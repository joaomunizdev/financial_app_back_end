import 'reflect-metadata';
import { DataSource } from 'typeorm';
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

export const AppDataSource = new DataSource({
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
  ],
  migrations: [
    Init1700000000000,
    AddStatements1700000000001,
    CreateSubscriptions1720000000000,
    AddTenantToSubscriptions1720000002000,
  ],
  synchronize: false,
});
