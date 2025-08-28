import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ReportsService } from "../../application/services/reports.service";
import { JwtAuthGuard, ReqUser } from "../security/jwt.guard";
import { ReportFiltersQueryDto } from "../dtos/report.dto";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("reports")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("/reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get("by-tenant")
  @ApiOkResponse({ description: "Totals grouped by tenant" })
  @ApiQuery({ name: "creditCardId", required: false, type: String })
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
  byTenant(@ReqUser() user: any, @Query() q: ReportFiltersQueryDto) {
    return this.service.summaryByTenant({ userId: user.userId, ...q });
  }

  @Get("global")
  @ApiOkResponse({ description: "Global total amount" })
  @ApiQuery({ name: "creditCardId", required: false, type: String })
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
  global(@ReqUser() user: any, @Query() q: ReportFiltersQueryDto) {
    return this.service.globalSummary({ userId: user.userId, ...q });
  }
}
