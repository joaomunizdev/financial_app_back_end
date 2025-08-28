// src/presentation/controllers/statements.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { StatementsService } from '../../application/services/statements.service';
import {
  CreateStatementDto,
  PayStatementDto,
  UpdateStatementDto,
} from '../dtos/statement.dto';

@ApiTags('statements')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('statements')
export class StatementsController {
  constructor(private readonly service: StatementsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Generate monthly statement for a card' })
  generate(@ReqUser() user: any, @Body() dto: CreateStatementDto) {
    return this.service.generate({
      creditCardId: dto.creditCardId,
      year: dto.year,
      month: dto.month,
      closingDate: dto.closingDate,
      dueDate: dto.dueDate,
      locked: dto.locked,
      userId: user.userId,
    });
  }

  @Get()
  @ApiOkResponse({
    description:
      'List statements by card. If year & month are passed returns a single statement or 404.',
  })
  list(
    @ReqUser() user: any,
    @Query('creditCardId') creditCardId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? Number(year) : undefined;
    const m = month ? Number(month) : undefined;
    return this.service.list(user.userId, { creditCardId, year: y, month: m });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get a statement with items' })
  get(@ReqUser() user: any, @Param('id') id: string) {
    return this.service.findById(id, user.userId);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update statement metadata/adjustment' })
  update(
    @ReqUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateStatementDto,
  ) {
    return this.service.update(id, user.userId, dto as any);
  }

  @Post(':id/pay')
  @ApiOkResponse({ description: 'Mark statement as paid' })
  pay(
    @ReqUser() user: any,
    @Param('id') id: string,
    @Body() dto: PayStatementDto,
  ) {
    return this.service.pay(id, user.userId, dto.amount, dto.paidAt);
  }
}
