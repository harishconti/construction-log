'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/inputs';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

type Role = 'admin' | 'editor' | 'viewer';
type Member = { role: Role; createdAt: string; user: { id: string; name: string; email: string } };
type Invitation = { id: string; email: string; role: Role; expiresAt: string };

const ROLES: Role[] = ['admin', 'editor', 'viewer'];
const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export function MembersView({ projectId, currentUserId }: { projectId: string; currentUserId: string }) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; message: string; run: () => void }>({
    open: false,
    message: '',
    run: () => undefined,
  });

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
    setAdding(true);
    try {
      const res = await api.post<{ pending?: boolean }>(`/api/projects/${projectId}/members`, { email, role });
      toast.notify(
        res.pending ? `Invitation saved for ${email}` : `${email} added as ${ROLE_LABEL[role].toLowerCase()}`,
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
    try {
      await api.patch(`/api/projects/${projectId}/members/${userId}`, { role: next });
      toast.notify('Role updated');
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Failed to change role', 'error');
    }
  }

  function requestRemove(m: Member) {
    setConfirm({
      open: true,
      message: `Remove ${m.user.name} from this project?`,
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await api.delete(`/api/projects/${projectId}/members/${m.user.id}`);
          toast.notify('Member removed');
          void load();
        } catch (err) {
          toast.notify(err instanceof Error ? err.message : 'Failed to remove member', 'error');
        }
      },
    });
  }

  function requestCancel(inv: Invitation) {
    setConfirm({
      open: true,
      message: `Cancel the invitation for ${inv.email}?`,
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await api.delete(`/api/projects/${projectId}/invitations/${inv.id}`);
          toast.notify('Invitation cancelled');
          void load();
        } catch (err) {
          toast.notify(err instanceof Error ? err.message : 'Failed to cancel', 'error');
        }
      },
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Members</h1>

      <form onSubmit={addMember} className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Email">
            <TextInput
              type="email"
              required
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={adding} className="h-11">
            <Plus size={16} aria-hidden /> Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          If they already have an account they are added now; otherwise the invitation applies when they sign up with that email.
        </p>
      </form>

      {error && <Alert message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows rows={3} trailing label="Loading members" />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {members.map((m) => (
              <li key={m.user.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">
                    {m.user.name}
                    {m.user.id === currentUserId && <span className="ml-2 text-xs text-ink-3">you</span>}
                  </div>
                  <div className="truncate text-ink-3">{m.user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onChange={(e) => changeRole(m.user.id, e.target.value as Role)}
                    disabled={m.user.id === currentUserId}
                    className="!h-9 !w-auto"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger-tint"
                    disabled={m.user.id === currentUserId}
                    onClick={() => requestRemove(m)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {invitations.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold">Pending invitations</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        <Mail size={15} aria-hidden className="text-ink-3" />
                        {inv.email}
                      </div>
                      <div className="text-xs text-ink-3">
                        {ROLE_LABEL[inv.role]} · expires {formatDate(inv.expiresAt)}
                      </div>
                    </div>
                    <Button variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => requestCancel(inv)}>
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {members.length === 1 && invitations.length === 0 && (
            <EmptyState title="Only you so far — add a member above." />
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Are you sure?"
        message={confirm.message}
        confirmLabel="Confirm"
        destructive
        onConfirm={confirm.run}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
    </div>
  );
}
