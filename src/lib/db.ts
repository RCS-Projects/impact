import postgres from 'postgres';
import { env } from './env';

const globalForDb = global as unknown as { sql?: postgres.Sql };
export const sql = globalForDb.sql ?? postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;
