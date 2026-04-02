import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

async function checkDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("🔍 Checking database status...\n");

    // Get all tables
    const tablesRes = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log("📊 Tables created:", tables.join(", "));

    // Check data counts in each table
    console.log("\n📈 Data counts:");
    
    const userRes = await pool.query("SELECT COUNT(*) as count FROM users");
    console.log(`  👥 Users: ${userRes.rows[0].count}`);
    
    const accountRes = await pool.query("SELECT COUNT(*) as count FROM accounts");
    console.log(`  💳 Accounts: ${accountRes.rows[0].count}`);
    
    const loanRes = await pool.query("SELECT COUNT(*) as count FROM loans");
    console.log(`  📊 Loans: ${loanRes.rows[0].count}`);
    
    const transRes = await pool.query("SELECT COUNT(*) as count FROM transactions");
    console.log(`  💸 Transactions: ${transRes.rows[0].count}`);
    
    const subRes = await pool.query("SELECT COUNT(*) as count FROM subscriptions");
    console.log(`  🔔 Subscriptions: ${subRes.rows[0].count}`);
    
    const invRes = await pool.query("SELECT COUNT(*) as count FROM investments");
    console.log(`  📈 Investments: ${invRes.rows[0].count}`);
    
    const savRes = await pool.query("SELECT COUNT(*) as count FROM savings_goals");
    console.log(`  🎯 Savings Goals: ${savRes.rows[0].count}`);

    // Show status summary
    console.log("\n✨ Summary:");
    console.log("  ✅ Database created: YES");
    console.log("  ✅ Tables created: YES");
    const hasData = parseInt(userRes.rows[0].count) > 0;
    console.log(`  ✅ Data pushed: ${hasData ? "YES" : "NO"}`);

    console.log("\n✅ Database check complete!");
  } catch (error) {
    console.error("❌ Error checking database:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkDatabase();
