'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Share2, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/inputs';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

type Role = 'admin' | 'editor' | 'viewer';
type Link = { id: string; role: Role; createdAt: string; expiresAt: string };

const ROLES: Role[] = ['viewer', 'editor', 'admin'];
const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

/** Admin panel: create single-use join links (no email needed), share them, revoke unused ones. */
export function InviteLinksPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const toast = useToast();
  const [links, setLinks] = useState<Link[]>([]);
  const [role, setRole] = useState<Role>('editor');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ url: string; role: Role } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<Link | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ links: Link[] }>(`/api/projects/${projectId}/invite-links`);
      setLinks(res.links);
    } catch {
      /* the list is secondary; creation still works */
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    try {
      const res = await api.post<{ link: Link; path: string }>(`/api/projects/${projectId}/invite-links`, { role });
      setCopied(false);
      setCreated({ url: `${window.location.origin}${res.path}`, role });
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not create the link', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.notify('Link copied');
    } catch {
      toast.notify('Copy failed — select the link and copy it manually', 'error');
    }
  }

  async function share(url: string, r: Role) {
    try {
      await navigator.share({
        title: `Join ${projectName}`,
        text: `You're invited to join "${projectName}" on Construction Ledger as ${ROLE_LABEL[r].toLowerCase()}. Sign in with Google or email:`,
        url,
      });
    } catch {
      /* user closed the share sheet */
    }
  }

  async function revoke(link: Link) {
    setRevoking(null);
    try {
      await api.delete(`/api/projects/${projectId}/invite-links/${link.id}`);
      toast.notify('Invite link revoked');
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not revoke the link', 'error');
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Link2 size={18} aria-hidden className="text-ink-3" /> Invite with a link
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        No email needed. Whoever opens the link signs in with Google or email and joins once. Links expire in 7 days.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Role for the link">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="button" onClick={create} loading={creating} className="h-11">
          {!creating && <Link2 size={16} aria-hidden />} Create link
        </Button>
      </div>

      {links.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Active invite links">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium">{ROLE_LABEL[l.role]}</span>
                <span className="text-ink-3"> · unused · expires {formatDate(l.expiresAt)}</span>
              </span>
              <Button variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => setRevoking(l)}>
                <X size={16} aria-hidden /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Invite link ready"
        footer={
          created && (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => copy(created.url)}>
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? 'Copied' : 'Copy link'}
              </Button>
              {canShare && (
                <Button className="flex-1" onClick={() => share(created.url, created.role)}>
                  <Share2 size={16} aria-hidden /> Share
                </Button>
              )}
            </div>
          )
        }
      >
        {created && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Send this to the person joining as <strong>{ROLE_LABEL[created.role].toLowerCase()}</strong>. It works once
              and expires in 7 days. For security it is only shown now — create a new link if you lose it.
            </p>
            <Field label="Invite link">
              <TextInput readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} />
            </Field>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke invite link?"
        message="Anyone who has this link will no longer be able to join."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => revoking && void revoke(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </section>
  );
}
