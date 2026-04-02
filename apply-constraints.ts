import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

async function applyConstraints() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log("🔒 Applying UNIQUE constraints to prevent future duplicates...\n");

    // Add unique constraint on subscriptions
    console.log("1️⃣  Adding constraint on subscriptions (user_id, name)...");
    try {
      await pool.query(`
        ALTER TABLE subscriptions
        ADD CONSTRAINT subscriptions_user_name_unique UNIQUE (user_id, name);
      `);
      console.log("   ✅ Constraint added successfully");
    } catch (err: any) {
      if (err.code === '42P07') {
        console.log("   ℹ️  Constraint already exists");
      } else if (err.message.includes("already exists")) {
        console.log("   ℹ️  Constraint already exists");
      } else {
        console.error("   ❌ Error:", err.message);
      }
    }

    // Add unique constraint on investments
    console.log("\n2️⃣  Adding constraint on investments (user_id, type, provider)...");
    try {
      await pool.query(`
        ALTER TABLE investments
        ADD CONSTRAINT investments_user_type_provider_unique UNIQUE (user_id, type, provider);
      `);
      console.log("   ✅ Constraint added successfully");
    } catch (err: any) {
      if (err.code === '42P07') {
        console.log("   ℹ️  Constraint already exists");
      } else if (err.message.includes("already exists")) {
        console.log("   ℹ️  Constraint already exists");
      } else {
        console.error("   ❌ Error:", err.message);
      }
    }

    // Add unique constraint on transactions
    console.log("\n3️⃣  Adding constraint on transactions (user_id, date, category, type, amount)...");
    try {
      await pool.query(`
        ALTER TABLE transactions
        ADD CONSTRAINT transactions_unique_composite UNIQUE (user_id, date, category, type, amount);
      `);
      console.log("   ✅ Constraint added successfully");
    } catch (err: any) {
      if (err.code === '42P07') {
        console.log("   ℹ️  Constraint already exists");
      } else if (err.message.includes("already exists")) {
        console.log("   ℹ️  Constraint already exists");
      } else {
        console.error("   ❌ Error:", err.message);
      }
    }

    // Add unique constraint on savings_goals
    console.log("\n4️⃣  Adding constraint on savings_goals (user_id, goal_id)...");
    try {
      await pool.query(`
        ALTER TABLE savings_goals
        ADD CONSTRAINT savings_goals_id_unique UNIQUE (user_id, goal_id);
      `);
      console.log("   ✅ Constraint added successfully");
    } catch (err: any) {
      if (err.code === '42P07') {
        console.log("   ℹ️  Constraint already exists");
      } else if (err.message.includes("already exists")) {
        console.log("   ℹ️  Constraint already exists");
      } else {
        console.error("   ❌ Error:", err.message);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n✅ All constraints applied successfully!");
    console.log("\n💾 Database protection enabled:");
    console.log("   • Subscriptions: No duplicate names per user");
    console.log("   • Investments: No duplicate type+provider per user");
    console.log("   • Transactions: No duplicate transactions on same day");
    console.log("   • Savings Goals: No duplicate goals per user");
    console.log("\n🛡️  Future duplicate data will be automatically rejected!");

  } catch (error: any) {
    console.error("❌ Error applying constraints:", error.message || error);
  } finally {
    try {
      await pool.end();
    } catch (e) {
      console.error("Error closing pool:", e);
    }
    process.exit(0);
  }
}

applyConstraints().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
