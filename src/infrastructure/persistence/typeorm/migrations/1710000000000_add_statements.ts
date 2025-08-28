// src/infrastructure/persistence/typeorm/migrations/1700000000001_AddStatements.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatements1700000000001 implements MigrationInterface {
  name = "AddStatements1700000000001";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE statements (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        closing_date date NULL,
        due_date date NULL,
        total_amount numeric(14,2) NOT NULL DEFAULT 0,
        adjustment_amount numeric(14,2) NOT NULL DEFAULT 0,
        locked boolean NOT NULL DEFAULT false,
        paid_at timestamptz NULL,
        paid_amount numeric(14,2) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT statements_card_month_uq UNIQUE (credit_card_id, year, month)
      );
      CREATE TABLE statement_items (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
        purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        label varchar(120) NOT NULL,
        amount numeric(14,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX statement_items_statement_idx ON statement_items(statement_id);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS statement_items_statement_idx;`);
    await q.query(`DROP TABLE IF EXISTS statement_items;`);
    await q.query(`DROP TABLE IF EXISTS statements;`);
  }
}
