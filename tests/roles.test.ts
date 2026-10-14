import { describe, expect, it } from 'vitest';
import { ROLE_RANK, hasMinRole, isRole } from '../src/lib/roles';

describe('role helpers', () => {
  it('ranks admin > editor > viewer', () => {
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.editor);
    expect(ROLE_RANK.editor).toBeGreaterThan(ROLE_RANK.viewer);
  });

  it('hasMinRole allows equal or higher roles', () => {
    expect(hasMinRole('admin', 'editor')).toBe(true);
    expect(hasMinRole('admin', 'admin')).toBe(true);
    expect(hasMinRole('editor', 'editor')).toBe(true);
    expect(hasMinRole('editor', 'admin')).toBe(false);
    expect(hasMinRole('viewer', 'editor')).toBe(false);
    expect(hasMinRole('viewer', 'viewer')).toBe(true);
  });

  it('isRole narrows valid role strings only', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('viewer')).toBe(true);
    expect(isRole('superadmin')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
