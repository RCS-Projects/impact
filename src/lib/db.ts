import postgres from 'postgres';
import { getEnv } from './env';

const globalForDb = global as unknown as { sql?: postgres.Sql };
export function getSql() {
  const sql = globalForDb.sql ?? postgres(getEnv().DATABASE_URL, { max: 10, idle_timeout: 20 });
  if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;
  return sql;
}
