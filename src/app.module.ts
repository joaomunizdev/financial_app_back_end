import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './infrastructure/persistence/typeorm/entities/user.entity';
import { Tenant } from './infrastructure/persistence/typeorm/entities/tenant.entity';
import { CreditCard } from './infrastructure/persistence/typeorm/entities/credit-card.entity';
import { Purchase } from './infrastructure/persistence/typeorm/entities/purchase.entity';
import { AuthController } from './presentation/controllers/auth.controller';
import { TenantsController } from './presentation/controllers/tenants.controller';
import { CreditCardsController } from './presentation/controllers/credit-cards.controller';
import { PurchasesController } from './presentation/controllers/purchases.controller';
import { ReportsController } from './presentation/controllers/reports.controller';
import { AuthService } from './application/services/auth.service';
import { TenantsService } from './application/services/tenants.service';
import { CreditCardsService } from './application/services/credit-cards.service';
import { PurchasesService } from './application/services/purchases.service';
import { ReportsService } from './application/services/reports.service';
import { SecurityModule } from './presentation/security/security.module';
import { Statement } from './infrastructure/persistence/typeorm/entities/statement.entity';
import { StatementItem } from './infrastructure/persistence/typeorm/entities/statement-item.entity';
import { StatementsService } from './application/services/statements.service';
import { StatementsController } from './presentation/controllers/statements.controller';
import { Subscription } from './infrastructure/persistence/typeorm/entities/subscription.entity';
import { SubscriptionsController } from './presentation/controllers/subscriptions.controller';
import { SubscriptionsService } from './application/services/subscriptions.service';
import { ReportsPdfService } from './application/services/reports-pdf.service';
import { ReportsPdfController } from './presentation/controllers/reports-pdf.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    SecurityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
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
      synchronize: false,
    }),
    TypeOrmModule.forFeature([
      User,
      Tenant,
      CreditCard,
      Purchase,
      Statement,
      StatementItem,
      Subscription,
    ]),
  ],
  controllers: [
    AuthController,
    TenantsController,
    CreditCardsController,
    PurchasesController,
    ReportsController,
    StatementsController,
    SubscriptionsController,
    ReportsPdfController,
  ],
  providers: [
    AuthService,
    TenantsService,
    CreditCardsService,
    PurchasesService,
    ReportsService,
    StatementsService,
    SubscriptionsService,
    ReportsPdfService,
  ],
})
export class AppModule {}
