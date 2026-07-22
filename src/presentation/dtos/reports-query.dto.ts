import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReportsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  statementId?: string;
}

export class ReportsByTenantQueryDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class InstallmentsTotalQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  creditCardId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
