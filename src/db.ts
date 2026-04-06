import { Kysely, PostgresDialect } from "kysely";
import pkg from "pg";
import { ENV } from "./config/env.js";
import { Database } from "./db/schema/index.js";

const { Pool } = pkg;

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: ENV.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 50000,
    }),
  }),
});
