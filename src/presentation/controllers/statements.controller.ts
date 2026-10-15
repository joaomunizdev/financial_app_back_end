import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
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
import { pageRequest } from '../../application/utils/pagination';
import { StatementsService } from '../../application/services/statements.service';
import {
  CreateStatementDto,
  ListStatementsQueryDto,
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
      'List statements. You can filter by creditCardId and/or by year and month. Card + year + month without page returns that single statement (404 when missing).',
  })
  list(@ReqUser() user: any, @Query() q: ListStatementsQueryDto) {
    const { creditCardId, year, month } = q;
    return this.service.list(user.userId, { creditCardId, year, month }, pageRequest(q));
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get a statement with items' })
  get(@ReqUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id, user.userId);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update statement metadata/adjustment' })
  update(
    @ReqUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStatementDto,
  ) {
    return this.service.update(id, user.userId, dto as any);
  }

  @Post(':id/pay')
  @ApiOkResponse({ description: 'Mark statement as paid' })
  pay(
    @ReqUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PayStatementDto,
  ) {
    return this.service.pay(id, user.userId, dto.amount, dto.paidAt);
  }
}
