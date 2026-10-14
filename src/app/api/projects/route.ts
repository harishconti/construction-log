import { handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createProjectSchema } from '@/lib/validation/schemas';

export const GET = handle(async () => {
  const user = await requireUser();
  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      project: {
        select: { id: true, name: true, description: true, status: true, startDate: true },
      },
    },
  });
  return json({
    projects: memberships.map((m) => ({ ...m.project, role: m.role })),
  });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await parseJson(req, createProjectSchema);

  const project = await prisma.project.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      startDate: body.startDate,
      status: body.status ?? 'active',
      createdBy: user.id,
      members: { create: { userId: user.id, role: 'admin' } },
    },
    select: { id: true, name: true, description: true, status: true, startDate: true },
  });

  return json({ project: { ...project, role: 'admin' } }, 201);
});
