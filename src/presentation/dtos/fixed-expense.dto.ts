import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMoney } from './money.validator';

export class CreateFixedExpenseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ example: 'Aluguel' })
  @IsString()
  @Length(1, 180)
  description!: string;

  @ApiProperty({ example: '1500.00', description: 'BRL string' })
  @IsMoney()
  amount!: string;

  @ApiPropertyOptional({
    example: '2025-01-01',
    nullable: true,
    description: 'First day it counts in; null = always',
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

export class UpdateFixedExpenseDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'Condominio' })
  @IsOptional()
  @IsString()
  @Length(1, 180)
  description?: string;

  @ApiPropertyOptional({ example: '650.00', description: 'BRL string' })
  @IsOptional()
  @IsMoney()
  amount?: string;

  @ApiPropertyOptional({
    example: '2025-01-01',
    nullable: true,
    description: 'First day it counts in; null = always',
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
