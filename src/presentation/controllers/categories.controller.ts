import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CategoriesService } from "../../application/services/categories.service";
import { JwtAuthGuard, ReqUser } from "../security/jwt.guard";
import {
  CategoryIdParamDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from "../dtos/category.dto";
import { pageRequest } from "../../application/utils/pagination";

@ApiTags("categories")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("/categories")
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @ApiOkResponse({ description: "Default categories plus the user's own ({ id, name, icon, isDefault })" })
  list(@ReqUser() user: any, @Query() q: ListCategoriesQueryDto) {
    return this.service.list(user.userId, { scope: q.scope, search: q.search }, pageRequest(q));
  }

  @Post()
  @ApiCreatedResponse({ description: "Category created (409 when the name is in use)" })
  create(@ReqUser() user: any, @Body() dto: CreateCategoryDto) {
    return this.service.create(user.userId, dto);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Category updated (defaults are read-only: 403)" })
  update(@ReqUser() user: any, @Param() p: CategoryIdParamDto, @Body() dto: UpdateCategoryDto) {
    return this.service.update(p.id, user.userId, dto);
  }

  @Delete(":id")
  @ApiNoContentResponse({ description: "Category removed; its records become uncategorized" })
  remove(@ReqUser() user: any, @Param() p: CategoryIdParamDto) {
    return this.service.remove(p.id, user.userId);
  }
}
