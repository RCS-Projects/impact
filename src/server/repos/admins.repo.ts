import type postgres from 'postgres';

export interface AdministratorRow {
  id: string;
  email: string;
  role: 'admin' | 'moderator';
  passwordHash: string;
}

export interface AdminListRow {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
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
    ORDER BY (email = ${login}) DESC, created_at DESC
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

export function count(db: postgres.Sql) {
  return db<{ n: number }[]>`SELECT count(*)::int AS n FROM administrators`.then(
    (rows) => rows[0]?.n ?? 0,
  );
}

export function listAll(db: postgres.Sql) {
  return db<AdminListRow[]>`
    SELECT id, email, role, created_at::text AS "createdAt",
      last_login_at::text AS "lastLoginAt"
    FROM administrators
    ORDER BY created_at
  `;
}

export function findById(db: postgres.Sql, id: string) {
  return db<AdminListRow[]>`
    SELECT id, email, role, created_at::text AS "createdAt",
      last_login_at::text AS "lastLoginAt"
    FROM administrators WHERE id = ${id} LIMIT 1
  `.then((rows) => rows[0] ?? null);
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

export function updateRole(db: postgres.Sql, id: string, role: 'admin' | 'moderator') {
  return db<{ id: string }[]>`
    UPDATE administrators SET role = ${role} WHERE id = ${id}
    RETURNING id
  `.then((rows) => rows.length > 0);
}

export function remove(db: postgres.Sql, id: string) {
  return db<{ id: string }[]>`
    DELETE FROM administrators WHERE id = ${id}
    RETURNING id
  `.then((rows) => rows.length > 0);
}

export function touchLogin(db: postgres.Sql, id: string) {
  return db`UPDATE administrators SET last_login_at = now() WHERE id = ${id}`;
}
