import 'reflect-metadata';
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from './infrastructure/persistence/typeorm/entities/user.entity';
import { Tenant } from './infrastructure/persistence/typeorm/entities/tenant.entity';
import { CreditCard } from './infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Purchase } from './infrastructure/persistence/typeorm/entities/purchase.entity';
import { Init1700000000000 } from './infrastructure/persistence/typeorm/migrations/1700000000000_Init';
import { Statement } from './infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from './infrastructure/persistence/typeorm/entities/statement-item.entity';
import { AddStatements1700000000001 } from './infrastructure/persistence/typeorm/migrations/1710000000000_add_statements';
import { Subscription } from './infrastructure/persistence/typeorm/entities/subscription.entity';
import { CreateSubscriptions1720000000000 } from './infrastructure/persistence/typeorm/migrations/1720000000000_add_subscriptions';
import { AddTenantToSubscriptions1720000002000 } from './infrastructure/persistence/typeorm/migrations/1720000002000_add_tenant_to_subscriptions';
import { FixedExpense } from './infrastructure/persistence/typeorm/entities/fixed-expense.entity';
import { CreateFixedExpenses1720000003000 } from './infrastructure/persistence/typeorm/migrations/1720000003000_add_fixed_expenses';
import { AddTenantToFixedExpenses1720000004000 } from './infrastructure/persistence/typeorm/migrations/1720000004000_add_tenant_to_fixed_expenses';
import { IncomeSource } from './infrastructure/persistence/typeorm/entities/income-source.entity';
import { CreateIncomeSources1720000005000 } from './infrastructure/persistence/typeorm/migrations/1720000005000_add_income_sources';
import { AddTenantToIncomeSources1720000006000 } from './infrastructure/persistence/typeorm/migrations/1720000006000_add_tenant_to_income_sources';
import { AddActiveToCreditCards1720000007000 } from './infrastructure/persistence/typeorm/migrations/1720000007000_add_active_to_credit_cards';
import { AddIncomeTypeToIncomeSources1720000008000 } from './infrastructure/persistence/typeorm/migrations/1720000008000_add_income_type_to_income_sources';
import { AddInstallmentNumberToStatementItems1720000009000 } from './infrastructure/persistence/typeorm/migrations/1720000009000_add_installment_number_to_statement_items';
import { AddSubscriptionItemsToStatements1720000010000 } from './infrastructure/persistence/typeorm/migrations/1720000010000_add_subscription_items_to_statements';
import { AddMissingIndexes1720000011000 } from './infrastructure/persistence/typeorm/migrations/1720000011000_add_missing_indexes';
import { AddValidityDatesToFixedExpensesAndIncome1720000012000 } from './infrastructure/persistence/typeorm/migrations/1720000012000_add_validity_dates_to_fixed_expenses_and_income';

// Shared by the Nest app (AppModule) and the TypeORM CLI / seed. `dotenv/config`
// loads .env for CLI usage; it never overrides variables already set.
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User,
    Tenant,
    CreditCard,
    Purchase,
    Statement,
    StatementItem,
    Subscription,
    FixedExpense,
    IncomeSource,
  ],
  migrations: [
    Init1700000000000,
    AddStatements1700000000001,
    CreateSubscriptions1720000000000,
    AddTenantToSubscriptions1720000002000,
    CreateFixedExpenses1720000003000,
    AddTenantToFixedExpenses1720000004000,
    CreateIncomeSources1720000005000,
    AddTenantToIncomeSources1720000006000,
    AddActiveToCreditCards1720000007000,
    AddIncomeTypeToIncomeSources1720000008000,
    AddInstallmentNumberToStatementItems1720000009000,
    AddSubscriptionItemsToStatements1720000010000,
    AddMissingIndexes1720000011000,
    AddValidityDatesToFixedExpensesAndIncome1720000012000,
  ],
  synchronize: false,
};

export const AppDataSource = new DataSource(dataSourceOptions);
