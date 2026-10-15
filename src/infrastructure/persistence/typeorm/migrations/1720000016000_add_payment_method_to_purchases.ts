import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Purchases paid by Pix or cash: no credit card, always one-time, never part of a
 * statement. Existing purchases become "card"; no financial data changes.
 */
export class AddPaymentMethodToPurchases1720000016000 implements MigrationInterface {
  name = 'AddPaymentMethodToPurchases1720000016000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE purchases
        ADD COLUMN IF NOT EXISTS payment_method varchar(10) NOT NULL DEFAULT 'card';
    `);
    await q.query(`ALTER TABLE purchases ALTER COLUMN credit_card_id DROP NOT NULL;`);
    await q.query(`
      ALTER TABLE purchases
        ADD CONSTRAINT purchases_payment_method_chk
          CHECK (payment_method IN ('card', 'pix', 'cash')),
        ADD CONSTRAINT purchases_card_matches_method_chk
          CHECK ((payment_method = 'card') = (credit_card_id IS NOT NULL)),
        ADD CONSTRAINT purchases_direct_one_time_chk
          CHECK (payment_method = 'card' OR is_installment = false);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Pix/cash purchases have no card and can't survive the NOT NULL constraint.
    await q.query(`DELETE FROM purchases WHERE credit_card_id IS NULL;`);
    await q.query(`
      ALTER TABLE purchases
        DROP CONSTRAINT IF EXISTS purchases_direct_one_time_chk,
        DROP CONSTRAINT IF EXISTS purchases_card_matches_method_chk,
        DROP CONSTRAINT IF EXISTS purchases_payment_method_chk;
    `);
    await q.query(`ALTER TABLE purchases ALTER COLUMN credit_card_id SET NOT NULL;`);
    await q.query(`ALTER TABLE purchases DROP COLUMN IF EXISTS payment_method;`);
  }
}
