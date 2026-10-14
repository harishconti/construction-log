import { ApiError } from './api';
import { prisma } from './prisma';
import { hasMinRole, type Role } from './roles';

export type ProjectAccess = {
  projectId: string;
  userId: string;
  role: Role;
};

/**
 * Resolves the caller's membership on a project and enforces a minimum role.
 * Roles are always read fresh from the DB — never trusted from the JWT.
 * Throws 403 (or 404 when the project does not exist) on failure.
 */
export async function requireRole(
  projectId: string,
  userId: string,
  minRole: Role,
): Promise<ProjectAccess> {
  // Fast path: one query for members (the common case).
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (membership) {
    const role = membership.role as Role;
    if (!hasMinRole(role, minRole)) {
      throw ApiError.forbidden(`Requires ${minRole} role or higher`);
    }
    return { projectId, userId, role };
  }

  // Not a member: distinguish "no such project" (404) from "not a member" (403).
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw ApiError.notFound('Project not found');
  throw ApiError.forbidden('You are not a member of this project');
}
