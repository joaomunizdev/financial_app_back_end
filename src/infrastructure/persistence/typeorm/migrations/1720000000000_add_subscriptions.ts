import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptions1720000000000 implements MigrationInterface {
  name = 'CreateSubscriptions1720000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        creditCardId uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
        description varchar(180) NOT NULL,
        amount numeric(12,2) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        createdByUserId uuid NOT NULL,
        createdAt timestamptz NOT NULL DEFAULT now(),
        updatedAt timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(createdByUserId);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_subscriptions_user;`);
    await q.query(`DROP TABLE IF EXISTS subscriptions;`);
  }
}
