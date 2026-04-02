import { Kysely, sql, Selectable, Insertable, Updateable } from 'kysely';
import { Database } from '../db/schema/index.js'; // Your main database interface
import { FinancialDataSyncTable } from '../db/schema/sync.js';


// dto/sync.dto.ts

export interface CreateSyncDTO {
    userId: string;
    externalConnectionId: string;
  }
  
  export interface SyncStatusUpdateDTO {
    id: string;
    status: 1 | 2 | 3 | 4;
    errorLog?: string | null;
  }
  
  export interface FinancialSyncResponseDTO {
    id: string;
    userId: string;
    externalConnectionId: string;
    status: 1 | 2 | 3 | 4;
    errorLog: string | null;
    startedAt: string;   // BIGINT as string
    completedAt: string | null;
  }

  


export class FinancialSyncRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * CREATE: Starts a new sync job (maps DTO -> DB)
   */
  async createSync(dto: CreateSyncDTO): Promise<FinancialSyncResponseDTO> {
    const record = await this.db
      .insertInto('financial_data_sync')
      .values({
        user_id: dto.userId,
        external_connection_id: dto.externalConnectionId,
        status: 1, // PENDING
        started_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToResponseDTO(record);
  }

  /**
   * UPDATE: Changes status and sets completed_at if finished
   */
  async updateSyncStatus(dto: SyncStatusUpdateDTO): Promise<FinancialSyncResponseDTO | undefined> {
    const isFinished = dto.status === 3 || dto.status === 4;

    const record = await this.db
      .updateTable('financial_data_sync')
      .set({
        status: dto.status,
        error_log: dto.errorLog ?? null,
        completed_at: isFinished 
          ? sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT` 
          : null
      })
      .where('id', '=', dto.id)
      .returningAll()
      .executeTakeFirst();

    return record ? this.mapToResponseDTO(record) : undefined;
  }

  /**
   * READ: Fetches latest sync (maps DB -> DTO)
   */
  async getLatestSync(userId: string): Promise<FinancialSyncResponseDTO | undefined> {
    const record = await this.db
      .selectFrom('financial_data_sync')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('started_at', 'desc')
      .executeTakeFirst();

    return record ? this.mapToResponseDTO(record) : undefined;
  }

  /* =====================================================
   * PRIVATE MAPPER
   * ===================================================== */

  private mapToResponseDTO(record: Selectable<FinancialDataSyncTable>): FinancialSyncResponseDTO {
    return {
      id: record.id,
      userId: record.user_id,
      externalConnectionId: record.external_connection_id,
      status: record.status as 1 | 2 | 3 | 4,
      errorLog: record.error_log,
      startedAt: record.started_at,
      completedAt: record.completed_at
    };
  }
}

