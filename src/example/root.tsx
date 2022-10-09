import { $, component$, useContextProvider, useStore } from '@builder.io/qwik';
import {
  QwikCity,
  RouterOutlet,
  ServiceWorkerRegister,
} from '@builder.io/qwik-city';
import { registerClientFactory } from '../client/client-factory';
import { UrqlProvider } from '../components/urql-provider';
import { clientFactory } from './client';
import { AuthStateContext } from './contexts';
import { useCookie } from './hooks/use-cookie';

export default component$(() => {
  registerClientFactory($(clientFactory));

  // Make sure the cookie is decoded /verified if needed
  const session = useCookie('session');
  const authState = useStore({ token: session });

  // Provide the auth state for the app logic. Not required for qwik-urql
  useContextProvider(AuthStateContext, authState);

  return (
    <UrqlProvider auth={authState}>
      <QwikCity>
        <head></head>
        <body lang='en'>
          <RouterOutlet />
          <ServiceWorkerRegister />
        </body>
      </QwikCity>
    </UrqlProvider>
  );
});