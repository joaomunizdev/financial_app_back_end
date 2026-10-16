import { INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from '../../application/services/auth.service';
import { AuthController } from '../controllers/auth.controller';
import { HealthController } from '../controllers/health.controller';
import { DataSource } from 'typeorm';
import { clientIpTracker, throttlerOptions } from './rate-limits';

const quietLogger = () => ({ log: jest.fn() }) as unknown as Logger;

describe('clientIpTracker', () => {
  it('uses the configured header when it holds an IP', () => {
    const track = clientIpTracker('CF-Connecting-IP', quietLogger());
    expect(track({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': '203.0.113.7' } })).toBe('203.0.113.7');
    expect(track({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': ['198.51.100.2'] } })).toBe('198.51.100.2');
  });

  it('falls back to the connection IP when the header is missing, invalid or not configured', () => {
    const track = clientIpTracker('cf-connecting-ip', quietLogger());
    expect(track({ ip: '10.0.0.1', headers: {} })).toBe('10.0.0.1');
    expect(track({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': 'not-an-ip, 1.2.3.4' } })).toBe('10.0.0.1');
    expect(clientIpTracker(undefined, quietLogger())({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': '203.0.113.7' } })).toBe(
      '10.0.0.1',
    );
  });

  it('groups IPv6 clients by /64', () => {
    const track = clientIpTracker('cf-connecting-ip', quietLogger());
    const a = track({ headers: { 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' } });
    const b = track({ headers: { 'cf-connecting-ip': '2001:db8:1:2:bbbb::9' } });
    expect(a).toBe(b);
    expect(track({ headers: { 'cf-connecting-ip': '2001:db8:1:3::1' } })).not.toBe(a);
  });

  it('logs each source the first time it is used, without the address', () => {
    const logger = quietLogger();
    const track = clientIpTracker('cf-connecting-ip', logger);
    track({ ip: '10.0.0.1', headers: {} });
    track({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': '203.0.113.7' } });
    track({ ip: '10.0.0.2', headers: {} });
    track({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': '198.51.100.2' } });
    expect((logger.log as jest.Mock).mock.calls).toEqual([
      ['Client IP taken from the connection (cf-connecting-ip missing)'],
      ['Client IP taken from cf-connecting-ip'],
    ]);
  });
});

describe('auth rate limits (per client IP)', () => {
  let app: INestApplication;
  let base: string;
  let now: number;
  const auth = { login: jest.fn(), register: jest.fn(), resendVerification: jest.fn() };

  beforeEach(async () => {
    now = Date.parse('2026-10-16T12:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    Object.values(auth).forEach((fn) => fn.mockReset().mockResolvedValue({ ok: true }));
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions('cf-connecting-ip'))],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('/api');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/auth`;
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const post = (path: string, ip: string, body: object) =>
    fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    });
  const login = (ip: string) => post('login', ip, { email: 'ana@example.com', password: 'whatever1' });
  const register = (ip: string) => post('register', ip, {});
  const statuses = async (n: number, send: () => Promise<Response>) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await send()).status);
    return out;
  };

  it('blocks one IP after 10 logins a minute without affecting other IPs', async () => {
    expect(await statuses(10, () => login('203.0.113.7'))).not.toContain(429);
    const blocked = await login('203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await blocked.json()).message).toBe('Too many requests, try again later');

    expect((await login('198.51.100.2')).status).not.toBe(429);
    now += 61_000; // next minute
    expect((await login('203.0.113.7')).status).not.toBe(429);
  });

  it('caps logins at 30 an hour per IP', async () => {
    for (let minute = 0; minute < 3; minute++) {
      expect(await statuses(10, () => login('203.0.113.7'))).not.toContain(429);
      now += 61_000;
    }
    expect((await login('203.0.113.7')).status).toBe(429);
    expect((await login('198.51.100.2')).status).not.toBe(429);
    now += 60 * 60_000;
    expect((await login('203.0.113.7')).status).not.toBe(429);
  });

  it('caps e-mail sending routes at 10 an hour per IP', async () => {
    for (let minute = 0; minute < 2; minute++) {
      expect(await statuses(5, () => register('203.0.113.7'))).not.toContain(429);
      now += 61_000;
    }
    expect((await register('203.0.113.7')).status).toBe(429);
    // Logins have their own bucket.
    expect((await login('203.0.113.7')).status).not.toBe(429);
  });

  it('a forged X-Forwarded-For does not get a new bucket', async () => {
    for (let i = 0; i < 10; i++) {
      await fetch(`${base}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': `10.9.0.${i}` },
        body: '{}',
      });
    }
    expect((await login('203.0.113.7')).status).toBe(429);
  });
});

describe('health check', () => {
  it('is not rate limited by any throttler', async () => {
    const tracker = jest.fn((req: { ip?: string }) => req.ip ?? '');
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ ...throttlerOptions(undefined), getTracker: tracker })],
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    try {
      for (let i = 0; i < 130; i++) expect((await fetch(`${await app.getUrl()}/health`)).status).toBe(200);
      expect(tracker).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
