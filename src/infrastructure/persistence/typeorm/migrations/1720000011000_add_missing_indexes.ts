import { MigrationInterface, QueryRunner } from 'typeorm';

/** Indexes for foreign keys used in joins, filters and ON DELETE cascades. */
export class AddMissingIndexes1720000011000 implements MigrationInterface {
  name = 'AddMissingIndexes1720000011000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE INDEX IF NOT EXISTS statement_items_purchase_idx ON statement_items(purchase_id);
      CREATE INDEX IF NOT EXISTS statement_items_subscription_idx ON statement_items(subscription_id);
      CREATE INDEX IF NOT EXISTS statement_items_tenant_idx ON statement_items(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_card ON subscriptions(creditCardId);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenantId);
      CREATE INDEX IF NOT EXISTS idx_fixed_expenses_tenant ON fixed_expenses(tenantId);
      CREATE INDEX IF NOT EXISTS idx_income_sources_tenant ON income_sources(tenantId);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS idx_income_sources_tenant;
      DROP INDEX IF EXISTS idx_fixed_expenses_tenant;
      DROP INDEX IF EXISTS idx_subscriptions_tenant;
      DROP INDEX IF EXISTS idx_subscriptions_card;
      DROP INDEX IF EXISTS statement_items_tenant_idx;
      DROP INDEX IF EXISTS statement_items_subscription_idx;
      DROP INDEX IF EXISTS statement_items_purchase_idx;
    `);
  }
}
