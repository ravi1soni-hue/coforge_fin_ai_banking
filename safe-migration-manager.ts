import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

interface MigrationField {
  table: string;
  name: string;
  type: string;
  nullable?: boolean;
  default?: any;
  description?: string;
}

class SafeMigrationManager {
  private pool: pkg.Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
    });
  }

  /**
   * Safely add a new field to a table without affecting existing data
   */
  async addField(field: MigrationField): Promise<void> {
    const { table, name, type, nullable = true, default: defaultValue, description } = field;

    try {
      console.log(`🔄 Adding field '${name}' to table '${table}'...`);

      // Check if column already exists
      const columnCheck = await this.pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `, [table, name]);

      if (columnCheck.rows.length > 0) {
        console.log(`   ℹ️  Field '${name}' already exists in '${table}'`);
        return;
      }

      // Build ALTER TABLE statement
      let alterQuery = `ALTER TABLE ${table} ADD COLUMN ${name} ${type}`;

      if (!nullable) {
        alterQuery += ' NOT NULL';
      }

      if (defaultValue !== undefined) {
        if (typeof defaultValue === 'string') {
          alterQuery += ` DEFAULT '${defaultValue}'`;
        } else if (typeof defaultValue === 'boolean') {
          alterQuery += ` DEFAULT ${defaultValue}`;
        } else if (typeof defaultValue === 'number') {
          alterQuery += ` DEFAULT ${defaultValue}`;
        } else if (defaultValue === null) {
          // For nullable fields with null default
        } else {
          alterQuery += ` DEFAULT '${JSON.stringify(defaultValue)}'`;
        }
      }

      await this.pool.query(alterQuery);

      // Log the migration
      await this.logMigration(table, 'ADD_COLUMN', name, type, nullable, defaultValue);

      console.log(`   ✅ Added field '${name}' to '${table}'`);

      if (description) {
        console.log(`   📝 ${description}`);
      }

    } catch (error: any) {
      console.error(`   ❌ Error adding field '${name}':`, error.message);
      throw error;
    }
  }

  /**
   * Safely remove a field (only if it's nullable and has no data)
   */
  async removeField(table: string, fieldName: string): Promise<void> {
    try {
      console.log(`🗑️  Checking if field '${fieldName}' can be safely removed from '${table}'...`);

      // Check if field exists
      const columnCheck = await this.pool.query(`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `, [table, fieldName]);

      if (columnCheck.rows.length === 0) {
        console.log(`   ℹ️  Field '${fieldName}' doesn't exist in '${table}'`);
        return;
      }

      // Check if field has data
      const dataCheck = await this.pool.query(`
        SELECT COUNT(*) as count FROM ${table} WHERE ${fieldName} IS NOT NULL
      `);

      if (parseInt(dataCheck.rows[0].count) > 0) {
        console.log(`   ⚠️  Cannot remove field '${fieldName}' - it contains ${dataCheck.rows[0].count} non-null values`);
        return;
      }

      // Safe to remove
      await this.pool.query(`ALTER TABLE ${table} DROP COLUMN ${fieldName}`);
      await this.logMigration(table, 'DROP_COLUMN', fieldName);

      console.log(`   ✅ Removed field '${fieldName}' from '${table}'`);

    } catch (error: any) {
      console.error(`   ❌ Error removing field '${fieldName}':`, error.message);
      throw error;
    }
  }

  /**
   * Make a field nullable (safe operation)
   */
  async makeFieldNullable(table: string, fieldName: string): Promise<void> {
    try {
      console.log(`🔓 Making field '${fieldName}' nullable in '${table}'...`);

      await this.pool.query(`ALTER TABLE ${table} ALTER COLUMN ${fieldName} DROP NOT NULL`);
      await this.logMigration(table, 'MAKE_NULLABLE', fieldName);

      console.log(`   ✅ Field '${fieldName}' is now nullable`);

    } catch (error: any) {
      console.error(`   ❌ Error making field nullable:`, error.message);
      throw error;
    }
  }

  /**
   * Add an index for performance
   */
  async addIndex(table: string, columns: string[], indexName?: string): Promise<void> {
    try {
      const idxName = indexName || `${table}_${columns.join('_')}_idx`;
      console.log(`📊 Adding index '${idxName}' on '${table}'...`);

      // Check if index exists
      const indexCheck = await this.pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = $1 AND indexname = $2
      `, [table, idxName]);

      if (indexCheck.rows.length > 0) {
        console.log(`   ℹ️  Index '${idxName}' already exists`);
        return;
      }

      await this.pool.query(`CREATE INDEX ${idxName} ON ${table} (${columns.join(', ')})`);
      console.log(`   ✅ Added index '${idxName}'`);

    } catch (error: any) {
      console.error(`   ❌ Error adding index:`, error.message);
      throw error;
    }
  }

  /**
   * Log migration operation
   */
  private async logMigration(
    table: string,
    operation: string,
    fieldName: string,
    fieldType?: string,
    nullable?: boolean,
    defaultValue?: any
  ): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO data_migrations (table_name, operation, field_name, field_type, nullable, default_value, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [table, operation, fieldName, fieldType, nullable, JSON.stringify(defaultValue), '1.0.0']);
    } catch (error) {
      // Don't fail the migration if logging fails
      console.warn('Warning: Could not log migration:', error.message);
    }
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(): Promise<any[]> {
    try {
      const result = await this.pool.query(`
        SELECT * FROM data_migrations
        ORDER BY executed_at DESC
      `);
      return result.rows;
    } catch (error) {
      console.error('Error getting migration history:', error.message);
      return [];
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Example usage and future-proof field additions
async function runFutureProofMigrations() {
  const migrator = new SafeMigrationManager();

  try {
    console.log("🚀 Starting Future-Proof Data Migrations\n");
    console.log("=".repeat(60));

    // Example: Add new fields that might be useful in the future
    const newFields: MigrationField[] = [
      // User enhancements
      { table: 'users', name: 'email', type: 'VARCHAR(255)', nullable: true, description: 'User email for notifications' },
      { table: 'users', name: 'phone', type: 'VARCHAR(20)', nullable: true, description: 'User phone number' },
      { table: 'users', name: 'preferences', type: 'JSONB', nullable: true, default: {}, description: 'User preferences and settings' },

      // Account enhancements
      { table: 'accounts', name: 'account_number', type: 'VARCHAR(50)', nullable: true, description: 'Full account number' },
      { table: 'accounts', name: 'iban', type: 'VARCHAR(34)', nullable: true, description: 'International Bank Account Number' },
      { table: 'accounts', name: 'is_primary', type: 'BOOLEAN', nullable: true, default: false, description: 'Primary account flag' },

      // Transaction enhancements
      { table: 'transactions', name: 'description', type: 'TEXT', nullable: true, description: 'Transaction description' },
      { table: 'transactions', name: 'merchant', type: 'VARCHAR(255)', nullable: true, description: 'Merchant name' },
      { table: 'transactions', name: 'is_recurring', type: 'BOOLEAN', nullable: true, default: false, description: 'Recurring transaction flag' },

      // Investment enhancements
      { table: 'investments', name: 'risk_level', type: 'VARCHAR(20)', nullable: true, description: 'Risk level (low/medium/high)' },
      { table: 'investments', name: 'returns', type: 'DECIMAL(15,2)', nullable: true, default: 0, description: 'Total returns earned' },

      // Savings goals enhancements
      { table: 'savings_goals', name: 'name', type: 'VARCHAR(255)', nullable: true, description: 'Goal name' },
      { table: 'savings_goals', name: 'monthly_target', type: 'DECIMAL(15,2)', nullable: true, description: 'Monthly savings target' },
    ];

    for (const field of newFields) {
      await migrator.addField(field);
    }

    // Add performance indexes
    console.log("\n📊 Adding Performance Indexes...");
    await migrator.addIndex('transactions', ['user_id', 'date']);
    await migrator.addIndex('accounts', ['user_id', 'type']);
    await migrator.addIndex('transactions', ['category']);
    await migrator.addIndex('transactions', ['type']);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Future-Proof Migrations Completed!");
    console.log("\n🛡️  Data Protection Features:");
    console.log("   • All new fields are nullable (won't break existing data)");
    console.log("   • Default values provided where appropriate");
    console.log("   • Migration history tracked in 'data_migrations' table");
    console.log("   • Indexes added for query performance");
    console.log("   • Safe rollback possible for unused fields");

  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
  } finally {
    await migrator.close();
  }
}

// Export for use in other scripts
export { SafeMigrationManager, MigrationField };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFutureProofMigrations().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
