import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Investments and their movements: contributions, withdrawals and balance
 * updates (the value reported by the bank/broker on a date).
 */
export class AddInvestments1720000018000 implements MigrationInterface {
  name = 'AddInvestments1720000018000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS investments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(120) NOT NULL,
        type varchar(20) NOT NULL CHECK (type IN (
          'fixed_income', 'stocks', 'real_estate_funds', 'funds', 'crypto', 'pension', 'other'
        )),
        institution varchar(80) NULL,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS investments_owner_idx ON investments (created_by_user_id);`,
    );
    await q.query(`
      CREATE TABLE IF NOT EXISTS investment_movements (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        investment_id uuid NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
        kind varchar(20) NOT NULL CHECK (kind IN ('contribution', 'withdrawal', 'balance')),
        amount numeric(14,2) NOT NULL CHECK (amount >= 0),
        date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS investment_movements_investment_date_idx
        ON investment_movements (investment_id, date);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS investment_movements;`);
    await q.query(`DROP TABLE IF EXISTS investments;`);
  }
}
