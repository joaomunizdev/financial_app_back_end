import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantToFixedExpenses1720000004000
  implements MigrationInterface
{
  name = 'AddTenantToFixedExpenses1720000004000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE fixed_expenses
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
          WHERE tc.table_name='fixed_expenses' AND u.column_name='tenantid'
        ) THEN
          ALTER TABLE fixed_expenses
            ADD CONSTRAINT fk_fixed_expenses_tenant
            FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fk_fixed_expenses_tenant;`,
    );
    await q.query(`ALTER TABLE fixed_expenses DROP COLUMN IF EXISTS tenantId;`);
  }
}
