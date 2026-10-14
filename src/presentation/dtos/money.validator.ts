import { Matches } from 'class-validator';

// Up to 10 integer digits keeps every value within the smallest money column (numeric(12,2)).
const UNSIGNED_MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const SIGNED_MONEY = /^-?\d{1,10}(\.\d{1,2})?$/;

/** BRL amount as a string with at most 2 decimal places, e.g. "1500.00". */
export function IsMoney(options: { allowNegative?: boolean } = {}) {
  return options.allowNegative
    ? Matches(SIGNED_MONEY, {
        message: '$property must be an amount with up to 2 decimal places',
      })
    : Matches(UNSIGNED_MONEY, {
        message:
          '$property must be a non-negative amount with up to 2 decimal places',
      });
}
