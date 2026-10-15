import { IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Material Design Icons class name, e.g. "mdi-silverware-fork-knife".
const ICON_PATTERN = /^mdi-[a-z0-9-]{1,56}$/;

export class CreateCategoryDto {
  @ApiProperty({ example: "Academia", maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ example: "mdi-dumbbell" })
  @IsOptional()
  @Matches(ICON_PATTERN)
  icon?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: "Academia", maxLength: 60 })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ example: "mdi-dumbbell" })
  @IsOptional()
  @Matches(ICON_PATTERN)
  icon?: string;
}

export class CategoryIdParamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;
}
