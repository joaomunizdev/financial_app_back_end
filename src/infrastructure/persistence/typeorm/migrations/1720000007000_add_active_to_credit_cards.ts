import { MigrationInterface, QueryRunner } from "typeorm";

export class AddActiveToCreditCards1720000007000
  implements MigrationInterface
{
  name = "AddActiveToCreditCards1720000007000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credit_cards
      ADD COLUMN active boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credit_cards
      DROP COLUMN active
    `);
  }
}
