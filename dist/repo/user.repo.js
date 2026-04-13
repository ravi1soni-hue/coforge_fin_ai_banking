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
        return this.db
            .selectFrom("users")
            .selectAll()
            .where("external_user_id", "=", externalId)
            .executeTakeFirst();
    }
    async findByIdentity(identity) {
        const normalized = identity.trim();
        if (!normalized)
            return undefined;
        return this.db
            .selectFrom("users")
            .selectAll()
            .where((eb) => eb.or([
            eb("id", "=", normalized),
            eb("external_user_id", "=", normalized),
        ]))
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
