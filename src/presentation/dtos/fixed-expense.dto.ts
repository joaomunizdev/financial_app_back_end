import {
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFixedExpenseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ example: 'Aluguel' })
  @IsString()
  @Length(1, 180)
  description!: string;

  @ApiProperty({ example: '1500.00', description: 'BRL string' })
  @IsNumberString()
  amount!: string;
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
  @IsNumberString()
  amount?: string;
}
