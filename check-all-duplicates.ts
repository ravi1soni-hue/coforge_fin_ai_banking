import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

async function checkAndCleanDuplicates() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log("🔍 Comprehensive Duplicate Check and Cleanup\n");
    console.log("=".repeat(50));

    const tables = [
      { name: 'accounts', uniqueColumn: 'account_id' },
      { name: 'loans', uniqueColumn: 'loan_id' },
      { name: 'subscriptions', uniqueColumn: 'name', groupBy: 'user_id, name' },
      { name: 'investments', uniqueColumn: 'type', groupBy: 'user_id, type, provider' },
      { name: 'transactions', uniqueColumn: null, groupBy: 'user_id, date, category, type, amount' },
      { name: 'savings_goals', uniqueColumn: 'goal_id' }
    ];

    let totalDuplicatesRemoved = 0;

    for (const table of tables) {
      console.log(`\n📋 Checking ${table.name}...`);
      
      try {
        let duplicateQuery;
        let deleteQuery;

        if (table.name === 'subscriptions') {
          duplicateQuery = `
            SELECT name, COUNT(*) as count
            FROM ${table.name}
            WHERE user_id = 'uk_user_001'
            GROUP BY name
            HAVING COUNT(*) > 1
            ORDER BY count DESC
          `;
          deleteQuery = `
            DELETE FROM ${table.name}
            WHERE id NOT IN (
              SELECT MIN(id)
              FROM ${table.name}
              WHERE user_id = 'uk_user_001'
              GROUP BY name
            ) AND user_id = 'uk_user_001'
          `;
        } else if (table.name === 'investments') {
          duplicateQuery = `
            SELECT type, provider, COUNT(*) as count
            FROM ${table.name}
            WHERE user_id = 'uk_user_001'
            GROUP BY type, provider
            HAVING COUNT(*) > 1
            ORDER BY count DESC
          `;
          deleteQuery = `
            DELETE FROM ${table.name}
            WHERE id NOT IN (
              SELECT MIN(id)
              FROM ${table.name}
              WHERE user_id = 'uk_user_001'
              GROUP BY type, provider
            ) AND user_id = 'uk_user_001'
          `;
        } else if (table.name === 'transactions') {
          duplicateQuery = `
            SELECT date, category, type, amount, COUNT(*) as count
            FROM ${table.name}
            WHERE user_id = 'uk_user_001'
            GROUP BY date, category, type, amount
            HAVING COUNT(*) > 1
            ORDER BY count DESC
            LIMIT 5
          `;
          deleteQuery = `
            DELETE FROM ${table.name}
            WHERE id NOT IN (
              SELECT MIN(id)
              FROM ${table.name}
              WHERE user_id = 'uk_user_001'
              GROUP BY date, category, type, amount
            ) AND user_id = 'uk_user_001'
          `;
        } else {
          duplicateQuery = `
            SELECT COUNT(*) as total
            FROM ${table.name}
            WHERE user_id = 'uk_user_001'
          `;
        }

        const dupRes = await pool.query(duplicateQuery);
        
        if (table.name === 'transactions' || table.name === 'subscriptions' || table.name === 'investments') {
          if (dupRes.rows.length > 0) {
            console.log(`   ❌ Found duplicates:`);
            dupRes.rows.forEach((row: any, idx: number) => {
              const count = row.count;
              if (table.name === 'investments') {
                console.log(`      [${idx + 1}] ${row.type} (${row.provider}): ${count} times`);
              } else if (table.name === 'subscriptions') {
                console.log(`      [${idx + 1}] ${row.name}: ${count} times`);
              } else {
                console.log(`      [${idx + 1}] ${row.category} (${row.type}) - ${row.amount}: ${count} times`);
              }
            });

            if (deleteQuery) {
              const deleteRes = await pool.query(deleteQuery);
              console.log(`   ✅ Removed ${deleteRes.rowCount || 0} duplicates`);
              totalDuplicatesRemoved += deleteRes.rowCount || 0;
            }
          } else {
            console.log(`   ✅ No duplicates found`);
          }
        }

        // Show total count
        const countRes = await pool.query(`SELECT COUNT(*) as count FROM ${table.name}`);
        console.log(`   📊 Total records in ${table.name}: ${countRes.rows[0].count}`);
      } catch (err: any) {
        console.log(`   ⚠️  Error checking ${table.name}:`, err.message);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`\n✅ Total duplicates removed: ${totalDuplicatesRemoved}`);
    console.log("\n💡 Recommendations for data migration:");
    console.log("   1. Add UNIQUE constraints to prevent duplicates");
    console.log("   2. Use upsert (ON CONFLICT) pattern in migrations");
    console.log("   3. Add composite unique indexes where needed");

  } catch (error: any) {
    console.error("❌ Error:", error.message || error);
  } finally {
    try {
      await pool.end();
    } catch (e) {
      console.error("Error closing pool:", e);
    }
    process.exit(0);
  }
}

checkAndCleanDuplicates().catch((err: any) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
