import { Logger } from '@nestjs/common';
import { normalizeIp, ThrottlerModuleOptions } from '@nestjs/throttler';
import { isIP } from 'net';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Per-client-IP limits. Every route gets both windows; @Throttle overrides
 * them by name (see AuthController):
 * - default: short bursts;
 * - hourly: sustained abuse (scripted sign-ups, e-mail quota).
 */
export const RATE_LIMITS = {
  global: { default: { limit: 120, ttl: MINUTE }, hourly: { limit: 3_000, ttl: HOUR } },
  /** Login, codes and sign-up: slows down credential stuffing and code guessing. */
  auth: { default: { limit: 10, ttl: MINUTE }, hourly: { limit: 30, ttl: HOUR } },
  /** Routes that send an e-mail (sign-up, code resends): protects the provider's daily quota. */
  sendsEmail: { hourly: { limit: 10, ttl: HOUR } },
} as const;

type TrackedRequest = { ip?: string; headers?: Record<string, string | string[] | undefined> };

/**
 * Key of the client for rate limiting. Behind Render the app only sees the
 * proxy's address (so everyone would share one bucket); CLIENT_IP_HEADER names
 * the header the edge sets with the visitor's IP: `cf-connecting-ip` on Render
 * (Cloudflare sets it and rejects requests that try to supply it). When unset,
 * missing or not an IP, req.ip is used (TRUST_PROXY still applies). IPv6
 * addresses are grouped by /64, like the throttler's default tracker.
 */
export function clientIpTracker(header: string | undefined, logger = new Logger('RateLimit')) {
  const name = header?.trim().toLowerCase() || undefined;
  const announced = new Set<boolean>();
  return (req: TrackedRequest): string => {
    const raw = name ? req.headers?.[name] : undefined;
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    const fromHeader = !!value && isIP(value) !== 0;
    if (!announced.has(fromHeader)) {
      // First time each source is used, without the address itself: shows in the logs whether the
      // header is arriving (internal requests such as health checks don't carry it).
      announced.add(fromHeader);
      logger.log(fromHeader ? `Client IP taken from ${name}` : `Client IP taken from the connection${name ? ` (${name} missing)` : ''}`);
    }
    return normalizeIp(fromHeader ? (value as string) : (req.ip ?? ''));
  };
}

export function throttlerOptions(clientIpHeader: string | undefined): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: 'default', ...RATE_LIMITS.global.default },
      { name: 'hourly', ...RATE_LIMITS.global.hourly },
    ],
    getTracker: clientIpTracker(clientIpHeader),
    errorMessage: 'Too many requests, try again later',
  };
}
