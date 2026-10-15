import { MigrationInterface, QueryRunner } from 'typeorm';

/** Default categories, shared by every account (created_by_user_id NULL). */
export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Alimentação', icon: 'mdi-silverware-fork-knife' },
  { name: 'Mercado', icon: 'mdi-cart-outline' },
  { name: 'Casa', icon: 'mdi-sofa-outline' },
  { name: 'Contas e serviços', icon: 'mdi-file-document-outline' },
  { name: 'Transporte', icon: 'mdi-car-outline' },
  { name: 'Saúde', icon: 'mdi-heart-pulse' },
  { name: 'Cuidados pessoais', icon: 'mdi-face-man-shimmer-outline' },
  { name: 'Vestuário', icon: 'mdi-tshirt-crew-outline' },
  { name: 'Eletrônicos', icon: 'mdi-laptop' },
  { name: 'Lazer', icon: 'mdi-party-popper' },
  { name: 'Cultura', icon: 'mdi-drama-masks' },
  { name: 'Educação', icon: 'mdi-school-outline' },
  { name: 'Viagem', icon: 'mdi-airplane' },
  { name: 'Presentes', icon: 'mdi-gift-outline' },
  { name: 'Assinaturas', icon: 'mdi-autorenew' },
  { name: 'Pets', icon: 'mdi-paw' },
  { name: 'Outros', icon: 'mdi-dots-horizontal-circle-outline' },
];

/**
 * Expense categories: defaults shared by all accounts plus each user's own.
 * Purchases and subscriptions may point to a category; statement items keep a
 * copy so items whose subscription was deleted stay classified. Deleting a
 * category leaves the records uncategorized (SET NULL).
 */
export class AddCategories1720000015000 implements MigrationInterface {
  name = 'AddCategories1720000015000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(60) NOT NULL,
        icon varchar(60) NOT NULL DEFAULT 'mdi-tag-outline',
        created_by_user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // One name per account, case-insensitive; defaults share the NULL owner bucket.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS categories_owner_name_uq ON categories (
        COALESCE(created_by_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(name)
      );
    `);
    for (const c of DEFAULT_CATEGORIES) {
      await q.query(
        `INSERT INTO categories (name, icon) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
        [c.name, c.icon],
      );
    }

    await q.query(`
      ALTER TABLE purchases
        ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES categories(id) ON DELETE SET NULL;
    `);
    await q.query(`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS categoryid uuid NULL REFERENCES categories(id) ON DELETE SET NULL;
    `);
    await q.query(`
      ALTER TABLE statement_items
        ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES categories(id) ON DELETE SET NULL;
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS purchases_category_idx ON purchases (category_id);`);
    await q.query(`CREATE INDEX IF NOT EXISTS subscriptions_category_idx ON subscriptions (categoryid);`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS statement_items_category_idx ON statement_items (category_id);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE statement_items DROP COLUMN IF EXISTS category_id;`);
    await q.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS categoryid;`);
    await q.query(`ALTER TABLE purchases DROP COLUMN IF EXISTS category_id;`);
    await q.query(`DROP TABLE IF EXISTS categories;`);
  }
}
