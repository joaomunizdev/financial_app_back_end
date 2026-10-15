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
import { IncomeSourcesService } from '../../application/services/income-sources.service';
import {
  CreateIncomeSourceDto,
  UpdateIncomeSourceDto,
} from '../dtos/income-source.dto';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { PageQueryDto } from '../dtos/pagination.dto';
import { pageRequest } from '../../application/utils/pagination';

@ApiTags('income-sources')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('income-sources')
export class IncomeSourcesController {
  constructor(private readonly service: IncomeSourcesService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Create a new income source.' })
  create(@ReqUser() user: any, @Body() dto: CreateIncomeSourceDto) {
    return this.service.create(user.userId, dto);
  }

  @Get()
  @ApiOkResponse({
    description: 'List all income sources for the authenticated user.',
  })
  list(@ReqUser() user: any, @Query() q: PageQueryDto) {
    return this.service.list(user.userId, pageRequest(q));
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get an income source by id.' })
  findOne(@ReqUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update an income source.' })
  update(
    @ReqUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIncomeSourceDto,
  ) {
    return this.service.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete an income source.' })
  remove(@ReqUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(user.userId, id);
  }
}
