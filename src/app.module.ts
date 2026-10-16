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
import { ConfigModule, ConfigService } from '@nestjs/config';
import { throttlerOptions } from './presentation/security/rate-limits';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { dataSourceOptions } from './typeorm.config';
import { validateEnv } from './config/env.validation';
import { FixedExpense } from './infrastructure/persistence/typeorm/entities/fixed-expense.entity';
import { FixedExpensesController } from './presentation/controllers/fixed-expenses.controller';
import { FixedExpensesService } from './application/services/fixed-expenses.service';
import { IncomeSource } from './infrastructure/persistence/typeorm/entities/income-source.entity';
import { IncomeSourcesController } from './presentation/controllers/income-sources.controller';
import { IncomeSourcesService } from './application/services/income-sources.service';
import { HealthController } from './presentation/controllers/health.controller';
import { AuthCode } from './infrastructure/persistence/typeorm/entities/auth-code.entity';
import { UsersController } from './presentation/controllers/users.controller';
import { UsersService } from './application/services/users.service';
import { VerificationCodesService } from './application/services/verification-codes.service';
import { MailService } from './infrastructure/mail/mail.service';
import { Category } from './infrastructure/persistence/typeorm/entities/category.entity';
import { CategoriesController } from './presentation/controllers/categories.controller';
import { CategoriesService } from './application/services/categories.service';
import { Investment, InvestmentMovement } from './infrastructure/persistence/typeorm/entities/investment.entity';
import { InvestmentsController } from './presentation/controllers/investments.controller';
import { InvestmentsService } from './application/services/investments.service';
import { ImportsController } from './presentation/controllers/imports.controller';
import { ImportsService } from './application/services/imports.service';

@Module({
  imports: [
    SecurityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => throttlerOptions(config.get<string>('CLIENT_IP_HEADER')),
    }),
    TypeOrmModule.forFeature([
      User,
      Tenant,
      CreditCard,
      Purchase,
      Statement,
      StatementItem,
      Subscription,
      FixedExpense,
      IncomeSource,
      AuthCode,
      Category,
      Investment,
      InvestmentMovement,
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
    FixedExpensesController,
    IncomeSourcesController,
    HealthController,
    UsersController,
    CategoriesController,
    InvestmentsController,
    ImportsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuthService,
    TenantsService,
    CreditCardsService,
    PurchasesService,
    ReportsService,
    StatementsService,
    SubscriptionsService,
    ReportsPdfService,
    FixedExpensesService,
    IncomeSourcesService,
    UsersService,
    VerificationCodesService,
    MailService,
    CategoriesService,
    InvestmentsService,
    ImportsService,
  ],
})
export class AppModule {}
