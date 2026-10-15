import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe', maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: '12345678909' })
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'cpf must have 11 digits' })
  cpf?: string;

  @ApiPropertyOptional({ example: '11987654321' })
  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'phone must have 10 or 11 digits' })
  phone?: string;

  @ApiPropertyOptional({ example: '1990-05-20' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

export class TwoFactorDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ description: 'Current password, required to change this setting' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
