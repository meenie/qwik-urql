import { isServer } from '@builder.io/qwik/build';
import { AnyVariables, Exchange, Operation, OperationResult } from '@urql/core';
import { pipe, tap } from 'wonka';

type Query = {
  request: Operation<any, AnyVariables>;
  response: Omit<OperationResult<any, AnyVariables>, 'operation'>;
  trigger: { value: number };
};

export type Cache = {
  dependencies: Record<string, number[]>;
  queries: Record<number, Query>;
};

/**
 * This exchange allows us to resume SSR query subscriptions on the client
 * and watch the cache for updates to queries.
 *
 * @param cache this must be an empty Qwik store
 */
class QwikExchange {
  constructor(private readonly cache: Cache) {
    if (!isServer) {
      for (const query of Object.values(this.cache.queries)) {
        this.setDependencies(query.request.key, query.response);
      }
    }
  }

  /**
   * Process outgoing requests.
   * On the server we simply add Urql Operations to a store for resuming on the
   * client.
   */
  processRequest(operation: Operation) {
    const context = operation.context;
    const isWatched = context.watch;

    // Store watched requests for retriggering later
    if (isWatched) {
      this.cacheRequest(operation);
    }

    // Use the cache first for future requests
    if (isWatched && context.trigger.value > 0) {
      context.requestPolicy = 'cache-first';
    }
  }

  /** Process response by updating watch stores or triggering watch refetches */
  processResponse(result: OperationResult) {
    const key = result.operation.key;
    const store = this.cache.queries[key];

    // Update all dependent queries if new data is returned
    if (result.operation.context.meta?.cacheOutcome !== 'hit' && result.data) {
      this.triggerDependencies(result.data, new Set([result.operation.key]));
    }

    // Stores only exist for watched queries and are updated here
    if (store) {
      // Remove non-serializable fields
      delete result.operation.context.fetch;

      // Update the store with the new response
      store.response.data = result.data;
      store.response.error = result.error;
      store.response.extensions = result.extensions;
      store.response.hasNext = result.hasNext;
      store.response.stale = result.stale;

      // Set any new dependencies returned from the request
      const trigger = result.operation.context.trigger;
      if (trigger && trigger.value === 0 && result.data) {
        this.setDependencies(result.operation.key, result.data);
      }
    }
  }

  /**
   * Stores the request query to be continued later, the output result sent to
   * the client, and a trigger signal to force a refetch
   */
  private cacheRequest(operation: Operation) {
    // Remove non-serializeable fields. Must copy first to avoid removing from
    // the original object
    const contextCopy = { ...operation.context };
    delete contextCopy.fetch;

    this.cache.queries[operation.key] = {
      request: {
        ...operation,
        context: contextCopy,
      },
      response: operation.context.store,
      trigger: operation.context.trigger,
    };
  }

  /**
   * Traverse through results and store a lookup of which queries are dependant
   * on which objects. These are then used to trigger refetches if the target
   * objects are ever updated.
   */
  private setDependencies(key: number, data: any) {
    if (typeof data !== 'object') {
      return;
    } else if (Array.isArray(data)) {
      if (data.length === 0) {
        return;
      }

      this.setDependencies(key, data[0]);
    }

    const id = data.id;
    const __typename = data.__typename;

    if (id && __typename) {
      const depKey = `${__typename}:${id}`;

      if (!this.cache.dependencies[depKey]) {
        this.cache.dependencies[depKey] = [key];
      } else {
        this.cache.dependencies[depKey].push(key);
      }
    }

    const fields = Object.keys(data);

    for (const field of fields) {
      this.setDependencies(key, data[field]);
    }
  }

  /**
   * Loop through query results and trigger a refetch for any dependant queries
   */
  private triggerDependencies(data: any, hits: Set<number>) {
    if (typeof data !== 'object') {
      return;
    } else if (Array.isArray(data)) {
      if (!data.length || typeof data[0] !== 'object') {
        return;
      }
      for (const item of data) {
        this.triggerDependencies(item, hits);
      }
    }

    const id = data.id;
    const __typename = data.__typename;

    if (id && __typename) {
      const dependencies = this.cache.dependencies[`${__typename}:${id}`];

      if (dependencies) {
        for (const dep of dependencies) {
          if (!hits.has(dep)) {
            hits.add(dep);
            this.cache.queries[dep].trigger.value++;
          }
        }
      }
    }

    const fields = Object.keys(data);

    for (const field of fields) {
      this.triggerDependencies(data[field], hits);
    }
  }

  run: Exchange = ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        tap((req) => this.processRequest(req)),
        forward,
        tap((res) => this.processResponse(res))
      );
    };
  };
}

export const qwikExchange = (cacheStore: {}): Exchange => {
  const cache = cacheStore as Cache;

  if (!cache.queries) {
    cache.queries = {};
    cache.dependencies = {};
  }

  const exchange = new QwikExchange(cache);
  return exchange.run;
};