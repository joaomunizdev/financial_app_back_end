import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from '../../application/services/reports.service';
import { InvestmentsService } from '../../application/services/investments.service';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import {
  InstallmentsTotalQueryDto,
  ReportsByTenantQueryDto,
  ReportsQueryDto,
} from '../dtos/reports-query.dto';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly investments: InvestmentsService,
  ) {}

  @Get('by-tenant')
  byTenant(@ReqUser() user: any, @Query() q: ReportsByTenantQueryDto) {
    return this.service.totalsByTenant(user.userId, q.year, q.month);
  }

  @Get('by-category')
  @ApiOkResponse({
    description:
      'Statement items of the month per category, largest first: [{ categoryId, name, icon, totalAmount }] (categoryId null = uncategorized)',
  })
  byCategory(@ReqUser() user: any, @Query() q: ReportsByTenantQueryDto) {
    return this.service.totalsByCategory(user.userId, q.year, q.month);
  }

  @Get('investments')
  @ApiOkResponse({
    description:
      'Investments summary for the month: { totalValue, contributions, withdrawals, investmentsCount, history[6]: { year, month, value }, byType: { type, value }[] }',
  })
  investmentsSummary(@ReqUser() user: any, @Query() q: ReportsByTenantQueryDto) {
    return this.investments.summary(user.userId, q.year, q.month);
  }

  @Get('global')
  global(@ReqUser() user: any, @Query() q: ReportsQueryDto) {
    return this.service.totalGlobal(user.userId, {
      statementId: q.statementId,
    });
  }

  @Get('installments-total')
  installmentsTotal(
    @ReqUser() user: any,
    @Query() q: InstallmentsTotalQueryDto,
  ) {
    return this.service.installmentsTotalFromMonth(
      user.userId,
      q.creditCardId,
      q.year,
      q.month,
      q.tenantId,
    );
  }
}
