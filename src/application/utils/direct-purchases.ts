import { Repository } from 'typeorm';
import { Purchase } from '../../infrastructure/persistence/typeorm/entities/purchase.entity';

/**
 * Pix and cash purchases of a period. They never enter a statement, so reports
 * add them by purchase date (periodEnd is exclusive, see monthPeriod()).
 */
export function directPurchasesInPeriod(
  purchases: Repository<Purchase>,
  userId: string,
  periodStart: string,
  periodEnd: string,
) {
  return purchases
    .createQueryBuilder('dp')
    .where('dp.createdByUserId = :dpUser', { dpUser: userId })
    .andWhere('dp.creditCardId IS NULL')
    .andWhere('dp.purchaseDate >= :dpStart AND dp.purchaseDate < :dpEnd', {
      dpStart: periodStart,
      dpEnd: periodEnd,
    });
}
