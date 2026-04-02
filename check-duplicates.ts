import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

async function checkDuplicates() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("🔍 Checking for duplicate subscriptions...\n");

    // Get all subscriptions
    const res = await pool.query(`
      SELECT name, COUNT(*) as count
      FROM subscriptions
      WHERE user_id = 'uk_user_001'
      GROUP BY name
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);

    if (res.rows.length > 0) {
      console.log("❌ Found duplicate subscriptions:");
      res.rows.forEach(row => {
        console.log(`   - ${row.name}: ${row.count} times`);
      });

      console.log("\n📋 All subscriptions for user:");
      const allRes = await pool.query(`
        SELECT id, name, amount, cycle FROM subscriptions
        WHERE user_id = 'uk_user_001'
        ORDER BY name
      `);
      
      console.log("Subscription Details:");
      allRes.rows.forEach((sub, idx) => {
        console.log(`  [${idx + 1}] ${sub.name} - ${sub.amount} (${sub.cycle})`);
      });

      // Delete duplicates - keep only first occurrence
      console.log("\n🔧 Removing duplicates...");
      const deleteRes = await pool.query(`
        DELETE FROM subscriptions
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM subscriptions
          WHERE user_id = 'uk_user_001'
          GROUP BY name
        ) AND user_id = 'uk_user_001'
      `);

      console.log(`✅ Deleted ${deleteRes.rowCount} duplicate records`);

      // Show final count
      const finalRes = await pool.query(`
        SELECT COUNT(*) as count FROM subscriptions
        WHERE user_id = 'uk_user_001'
      `);
      console.log(`\n✅ Final subscription count: ${finalRes.rows[0].count}`);
    } else {
      console.log("✅ No duplicate subscriptions found!");
      const countRes = await pool.query(`
        SELECT COUNT(*) as count FROM subscriptions
        WHERE user_id = 'uk_user_001'
      `);
      console.log(`Total subscriptions: ${countRes.rows[0].count}`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkDuplicates();
