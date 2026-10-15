import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { IsMoney } from "./money.validator";
import { PageQueryDto } from "./pagination.dto";
import {
  INVESTMENT_TYPES,
  InvestmentType,
  MOVEMENT_KINDS,
  MovementKind,
} from "../../infrastructure/persistence/typeorm/entities/investment.entity";

export class CreateInvestmentDto {
  @ApiProperty({ example: "CDB Banco X 110% CDI", maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ enum: INVESTMENT_TYPES })
  @IsIn(INVESTMENT_TYPES)
  type!: InvestmentType;

  @ApiPropertyOptional({ example: "Nubank", maxLength: 80, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  institution?: string | null;
}

export class UpdateInvestmentDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ enum: INVESTMENT_TYPES })
  @IsOptional()
  @IsIn(INVESTMENT_TYPES)
  type?: InvestmentType;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, description: "null clears it" })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  institution?: string | null;
}

export class ListInvestmentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: "cdb" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: INVESTMENT_TYPES })
  @IsOptional()
  @IsIn(INVESTMENT_TYPES)
  type?: InvestmentType;
}

export class CreateMovementDto {
  @ApiProperty({ enum: MOVEMENT_KINDS })
  @IsIn(MOVEMENT_KINDS)
  kind!: MovementKind;

  @ApiProperty({ example: "1000.00", description: "Contribution/withdrawal > 0; balance >= 0" })
  @IsMoney()
  amount!: string;

  @ApiProperty({ example: "2026-10-01" })
  @IsDateString()
  date!: string;
}

export class InvestmentIdParamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;
}

export class MovementIdParamDto extends InvestmentIdParamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  movementId!: string;
}
