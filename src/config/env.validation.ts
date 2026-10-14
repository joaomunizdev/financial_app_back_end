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

  for (const key of ['DB_PORT', 'PORT']) {
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
