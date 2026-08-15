'use client';
import { useCallback, useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'moderator'>('moderator');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (!res.ok) return;
    const data = (await res.json()) as { users: AdminUser[] };
    setUsers(data.users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser() {
    setMessage('');
    if (!newEmail || !newPassword) {
      setMessage('Email and password are required');
      return;
    }
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? 'Could not create user');
      return;
    }
    setMessage(`User "${newEmail}" created`);
    setNewEmail('');
    setNewPassword('');
    setNewRole('moderator');
    setShowCreate(false);
    void load();
  }

  async function changeRole(id: string, role: 'admin' | 'moderator') {
    setMessage('');
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? 'Could not change role');
      return;
    }
    void load();
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Remove "${email}"? This cannot be undone.`)) return;
    setMessage('');
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': getCsrfToken() },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? 'Could not delete user');
      return;
    }
    setMessage(`User "${email}" removed`);
    void load();
  }

  return (
    <main className="shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">
            <a href="/admin" style={{ color: 'inherit' }}>
              Admin
            </a>{' '}
            / Users
          </p>
          <h1 className="page-title">User management</h1>
        </div>
        <div className="buttons" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="button button-sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'New user'}
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      {showCreate && (
        <section className="card">
          <h2>Create user</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="grid-3">
              <label className="field">
                Email
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={12}
                  required
                />
              </label>
              <label className="field">
                Role
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'moderator')}
                >
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="button"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void createUser()}
            >
              Create user
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>All users</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <span className={`chip chip-${user.role === 'admin' ? 'live' : 'closed'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="hint" style={{ fontSize: '0.82rem' }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="hint" style={{ fontSize: '0.82rem' }}>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'never'}
                  </td>
                  <td>
                    <div className="buttons" style={{ marginTop: 0 }}>
                      <select
                        value={user.role}
                        onChange={(e) =>
                          void changeRole(user.id, e.target.value as 'admin' | 'moderator')
                        }
                        style={{ fontSize: '0.82rem', padding: '0.2rem 0.4rem' }}
                      >
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="button button-secondary button-sm"
                        style={{ color: '#e5534b' }}
                        onClick={() => void deleteUser(user.id, user.email)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="hint">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
