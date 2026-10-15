const REQUIRED = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
] as const;

/** Fails application startup when required environment variables are missing or invalid. */
export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  // E-mail codes (sign-up confirmation, login second factor) must really be sent in production.
  const filled = (k: string) => String(config[k] ?? '').trim() !== '';
  if (config.NODE_ENV === 'production') {
    if (!['RESEND_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST'].some(filled)) {
      errors.push('RESEND_API_KEY, BREVO_API_KEY or SMTP_HOST is required in production');
    }
    // Brevo e-mails load their images from this API's public URL.
    if (filled('BREVO_API_KEY') && !filled('RESEND_API_KEY') && !filled('PUBLIC_URL') && !filled('RENDER_EXTERNAL_URL')) {
      errors.push('PUBLIC_URL is required in production with BREVO_API_KEY');
    }
  }

  for (const key of ['DB_PORT', 'PORT', 'SMTP_PORT', 'TRUST_PROXY']) {
    const value = config[key];
    if (value !== undefined && value !== '' && !/^\d+$/.test(String(value))) {
      errors.push(`${key} must be an integer`);
    }
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }
  return config;
}
