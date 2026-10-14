import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ example: "John Doe", maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ example: "john@example.com" })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  // bcrypt only uses the first 72 bytes
  @ApiProperty({ minLength: 8, maxLength: 72, example: "StrongPass123" })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: "john@example.com" })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  // No minimum here so accounts created under older rules can still log in
  @ApiProperty({ example: "StrongPass123" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
