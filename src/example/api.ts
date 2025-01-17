import { buildSchema } from 'graphql';

// Create local schema
export const schema = buildSchema(`
  type Film {
    id: String!
    title: String!
  }

  input AddFilmInput {
    title: String!
  }

  input UpdateFilmInput {
    id: String!
    title: String!
  }

  type Query {
    film(id: String!): Film
  }

  type Mutation {
    addFilm(input: AddFilmInput!): Film!
    updateFilm(input: UpdateFilmInput!): Film!
  }
`);

// Create local state
const data = ['Shrek', 'The Matrix', 'The Lord of the Rings', 'Something else'];

// Create root value with resolvers
export const rootValue = {
  film: ({ id }: { id: string }) => {
    return {
      title: data[parseInt(id) % data.length],
      id,
    };
  },
  addFilm: ({ input }: { input: { title: string } }) => {
    const { title } = input;
    const id = data.length;
    data.push(title);
    return { title, id };
  },
  updateFilm: async ({ input }: { input: { title: string; id: string } }) => {
    const { title, id } = input;
    data[parseInt(id, 10)] = title;
    return { title, id };
  },
};
