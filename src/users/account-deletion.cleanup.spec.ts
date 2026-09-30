import { AccountDeletionService } from './account-deletion.service';

describe('AccountDeletionService user-owned cleanup', () => {
  it('deletes OAuth PKCE and Google push-channel rows before deleting the user', async () => {
    const deletedTables: string[] = [];
    const deletionOrder: string[] = [];
    const user = {
      delete: jest.fn(async () => {
        deletionOrder.push('user');
        return undefined;
      }),
    };
    const prisma = new Proxy(
      {},
      {
        get(_target, property: string): Record<string, jest.Mock> {
          if (property === 'user') return user;
          return {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn(async () => {
              deletedTables.push(property);
              deletionOrder.push(property);
              return { count: 1 };
            }),
          };
        },
      }
    );
    const service = new AccountDeletionService(
      prisma as never,
      {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as never
    );

    await service.deleteAccount('user-1');

    expect(deletedTables).toContain('calendarOAuthPkce');
    expect(deletedTables).toContain('calendarPushChannel');
    expect(deletionOrder.indexOf('calendarOAuthPkce')).toBeLessThan(deletionOrder.indexOf('user'));
    expect(deletionOrder.indexOf('calendarPushChannel')).toBeLessThan(
      deletionOrder.indexOf('user')
    );
    expect(user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
