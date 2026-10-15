import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
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

  @ApiProperty({ example: "12345678909", description: "11 digits, check digits validated" })
  @Matches(/^\d{11}$/, { message: "cpf must have 11 digits" })
  cpf!: string;

  @ApiProperty({ example: "11987654321", description: "10 or 11 digits with area code" })
  @Matches(/^\d{10,11}$/, { message: "phone must have 10 or 11 digits" })
  phone!: string;

  @ApiProperty({ example: "1990-05-20" })
  @IsDateString()
  birthDate!: string;
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

const CODE = /^\d{6}$/;

export class VerifyEmailDto {
  @ApiProperty({ example: "john@example.com" })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: "123456" })
  @Matches(CODE, { message: "code must have 6 digits" })
  code!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: "john@example.com" })
  @IsEmail()
  @MaxLength(180)
  email!: string;
}

export class VerifyLoginDto {
  @ApiProperty({ description: "challengeToken returned by POST /auth/login" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  challengeToken!: string;

  @ApiProperty({ example: "123456" })
  @Matches(CODE, { message: "code must have 6 digits" })
  code!: string;
}

export class ResendLoginCodeDto {
  @ApiProperty({ description: "challengeToken returned by POST /auth/login" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  challengeToken!: string;
}
