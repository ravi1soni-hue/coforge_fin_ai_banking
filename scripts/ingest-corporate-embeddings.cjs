const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { ingestJsonStream } = require("../dist/src/services/ingestion.service.js");

const SEED_PATH = path.resolve("seed/corporate_treasury_seed.json");

async function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.error("❌ Seed file not found:", SEED_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(SEED_PATH, "utf8");
  const data = JSON.parse(raw);

  // Find the correct key for transactions
  let transactions = data.transactions || data.treasury_account_transactions || data.treasury_transactions || data.treasury_cashflow_transactions || data.treasury_cashflow_90d_array || data.treasury_cashflow_daily;
  if (!Array.isArray(transactions)) {
    // Try to find the largest array in the object as fallback
    transactions = Object.values(data).find(v => Array.isArray(v) && v.length > 0);
  }
  if (!Array.isArray(transactions)) {
    console.error("❌ No transactions array found in seed file.");
    process.exit(1);
  }

  // Stream the transactions array as JSON
  const transactionsJson = JSON.stringify(transactions);
  const readable = Readable.from([transactionsJson]);

  console.log(`🚀 Ingesting ${transactions.length} transactions for embedding/vector sync...`);
  await ingestJsonStream(readable, { userId: data.user?.id || "unknown_user", source: "corporate_seed" });
  console.log("✅ Embedding/vector ingestion complete.");
}

main().catch((err) => {
  console.error("❌ Ingestion failed:", err);
  process.exit(1);
});
