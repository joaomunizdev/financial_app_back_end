import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantToIncomeSources1720000006000
  implements MigrationInterface
{
  name = 'AddTenantToIncomeSources1720000006000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE income_sources
        ADD COLUMN IF NOT EXISTS tenantId uuid NULL;
    `);

    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.constraint_column_usage u
          JOIN information_schema.table_constraints tc
            ON tc.constraint_name = u.constraint_name
          WHERE tc.table_name='income_sources' AND u.column_name='tenantid'
        ) THEN
          ALTER TABLE income_sources
            ADD CONSTRAINT fk_income_sources_tenant
            FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE income_sources DROP CONSTRAINT IF EXISTS fk_income_sources_tenant;`,
    );
    await q.query(`ALTER TABLE income_sources DROP COLUMN IF EXISTS tenantId;`);
  }
}
