import { IsBoolean, IsDateString, IsOptional, IsUUID } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class ReportFiltersQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  creditCardId?: string;
  @ApiPropertyOptional({ example: "2025-08-01" })
  @IsOptional()
  @IsDateString()
  dateStart?: string;
  @ApiPropertyOptional({ example: "2025-08-31" })
  @IsOptional()
  @IsDateString()
  dateEnd?: string;
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isInstallment?: boolean;
}
