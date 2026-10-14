import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @IsNumberString()
  amount!: string;

  @ApiPropertyOptional({
    enum: IncomeSourceType,
    default: IncomeSourceType.FIXED,
  })
  @IsOptional()
  @IsEnum(IncomeSourceType)
  incomeType?: IncomeSourceType;
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
  @IsNumberString()
  amount?: string;

  @ApiPropertyOptional({ enum: IncomeSourceType })
  @IsOptional()
  @IsEnum(IncomeSourceType)
  incomeType?: IncomeSourceType;
}
