interface PackageTaskCandidate {
  type: string;
  externalKey: string | null;
  stratusSync: unknown | null;
}

const STRATUS_ASSEMBLY_MARKER = '::assembly:';
const STRATUS_PROJECT_PREFIX = 'stratus-project:';

export function isPackageTask(task: PackageTaskCandidate): boolean {
  if (task.type === 'summary') {
    return true;
  }

  if (task.stratusSync) {
    return true;
  }

  const externalKey = task.externalKey?.trim();
  if (!externalKey) {
    return false;
  }

  if (externalKey.includes(STRATUS_ASSEMBLY_MARKER)) {
    return false;
  }

  if (externalKey.startsWith(STRATUS_PROJECT_PREFIX)) {
    return false;
  }

  return true;
}
