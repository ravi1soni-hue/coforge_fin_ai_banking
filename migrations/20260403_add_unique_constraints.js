/**
 * Add unique constraints to prevent duplicate data
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema
    // Add unique constraint on subscriptions
    .alterTable('subscriptions', function(table) {
      table.unique(['user_id', 'name'], { indexName: 'subscriptions_user_name_unique' });
    })
    // Add unique constraint on investments
    .alterTable('investments', function(table) {
      table.unique(['user_id', 'type', 'provider'], { indexName: 'investments_user_type_provider_unique' });
    })
    // Add unique constraint on transactions (prevents exact duplicate transactions on same day)
    .alterTable('transactions', function(table) {
      table.unique(['user_id', 'date', 'category', 'type', 'amount'], { indexName: 'transactions_unique_composite' });
    })
    // Add unique constraint on savings_goals
    .alterTable('savings_goals', function(table) {
      table.unique(['user_id', 'goal_id'], { indexName: 'savings_goals_user_id_unique' });
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema
    .alterTable('subscriptions', function(table) {
      table.dropIndex('subscriptions_user_name_unique');
    })
    .alterTable('investments', function(table) {
      table.dropIndex('investments_user_type_provider_unique');
    })
    .alterTable('transactions', function(table) {
      table.dropIndex('transactions_unique_composite');
    })
    .alterTable('savings_goals', function(table) {
      table.dropIndex('savings_goals_user_id_unique');
    });
};
