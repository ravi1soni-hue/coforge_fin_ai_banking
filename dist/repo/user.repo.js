import { withDbRetry } from "../utils/dbRetry.js";
import { sql } from "kysely";
import { UserStatus } from "../db/schema/user.js";
export class UserRepository {
    db;
    constructor({ db }) {
        this.db = db;
    }
    async findById(id) {
        return withDbRetry(() => this.db
            .selectFrom("users")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst());
    }
    async findByExternalId(externalId) {
        // Case-insensitive and trimmed lookup for robustness
        return withDbRetry(() => this.db
            .selectFrom("users")
            .selectAll()
            .where(sql `LOWER(TRIM(external_user_id))`, "=", externalId.trim().toLowerCase())
            .executeTakeFirst());
    }
    async create(user) {
        return withDbRetry(() => this.db
            .insertInto("users")
            .values(user)
            .returningAll()
            .executeTakeFirstOrThrow());
    }
    async update(id, updateWith) {
        return withDbRetry(() => this.db
            .updateTable("users")
            .set({
            ...updateWith,
            updated_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
        })
            .where("id", "=", id)
            .returningAll()
            .executeTakeFirst());
    }
    async softDelete(id) {
        return withDbRetry(() => this.update(id, { status: UserStatus.DELETED }));
    }
    async listByStatus(status) {
        return withDbRetry(() => this.db
            .selectFrom("users")
            .selectAll()
            .where("status", "=", status)
            .orderBy("created_at", "desc")
            .execute());
    }
}
