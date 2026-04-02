/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema
    .createTable('users', function(table) {
      table.string('user_id').primary();
      table.string('name').notNullable();
      table.string('currency').notNullable();
      table.string('country').notNullable();
      table.jsonb('employment').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('accounts', function(table) {
      table.string('account_id').primary();
      table.string('user_id').references('user_id').inTable('users').onDelete('CASCADE');
      table.string('type').notNullable();
      table.string('bank').notNullable();
      table.decimal('balance', 15, 2).notNullable();
      table.decimal('average_monthly_balance', 15, 2);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('loans', function(table) {
      table.string('loan_id').primary();
      table.string('user_id').references('user_id').inTable('users').onDelete('CASCADE');
      table.string('type').notNullable();
      table.string('provider').notNullable();
      table.decimal('emi', 10, 2).notNullable();
      table.integer('remaining_tenure_months').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('subscriptions', function(table) {
      table.increments('id').primary();
      table.string('user_id').references('user_id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.decimal('amount', 10, 2).notNullable();
      table.string('cycle').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('investments', function(table) {
      table.increments('id').primary();
      table.string('user_id').references('user_id').inTable('users').onDelete('CASCADE');
      table.string('type').notNullable();
      table.string('provider').notNullable();
      table.decimal('current_value', 15, 2).notNullable();
      table.decimal('monthly_contribution', 10, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('transactions', function(table) {
      table.increments('id').primary();
      table.string('user_id').references('user_id').inTable('users').onDelete('CASCADE');
      table.date('date').notNullable();
      table.enu('type', ['CREDIT', 'DEBIT']).notNullable();
      table.string('category').notNullable();
      table.decimal('amount', 10, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('savings_goals', function(table) {
      table.string('goal_id').primary();
      table.string('user_id').references('user_id').inTable('users').onDelete('CASCADE');
      table.decimal('target_amount', 15, 2).notNullable();
      table.date('target_date').notNullable();
      table.decimal('current_saved', 15, 2).notNullable();
      table.string('status').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema
    .dropTable('savings_goals')
    .dropTable('transactions')
    .dropTable('investments')
    .dropTable('subscriptions')
    .dropTable('loans')
    .dropTable('accounts')
    .dropTable('users');
};
