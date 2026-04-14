import { sql } from "kysely";
export class FinancialSyncRepository {
    db;
    constructor({ db }) {
        this.db = db;
    }
    async createSync(dto) {
        const record = await this.db
            .insertInto("financial_data_sync")
            .values({
            user_id: dto.userId,
            external_connection_id: dto.externalConnectionId,
            status: 1, // PENDING
            started_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
        })
            .returningAll()
            .executeTakeFirstOrThrow();
        return this.mapToDTO(record);
    }
    async updateSyncStatus(dto) {
        const isFinished = dto.status === 3 || dto.status === 4;
        const record = await this.db
            .updateTable("financial_data_sync")
            .set({
            status: dto.status,
            error_log: dto.errorLog ?? null,
            completed_at: isFinished
                ? sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`
                : null,
        })
            .where("id", "=", dto.id)
            .returningAll()
            .executeTakeFirst();
        return record ? this.mapToDTO(record) : undefined;
    }
    async getLatestSync(userId) {
        const record = await this.db
            .selectFrom("financial_data_sync")
            .selectAll()
            .where("user_id", "=", userId)
            .orderBy("started_at", "desc")
            .executeTakeFirst();
        return record ? this.mapToDTO(record) : undefined;
    }
    mapToDTO(record) {
        return {
            id: record.id,
            userId: record.user_id,
            externalConnectionId: record.external_connection_id,
            status: record.status,
            errorLog: record.error_log,
            startedAt: String(record.started_at),
            completedAt: record.completed_at ? String(record.completed_at) : null,
        };
    }
}
