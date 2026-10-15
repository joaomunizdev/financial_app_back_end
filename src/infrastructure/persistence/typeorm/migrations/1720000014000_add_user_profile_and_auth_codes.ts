import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Profile fields (CPF, phone, birth date), e-mail confirmation and optional login
 * second factor. Existing accounts are treated as already confirmed (verified at
 * their creation time) so nobody is locked out; their new profile fields stay null
 * until the user fills them in.
 */
export class AddUserProfileAndAuthCodes1720000014000 implements MigrationInterface {
  name = 'AddUserProfileAndAuthCodes1720000014000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS cpf varchar(11) NULL,
        ADD COLUMN IF NOT EXISTS phone varchar(11) NULL,
        ADD COLUMN IF NOT EXISTS birth_date date NULL,
        ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
    `);
    await q.query(`
      UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_uq ON users (cpf) WHERE cpf IS NOT NULL;
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS auth_codes (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose varchar(30) NOT NULL CHECK (purpose IN ('email_verification', 'login')),
        code_hash varchar(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts int NOT NULL DEFAULT 0,
        consumed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS auth_codes_user_purpose_idx ON auth_codes (user_id, purpose);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS auth_codes;`);
    await q.query(`DROP INDEX IF EXISTS users_cpf_uq;`);
    await q.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS two_factor_enabled,
        DROP COLUMN IF EXISTS email_verified_at,
        DROP COLUMN IF EXISTS birth_date,
        DROP COLUMN IF EXISTS phone,
        DROP COLUMN IF EXISTS cpf;
    `);
  }
}
