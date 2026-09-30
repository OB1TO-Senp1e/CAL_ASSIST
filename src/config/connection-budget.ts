interface ConnectionBudgetConfig {
  databasePoolMax?: string;
  apiReplicaCount?: string;
  workerPoolConnections?: string;
  postgresMaxConnections?: string;
  databaseConnectionHeadroom?: string;
}

export interface ConnectionBudget {
  apiConnections: number;
  workerConnections: number;
  headroom: number;
  total: number;
  maxConnections: number;
  poolMax: number;
}

function readInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number
): number {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

export function validateDatabaseConnectionBudget(config: ConnectionBudgetConfig): ConnectionBudget {
  const poolMax = readInteger(config.databasePoolMax, 'DATABASE_POOL_MAX', 10, 1);
  const apiReplicas = readInteger(config.apiReplicaCount, 'API_REPLICA_COUNT', 2, 1);
  const workerConnections = readInteger(
    config.workerPoolConnections,
    'WORKER_POOL_CONNECTIONS',
    0,
    0
  );
  const maxConnections = readInteger(
    config.postgresMaxConnections,
    'POSTGRES_MAX_CONNECTIONS',
    100,
    1
  );
  const headroom = readInteger(
    config.databaseConnectionHeadroom,
    'DATABASE_CONNECTION_HEADROOM',
    20,
    0
  );
  const apiConnections = poolMax * apiReplicas;
  const total = apiConnections + workerConnections + headroom;

  if (total >= maxConnections) {
    throw new Error(
      `Database connection budget ${total} must be less than POSTGRES_MAX_CONNECTIONS ${maxConnections}`
    );
  }

  return { apiConnections, workerConnections, headroom, total, maxConnections, poolMax };
}
