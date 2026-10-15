import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE, SortDir } from '../../application/utils/pagination';

/**
 * Optional paging for list endpoints. Without `page` the endpoint returns the
 * full array; with it, `{ items, total, page, pageSize }`.
 */
export class PageQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Enables paging (1-based)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Column key; unknown keys use the default order' })
  @IsOptional()
  @Matches(/^[a-zA-Z]{1,40}$/)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: SortDir;
}
