import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Subscriptions become statement items (snapshotted at generation time) and every
 * item stores the tenant it is attributed to.
 *
 * Backfill keeps every existing statement total unchanged. The previous code added
 * the active-subscription sum to total_amount without creating items, so for each
 * statement gap = total_amount - sum(items) - adjustment_amount:
 *   - gap equals the card's current active subscriptions → one item per subscription;
 *   - any other non-zero gap → a single unattributed "Assinaturas (histórico)" item.
 */
export class AddSubscriptionItemsToStatements1720000010000
  implements MigrationInterface
{
  name = 'AddSubscriptionItemsToStatements1720000010000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE statement_items
        ALTER COLUMN purchase_id DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'purchase',
        ADD COLUMN IF NOT EXISTS subscription_id uuid NULL
          REFERENCES subscriptions(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
          REFERENCES tenants(id) ON DELETE SET NULL;
    `);

    await q.query(`
      ALTER TABLE statement_items
        ADD CONSTRAINT statement_items_kind_ck
          CHECK (kind IN ('purchase', 'subscription')),
        ADD CONSTRAINT statement_items_purchase_kind_ck
          CHECK (kind <> 'purchase' OR purchase_id IS NOT NULL);
    `);

    await q.query(`
      UPDATE statement_items si
        SET tenant_id = p.tenant_id
        FROM purchases p
        WHERE si.purchase_id = p.id AND si.tenant_id IS NULL;
    `);

    await q.query(`
      CREATE TEMP TABLE _statement_gaps ON COMMIT DROP AS
      SELECT s.id AS statement_id,
             s.credit_card_id,
             c.created_by_user_id AS user_id,
             s.total_amount
               - COALESCE((SELECT SUM(si.amount) FROM statement_items si
                           WHERE si.statement_id = s.id), 0)
               - s.adjustment_amount AS gap,
             COALESCE((SELECT SUM(sb.amount) FROM subscriptions sb
                       WHERE sb.creditcardid = s.credit_card_id
                         AND sb.createdbyuserid = c.created_by_user_id
                         AND sb.active = true), 0) AS active_subs
      FROM statements s
      JOIN credit_cards c ON c.id = s.credit_card_id;
    `);

    await q.query(`
      INSERT INTO statement_items
        (statement_id, kind, subscription_id, tenant_id, label, amount)
      SELECT g.statement_id, 'subscription', sb.id, sb.tenantid, sb.description, sb.amount
      FROM _statement_gaps g
      JOIN subscriptions sb
        ON sb.creditcardid = g.credit_card_id
       AND sb.createdbyuserid = g.user_id
       AND sb.active = true
      WHERE g.gap <> 0 AND g.gap = g.active_subs;
    `);

    await q.query(`
      INSERT INTO statement_items (statement_id, kind, label, amount)
      SELECT g.statement_id, 'subscription', 'Assinaturas (histórico)', g.gap
      FROM _statement_gaps g
      WHERE g.gap <> 0 AND g.gap <> g.active_subs;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM statement_items WHERE kind = 'subscription';`);
    await q.query(`
      ALTER TABLE statement_items
        DROP CONSTRAINT IF EXISTS statement_items_purchase_kind_ck,
        DROP CONSTRAINT IF EXISTS statement_items_kind_ck,
        DROP COLUMN IF EXISTS tenant_id,
        DROP COLUMN IF EXISTS subscription_id,
        DROP COLUMN IF EXISTS kind,
        ALTER COLUMN purchase_id SET NOT NULL;
    `);
  }
}
