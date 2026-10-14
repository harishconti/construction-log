'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

type Role = 'admin' | 'editor' | 'viewer';
type Member = { role: Role; createdAt: string; user: { id: string; name: string; email: string } };
type Invitation = { id: string; email: string; role: Role; expiresAt: string };

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export function MembersView({ projectId, currentUserId }: { projectId: string; currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ members: Member[]; invitations: Invitation[] }>(
        `/api/projects/${projectId}/members`,
      );
      setMembers(res.members);
      setInvitations(res.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setAdding(true);
    try {
      const res = await api.post<{ pending?: boolean }>(`/api/projects/${projectId}/members`, { email, role });
      setNotice(
        res.pending
          ? `Invitation saved for ${email}. They join automatically when they sign up.`
          : `${email} added as ${role}.`,
      );
      setEmail('');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(userId: string, next: Role) {
    setError(null);
    try {
      await api.patch(`/api/projects/${projectId}/members/${userId}`, { role: next });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    }
  }

  async function remove(userId: string) {
    setError(null);
    try {
      await api.delete(`/api/projects/${projectId}/members/${userId}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  async function cancelInvitation(id: string) {
    setError(null);
    try {
      await api.delete(`/api/projects/${projectId}/invitations/${id}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Members</h1>

      <form onSubmit={addMember} className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm sm:flex-row">
        <input
          type="email"
          required
          placeholder="member@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={adding}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>
      <p className="text-xs text-slate-400">
        If they already have an account they are added now; otherwise the invitation applies automatically
        when they sign up with that email.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
            {members.map((m) => (
              <li key={m.user.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <div className="font-medium">
                    {m.user.name}
                    {m.user.id === currentUserId && <span className="ml-2 text-xs text-slate-400">you</span>}
                  </div>
                  <div className="text-slate-500">{m.user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.user.id, e.target.value as Role)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(m.user.id)}
                    disabled={m.user.id === currentUserId}
                    className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {invitations.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-slate-700">Pending invitations</h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div>
                      <div className="font-medium">{inv.email}</div>
                      <div className="text-xs text-slate-400">
                        awaiting sign-up · expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
                        {inv.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => cancelInvitation(inv.id)}
                        className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
