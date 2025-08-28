/** AuthService
 * Clean-architecture application service.
 * Exposes use-cases and enforces business rules.
 */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { User } from "../../infrastructure/persistence/typeorm/entities/user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService
  ) {}

  async register(name: string, email: string, password: string) {
    const exists = await this.users.findOne({
      where: { email: email.toLowerCase() },
    });
    if (exists) throw new ConflictException("Email already in use");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.users.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });
    await this.users.save(user);
    return { id: user.id, name: user.name, email: user.email };
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });
    return { accessToken };
  }
}
