import { Generated } from "kysely";

export interface UsersTable {
  // Uses 'Generated' so Kysely knows the DB handles the ID (e.g., via SERIAL or UUID default)
  id: Generated<string>;

  external_user_id: string;
  full_name: string | null;

  country_code: string | null;
  base_currency: string | null;
  timezone: string | null;

  /**
   * Status codes:
   * 1 = active
   * 2 = suspended
   * 3 = deleted
   */
  status: 1 | 2 | 3;

  metadata: unknown;

  // Use string or bigint for BIGINT columns in Postgres to prevent JS precision issues
  created_at: Generated<string>; 
  updated_at: Generated<string>;
}


export const UserStatus = {
    ACTIVE: 1,
    SUSPENDED: 2,
    DELETED: 3,
  } as const;
  
  export type UserStatusType = typeof UserStatus[keyof typeof UserStatus];
  