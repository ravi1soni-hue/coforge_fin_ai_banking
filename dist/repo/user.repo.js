import { sql } from "kysely";
import { UserStatus } from "../db/schema/user.js";
export class UserRepository {
    db;
    constructor({ db }) {
        this.db = db;
    }
    async findById(id) {
        return this.db
            .selectFrom("users")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
    }
    async findByExternalId(externalId) {
        // Case-insensitive and trimmed lookup for robustness
        return this.db
            .selectFrom("users")
            .selectAll()
            .where(sql `LOWER(TRIM(external_user_id))`, "=", externalId.trim().toLowerCase())
            .executeTakeFirst();
    }
    async create(user) {
        return this.db
            .insertInto("users")
            .values(user)
            .returningAll()
            .executeTakeFirstOrThrow();
    }
    async update(id, updateWith) {
        return this.db
            .updateTable("users")
            .set({
            ...updateWith,
            updated_at: sql `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
        })
            .where("id", "=", id)
            .returningAll()
            .executeTakeFirst();
    }
    async softDelete(id) {
        return this.update(id, { status: UserStatus.DELETED });
    }
    async listByStatus(status) {
        return this.db
            .selectFrom("users")
            .selectAll()
            .where("status", "=", status)
            .orderBy("created_at", "desc")
            .execute();
    }
}
