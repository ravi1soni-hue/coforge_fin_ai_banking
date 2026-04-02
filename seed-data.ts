import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { financialDataModule } from "./src/modules/financial-data/index.js";

// Load environment variables
dotenv.config();

// Load UK user data from JSON file
const bankingDataPath = path.join(process.cwd(), "banking_user_data.json");
const bankingDataJson = JSON.parse(fs.readFileSync(bankingDataPath, "utf-8"));

const applicationService = financialDataModule.getApplicationService();

// Use only the UK user data
const userData = {
  userProfile: bankingDataJson.userProfile,
  accounts: bankingDataJson.accounts,
  loans: bankingDataJson.loans,
  subscriptions: bankingDataJson.subscriptions,
  investments: bankingDataJson.investments,
  transactions: bankingDataJson.transactions,
  savingsGoals: bankingDataJson.savingsGoals
};

async function seedDatabase(): Promise<void> {
  try {
    console.log("🌱 Starting database seeding with UK user data...\n");

    // Save the UK user data (James Walker)
    await applicationService.saveBankingData(userData);

    console.log(
      `✨ Database seeding completed successfully!`
    );
    console.log(
      `   📝 User: ${userData.userProfile.name} (${userData.userProfile.userId})`
    );
    console.log(`   💰 Currency: ${userData.userProfile.currency}`);
    console.log(`   📍 Country: ${userData.userProfile.country}`);
    console.log(`   🏦 Accounts: ${userData.accounts.length}`);
    console.log(`   💳 Loans: ${userData.loans.length}`);
    console.log(`   📺 Subscriptions: ${userData.subscriptions.length}`);
    console.log(`   💼 Investments: ${userData.investments.length}`);
    console.log(`   📝 Transactions: ${userData.transactions.length}`);
    console.log(`   🎯 Savings Goals: ${userData.savingsGoals.length}`);
    console.log();
    console.log("🧪 View data at: http://localhost:3000/");
    console.log(`   API: /api/financial-data/${userData.userProfile.userId}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();