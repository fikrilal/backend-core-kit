export type Permission = string;

function splitPermission(value: string): { resource: string; action: string } | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const idx = trimmed.indexOf(':');
  if (idx <= 0 || idx === trimmed.length - 1) return undefined;
  const resource = trimmed.slice(0, idx).trim();
  const action = trimmed.slice(idx + 1).trim();
  if (!resource || !action) return undefined;
  return { resource, action };
}

export function normalizePermissions(input: ReadonlyArray<string>): Permission[] {
  const out: Permission[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

export function permissionMatches(granted: Permission, required: Permission): boolean {
  const grantedParts = splitPermission(granted);
  const requiredParts = splitPermission(required);
  if (!grantedParts || !requiredParts) return false;

  if (grantedParts.resource === '*' && grantedParts.action === '*') return true;

  const resourceMatches =
    grantedParts.resource === '*' || grantedParts.resource === requiredParts.resource;
  const actionMatches = grantedParts.action === '*' || grantedParts.action === requiredParts.action;

  return resourceMatches && actionMatches;
}

export function hasAllPermissions(
  granted: ReadonlyArray<Permission>,
  required: ReadonlyArray<Permission>,
): boolean {
  const grantedNorm = normalizePermissions(granted);
  const requiredNorm = normalizePermissions(required);

  for (const req of requiredNorm) {
    let ok = false;
    for (const g of grantedNorm) {
      if (permissionMatches(g, req)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }

  return true;
}
