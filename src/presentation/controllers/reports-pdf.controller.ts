import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { ReportsPdfService } from '../../application/services/reports-pdf.service';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsPdfController {
  constructor(private readonly pdf: ReportsPdfService) {}

  @Get('tenants/:tenantId/monthly-pdf')
  @ApiOkResponse({
    description:
      'Download monthly PDF for a tenant (all statements/cards in that month).',
  })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({
    name: 'month',
    required: true,
    type: Number,
    description: '1..12',
  })
  async tenantMonthlyPdf(
    @ReqUser() user: any,
    @Param('tenantId') tenantId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Res() res: Response,
  ) {
    return this.pdf.tenantMonthlyPdf(user.userId, tenantId, year, month, res);
  }
}
