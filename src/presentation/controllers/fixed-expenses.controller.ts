import {
  Body,
  Controller,
  Delete,
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
import { FixedExpensesService } from '../../application/services/fixed-expenses.service';
import {
  CreateFixedExpenseDto,
  UpdateFixedExpenseDto,
} from '../dtos/fixed-expense.dto';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { PageQueryDto } from '../dtos/pagination.dto';
import { pageRequest } from '../../application/utils/pagination';

@ApiTags('fixed-expenses')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('fixed-expenses')
export class FixedExpensesController {
  constructor(private readonly service: FixedExpensesService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Create a new fixed expense.' })
  create(@ReqUser() user: any, @Body() dto: CreateFixedExpenseDto) {
    return this.service.create(user.userId, dto);
  }

  @Get()
  @ApiOkResponse({
    description: 'List all fixed expenses for the authenticated user.',
  })
  list(@ReqUser() user: any, @Query() q: PageQueryDto) {
    return this.service.list(user.userId, pageRequest(q));
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get a fixed expense by id.' })
  findOne(@ReqUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update a fixed expense.' })
  update(
    @ReqUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFixedExpenseDto,
  ) {
    return this.service.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete a fixed expense.' })
  remove(@ReqUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(user.userId, id);
  }
}
