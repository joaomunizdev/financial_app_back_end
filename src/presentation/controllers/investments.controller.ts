import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { InvestmentsService } from "../../application/services/investments.service";
import { pageRequest } from "../../application/utils/pagination";
import { JwtAuthGuard, ReqUser } from "../security/jwt.guard";
import {
  CreateInvestmentDto,
  CreateMovementDto,
  InvestmentIdParamDto,
  ListInvestmentsQueryDto,
  MovementIdParamDto,
  UpdateInvestmentDto,
} from "../dtos/investment.dto";

@ApiTags("investments")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("/investments")
export class InvestmentsController {
  constructor(private readonly service: InvestmentsService) {}

  @Get()
  @ApiOkResponse({
    description:
      "Investments with currentValue (today) and investedTotal (contributions − withdrawals)",
  })
  list(@ReqUser() user: any, @Query() q: ListInvestmentsQueryDto) {
    return this.service.list(user.userId, { search: q.search, type: q.type }, pageRequest(q));
  }

  @Post()
  @ApiCreatedResponse({ description: "Investment created" })
  create(@ReqUser() user: any, @Body() dto: CreateInvestmentDto) {
    return this.service.create(user.userId, dto);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Investment updated" })
  update(@ReqUser() user: any, @Param() p: InvestmentIdParamDto, @Body() dto: UpdateInvestmentDto) {
    return this.service.update(p.id, user.userId, dto);
  }

  @Delete(":id")
  @ApiNoContentResponse({ description: "Investment and its movements removed" })
  remove(@ReqUser() user: any, @Param() p: InvestmentIdParamDto) {
    return this.service.remove(p.id, user.userId);
  }

  @Get(":id/movements")
  @ApiOkResponse({ description: "Movements, newest first" })
  movements(@ReqUser() user: any, @Param() p: InvestmentIdParamDto) {
    return this.service.listMovements(p.id, user.userId);
  }

  @Post(":id/movements")
  @ApiCreatedResponse({
    description: "Contribution, withdrawal (≤ value on that date) or balance update",
  })
  addMovement(@ReqUser() user: any, @Param() p: InvestmentIdParamDto, @Body() dto: CreateMovementDto) {
    return this.service.addMovement(p.id, user.userId, dto);
  }

  @Delete(":id/movements/:movementId")
  @ApiNoContentResponse({ description: "Movement removed" })
  removeMovement(@ReqUser() user: any, @Param() p: MovementIdParamDto) {
    return this.service.removeMovement(p.id, p.movementId, user.userId);
  }
}
