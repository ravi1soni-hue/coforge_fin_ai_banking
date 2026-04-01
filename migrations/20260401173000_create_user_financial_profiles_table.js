/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema.createTable(
    "user_financial_profiles",
    function (table) {
      table.string("user_id").primary();
      table.decimal("current_balance", 14, 2).nullable();
      table.decimal("monthly_income", 14, 2).nullable();
      table.decimal("monthly_expenses", 14, 2).nullable();
      table.decimal("net_monthly_savings", 14, 2).nullable();
      table.string("currency", 10).nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table
        .timestamp("updated_at")
        .defaultTo(knex.fn.now());
    }
  );
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema.dropTable("user_financial_profiles");
}
