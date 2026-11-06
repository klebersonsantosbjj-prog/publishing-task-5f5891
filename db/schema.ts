import { pgTable, integer, jsonb } from 'drizzle-orm/pg-core';

export const catalogEdits = pgTable('catalog_edits', {
  id: integer().primaryKey(),
  product: jsonb().notNull(),
});
export const catalogState = pgTable('catalog_state', {
  id: integer().primaryKey(),
  revision: integer().notNull().default(0),
});
