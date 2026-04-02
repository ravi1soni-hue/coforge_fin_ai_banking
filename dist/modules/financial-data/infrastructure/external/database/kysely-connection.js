import { Kysely, PostgresDialect } from 'kysely';
import pkg from 'pg';
const { Pool } = pkg;
export class DatabaseConnection {
    static instance;
    static getInstance() {
        if (!DatabaseConnection.instance) {
            const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                idleTimeoutMillis: 5000,
                connectionTimeoutMillis: 10000,
            });
            DatabaseConnection.instance = new Kysely({
                dialect: new PostgresDialect({ pool })
            });
        }
        return DatabaseConnection.instance;
    }
}
