

import { VectorRepository } from "../repo/vector.repo.js";
import { FinancialSyncRepository } from "../repo/finance_data_sync_repo.js"; 
import { IBankProvider } from "./bank.provider.js";

export class SyncService {
  private readonly syncRepo: FinancialSyncRepository;
  private readonly vectorRepo: VectorRepository;
  private readonly bankProvider: IBankProvider;

  constructor({
    syncRepo,
    vectorRepo,
    bankProvider,
  }: {
    syncRepo: FinancialSyncRepository;
    vectorRepo: VectorRepository;
    bankProvider: IBankProvider;
  }) {
    this.syncRepo = syncRepo;
    this.vectorRepo = vectorRepo;
    this.bankProvider = bankProvider;
  }

  async runSync(userId: string, externalConnectionId: string) {
    // 1. Create a "Pending" sync record
    const syncJob = await this.syncRepo.createSync({ 
      userId, 
      externalConnectionId 
    });

    try {
        var getLatestSyncData = this.syncRepo.getLatestSync
      // 2. Update status to "Processing"
      await this.syncRepo.updateSyncStatus({ id: syncJob.id, status: 2 });

      // 3. Fetch data using the configured bank provider
      const transactions = await this.bankProvider.fetchTransactions(externalConnectionId,null);

      // 4. Segregate and Save Data
      for (const tx of transactions) {
        // A. Save structured data to Postgres (Implementation depends on your Account repo)
        // await this.accountRepo.upsertTransaction({...});

        // B. Save unstructured data to Vector Database
        // await this.vectorRepo.insertDb({
        //   user_id: userId,
        //   content: `Transaction: ${tx.description} for ${tx.amount} ${tx.currency} on ${tx.date}`,
        //   embedding: await this.generateEmbedding(tx.description), // Helper to call OpenAI/local model
        //   domain: "finance",
        //   facet: "transaction",
        //   source: this.bankProvider.name,
        //   metadata: tx.rawMetadata,
        //   embedding_model: "text-embedding-3-small"
        // });
      }

      // 5. Mark as Completed
      await this.syncRepo.updateSyncStatus({ id: syncJob.id, status: 3 });

    } catch (error: any) {
      // 6. Mark as Failed
      await this.syncRepo.updateSyncStatus({ 
        id: syncJob.id, 
        status: 4, 
        errorLog: error.message 
      });
      throw error;
    }
  }

  // Mock embedding helper - in reality, call your AI service here
  private async generateEmbedding(text: string): Promise<number[]> {
    return new Array(1536).fill(0); // Replace with real embedding logic
  }
}
