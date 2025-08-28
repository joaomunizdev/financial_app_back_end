import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CreditCardsService } from "../../application/services/credit-cards.service";
import { JwtAuthGuard, ReqUser } from "../security/jwt.guard";
import {
  CreateCreditCardDto,
  CreditCardIdParamDto,
  UpdateCreditCardDto,
} from "../dtos/credit-card.dto";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("credit-cards")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("/credit-cards")
export class CreditCardsController {
  constructor(private readonly service: CreditCardsService) {}

  @Post()
  @ApiCreatedResponse({ description: "Credit card created" })
  create(@ReqUser() user: any, @Body() dto: CreateCreditCardDto) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  @ApiOkResponse({ description: "List credit cards" })
  list(@ReqUser() user: any) {
    return this.service.list(user.userId);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Credit card updated" })
  update(
    @ReqUser() user: any,
    @Param() p: CreditCardIdParamDto,
    @Body() dto: UpdateCreditCardDto
  ) {
    return this.service.update(p.id, dto, user.userId);
  }

  @Delete(":id")
  @ApiNoContentResponse({ description: "Credit card removed" })
  remove(@ReqUser() user: any, @Param() p: CreditCardIdParamDto) {
    return this.service.remove(p.id, user.userId);
  }
}
