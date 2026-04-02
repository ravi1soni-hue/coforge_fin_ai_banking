/**
 * Future-proof data migration - Make schema more flexible and add new optional fields
 * This migration preserves all existing data while making the schema more adaptable
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema
    // Make users table more flexible
    .alterTable('users', function(table) {
      // Add optional fields that might be useful in the future
      table.string('email').nullable();
      table.string('phone').nullable();
      table.date('date_of_birth').nullable();
      table.string('address').nullable();
      table.jsonb('preferences').nullable().defaultTo('{}');
      table.boolean('is_active').nullable().defaultTo(true);
      table.timestamp('last_login').nullable();

      // Add indexes for performance
      table.index(['email']);
      table.index(['is_active']);
    })

    // Make accounts table more flexible
    .alterTable('accounts', function(table) {
      // Add optional fields
      table.string('account_number').nullable();
      table.string('iban').nullable();
      table.string('swift_code').nullable();
      table.boolean('is_primary').nullable().defaultTo(false);
      table.string('status').nullable().defaultTo('active');
      table.decimal('interest_rate', 5, 2).nullable();
      table.date('opening_date').nullable();
      table.jsonb('metadata').nullable().defaultTo('{}');

      // Add indexes
      table.index(['user_id', 'type']);
      table.index(['status']);
    })

    // Make loans table more flexible
    .alterTable('loans', function(table) {
      // Add optional fields
      table.decimal('principal_amount', 15, 2).nullable();
      table.decimal('total_amount', 15, 2).nullable();
      table.decimal('interest_rate', 5, 2).nullable();
      table.date('start_date').nullable();
      table.date('end_date').nullable();
      table.string('status').nullable().defaultTo('active');
      table.integer('total_tenure_months').nullable();
      table.jsonb('terms').nullable().defaultTo('{}');

      // Add indexes
      table.index(['user_id', 'status']);
    })

    // Make subscriptions table more flexible
    .alterTable('subscriptions', function(table) {
      // Add optional fields
      table.string('description').nullable();
      table.date('start_date').nullable();
      table.date('end_date').nullable();
      table.boolean('auto_renew').nullable().defaultTo(true);
      table.string('category').nullable();
      table.string('payment_method').nullable();
      table.string('status').nullable().defaultTo('active');
      table.jsonb('billing_info').nullable().defaultTo('{}');

      // Add indexes
      table.index(['user_id', 'status']);
      table.index(['category']);
    })

    // Make investments table more flexible
    .alterTable('investments', function(table) {
      // Add optional fields
      table.decimal('initial_investment', 15, 2).nullable();
      table.decimal('total_contributions', 15, 2).nullable();
      table.decimal('returns', 15, 2).nullable().defaultTo(0);
      table.decimal('return_percentage', 7, 2).nullable().defaultTo(0);
      table.date('start_date').nullable();
      table.string('risk_level').nullable();
      table.string('status').nullable().defaultTo('active');
      table.jsonb('performance_data').nullable().defaultTo('{}');

      // Add indexes
      table.index(['user_id', 'type']);
      table.index(['status']);
    })

    // Make transactions table more flexible
    .alterTable('transactions', function(table) {
      // Add optional fields
      table.string('description').nullable();
      table.string('reference').nullable();
      table.string('merchant').nullable();
      table.string('location').nullable();
      table.string('payment_method').nullable();
      table.boolean('is_recurring').nullable().defaultTo(false);
      table.string('tags').nullable(); // JSON array as string
      table.string('status').nullable().defaultTo('completed');
      table.jsonb('additional_data').nullable().defaultTo('{}');

      // Add indexes
      table.index(['user_id', 'date']);
      table.index(['category']);
      table.index(['type']);
      table.index(['status']);
    })

    // Make savings_goals table more flexible
    .alterTable('savings_goals', function(table) {
      // Add optional fields
      table.string('name').nullable();
      table.string('description').nullable();
      table.decimal('monthly_target', 15, 2).nullable();
      table.string('category').nullable();
      table.integer('priority').nullable().defaultTo(1);
      table.boolean('auto_save').nullable().defaultTo(false);
      table.string('linked_account').nullable();
      table.jsonb('progress_history').nullable().defaultTo('[]');

      // Add indexes
      table.index(['user_id', 'status']);
      table.index(['priority']);
    })

    // Create audit table for tracking changes
    .createTable('data_migrations', function(table) {
      table.increments('id').primary();
      table.string('table_name').notNullable();
      table.string('operation').notNullable(); // 'ADD_COLUMN', 'MODIFY_COLUMN', etc.
      table.string('field_name').notNullable();
      table.string('field_type').nullable();
      table.boolean('nullable').nullable();
      table.string('default_value').nullable();
      table.timestamp('executed_at').defaultTo(knex.fn.now());
      table.string('version').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema
    // Remove added columns (safely - only if they exist)
    .alterTable('users', function(table) {
      table.dropColumn('email');
      table.dropColumn('phone');
      table.dropColumn('date_of_birth');
      table.dropColumn('address');
      table.dropColumn('preferences');
      table.dropColumn('is_active');
      table.dropColumn('last_login');
    })
    .alterTable('accounts', function(table) {
      table.dropColumn('account_number');
      table.dropColumn('iban');
      table.dropColumn('swift_code');
      table.dropColumn('is_primary');
      table.dropColumn('status');
      table.dropColumn('interest_rate');
      table.dropColumn('opening_date');
      table.dropColumn('metadata');
    })
    .alterTable('loans', function(table) {
      table.dropColumn('principal_amount');
      table.dropColumn('total_amount');
      table.dropColumn('interest_rate');
      table.dropColumn('start_date');
      table.dropColumn('end_date');
      table.dropColumn('status');
      table.dropColumn('total_tenure_months');
      table.dropColumn('terms');
    })
    .alterTable('subscriptions', function(table) {
      table.dropColumn('description');
      table.dropColumn('start_date');
      table.dropColumn('end_date');
      table.dropColumn('auto_renew');
      table.dropColumn('category');
      table.dropColumn('payment_method');
      table.dropColumn('status');
      table.dropColumn('billing_info');
    })
    .alterTable('investments', function(table) {
      table.dropColumn('initial_investment');
      table.dropColumn('total_contributions');
      table.dropColumn('returns');
      table.dropColumn('return_percentage');
      table.dropColumn('start_date');
      table.dropColumn('risk_level');
      table.dropColumn('status');
      table.dropColumn('performance_data');
    })
    .alterTable('transactions', function(table) {
      table.dropColumn('description');
      table.dropColumn('reference');
      table.dropColumn('merchant');
      table.dropColumn('location');
      table.dropColumn('payment_method');
      table.dropColumn('is_recurring');
      table.dropColumn('tags');
      table.dropColumn('status');
      table.dropColumn('additional_data');
    })
    .alterTable('savings_goals', function(table) {
      table.dropColumn('name');
      table.dropColumn('description');
      table.dropColumn('monthly_target');
      table.dropColumn('category');
      table.dropColumn('priority');
      table.dropColumn('auto_save');
      table.dropColumn('linked_account');
      table.dropColumn('progress_history');
    })
    .dropTableIfExists('data_migrations');
};
