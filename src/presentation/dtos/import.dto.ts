import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from './money.validator';

const KINDS = ['statement', 'invoice'] as const;

export class PreviewImportDto {
  @ApiProperty({ enum: KINDS, description: 'Bank statement or credit card invoice' })
  @IsIn(KINDS)
  kind!: 'statement' | 'invoice';

  @ApiPropertyOptional({ format: 'uuid', description: 'Invoices: card used to flag possible duplicates' })
  @IsOptional()
  @IsUUID()
  creditCardId?: string;
}

class InstallmentDto {
  @IsInt() @Min(1) @Max(99) number!: number;
  @IsInt() @Min(2) @Max(99) total!: number;
}

export class ConfirmLineDto {
  @ApiProperty() @IsString() @Length(1, 200) key!: string;
  @ApiProperty({ enum: ['purchase', 'income'] }) @IsIn(['purchase', 'income']) action!: 'purchase' | 'income';
  @ApiProperty({ example: '2026-09-01' }) @IsDateString() date!: string;
  @ApiProperty({ maxLength: 255 }) @IsString() @Length(1, 255) description!: string;
  @ApiProperty({ example: '43.13', description: 'Per installment when installment is set' }) @IsMoney() amount!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstallmentDto)
  installment?: InstallmentDto | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() tenantId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() categoryId?: string | null;
  @ApiPropertyOptional({ enum: ['pix', 'cash'] }) @IsOptional() @IsIn(['pix', 'cash']) paymentMethod?: 'pix' | 'cash';
}

export class ConfirmImportDto {
  @ApiProperty({ enum: KINDS }) @IsIn(KINDS) kind!: 'statement' | 'invoice';
  @ApiPropertyOptional({ format: 'uuid', description: 'Required for invoices' })
  @IsOptional()
  @IsUUID()
  creditCardId?: string;
  @ApiProperty({ type: [ConfirmLineDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ConfirmLineDto)
  lines!: ConfirmLineDto[];
}
