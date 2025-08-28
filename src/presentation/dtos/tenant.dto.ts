import { IsOptional, IsString, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTenantDto {
  @ApiProperty({ example: "John Doe" })
  @IsString()
  name!: string;
}
export class UpdateTenantDto {
  @ApiProperty({ example: "John Doe" })
  @IsString()
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
