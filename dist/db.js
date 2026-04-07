import { Kysely, PostgresDialect } from "kysely";
import pkg from "pg";
import { ENV } from "./config/env.js";
const { Pool } = pkg;
export const db = new Kysely({
    dialect: new PostgresDialect({
        pool: new Pool({
            connectionString: ENV.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 50000,
        }),
    }),
});
