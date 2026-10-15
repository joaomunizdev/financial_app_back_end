import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AuthService } from "../../application/services/auth.service";
import {
  LoginDto,
  RegisterDto,
  ResendLoginCodeDto,
  ResendVerificationDto,
  VerifyEmailDto,
  VerifyLoginDto,
} from "../dtos/auth.dto";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

@ApiTags("auth")
// Stricter limit than the global one to slow down credential stuffing/brute force
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller("/auth")
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post("register")
  @ApiCreatedResponse({
    description: "User created; a confirmation code was e-mailed",
    schema: {
      example: { id: "uuid", name: "John Doe", email: "john@example.com", verificationRequired: true },
    },
  })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Post("verify-email")
  @HttpCode(200)
  @ApiOkResponse({ description: "E-mail confirmed and signed in", schema: { example: { accessToken: "jwt" } } })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.service.verifyEmail(dto.email, dto.code);
  }

  @Post("resend-verification")
  @HttpCode(200)
  @ApiOkResponse({ description: "Same answer whether or not the e-mail exists", schema: { example: { sent: true } } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.service.resendVerification(dto.email);
  }

  @Post("login")
  @ApiOkResponse({
    description:
      "Authenticated ({ accessToken }), or the next step: { emailVerificationRequired, email } / { twoFactorRequired, challengeToken }",
    schema: {
      example: { accessToken: "jwt-token-here" },
    },
  })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto.email, dto.password);
  }

  @Post("login/verify")
  @HttpCode(200)
  @ApiOkResponse({ description: "Second factor accepted", schema: { example: { accessToken: "jwt" } } })
  verifyLogin(@Body() dto: VerifyLoginDto) {
    return this.service.verifyLogin(dto.challengeToken, dto.code);
  }

  @Post("login/resend")
  @HttpCode(200)
  @ApiOkResponse({ schema: { example: { sent: true } } })
  resendLoginCode(@Body() dto: ResendLoginCodeDto) {
    return this.service.resendLoginCode(dto.challengeToken);
  }
}
