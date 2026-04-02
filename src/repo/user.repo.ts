import { Kysely, Insertable, Selectable, Updateable, sql } from 'kysely';
import { UserStatus, UserStatusType, UsersTable } from '../db/schema/user.js';

// 1. Database Interface mapping
export interface Database {
  users: UsersTable;
}

// 2. Type Aliases for cleaner code
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export class UserRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Find a user by their internal UUID
   */
  async findById(id: string): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find a user by the external provider's ID (e.g. Auth0, Firebase)
   */
  async findByExternalId(externalId: string): Promise<User | undefined> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('external_user_id', '=', externalId)
      .executeTakeFirst();
  }

  /**
   * Create a new user. 
   * 'id', 'created_at', and 'updated_at' are handled by the DB.
   */
  async create(user: NewUser): Promise<User> {
    return await this.db
      .insertInto('users')
      .values(user)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Update user details and refresh the updated_at timestamp
   */
  async update(id: string, updateWith: UserUpdate): Promise<User | undefined> {
    return await this.db
      .updateTable('users')
      .set({
        ...updateWith,
        updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Soft delete a user by setting status to DELETED (3)
   */
  async softDelete(id: string): Promise<User | undefined> {
    return await this.update(id, { status: UserStatus.DELETED });
  }

  /**
   * List users by status (Active, Suspended, or Deleted)
   */
  async listByStatus(status: UserStatusType): Promise<User[]> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('status', '=', status)
      .orderBy('created_at', 'desc')
      .execute();
  }
}
