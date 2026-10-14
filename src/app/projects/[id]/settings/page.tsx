import { notFound, redirect } from 'next/navigation';
import { SettingsView } from '@/components/SettingsView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    select: { role: true },
  });
  if (!membership) notFound();
  if (membership.role !== 'admin') redirect(`/projects/${id}`);

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, startDate: true, status: true, version: true },
  });
  if (!project) notFound();

  return (
    <SettingsView
      projectId={id}
      initialProject={{ ...project, startDate: project.startDate.toISOString() }}
    />
  );
}
