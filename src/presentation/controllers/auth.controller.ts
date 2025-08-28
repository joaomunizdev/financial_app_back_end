import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "../../application/services/auth.service";
import { LoginDto, RegisterDto } from "../dtos/auth.dto";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("auth")
@Controller("/auth")
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post("register")
  @ApiCreatedResponse({
    description: "User created",
    schema: {
      example: { id: "uuid", name: "John Doe", email: "john@example.com" },
    },
  })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto.name, dto.email, dto.password);
  }

  @Post("login")
  @ApiOkResponse({
    description: "Authenticated",
    schema: {
      example: { accessToken: "jwt-token-here" },
    },
  })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto.email, dto.password);
  }
}
