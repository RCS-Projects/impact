import type postgres from 'postgres';

export interface AdministratorRow {
  id: string;
  email: string;
  role: 'admin' | 'moderator';
  passwordHash: string;
}

export function findByEmail(db: postgres.Sql, email: string) {
  return db<AdministratorRow[]>`
    SELECT id, email, role, password_hash AS "passwordHash"
    FROM administrators WHERE email = ${email} LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

export function findByLogin(db: postgres.Sql, login: string) {
  return db<AdministratorRow[]>`
    SELECT id, email, role, password_hash AS "passwordHash"
    FROM administrators
    WHERE email = ${login} OR split_part(email, '@', 1) = ${login}
    ORDER BY created_at
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

export function count(db: postgres.Sql) {
  return db<{ n: number }[]>`SELECT count(*)::int AS n FROM administrators`.then(
    (rows) => rows[0]?.n ?? 0,
  );
}

export function create(
  db: postgres.Sql,
  admin: { email: string; passwordHash: string; role: 'admin' | 'moderator' },
) {
  return db<{ id: string }[]>`
    INSERT INTO administrators (email, password_hash, role)
    VALUES (${admin.email}, ${admin.passwordHash}, ${admin.role})
    RETURNING id
  `.then((rows) => rows[0]?.id);
}

export function touchLogin(db: postgres.Sql, id: string) {
  return db`UPDATE administrators SET last_login_at = now() WHERE id = ${id}`;
}
