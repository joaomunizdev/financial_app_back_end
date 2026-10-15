import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Card type (credit or debit). Existing cards become "credit", which keeps every
 * current purchase valid: installment purchases are only rejected on debit cards.
 * Switching a card to debit (PATCH) converts its installment purchases; this
 * migration changes no financial data.
 */
export class AddCardTypeToCreditCards1720000013000 implements MigrationInterface {
  name = 'AddCardTypeToCreditCards1720000013000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_card_type') THEN
          CREATE TYPE credit_card_type AS ENUM ('credit', 'debit');
        END IF;
      END $$;
    `);
    await q.query(`
      ALTER TABLE credit_cards
        ADD COLUMN IF NOT EXISTS card_type credit_card_type NOT NULL DEFAULT 'credit';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE credit_cards DROP COLUMN IF EXISTS card_type;`);
    await q.query(`DROP TYPE IF EXISTS credit_card_type;`);
  }
}
