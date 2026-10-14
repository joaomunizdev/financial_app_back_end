import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional validity period for fixed expenses and income sources, so editing them
 * no longer rewrites past months. NULL bounds mean "open-ended", which matches the
 * previous behavior (counted in every month).
 *
 * For one-time income, start_date is the date it counts in; existing rows are
 * backfilled from created_at in Brazilian time (the previous bucketing rule).
 */
export class AddValidityDatesToFixedExpensesAndIncome1720000012000
  implements MigrationInterface
{
  name = 'AddValidityDatesToFixedExpensesAndIncome1720000012000';

  public async up(q: QueryRunner): Promise<void> {
    for (const table of ['fixed_expenses', 'income_sources']) {
      await q.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS start_date date NULL,
          ADD COLUMN IF NOT EXISTS end_date date NULL,
          ADD CONSTRAINT ${table}_validity_ck
            CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
      `);
    }

    await q.query(`
      UPDATE income_sources
        SET start_date = (createdAt AT TIME ZONE 'America/Sao_Paulo')::date
        WHERE incomeType = 'one_time' AND start_date IS NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of ['fixed_expenses', 'income_sources']) {
      await q.query(`
        ALTER TABLE ${table}
          DROP CONSTRAINT IF EXISTS ${table}_validity_ck,
          DROP COLUMN IF EXISTS end_date,
          DROP COLUMN IF EXISTS start_date;
      `);
    }
  }
}
