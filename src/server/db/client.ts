import postgres from 'postgres';
import { getEnv } from '../env';

const globalForDb = global as unknown as { impactSql?: postgres.Sql };

export function getSql(): postgres.Sql {
  if (!globalForDb.impactSql) {
    globalForDb.impactSql = postgres(getEnv().DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForDb.impactSql;
}
