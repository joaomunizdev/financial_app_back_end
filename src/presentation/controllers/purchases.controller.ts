import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PurchasesService } from "../../application/services/purchases.service";
import { JwtAuthGuard, ReqUser } from "../security/jwt.guard";
import {
  CreatePurchaseDto,
  ListPurchasesQueryDto,
  PurchaseIdParamDto,
  SetInstallmentsPaidDto,
  UpdatePurchaseDto,
} from "../dtos/purchase.dto";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("purchases")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("/purchases")
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  @Post()
  @ApiCreatedResponse({ description: "Purchase created" })
  create(@ReqUser() user: any, @Body() dto: CreatePurchaseDto) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  @ApiOkResponse({ description: "List purchases" })
  @ApiQuery({ name: "creditCardId", required: false, type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiQuery({
    name: "dateStart",
    required: false,
    type: String,
    example: "2025-08-01",
  })
  @ApiQuery({
    name: "dateEnd",
    required: false,
    type: String,
    example: "2025-08-31",
  })
  @ApiQuery({ name: "isInstallment", required: false, type: Boolean })
  list(@ReqUser() user: any, @Query() q: ListPurchasesQueryDto) {
    return this.service.list({ userId: user.userId, ...q });
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Purchase updated" })
  update(
    @ReqUser() user: any,
    @Param() p: PurchaseIdParamDto,
    @Body() dto: UpdatePurchaseDto
  ) {
    return this.service.update(p.id, dto, user.userId);
  }

  @Post(":id/installments-paid")
  @ApiOkResponse({ description: "Installments updated" })
  setInstallmentsPaid(
    @ReqUser() user: any,
    @Param() p: PurchaseIdParamDto,
    @Body() dto: SetInstallmentsPaidDto
  ) {
    return this.service.setInstallmentsPaid(
      p.id,
      dto.installmentsPaid,
      user.userId
    );
  }

  @Delete(":id")
  @ApiNoContentResponse({ description: "Purchase removed" })
  remove(@ReqUser() user: any, @Param() p: PurchaseIdParamDto) {
    return this.service.remove(p.id, user.userId);
  }
}
