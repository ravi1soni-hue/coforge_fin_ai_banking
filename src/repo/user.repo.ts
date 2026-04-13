import { Kysely, sql, Insertable, Selectable, Updateable } from "kysely";
import { UserStatus, UserStatusType, UsersTable } from "../db/schema/user.js";
import { Database } from "../db/schema/index.js";

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export class UserRepository {
  private readonly db: Kysely<Database>;

  constructor({ db }: { db: Kysely<Database> }) {
    this.db = db;
  }

  async findById(id: string): Promise<User | undefined> {
    return this.db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async findByExternalId(externalId: string): Promise<User | undefined> {
    return this.db
      .selectFrom("users")
      .selectAll()
      .where("external_user_id", "=", externalId)
      .executeTakeFirst();
  }

  async findByIdentity(identity: string): Promise<User | undefined> {
    const normalized = identity.trim();
    if (!normalized) return undefined;

    // Simple UUID v4 regex (accepts with/without dashes)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(normalized)) {
      // Looks like a UUID, search by id
      return this.db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", normalized)
        .executeTakeFirst();
    } else {
      // Otherwise, search by external_user_id
      return this.db
        .selectFrom("users")
        .selectAll()
        .where("external_user_id", "=", normalized)
        .executeTakeFirst();
    }
  }

  async create(user: NewUser): Promise<User> {
    // Ensure only valid fields for NewUser are passed
    const validUser: NewUser = {
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

  async update(id: string, updateWith: UserUpdate): Promise<User | undefined> {
    return this.db
      .updateTable("users")
      .set({
        ...updateWith,
        updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  }

  async softDelete(id: string): Promise<User | undefined> {
    return this.update(id, { status: UserStatus.DELETED });
  }

  async listByStatus(status: UserStatusType): Promise<User[]> {
    return this.db
      .selectFrom("users")
      .selectAll()
      .where("status", "=", status)
      .orderBy("created_at", "desc")
      .execute();
  }
}
