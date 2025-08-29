import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantToSubscriptions1720000002000
  implements MigrationInterface
{
  name = 'AddTenantToSubscriptions1720000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE subscriptions
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
          WHERE tc.table_name='subscriptions' AND u.column_name='tenantid'
        ) THEN
          ALTER TABLE subscriptions
            ADD CONSTRAINT fk_subs_tenant
            FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_subs_tenant;`,
    );
    await q.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS tenantId;`);
  }
}
