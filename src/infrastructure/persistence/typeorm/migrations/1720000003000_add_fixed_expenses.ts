import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFixedExpenses1720000003000 implements MigrationInterface {
  name = 'CreateFixedExpenses1720000003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS fixed_expenses (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        description varchar(180) NOT NULL,
        amount numeric(12,2) NOT NULL,
        createdByUserId uuid NOT NULL,
        createdAt timestamptz NOT NULL DEFAULT now(),
        updatedAt timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user ON fixed_expenses(createdByUserId);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_fixed_expenses_user;`);
    await q.query(`DROP TABLE IF EXISTS fixed_expenses;`);
  }
}
