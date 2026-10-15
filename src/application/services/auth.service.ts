/** AuthService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { User } from "../../infrastructure/persistence/typeorm/entities/user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { VerificationCodesService } from "./verification-codes.service";
import { isValidCpf, onlyDigits } from "../utils/cpf";
import { isBlockedEmailDomain } from "../utils/email";
import { todayInReportTimeZone } from "../utils/dates";

/** Claim that marks the short-lived token between password and login code. */
export const TWO_FACTOR_PURPOSE = "2fa";
const CHALLENGE_EXPIRES_IN = "10m";

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  cpf: string;
  phone: string;
  birthDate: string;
};

/** Shared by sign-up and profile updates: normalizes and validates identification fields. */
export function normalizeIdentity(input: { cpf?: string; phone?: string; birthDate?: string }) {
  const out: { cpf?: string; phone?: string; birthDate?: string } = {};
  if (input.cpf !== undefined) {
    const cpf = onlyDigits(input.cpf);
    if (!isValidCpf(cpf)) throw new BadRequestException("Invalid CPF");
    out.cpf = cpf;
  }
  if (input.phone !== undefined) {
    const phone = onlyDigits(input.phone);
    if (phone.length < 10 || phone.length > 11) {
      throw new BadRequestException("Phone must have 10 or 11 digits including area code");
    }
    out.phone = phone;
  }
  if (input.birthDate !== undefined) {
    const birthDate = input.birthDate.slice(0, 10);
    if (birthDate < "1900-01-01" || birthDate > todayInReportTimeZone()) {
      throw new BadRequestException("Invalid birth date");
    }
    out.birthDate = birthDate;
  }
  return out;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly codes: VerificationCodesService
  ) {}

  /** Creates an unconfirmed account and e-mails the confirmation code. */
  async register(input: RegisterInput) {
    const email = input.email.toLowerCase();
    if (isBlockedEmailDomain(email)) {
      throw new BadRequestException("Email domain not allowed");
    }
    const identity = normalizeIdentity(input);
    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException("Email already in use");
    }
    if (await this.users.findOne({ where: { cpf: identity.cpf } })) {
      throw new ConflictException("CPF already in use");
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.users.save(
      this.users.create({
        name: input.name.trim(),
        email,
        passwordHash,
        cpf: identity.cpf,
        phone: identity.phone,
        birthDate: identity.birthDate,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
      })
    );
    await this.codes.issue(user, "email_verification");
    return { id: user.id, name: user.name, email: user.email, verificationRequired: true };
  }

  /** Confirms the e-mail with the code and signs the user in. */
  async verifyEmail(email: string, code: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user || user.emailVerifiedAt) {
      throw new BadRequestException("Invalid or expired code");
    }
    await this.codes.consume(user.id, "email_verification", code);
    user.emailVerifiedAt = new Date();
    await this.users.save(user);
    return { accessToken: await this.signAccess(user) };
  }

  /** Always answers the same way so it can't be used to probe which e-mails exist. */
  async resendVerification(email: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (user && !user.emailVerifiedAt) {
      await this.codes.issue(user, "email_verification");
    }
    return { sent: true };
  }

  /**
   * Password step. Returns an access token, or tells the client which code step
   * comes next (e-mail confirmation, or the optional login second factor).
   */
  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    if (!user.emailVerifiedAt) {
      await this.codes.issue(user, "email_verification");
      return { emailVerificationRequired: true, email: user.email };
    }
    if (user.twoFactorEnabled) {
      await this.codes.issue(user, "login");
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, purpose: TWO_FACTOR_PURPOSE },
        { expiresIn: CHALLENGE_EXPIRES_IN }
      );
      return { twoFactorRequired: true, challengeToken };
    }
    return { accessToken: await this.signAccess(user) };
  }

  /** Second step of a two-factor login. */
  async verifyLogin(challengeToken: string, code: string) {
    const user = await this.userFromChallenge(challengeToken);
    await this.codes.consume(user.id, "login", code);
    return { accessToken: await this.signAccess(user) };
  }

  async resendLoginCode(challengeToken: string) {
    const user = await this.userFromChallenge(challengeToken);
    await this.codes.issue(user, "login");
    return { sent: true };
  }

  private async userFromChallenge(challengeToken: string) {
    const expired = new BadRequestException("Login session expired, sign in again");
    let payload: { sub?: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(challengeToken);
    } catch {
      throw expired;
    }
    if (payload.purpose !== TWO_FACTOR_PURPOSE || !payload.sub) throw expired;
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.twoFactorEnabled) throw expired;
    return user;
  }

  private signAccess(user: User) {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }
}
