import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1700000000000 implements MigrationInterface {
  name = "Init1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(120) NOT NULL,
        email varchar(180) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(120) NOT NULL,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tenants_owner_name_uq UNIQUE (created_by_user_id, name)
      );
      CREATE TABLE credit_cards (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        nickname varchar(80) NOT NULL,
        brand varchar(50) NOT NULL,
        last4 varchar(4) NOT NULL,
        limit_amount numeric(14,2),
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX credit_cards_owner_nickname_idx ON credit_cards(created_by_user_id, nickname);

      CREATE TABLE purchases (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE RESTRICT,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description varchar(255) NOT NULL,
        purchase_date date NOT NULL,
        total_amount numeric(14,2) NOT NULL,
        is_installment boolean NOT NULL DEFAULT false,
        installments_total int NULL,
        installments_paid int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX purchases_credit_card_idx ON purchases(credit_card_id);
      CREATE INDEX purchases_tenant_idx ON purchases(tenant_id);
      CREATE INDEX purchases_owner_idx ON purchases(created_by_user_id);
      CREATE INDEX purchases_date_idx ON purchases(purchase_date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS purchases_date_idx;
      DROP INDEX IF EXISTS purchases_owner_idx;
      DROP INDEX IF EXISTS purchases_tenant_idx;
      DROP INDEX IF EXISTS purchases_credit_card_idx;
      DROP TABLE IF EXISTS purchases;
      DROP INDEX IF EXISTS credit_cards_owner_nickname_idx;
      DROP TABLE IF EXISTS credit_cards;
      DROP TABLE IF EXISTS tenants;
      DROP TABLE IF EXISTS users;
    `);
  }
}
