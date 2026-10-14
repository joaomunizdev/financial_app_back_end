import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIncomeTypeToIncomeSources1720000008000
  implements MigrationInterface
{
  name = 'AddIncomeTypeToIncomeSources1720000008000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'income_source_type'
        ) THEN
          CREATE TYPE income_source_type AS ENUM ('fixed', 'one_time');
        END IF;
      END $$;
    `);

    await q.query(`
      ALTER TABLE income_sources
        ADD COLUMN IF NOT EXISTS incomeType income_source_type NOT NULL DEFAULT 'fixed';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE income_sources
        DROP COLUMN IF EXISTS incomeType;
    `);

    await q.query(`
      DROP TYPE IF EXISTS income_source_type;
    `);
  }
}
