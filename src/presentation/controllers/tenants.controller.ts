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
import { TenantsService } from "../../application/services/tenants.service";
import { JwtAuthGuard, ReqUser } from "../security/jwt.guard";
import {
  CreateTenantDto,
  ListTenantsQueryDto,
  TenantIdParamDto,
  UpdateTenantDto,
} from "../dtos/tenant.dto";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("tenants")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("/tenants")
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Post()
  @ApiCreatedResponse({ description: "Tenant created" })
  create(@ReqUser() user: any, @Body() dto: CreateTenantDto) {
    return this.service.create(dto.name, user.userId);
  }

  @Get()
  @ApiOkResponse({ description: "List tenants" })
  list(@ReqUser() user: any, @Query() q: ListTenantsQueryDto) {
    return this.service.list(user.userId, q.search);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Tenant updated" })
  update(
    @ReqUser() user: any,
    @Param() p: TenantIdParamDto,
    @Body() dto: UpdateTenantDto
  ) {
    return this.service.update(p.id, dto.name, user.userId);
  }

  @Delete(":id")
  @ApiNoContentResponse({ description: "Tenant removed" })
  remove(@ReqUser() user: any, @Param() p: TenantIdParamDto) {
    return this.service.remove(p.id, user.userId);
  }
}
