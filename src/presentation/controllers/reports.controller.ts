import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from '../../application/services/reports.service';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { ReportsQueryDto } from '../dtos/reports-query.dto';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('by-tenant')
  byTenant(@ReqUser() user: any, @Query() q: ReportsQueryDto) {
    return this.service.totalsByTenant(user.userId, {
      statementId: q.statementId,
    });
  }

  @Get('global')
  global(@ReqUser() user: any, @Query() q: ReportsQueryDto) {
    return this.service.totalGlobal(user.userId, {
      statementId: q.statementId,
    });
  }
}
