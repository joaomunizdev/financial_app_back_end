import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsMoney } from './money.validator';

class UnsignedDto {
  @IsMoney()
  amount!: string;
}

class SignedDto {
  @IsMoney({ allowNegative: true })
  amount!: string;
}

const errorsFor = (cls: any, amount: unknown) =>
  validateSync(plainToInstance(cls, { amount }) as object);

describe('IsMoney', () => {
  it.each(['0', '10', '10.5', '10.50', '1500.00', '9999999999.99'])(
    'accepts %s',
    (amount) => {
      expect(errorsFor(UnsignedDto, amount)).toHaveLength(0);
    },
  );

  it.each([
    'abc',
    '',
    '-10.00',
    '10.999',
    '1e3',
    '1,50',
    ' 10',
    '.50',
    '10.',
    '99999999999.00',
    10,
  ])('rejects %p', (amount) => {
    expect(errorsFor(UnsignedDto, amount)).not.toHaveLength(0);
  });

  it('accepts negative values only when allowNegative is set', () => {
    expect(errorsFor(SignedDto, '-80.00')).toHaveLength(0);
    expect(errorsFor(SignedDto, '45.90')).toHaveLength(0);
    expect(errorsFor(SignedDto, '-abc')).not.toHaveLength(0);
    expect(errorsFor(UnsignedDto, '-80.00')).not.toHaveLength(0);
  });
});
