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
    // Case-insensitive and trimmed lookup for robustness
    return this.db
      .selectFrom("users")
      .selectAll()
      .where(sql`LOWER(TRIM(external_user_id))`, "=", externalId.trim().toLowerCase())
      .executeTakeFirst();
  }

  async create(user: NewUser): Promise<User> {
    return this.db
      .insertInto("users")
      .values(user)
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
