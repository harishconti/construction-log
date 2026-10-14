import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SignOutButton } from '@/components/SignOutButton';
import { NewProjectForm } from '@/components/NewProjectForm';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', completed: 'Completed' };

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      project: { select: { id: true, name: true, description: true, status: true } },
    },
  });

  return (
    <main className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Your projects</h1>
          <p className="truncate text-sm text-ink-3">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mt-4 flex justify-end">
        <NewProjectForm />
      </section>

      <section className="mt-4 space-y-3">
        {memberships.length === 0 ? (
          <EmptyState title="No projects yet — create your first one." action={<NewProjectForm />} />
        ) : (
          memberships.map((m) => (
            <Link
              key={m.project.id}
              href={`/projects/${m.project.id}`}
              className="block rounded-lg border border-border bg-surface p-4 transition hover:shadow-e1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{m.project.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs capitalize text-ink-2">{m.role}</span>
                  <span className="rounded-full bg-ok-tint px-2 py-0.5 text-xs text-ok">
                    {STATUS_LABEL[m.project.status] ?? m.project.status}
                  </span>
                </span>
              </div>
              {m.project.description && <p className="mt-1 truncate text-sm text-ink-3">{m.project.description}</p>}
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
