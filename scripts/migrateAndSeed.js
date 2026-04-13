import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true },
});

async function runSqlFile(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await client.query(sql);
}

async function migrateAndSeed() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB');
    // Run all migration files in order
  } catch (err) {
    console.error('Migration/seed failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

async function migrateAndSeedOrdered() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB');
    // Drop all relevant tables first
    const dropTables = [
      'treasury_supplier_payment_candidates',
      'treasury_decision_snapshots',
      'treasury_cashflow_daily',
      'account_balances',
      'loan_accounts',
      'investment_summary',
      'financial_summary_monthly',
      'credit_profile',
      'users',
      'graph_state',
      'messages',
      'vector_documents',
      'financial_data_sync',
      'treasury_transaction_ledger',
      'user_financial_profiles',
      'chat_sessions',
      'chat_messages',
    ];
    for (const table of dropTables) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
        console.log(`Dropped table: ${table}`);
      } catch (e) {
        console.warn(`Could not drop table ${table}:`, e.message);
      }
    }
    // Explicit migration order
    const migrationOrder = [
      'V1__create_user.sql',
      'V2__create_graph_state.sql',
      'V3__create_messages.sql',
      'V4__create_vector_documents.sql',
      'V5__create_user_finance_data.sql',
      'V6__create_data_sync.sql',
      'V8__create_treasury_conversation_tables.sql',
      'V9__dedupe_financial_summary_monthly.sql',
      'V10__create_treasury_transaction_ledger.sql',
      'V11__fix_account_balances_unique_index.sql',
      'V12__create_user_financial_profiles.sql',
      'V13__add_current_balance_to_user_financial_profiles.sql',
      'V14__add_monthly_income_to_user_financial_profiles.sql',
      'V15__add_financial_fields_to_user_financial_profiles.sql',
      'V16__add_currency_to_user_financial_profiles.sql',
    ];
    const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
    for (const file of migrationOrder) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        console.log('Running migration:', file);
        await runSqlFile(client, filePath);
      } else {
        console.warn('Migration file missing:', file);
      }
    }
    console.log('All migrations applied.');
    // Run seed script (if SQL seed file exists)
    const seedFile = path.join(process.cwd(), 'scripts/seed_treasury_conversation.sql');
    if (fs.existsSync(seedFile)) {
      console.log('Running seed:', seedFile);
      await runSqlFile(client, seedFile);
      console.log('Seed data inserted.');
    } else {
      console.log('Seed file not found:', seedFile);
    }
  } catch (err) {
    console.error('Migration/seed failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrateAndSeedOrdered();
