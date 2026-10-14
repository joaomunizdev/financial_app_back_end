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
});
