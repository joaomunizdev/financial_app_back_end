import { MigrationInterface, QueryRunner } from 'typeorm';
import { CARD_BRANDS } from '../entities/credit-card.entity';

/** Spellings found in free-text brands, mapped to the official name. */
const ALIASES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  'master card': 'Mastercard',
  master: 'Mastercard',
  elo: 'Elo',
  'american express': 'American Express',
  amex: 'American Express',
  hipercard: 'Hipercard',
  'hiper card': 'Hipercard',
  'diners club': 'Diners Club',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  cabal: 'Cabal',
};

/**
 * Card brands become a closed list of real brands (CHECK credit_cards_brand_chk).
 * Known spellings are normalized; any other value stops the migration with the
 * list of unknown brands, so they are fixed deliberately instead of guessed.
 */
export class StandardizeCardBrands1720000017000 implements MigrationInterface {
  name = 'StandardizeCardBrands1720000017000';

  public async up(q: QueryRunner): Promise<void> {
    for (const [alias, brand] of Object.entries(ALIASES)) {
      await q.query(
        `UPDATE credit_cards SET brand = $1 WHERE lower(btrim(brand)) = $2 AND brand <> $1;`,
        [brand, alias],
      );
    }
    const unknown: { brand: string; count: string }[] = await q.query(
      `SELECT brand, count(*) AS count FROM credit_cards WHERE brand <> ALL($1) GROUP BY brand;`,
      [CARD_BRANDS],
    );
    if (unknown.length) {
      const list = unknown.map((u) => `"${u.brand}" (${u.count})`).join(', ');
      throw new Error(
        `Unknown card brands: ${list}. Update them to one of: ${CARD_BRANDS.join(', ')}.`,
      );
    }
    const allowed = CARD_BRANDS.map((b) => `'${b.replace(/'/g, "''")}'`).join(', ');
    await q.query(
      `ALTER TABLE credit_cards ADD CONSTRAINT credit_cards_brand_chk CHECK (brand IN (${allowed}));`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE credit_cards DROP CONSTRAINT IF EXISTS credit_cards_brand_chk;`);
  }
}
