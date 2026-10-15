import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, ExtractJwt } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(payload: any) {
    // Purpose-scoped tokens (e.g. the 2FA login challenge) are never access tokens.
    if (payload.purpose) throw new UnauthorizedException();
    return { userId: payload.sub, email: payload.email };
  }
}
