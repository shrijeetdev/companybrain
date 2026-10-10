import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.COMPANYBRAIN_DB_PATH ?? '~/.companybrain/companybrain.sqlite',
  },
} satisfies Config;
