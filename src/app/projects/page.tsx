import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { consentGatePath, hasCurrentConsent } from '@/lib/consent';
import { SignOutButton } from '@/components/SignOutButton';
import { NewProjectForm } from '@/components/NewProjectForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCoords, formatDayLabel, formatINR } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', completed: 'Completed' };
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-ok-tint text-ok',
  paused: 'bg-warn-tint text-warn',
  completed: 'bg-surface-2 text-ink-2',
};
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await hasCurrentConsent(user.id))) redirect(consentGatePath('/projects'));

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          archivedAt: true,
          locationName: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  const projectIds = memberships.map((m) => m.project.id);
  const [spend, diary] = projectIds.length
    ? await Promise.all([
        prisma.transaction.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds }, deletedAt: null },
          _sum: { amount: true },
          _max: { occurredAt: true },
        }),
        prisma.diaryEntry.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _max: { entryDate: true },
        }),
      ])
    : [[], []];

  const stats = new Map(
    projectIds.map((pid) => {
      const tx = spend.find((r) => r.projectId === pid);
      const lastTx = tx?._max.occurredAt ?? null;
      const lastDiary = diary.find((r) => r.projectId === pid)?._max.entryDate ?? null;
      const last = lastTx && lastDiary ? (lastTx > lastDiary ? lastTx : lastDiary) : (lastTx ?? lastDiary);
      return [pid, { total: Number(tx?._sum.amount ?? 0), last }];
    }),
  );

  // Ongoing work first: active → paused → completed, then most recent activity.
  const STATUS_ORDER: Record<string, number> = { active: 0, paused: 1, completed: 2 };
  const sorted = [...memberships].sort((a, b) => {
    const s = (STATUS_ORDER[a.project.status] ?? 3) - (STATUS_ORDER[b.project.status] ?? 3);
    if (s !== 0) return s;
    const la = stats.get(a.project.id)?.last?.getTime() ?? 0;
    const lb = stats.get(b.project.id)?.last?.getTime() ?? 0;
    return lb - la;
  });

  const activeRows = sorted.filter((m) => !m.project.archivedAt);
  const archivedRows = sorted.filter((m) => m.project.archivedAt);

  return (
    <main className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Your projects</h1>
          <p className="truncate text-sm text-ink-3">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      {memberships.length > 0 && (
        <section className="mt-4 flex justify-end">
          <NewProjectForm />
        </section>
      )}

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        {memberships.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyState title="No projects yet — create your first one." action={<NewProjectForm />} />
          </div>
        ) : (
          activeRows.map((m) => <ProjectCard key={m.project.id} m={m} st={stats.get(m.project.id)} />)
        )}
      </section>

      {archivedRows.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-ink-2">Archived</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {archivedRows.map((m) => (
              <ProjectCard key={m.project.id} m={m} st={stats.get(m.project.id)} />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-sm text-ink-3">
        <Link href="/account" className="hover:text-ink">
          Account &amp; data
        </Link>
        <Link href="/blog" className="hover:text-ink">
          Guides
        </Link>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </footer>
    </main>
  );
}

type ProjectRow = {
  role: string;
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    archivedAt: Date | null;
    locationName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
};

function ProjectCard({ m, st }: { m: ProjectRow; st?: { total: number; last: Date | null } }) {
  return (
    <Link
      href={`/projects/${m.project.id}`}
      className="block min-h-11 min-w-0 rounded-lg border border-border bg-surface p-4 transition hover:border-border-strong hover:shadow-e1"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-display text-lg font-semibold leading-snug line-clamp-2 break-words">
          {m.project.name}
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-2">
          {m.project.archivedAt && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">Archived</span>
          )}
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{ROLE_LABEL[m.role] ?? m.role}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[m.project.status] ?? 'bg-surface-2 text-ink-2'}`}>
            {STATUS_LABEL[m.project.status] ?? m.project.status}
          </span>
        </span>
      </div>
      {m.project.description && <p className="mt-1 truncate text-sm text-ink-2">{m.project.description}</p>}
      {(m.project.locationName || (m.project.latitude !== null && m.project.longitude !== null)) && (
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-3">
          <MapPin size={14} aria-hidden className="shrink-0" />
          <span className="truncate">
            {m.project.locationName || formatCoords(m.project.latitude as number, m.project.longitude as number)}
          </span>
        </p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Total spend</dt>
          <dd className="num font-semibold">{formatINR(st?.total ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Last activity</dt>
          <dd className="text-ink-2">{st?.last ? formatDayLabel(st.last) : 'No entries yet'}</dd>
        </div>
      </dl>
    </Link>
  );
}
