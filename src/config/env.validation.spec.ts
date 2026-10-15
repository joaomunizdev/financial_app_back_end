import { validateEnv } from './env.validation';

const valid = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'x',
  DB_NAME: 'cardsdb',
  JWT_SECRET: 'secret',
};

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...valid })).toEqual(valid);
  });

  it.each(['JWT_SECRET', 'DB_HOST', 'DB_NAME'])('rejects missing %s', (key) => {
    expect(() => validateEnv({ ...valid, [key]: undefined })).toThrow(key);
  });

  it('rejects a blank JWT_SECRET', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: '  ' })).toThrow('JWT_SECRET');
  });

  it('rejects a non-numeric port', () => {
    expect(() => validateEnv({ ...valid, DB_PORT: 'abc' })).toThrow('DB_PORT');
  });

  it('requires a public URL for Brevo images in production (Render provides one)', () => {
    const brevo = { ...valid, NODE_ENV: 'production', BREVO_API_KEY: 'xkeysib' };
    expect(() => validateEnv({ ...brevo })).toThrow('PUBLIC_URL');
    expect(validateEnv({ ...brevo, RENDER_EXTERNAL_URL: 'https://x.onrender.com' })).toBeTruthy();
    expect(validateEnv({ ...valid, NODE_ENV: 'development', BREVO_API_KEY: 'xkeysib' })).toBeTruthy();
  });

  it('rejects a non-numeric TRUST_PROXY', () => {
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow('TRUST_PROXY');
    expect(validateEnv({ ...valid, TRUST_PROXY: '1' })).toBeTruthy();
  });

  it('requires a mail provider (Resend or SMTP) only in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow('RESEND_API_KEY, BREVO_API_KEY or SMTP_HOST');
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production', RESEND_API_KEY: ' ' })).toThrow('RESEND_API_KEY');
    expect(validateEnv({ ...valid, NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' })).toBeTruthy();
    expect(validateEnv({ ...valid, NODE_ENV: 'production', RESEND_API_KEY: 're_123' })).toBeTruthy();
    expect(validateEnv({ ...valid, NODE_ENV: 'production', BREVO_API_KEY: 'xkeysib', PUBLIC_URL: 'https://api.example.com' })).toBeTruthy();
    expect(validateEnv({ ...valid, NODE_ENV: 'development' })).toBeTruthy();
  });
});
