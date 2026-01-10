import { permissionMatches, hasAllPermissions } from './permissions';

describe('RBAC permissions', () => {
  describe('permissionMatches', () => {
    it('matches exact permissions', () => {
      expect(permissionMatches('users:read', 'users:read')).toBe(true);
      expect(permissionMatches('users:read', 'users:write')).toBe(false);
    });

    it('matches wildcard resource/action', () => {
      expect(permissionMatches('*:*', 'users:read')).toBe(true);
      expect(permissionMatches('users:*', 'users:read')).toBe(true);
      expect(permissionMatches('*:read', 'users:read')).toBe(true);
      expect(permissionMatches('users:*', 'posts:read')).toBe(false);
      expect(permissionMatches('*:read', 'users:write')).toBe(false);
    });

    it('rejects invalid permission strings', () => {
      expect(permissionMatches('users', 'users:read')).toBe(false);
      expect(permissionMatches('users:read', 'users')).toBe(false);
      expect(permissionMatches('', 'users:read')).toBe(false);
      expect(permissionMatches('users:read', '')).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('requires all required permissions', () => {
      expect(hasAllPermissions(['users:read'], ['users:read'])).toBe(true);
      expect(hasAllPermissions(['users:read'], ['users:read', 'users:write'])).toBe(false);
      expect(hasAllPermissions(['users:*'], ['users:read', 'users:write'])).toBe(true);
    });
  });
});
