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
        // Simple UUID v4 regex (accepts with/without dashes)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(normalized)) {
            // Looks like a UUID, search by id
            return this.db
                .selectFrom("users")
                .selectAll()
                .where("id", "=", normalized)
                .executeTakeFirst();
        }
        else {
            // Otherwise, search by external_user_id
            return this.db
                .selectFrom("users")
                .selectAll()
                .where("external_user_id", "=", normalized)
                .executeTakeFirst();
        }
    }
    async create(user) {
        // Ensure only valid fields for NewUser are passed
        const validUser = {
            external_user_id: user.external_user_id,
            full_name: user.full_name ?? null,
            country_code: user.country_code ?? null,
            base_currency: user.base_currency ?? null,
            timezone: user.timezone ?? null,
            status: user.status,
            metadata: user.metadata,
        };
        return this.db
            .insertInto("users")
            .values(validUser)
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
