import { IsOptional, IsString, IsUUID, Length } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTenantDto {
  @ApiProperty({ example: "John Doe", maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;
}
export class UpdateTenantDto {
  @ApiProperty({ example: "John Doe", maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;
}
export class ListTenantsQueryDto {
  @ApiPropertyOptional({ example: "jo" })
  @IsOptional()
  @IsString()
  search?: string;
}
export class TenantIdParamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;
}
