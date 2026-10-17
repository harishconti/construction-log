import { handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { createProjectSchema } from '@/lib/validation/schemas';

// GST is tracked as the per-expense `gstAmount` field (a component of `amount`), so there is no
// "GST" category by default — a tax category would double-count the same money.
const DEFAULT_CATEGORIES: { name: string; type: string }[] = [
  { name: 'Material', type: 'material' },
  { name: 'Labour', type: 'labour' },
  { name: 'Electricity', type: 'utility' },
  { name: 'Transport', type: 'transport' },
  { name: 'Equipment hire', type: 'equipment' },
  { name: 'Professional fees', type: 'professional' },
  { name: 'Permits & approvals', type: 'professional' },
  { name: 'Subcontractor', type: 'subcontract' },
  { name: 'Site overheads', type: 'overhead' },
  { name: 'Interest & finance', type: 'finance' },
  { name: 'Misc', type: 'misc' },
];

export const GET = handle(async (req) => {
  const user = await requireUser();
  const includeArchived = new URL(req.url).searchParams.get('includeArchived') === 'true';
  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id, ...(includeArchived ? {} : { project: { archivedAt: null } }) },
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
          startDate: true,
          locationName: true,
          latitude: true,
          longitude: true,
        },
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

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        startDate: body.startDate,
        status: body.status ?? 'active',
        totalBudget: body.totalBudget ?? null,
        locationName: body.locationName ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        createdBy: user.id,
        members: { create: { userId: user.id, role: 'admin' } },
        categories: { create: DEFAULT_CATEGORIES },
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        startDate: true,
        totalBudget: true,
        locationName: true,
        latitude: true,
        longitude: true,
      },
    });
    await writeAudit(tx, {
      entity: 'project',
      entityId: created.id,
      action: 'create',
      actorId: user.id,
      after: created,
    });
    return created;
  });

  return json({ project: { ...project, role: 'admin' } }, 201);
});
