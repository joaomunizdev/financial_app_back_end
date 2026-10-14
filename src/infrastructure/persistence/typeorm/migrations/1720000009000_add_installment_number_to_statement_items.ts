import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstallmentNumberToStatementItems1720000009000
  implements MigrationInterface
{
  name = 'AddInstallmentNumberToStatementItems1720000009000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE statement_items
        ADD COLUMN IF NOT EXISTS installment_number int NULL;
    `);

    // Backfill existing installment items from their "Parcela k/n" label.
    await q.query(`
      UPDATE statement_items
        SET installment_number = substring(label from '^Parcela (\\d+)/\\d+$')::int
        WHERE installment_number IS NULL
          AND label ~ '^Parcela \\d+/\\d+$';
    `);

    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'statement_items_installment_number_ck'
        ) THEN
          ALTER TABLE statement_items
            ADD CONSTRAINT statement_items_installment_number_ck
            CHECK (installment_number IS NULL OR installment_number >= 1);
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE statement_items
        DROP CONSTRAINT IF EXISTS statement_items_installment_number_ck;
    `);
    await q.query(`
      ALTER TABLE statement_items
        DROP COLUMN IF EXISTS installment_number;
    `);
  }
}
