import 'dotenv/config';
import { Pool } from 'pg';

console.log('Starting DB test with rejectUnauthorized: false...');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
});

async function testConnection() {
  try {
    console.log('Attempting to connect to:', process.env.DATABASE_URL?.split('@')[1]); // Log host only for privacy
    const client = await pool.connect();
    console.log('Connection established');
    const result = await client.query('SELECT NOW()');
    console.log('Database time:', result.rows[0].now);
    console.log('✅ Connection successful!');
    client.release();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('Full error:', err);
  } finally {
    await pool.end();
    console.log('Pool closed');
  }
}

testConnection();
