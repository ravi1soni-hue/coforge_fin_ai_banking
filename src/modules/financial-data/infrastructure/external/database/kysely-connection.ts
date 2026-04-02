import dotenv from 'dotenv';
import { Kysely, PostgresDialect } from 'kysely';
import pkg from 'pg';
import type { Database } from '../../../../../models/database.types.js';

// Load environment variables
dotenv.config();

const { Pool } = pkg;

export class DatabaseConnection {
  private static instance: Kysely<Database>;

  static getInstance(): Kysely<Database> {
    if (!DatabaseConnection.instance) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
      }

      const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
      });

      DatabaseConnection.instance = new Kysely<Database>({
        dialect: new PostgresDialect({ pool })
      });
    }

    return DatabaseConnection.instance;
  }
}