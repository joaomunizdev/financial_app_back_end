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
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { SubscriptionsService } from '../../application/services/subscriptions.service';
import {
  CreateSubscriptionDto,
  ListSubscriptionsQueryDto,
  UpdateSubscriptionDto,
} from '../dtos/subscription.dto';
import { pageRequest } from '../../application/utils/pagination';

@ApiTags('subscriptions')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Create a new subscription.' })
  create(@ReqUser() u: any, @Body() dto: CreateSubscriptionDto) {
    return this.service.create(u.userId, dto);
  }

  @Get()
  @ApiOkResponse({
    description: 'List all subscriptions for the authenticated user.',
  })
  list(@ReqUser() u: any, @Query() q: ListSubscriptionsQueryDto) {
    const { search, creditCardId, categoryId, status } = q;
    return this.service.list(
      u.userId,
      { search, creditCardId, categoryId, status },
      pageRequest(q),
    );
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get a subscription by id.' })
  findOne(@ReqUser() u: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(u.userId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update a subscription.' })
  update(
    @ReqUser() u: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.service.update(u.userId, id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete a subscription.' })
  remove(@ReqUser() u: any, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(u.userId, id);
  }
}
