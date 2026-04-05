import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIncomeSources1720000005000 implements MigrationInterface {
  name = 'CreateIncomeSources1720000005000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS income_sources (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        description varchar(180) NOT NULL,
        amount numeric(12,2) NOT NULL,
        createdByUserId uuid NOT NULL,
        createdAt timestamptz NOT NULL DEFAULT now(),
        updatedAt timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_income_sources_user ON income_sources(createdByUserId);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_income_sources_user;`);
    await q.query(`DROP TABLE IF EXISTS income_sources;`);
  }
}
