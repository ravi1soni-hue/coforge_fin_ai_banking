/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
    return knex.schema.createTable('embeddings', function(table) {
        table.increments('id').primary();
        table.text('text').notNullable();
        table.specificType('embedding', 'vector(736)'); // pgvector type
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
    return knex.schema.dropTable('embeddings');
}
