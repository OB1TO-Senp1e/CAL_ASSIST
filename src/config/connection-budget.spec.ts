import { validateDatabaseConnectionBudget } from './connection-budget';

describe('validateDatabaseConnectionBudget', () => {
  it('budgets default API pools and operational headroom below PostgreSQL max', () => {
    expect(validateDatabaseConnectionBudget({})).toEqual({
      apiConnections: 20,
      workerConnections: 0,
      headroom: 20,
      total: 40,
      maxConnections: 100,
      poolMax: 10,
    });
  });

  it('accounts for worker pools and rejects budgets that reach the server maximum', () => {
    expect(() =>
      validateDatabaseConnectionBudget({
        databasePoolMax: '10',
        apiReplicaCount: '8',
        workerPoolConnections: '0',
        postgresMaxConnections: '100',
        databaseConnectionHeadroom: '20',
      })
    ).toThrow(/must be less than POSTGRES_MAX_CONNECTIONS/);
  });

  it('rejects invalid pool configuration before opening database connections', () => {
    expect(() => validateDatabaseConnectionBudget({ databasePoolMax: '0' })).toThrow(
      /DATABASE_POOL_MAX/
    );
  });
});
