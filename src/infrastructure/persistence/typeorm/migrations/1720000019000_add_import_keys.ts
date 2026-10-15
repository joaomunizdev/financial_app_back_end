import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records created by statement/invoice imports keep a key of the line they came
 * from, so importing the same file (or the next invoice with the same
 * installment purchase) again doesn't duplicate them.
 */
export class AddImportKeys1720000019000 implements MigrationInterface {
  name = 'AddImportKeys1720000019000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS import_key varchar(200) NULL;`);
    await q.query(`ALTER TABLE income_sources ADD COLUMN IF NOT EXISTS import_key varchar(200) NULL;`);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS purchases_owner_import_key_uq
        ON purchases (created_by_user_id, import_key) WHERE import_key IS NOT NULL;
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS income_sources_owner_import_key_uq
        ON income_sources (createdbyuserid, import_key) WHERE import_key IS NOT NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS income_sources_owner_import_key_uq;`);
    await q.query(`DROP INDEX IF EXISTS purchases_owner_import_key_uq;`);
    await q.query(`ALTER TABLE income_sources DROP COLUMN IF EXISTS import_key;`);
    await q.query(`ALTER TABLE purchases DROP COLUMN IF EXISTS import_key;`);
  }
}
