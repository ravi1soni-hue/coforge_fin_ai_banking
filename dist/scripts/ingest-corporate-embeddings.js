import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ingestJsonStream } from "../src/services/ingestion.service.js";
const SEED_PATH = path.resolve("seed/corporate_treasury_seed.json");
async function main() {
    if (!fs.existsSync(SEED_PATH)) {
        console.error("❌ Seed file not found:", SEED_PATH);
        process.exit(1);
    }
    const raw = fs.readFileSync(SEED_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.transactions)) {
        console.error("❌ No transactions array found in seed file.");
        process.exit(1);
    }
    // Stream the transactions array as JSON
    const transactionsJson = JSON.stringify(data.transactions);
    const readable = Readable.from([transactionsJson]);
    console.log(`🚀 Ingesting ${data.transactions.length} transactions for embedding/vector sync...`);
    await ingestJsonStream(readable, { userId: data.user?.id || "unknown_user", source: "corporate_seed" });
    console.log("✅ Embedding/vector ingestion complete.");
}
main().catch((err) => {
    console.error("❌ Ingestion failed:", err);
    process.exit(1);
});
