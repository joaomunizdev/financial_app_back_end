import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

function setup(user: any, taken: any = null) {
  const users = {
    findOne: jest.fn(async ({ where }: any) => (where.id && !where.cpf ? user : taken)),
    save: jest.fn(async (x: any) => x),
  };
  return { service: new UsersService(users as any), users };
}

const base = () => ({ id: 'u1', name: 'Ana', email: 'ana@gmail.com', twoFactorEnabled: false, emailVerifiedAt: new Date() });

describe('UsersService.updateProfile', () => {
  it('lets an older account fill in its CPF once', async () => {
    const { service, users } = setup({ ...base(), cpf: null });
    const profile = await service.updateProfile('u1', { cpf: '52998224725' });
    expect(profile.cpf).toBe('52998224725');
    expect(users.save).toHaveBeenCalled();
  });

  it('refuses to change a CPF that is already set', async () => {
    const { service, users } = setup({ ...base(), cpf: '52998224725' });
    await expect(service.updateProfile('u1', { cpf: '11144477735' })).rejects.toThrow('CPF cannot be changed');
    expect(users.save).not.toHaveBeenCalled();
  });

  it('accepts the same CPF and other fields', async () => {
    const { service } = setup({ ...base(), cpf: '52998224725' });
    const profile = await service.updateProfile('u1', { cpf: '529.982.247-25', name: 'Ana Souza' });
    expect(profile).toMatchObject({ cpf: '52998224725', name: 'Ana Souza' });
  });

  it('refuses a CPF used by another account when filling it in', async () => {
    const { service } = setup({ ...base(), cpf: null }, { id: 'other' });
    await expect(service.updateProfile('u1', { cpf: '52998224725' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates the CPF digits', async () => {
    const { service } = setup({ ...base(), cpf: null });
    await expect(service.updateProfile('u1', { cpf: '11111111111' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
