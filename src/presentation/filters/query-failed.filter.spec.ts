import { Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { QueryFailedFilter } from './query-failed.filter';

function run(code?: string) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host: any = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  };
  const error = new QueryFailedError('SELECT 1', [], Object.assign(new Error('boom'), { code }));
  new QueryFailedFilter().catch(error, host);
  return { status, json };
}

describe('QueryFailedFilter', () => {
  beforeAll(() =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
  );

  it.each([
    ['23505', 409],
    ['23503', 409],
    ['22P02', 400],
    ['22003', 400],
  ])('maps SQLSTATE %s to %i', (code, expected) => {
    expect(run(code).status).toHaveBeenCalledWith(expected);
  });

  it('returns a generic 500 without SQL details for unknown errors', () => {
    const { status, json } = run('XX000');
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
