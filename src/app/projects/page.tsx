import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SignOutButton } from '@/components/SignOutButton';
import { NewProjectForm } from '@/components/NewProjectForm';

export const dynamic = 'force-dynamic';

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
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Your projects</h1>
          <p className="text-sm text-slate-500">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mt-6">
        <NewProjectForm />
      </section>

      <section className="mt-6 space-y-3">
        {memberships.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No projects yet — create your first one above.
          </div>
        ) : (
          memberships.map((m) => (
            <Link
              key={m.project.id}
              href={`/projects/${m.project.id}`}
              className="block rounded-xl bg-white p-4 shadow-sm transition hover:shadow"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.project.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
                  {m.role}
                </span>
              </div>
              {m.project.description && (
                <p className="mt-1 text-sm text-slate-500">{m.project.description}</p>
              )}
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
