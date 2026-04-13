import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function cleanAndReseed() {
  const client = await pool.connect();
  try {
    console.log('Connection established');

    // Drop all tables (add all your table names here)
    await client.query('DROP TABLE IF EXISTS treasury_supplier_payment_candidates CASCADE;');
    await client.query('DROP TABLE IF EXISTS treasury_decision_snapshots CASCADE;');
    await client.query('DROP TABLE IF EXISTS treasury_cashflow_daily CASCADE;');
    await client.query('DROP TABLE IF EXISTS account_balances CASCADE;');
    await client.query('DROP TABLE IF EXISTS loan_accounts CASCADE;');
    await client.query('DROP TABLE IF EXISTS investment_summary CASCADE;');
    await client.query('DROP TABLE IF EXISTS financial_summary_monthly CASCADE;');
    await client.query('DROP TABLE IF EXISTS credit_profile CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    // Add more DROP statements for each table you have
    
    console.log('All tables dropped.');

    // Now recreate and seed your tables (example for users)
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        external_user_id VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        country_code VARCHAR(10),
        base_currency VARCHAR(10),
        timezone VARCHAR(50),
        status VARCHAR(50),
        metadata JSONB
      );
    `);

    console.log('Tables created.');

    // Seed data (example for users)
    const usersToInsert = [
      { external_user_id: 'uk_user_001', full_name: 'Northstar Retail Ltd', country_code: 'GB', base_currency: 'GBP', timezone: 'Europe/London', status: 'active', metadata: {} },
      { external_user_id: 'uk_user_002', full_name: 'Northstar Corporate Treasury', country_code: 'GB', base_currency: 'GBP', timezone: 'Europe/London', status: 'active', metadata: {} }
    ];

    for (const user of usersToInsert) {
      await client.query(
        'INSERT INTO users (external_user_id, full_name, country_code, base_currency, timezone, status, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7);',
        [user.external_user_id, user.full_name, user.country_code, user.base_currency, user.timezone, user.status, user.metadata]
      );
    }
    
    console.log('Data seeded successfully.');
  } catch (err) {
    console.error('Operation failed.', err.stack);
  } finally {
    client.release();
    pool.end();
  }
}

cleanAndReseed();
