// src/presentation/dtos/statement.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class CreateStatementDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() creditCardId!: string;
  @ApiProperty({ example: 2025 }) @IsInt() @Min(2000) @Max(2100) year!: number;
  @ApiProperty({ example: 8 }) @IsInt() @Min(1) @Max(12) month!: number;
  @ApiPropertyOptional({ example: "2025-08-10" })
  @IsOptional()
  @IsDateString()
  closingDate?: string;
  @ApiPropertyOptional({ example: "2025-08-17" })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}

export class UpdateStatementDto {
  @ApiPropertyOptional({ example: "2025-08-10" })
  @IsOptional()
  @IsDateString()
  closingDate?: string | null;
  @ApiPropertyOptional({ example: "2025-08-17" })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;
  @ApiPropertyOptional({ example: "0.00" })
  @IsOptional()
  adjustmentAmount?: string;
}

export class PayStatementDto {
  @ApiProperty({ example: "1550.90" }) amount!: string;
  @ApiPropertyOptional({ example: "2025-08-20" })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
