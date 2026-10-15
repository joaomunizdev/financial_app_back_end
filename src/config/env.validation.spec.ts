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

  it('requires SMTP_HOST only in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow('SMTP_HOST');
    expect(validateEnv({ ...valid, NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' })).toBeTruthy();
    expect(validateEnv({ ...valid, NODE_ENV: 'development' })).toBeTruthy();
  });
});
