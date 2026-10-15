import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

const USER = 'user-1';

function setup() {
  const qb = {
    alias: 'c',
    addOrderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ id: 'cat-new', ...x })),
    delete: jest.fn(),
  };
  return { service: new CategoriesService(repo as any), repo, qb };
}

const own = () => ({ id: 'cat-1', name: 'Academia', icon: 'mdi-dumbbell', createdByUserId: USER });
const def = () => ({ id: 'cat-d', name: 'Lazer', icon: 'mdi-party-popper', createdByUserId: null });

describe('CategoriesService', () => {
  it('lists defaults and own categories flagged with isDefault', async () => {
    const { service, qb } = setup();
    qb.getMany.mockResolvedValue([def(), own()]);
    await expect(service.list(USER)).resolves.toEqual([
      { id: 'cat-d', name: 'Lazer', icon: 'mdi-party-popper', isDefault: true },
      { id: 'cat-1', name: 'Academia', icon: 'mdi-dumbbell', isDefault: false },
    ]);
  });

  it('creates a trimmed category owned by the user with a default icon', async () => {
    const { service, repo } = setup();
    const created = await service.create(USER, { name: '  Academia ' });
    expect(repo.create).toHaveBeenCalledWith({
      name: 'Academia',
      icon: 'mdi-tag-outline',
      createdByUserId: USER,
    });
    expect(created.isDefault).toBe(false);
  });

  it('refuses a name already used by a default or own category', async () => {
    const { service, qb, repo } = setup();
    qb.getCount.mockResolvedValue(1);
    await expect(service.create(USER, { name: 'lazer' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('keeps default categories read-only', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(def());
    await expect(service.update('cat-d', USER, { name: 'X' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.remove('cat-d', USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("refuses another user's category", async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue({ ...own(), createdByUserId: 'user-2' });
    await expect(service.remove('cat-1', USER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertUsable('cat-1', USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns 404 for unknown categories', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove('nope', USER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts defaults, own categories and no category on records', async () => {
    const { service, repo } = setup();
    await expect(service.assertUsable(null, USER)).resolves.toBeUndefined();
    repo.findOne.mockResolvedValueOnce(def()).mockResolvedValueOnce(own());
    await expect(service.assertUsable('cat-d', USER)).resolves.toBeUndefined();
    await expect(service.assertUsable('cat-1', USER)).resolves.toBeUndefined();
  });
});
