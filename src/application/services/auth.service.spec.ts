import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, TWO_FACTOR_PURPOSE } from './auth.service';
import { JwtStrategy } from '../../presentation/security/jwt.strategy';

const input = () => ({
  name: ' Ana ',
  email: 'Ana@Gmail.com',
  password: 'secret123',
  cpf: '529.982.247-25',
  phone: '(11) 98765-4321',
  birthDate: '1990-05-20',
});

async function setup(user: any = null) {
  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    create: jest.fn((x: any) => ({ id: 'u1', ...x })),
    save: jest.fn(async (x: any) => x),
  };
  const jwt = {
    signAsync: jest.fn(async (payload: any) => `token:${JSON.stringify(payload)}`),
    verifyAsync: jest.fn(),
  };
  const codes = { issue: jest.fn().mockResolvedValue(true), consume: jest.fn() };
  const service = new AuthService(users as any, jwt as any, codes as any);
  return { service, users, jwt, codes };
}

const account = async (over: any = {}) => ({
  id: 'u1',
  email: 'ana@example.com',
  passwordHash: await bcrypt.hash('secret123', 4),
  emailVerifiedAt: new Date(),
  twoFactorEnabled: false,
  ...over,
});

describe('AuthService', () => {
  it('registers an unconfirmed user with normalized fields and sends the code', async () => {
    const { service, users, codes } = await setup();
    const result = await service.register(input());
    const saved = users.save.mock.calls[0][0];
    expect(saved).toMatchObject({
      name: 'Ana',
      email: 'ana@gmail.com',
      cpf: '52998224725',
      phone: '11987654321',
      birthDate: '1990-05-20',
      emailVerifiedAt: null,
    });
    expect(codes.issue).toHaveBeenCalledWith(saved, 'email_verification');
    expect(result).toMatchObject({ verificationRequired: true });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('refuses fictitious e-mail domains at sign-up', async () => {
    const { service, users } = await setup();
    await expect(service.register({ ...input(), email: 'ana@teste.com' })).rejects.toThrow(
      'Email domain not allowed',
    );
    expect(users.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid CPF and a CPF already in use', async () => {
    const { service, users } = await setup();
    await expect(service.register({ ...input(), cpf: '11111111111' })).rejects.toBeInstanceOf(BadRequestException);
    users.findOne.mockImplementation(async ({ where }: any) => (where.cpf ? { id: 'other' } : null));
    await expect(service.register(input())).rejects.toBeInstanceOf(ConflictException);
  });

  it('asks unconfirmed accounts to confirm the e-mail on login', async () => {
    const { service, codes } = await setup(await account({ emailVerifiedAt: null }));
    const result = await service.login('ana@example.com', 'secret123');
    expect(result).toEqual({ emailVerificationRequired: true, email: 'ana@example.com' });
    expect(codes.issue).toHaveBeenCalledWith(expect.anything(), 'email_verification');
  });

  it('returns a purpose-scoped challenge when two-factor is on', async () => {
    const { service, codes, jwt } = await setup(await account({ twoFactorEnabled: true }));
    const result: any = await service.login('ana@example.com', 'secret123');
    expect(result.twoFactorRequired).toBe(true);
    expect(result).not.toHaveProperty('accessToken');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', purpose: TWO_FACTOR_PURPOSE }, { expiresIn: '10m' });
    expect(codes.issue).toHaveBeenCalledWith(expect.anything(), 'login');
  });

  it('signs in directly without two-factor and rejects a wrong password', async () => {
    const { service } = await setup(await account());
    expect(await service.login('ana@example.com', 'secret123')).toHaveProperty('accessToken');
    await expect(service.login('ana@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies the login code only with a valid challenge', async () => {
    const { service, jwt, codes } = await setup(await account({ twoFactorEnabled: true }));
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', purpose: TWO_FACTOR_PURPOSE });
    expect(await service.verifyLogin('challenge', '123456')).toHaveProperty('accessToken');
    expect(codes.consume).toHaveBeenCalledWith('u1', 'login', '123456');

    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'ana@example.com' }); // an access token
    await expect(service.verifyLogin('access', '123456')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirms the e-mail and signs in', async () => {
    const { service, users, codes } = await setup(await account({ emailVerifiedAt: null }));
    expect(await service.verifyEmail('ana@example.com', '123456')).toHaveProperty('accessToken');
    expect(codes.consume).toHaveBeenCalledWith('u1', 'email_verification', '123456');
    expect(users.save.mock.calls[0][0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('answers resend requests the same way for unknown e-mails', async () => {
    const { service, codes } = await setup(null);
    expect(await service.resendVerification('nobody@example.com')).toEqual({ sent: true });
    expect(codes.issue).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy', () => {
  it('rejects the two-factor challenge token as an access token', async () => {
    const strategy = new JwtStrategy({ getOrThrow: () => 'secret' } as any);
    await expect(strategy.validate({ sub: 'u1', purpose: TWO_FACTOR_PURPOSE })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.c' })).resolves.toEqual({ userId: 'u1', email: 'a@b.c' });
  });
});
