export const UNDEFINED_PACKAGE_PREFIX = "stratus-undefined-package:";

export function buildUndefinedPackageExternalKey(packageKey: string): string {
  return `${UNDEFINED_PACKAGE_PREFIX}${packageKey}`;
}

export function extractUndefinedPackageKey(
  externalKey: string | null | undefined,
): string | null {
  if (!externalKey?.startsWith(UNDEFINED_PACKAGE_PREFIX)) {
    return null;
  }

  return externalKey.slice(UNDEFINED_PACKAGE_PREFIX.length) || null;
}

export function buildUndefinedPackageName(
  bestAvailableKey?: string | null,
): string {
  if (!bestAvailableKey) {
    return "Undefined Package";
  }

  return `Undefined Package - ${bestAvailableKey}`;
}

export function buildUndefinedPackageNote(
  bestAvailableKey?: string | null,
): string {
  const suffix = bestAvailableKey ? ` (${bestAvailableKey})` : "";
  return `Auto-created because no true Stratus package row exists yet${suffix}. Create or sync this package in Stratus to replace this placeholder.`;
}
