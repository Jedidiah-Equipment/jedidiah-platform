import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("products_name_unique").on(table.name)],
);
