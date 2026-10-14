import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMoney } from './money.validator';
import { IncomeSourceType } from '../../infrastructure/persistence/typeorm/entities/income-source.entity';

export class CreateIncomeSourceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ example: 'Salario' })
  @IsString()
  @Length(1, 180)
  description!: string;

  @ApiProperty({ example: '3500.00', description: 'BRL string' })
  @IsMoney()
  amount!: string;

  @ApiPropertyOptional({
    enum: IncomeSourceType,
    default: IncomeSourceType.FIXED,
  })
  @IsOptional()
  @IsEnum(IncomeSourceType)
  incomeType?: IncomeSourceType;

  @ApiPropertyOptional({
    example: '2025-01-01',
    nullable: true,
    description: 'First day it counts in; for one_time income, the date it is received (defaults to today, Brazil time)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({
    example: '2025-12-31',
    nullable: true,
    description: 'Last day it counts in; null = no end',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class UpdateIncomeSourceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'Freelance' })
  @IsOptional()
  @IsString()
  @Length(1, 180)
  description?: string;

  @ApiPropertyOptional({ example: '1200.00', description: 'BRL string' })
  @IsOptional()
  @IsMoney()
  amount?: string;

  @ApiPropertyOptional({ enum: IncomeSourceType })
  @IsOptional()
  @IsEnum(IncomeSourceType)
  incomeType?: IncomeSourceType;

  @ApiPropertyOptional({
    example: '2025-01-01',
    nullable: true,
    description: 'First day it counts in; for one_time income, the date it is received (defaults to today, Brazil time)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({
    example: '2025-12-31',
    nullable: true,
    description: 'Last day it counts in; null = no end',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}
