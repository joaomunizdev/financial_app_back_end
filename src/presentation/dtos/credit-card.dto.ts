import { IsOptional, IsString, Length, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateCreditCardDto {
  @ApiProperty({ example: "Main Visa" })
  @IsString()
  nickname!: string;
  @ApiProperty({ example: "Visa" })
  @IsString()
  brand!: string;
  @ApiProperty({ example: "1234", minLength: 4, maxLength: 4 })
  @IsString()
  @Length(4, 4)
  last4!: string;
  @ApiPropertyOptional({ example: "5000.00", description: "BRL string" })
  @IsOptional()
  @IsString()
  limitAmount?: string;
}
export class UpdateCreditCardDto {
  @ApiPropertyOptional({ example: "Main Visa" })
  @IsOptional()
  @IsString()
  nickname?: string;
  @ApiPropertyOptional({ example: "Visa" })
  @IsOptional()
  @IsString()
  brand?: string;
  @ApiPropertyOptional({ example: "1234" })
  @IsOptional()
  @IsString()
  @Length(4, 4)
  last4?: string;
  @ApiPropertyOptional({ example: "5000.00" })
  @IsOptional()
  @IsString()
  limitAmount?: string;
}
export class CreditCardIdParamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;
}
