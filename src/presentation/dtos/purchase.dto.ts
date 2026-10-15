import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsMoney } from "./money.validator";
import { PageQueryDto } from "./pagination.dto";

export class CreatePurchaseDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() creditCardId!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() tenantId!: string;
  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
  @ApiProperty({ example: "Groceries", maxLength: 255 })
  @IsString()
  @Length(1, 255)
  description!: string;
  @ApiProperty({ example: "2025-08-01" }) @IsDateString() purchaseDate!: string;
  @ApiProperty({ example: "350.40" }) @IsMoney() totalAmount!: string;
  @ApiProperty({ example: false }) @IsBoolean() isInstallment!: boolean;

  @ApiPropertyOptional({ example: 6 })
  @ValidateIf((o) => o.isInstallment === true)
  @IsInt()
  @Min(1)
  installmentsTotal?: number;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o) => o.isInstallment === true)
  @IsInt()
  @Min(0)
  installmentsPaid?: number;
}
export class UpdatePurchaseDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  creditCardId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "null clears it" })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
  @ApiPropertyOptional({ example: "Groceries" })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  description?: string;
  @ApiPropertyOptional({ example: "2025-08-01" })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;
  @ApiPropertyOptional({ example: "350.40" })
  @IsOptional()
  @IsMoney()
  totalAmount?: string;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isInstallment?: boolean;
  @ApiPropertyOptional({ example: 6 })
  @ValidateIf((o) => o.isInstallment === true)
  @IsOptional()
  @IsInt()
  @Min(1)
  installmentsTotal?: number | null;
  @ApiPropertyOptional({ example: 2 })
  @ValidateIf((o) => o.isInstallment === true)
  @IsOptional()
  @IsInt()
  @Min(0)
  installmentsPaid?: number;
}
export class SetInstallmentsPaidDto {
  @ApiProperty({ example: 2 }) @IsInt() @Min(0) installmentsPaid!: number;
}
export class PurchaseIdParamDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
}
export class ListPurchasesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  creditCardId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
  @ApiPropertyOptional({ example: "mercado", description: "Part of the description" })
  @IsOptional()
  @IsString()
  search?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
  @ApiPropertyOptional({ example: "2025-08-01" })
  @IsOptional()
  @IsDateString()
  dateStart?: string;
  @ApiPropertyOptional({ example: "2025-08-31" })
  @IsOptional()
  @IsDateString()
  dateEnd?: string;
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isInstallment?: boolean;
}
