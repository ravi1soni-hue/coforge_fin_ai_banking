import { Kysely, Insertable, Selectable, Updateable, sql } from 'kysely';
import { UserStatus, UserStatusType, UsersTable } from '../db/schema/user.js';

// Wrap your tables in a single Database interface
export interface Database {
  users: UsersTable;
}

// Helpers for cleaner method signatures
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;




export class UserRepository {
    constructor(private db: Kysely<Database>) {}
  
    async findById(id: string): Promise<User | undefined> {
      return await this.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
    }
  
    async findByExternalId(externalId: string): Promise<User | undefined> {
      return await this.db
        .selectFrom('users')
        .selectAll()
        .where('external_user_id', '=', externalId)
        .executeTakeFirst();
    }
  
    async create(user: NewUser): Promise<User> {
      return await this.db
        .insertInto('users')
        .values(user)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
  
    async update(id: string, updateWith: UserUpdate): Promise<User | undefined> {
      return await this.db
        .updateTable('users')
        .set({
          ...updateWith,
          updated_at: sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT` // Auto-update timestamp
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
    }
  
    async delete(id: string): Promise<void> {
      // Soft delete example: just change status to DELETED (3)
      await this.db
        .updateTable('users')
        .set({ status: UserStatus.DELETED })
        .where('id', '=', id)
        .execute();
    }
  
    async listByStatus(status: UserStatusType): Promise<User[]> {
      return await this.db
        .selectFrom('users')
        .selectAll()
        .where('status', '=', status)
        .orderBy('created_at', 'desc')
        .execute();
    }
  }
  