import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  IsUUID,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsMoney } from "./money.validator";
import { CreditCardType } from "../../infrastructure/persistence/typeorm/entities/credit-card.entity";

export class CreateCreditCardDto {
  @ApiProperty({ example: "Main Visa", maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nickname!: string;
  @ApiProperty({ example: "Visa", maxLength: 50 })
  @IsString()
  @Length(1, 50)
  brand!: string;
  @ApiProperty({ example: "1234", minLength: 4, maxLength: 4 })
  @IsString()
  @Matches(/^\d{4}$/, { message: "last4 must be 4 digits" })
  last4!: string;
  @ApiPropertyOptional({ example: "5000.00", description: "BRL string" })
  @IsOptional()
  @IsMoney()
  limitAmount?: string;
  @ApiPropertyOptional({ enum: CreditCardType, default: CreditCardType.CREDIT })
  @IsOptional()
  @IsEnum(CreditCardType)
  cardType?: CreditCardType;
}
export class UpdateCreditCardDto {
  @ApiPropertyOptional({ example: "Main Visa" })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  nickname?: string;
  @ApiPropertyOptional({ example: "Visa" })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  brand?: string;
  @ApiPropertyOptional({ example: "1234" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: "last4 must be 4 digits" })
  last4?: string;
  @ApiPropertyOptional({ example: "5000.00" })
  @IsOptional()
  @IsMoney()
  limitAmount?: string;
  @ApiPropertyOptional({
    enum: CreditCardType,
    description:
      "Changing a credit card to debit converts its installment purchases into one purchase per month",
  })
  @IsOptional()
  @IsEnum(CreditCardType)
  cardType?: CreditCardType;
  @ApiPropertyOptional({
    example: false,
    description: "false hides the card and its data from every endpoint",
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
export class CreditCardIdParamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;
}
