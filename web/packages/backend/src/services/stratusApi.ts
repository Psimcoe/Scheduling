import {
  type StratusConfig,
  STRATUS_FINISH_DATE_FIELD_NAME,
  STRATUS_START_DATE_FIELD_NAME,
  ensureStratusConfigured,
  normalizeBaseUrl,
  normalizeOptionalString,
} from './stratusConfig.js';

export const STRATUS_PAGE_SIZE = 200;
const STRATUS_MAX_429_RETRIES = 5;
const DEFAULT_429_WAIT_MS = 2_000;

export const REQUESTED_STRATUS_FIELD_KEYS = [
  'STRATUS.Field.Project Number',
  'STRATUS.Field.Cost_Code_Number',
  'STRATUS.Package.QRCode',
  'STRATUS.Field.Project Number Override',
  'STRATUS.Field.Project Name Override',
  'STRATUS.Field.SMC_Location',
  'STRATUS.Field.Detailer',
  'STRATUS.Field.Foreman Contact',
  'STRATUS.Package.Number',
  'STRATUS.Package.Name',
  'STRATUS.Field.Cost_Code_Category',
  'STRATUS.Package.CategoryAbbreviation',
  'STRATUS.Package.Description',
  'STRATUS.Field.Assembly_Qty_Editable',
  'Detail Due By Date',
  'STRATUS.Field.SMC_CREW SIZE',
  'Work Days (Reference)',
  STRATUS_START_DATE_FIELD_NAME,
  STRATUS_FINISH_DATE_FIELD_NAME,
  'STRATUS.Package.RequiredDT',
  'STRATUS.Field.SMARTSHEET TO STRATUS OVERRIDE',
  'STRATUS.Package.TrackingStatus',
  'STRATUS.Package.Notes',
  'Created By',
  'Date Created',
  'Modified By',
  'Modified Date',
  'STRATUS.Package.Id',
  'STRATUS.Model.ShippingAddress.Attention',
  'STRATUS.Model.ShippingAddress',
  'STRATUS.Package.Status',
  'STRATUS.Field.PREFAB ESTIMATED BUILD TIME',
  'Project Number',
  'Project Name',
  'STRATUS.Package.TrackingStatusId',
  'STRATUS.Package.FieldStartDT',
  'STRATUS.Package.ModifiedDT',
  'STRATUS.Package.Container',
] as const;

export interface StratusFieldDefinition {
  id: string | null;
  name: string | null;
  displayName: string | null;
}

export interface NormalizedStratusPackage {
  id: string;
  projectId: string | null;
  modelId: string | null;
  packageNumber: string | null;
  packageName: string | null;
  trackingStatusId: string | null;
  trackingStatusName: string | null;
  externalKey: string | null;
  normalizedFields: Record<string, string | null>;
  rawPackage: Record<string, unknown>;
}

export interface NormalizedStratusAssembly {
  id: string;
  packageId: string;
  projectId: string | null;
  modelId: string | null;
  name: string | null;
  externalKey: string;
  trackingStatusId: string | null;
  trackingStatusName: string | null;
  notes: string;
  rawAssembly: Record<string, unknown>;
}

export interface NormalizedStratusProject {
  id: string;
  number: string | null;
  name: string | null;
  status: string | null;
  category: string | null;
  phase: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  finishDate: string | null;
  rawProject: Record<string, unknown>;
}

export interface StratusProjectTarget {
  id: string;
  name: string;
  minutesPerDay: number;
  stratusProjectId: string | null;
  stratusModelId: string | null;
  stratusPackageWhere: string | null;
}

export interface FieldIdResolution {
  startFieldId: string | null;
  finishFieldId: string | null;
  canPush: boolean;
  message: string | null;
}

export function combineWhereClauses(...clauses: Array<string | null | undefined>): string | null {
  const filtered = clauses
    .map((clause) => clause?.trim() ?? '')
    .filter((clause) => clause.length > 0);

  if (filtered.length === 0) {
    return null;
  }

  if (filtered.length === 1) {
    return filtered[0] ?? null;
  }

  return filtered.map((clause) => `(${clause})`).join(' AND ');
}

export function resolveFieldIdsFromDefinitions(
  fields: StratusFieldDefinition[],
  overrides: { startDateFieldIdOverride?: string | null; finishDateFieldIdOverride?: string | null },
  cached: { cachedStartDateFieldId?: string | null; cachedFinishDateFieldId?: string | null } = {},
): FieldIdResolution {
  const manualStart = normalizeOptionalString(overrides.startDateFieldIdOverride);
  const manualFinish = normalizeOptionalString(overrides.finishDateFieldIdOverride);
  if (manualStart && manualFinish) {
    return { startFieldId: manualStart, finishFieldId: manualFinish, canPush: true, message: null };
  }

  const cachedStart = normalizeOptionalString(cached.cachedStartDateFieldId);
  const cachedFinish = normalizeOptionalString(cached.cachedFinishDateFieldId);
  if (cachedStart && cachedFinish) {
    return { startFieldId: cachedStart, finishFieldId: cachedFinish, canPush: true, message: null };
  }

  const startMatch = findFieldDefinitionMatch(fields, getEquivalentFieldNames(STRATUS_START_DATE_FIELD_NAME));
  const finishMatch = findFieldDefinitionMatch(fields, getEquivalentFieldNames(STRATUS_FINISH_DATE_FIELD_NAME));
  const startFieldId = manualStart ?? startMatch.matchId;
  const finishFieldId = manualFinish ?? finishMatch.matchId;

  if (startFieldId && finishFieldId && !startMatch.ambiguous && !finishMatch.ambiguous) {
    return { startFieldId, finishFieldId, canPush: true, message: null };
  }

  const problems: string[] = [];
  if (!startFieldId) {
    problems.push(`Unable to resolve ${STRATUS_START_DATE_FIELD_NAME}`);
  } else if (startMatch.ambiguous && !manualStart) {
    problems.push(`${STRATUS_START_DATE_FIELD_NAME} matched multiple company fields`);
  }
  if (!finishFieldId) {
    problems.push(`Unable to resolve ${STRATUS_FINISH_DATE_FIELD_NAME}`);
  } else if (finishMatch.ambiguous && !manualFinish) {
    problems.push(`${STRATUS_FINISH_DATE_FIELD_NAME} matched multiple company fields`);
  }

  return {
    startFieldId,
    finishFieldId,
    canPush: false,
    message: problems.join('. '),
  };
}

export function normalizeStratusPackage(
  rawPackage: Record<string, unknown>,
  _minutesPerDay: number,
): NormalizedStratusPackage {
  const fieldMap = getRecord(rawPackage, 'fieldNameToValueMap');
  const packageId = getString(rawPackage, 'id') ?? '';
  const packageNumber =
    firstNonEmptyString(
      getFieldValue(fieldMap, ['STRATUS.Package.Number', 'Package Number']),
      getString(rawPackage, 'number'),
    ) ?? null;
  const packageName =
    firstNonEmptyString(
      getFieldValue(fieldMap, ['STRATUS.Field.Project Name Override', 'Project Name Override']),
      getString(rawPackage, 'name'),
      getFieldValue(fieldMap, ['STRATUS.Package.Name']),
    ) ?? null;
  const projectNumber =
    firstNonEmptyString(
      getFieldValue(fieldMap, ['STRATUS.Field.Project Number Override', 'Project Number Override']),
      getFieldValue(fieldMap, ['STRATUS.Field.Project Number', 'Project Number']),
      getString(rawPackage, 'projectNumber'),
    ) ?? null;
  const trackingStatusId =
    firstNonEmptyString(
      getString(rawPackage, 'currentTrackingStatusId'),
      getString(rawPackage, 'trackingStatusId'),
      getFieldValue(fieldMap, ['STRATUS.Package.TrackingStatusId']),
    ) ?? null;
  const trackingStatusName =
    firstNonEmptyString(
      getString(rawPackage, 'currentTrackingStatusName'),
      getString(rawPackage, 'trackingStatusName'),
      getFieldValue(fieldMap, ['STRATUS.Package.TrackingStatus']),
    ) ?? null;
  const statusName =
    firstNonEmptyString(
      getString(rawPackage, 'statusName'),
      getFieldValue(fieldMap, ['STRATUS.Package.Status']),
      toNullableString(rawPackage.status),
    ) ?? null;
  const workDaysRaw = getFieldValue(fieldMap, ['Work Days (Reference)']);

  const normalizedFields: Record<string, string | null> = {
    'STRATUS.Field.Project Number': getFieldValue(fieldMap, ['STRATUS.Field.Project Number']),
    'STRATUS.Field.Cost_Code_Number': getFieldValue(fieldMap, ['STRATUS.Field.Cost_Code_Number']),
    'STRATUS.Package.QRCode': firstNonEmptyString(
      getFieldValue(fieldMap, ['STRATUS.Package.QRCode']),
      getString(rawPackage, 'qrCodeUrl'),
    ),
    'STRATUS.Field.Project Number Override': getFieldValue(fieldMap, ['STRATUS.Field.Project Number Override']),
    'STRATUS.Field.Project Name Override': getFieldValue(fieldMap, ['STRATUS.Field.Project Name Override']),
    'STRATUS.Field.SMC_Location': getFieldValue(fieldMap, ['STRATUS.Field.SMC_Location']),
    'STRATUS.Field.Detailer': getFieldValue(fieldMap, ['STRATUS.Field.Detailer']),
    'STRATUS.Field.Foreman Contact': getFieldValue(fieldMap, ['STRATUS.Field.Foreman Contact']),
    'STRATUS.Package.Number': packageNumber,
    'STRATUS.Package.Name': firstNonEmptyString(getString(rawPackage, 'name'), packageName),
    'STRATUS.Field.Cost_Code_Category': getFieldValue(fieldMap, ['STRATUS.Field.Cost_Code_Category']),
    'STRATUS.Package.CategoryAbbreviation': getFieldValue(fieldMap, ['STRATUS.Package.CategoryAbbreviation']),
    'STRATUS.Package.Description': firstNonEmptyString(
      getString(rawPackage, 'description'),
      getFieldValue(fieldMap, ['STRATUS.Package.Description', 'Description']),
    ),
    'STRATUS.Field.Assembly_Qty_Editable': getFieldValue(fieldMap, ['STRATUS.Field.Assembly_Qty_Editable']),
    'Detail Due By Date': parseDateToIso(getFieldValue(fieldMap, ['Detail Due By Date'])),
    'STRATUS.Field.SMC_CREW SIZE': getFieldValue(fieldMap, ['STRATUS.Field.SMC_CREW SIZE']),
    'Work Days (Reference)': workDaysRaw,
    [STRATUS_START_DATE_FIELD_NAME]: firstNonEmptyString(
      parseDateToIso(getFieldValue(fieldMap, [STRATUS_START_DATE_FIELD_NAME])),
      parseDateToIso(getString(rawPackage, 'startDT')),
    ),
    [STRATUS_FINISH_DATE_FIELD_NAME]: parseDateToIso(
      getFieldValue(fieldMap, [STRATUS_FINISH_DATE_FIELD_NAME]),
    ),
    'STRATUS.Package.RequiredDT': firstNonEmptyString(
      parseDateToIso(getString(rawPackage, 'requiredDT')),
      parseDateToIso(getFieldValue(fieldMap, ['STRATUS.Package.RequiredDT', 'Required'])),
    ),
    'STRATUS.Field.SMARTSHEET TO STRATUS OVERRIDE': getFieldValue(fieldMap, ['STRATUS.Field.SMARTSHEET TO STRATUS OVERRIDE']),
    'STRATUS.Package.TrackingStatus': trackingStatusName ?? statusName,
    'STRATUS.Package.Notes': getFieldValue(fieldMap, ['STRATUS.Package.Notes', 'Notes']),
    'Created By': firstNonEmptyString(getString(rawPackage, 'createdBy'), getFieldValue(fieldMap, ['Created By'])),
    'Date Created': firstNonEmptyString(parseDateToIso(getString(rawPackage, 'createdDT')), getFieldValue(fieldMap, ['Date Created'])),
    'Modified By': firstNonEmptyString(getString(rawPackage, 'modifiedBy'), getFieldValue(fieldMap, ['Modified By'])),
    'Modified Date': firstNonEmptyString(parseDateToIso(getString(rawPackage, 'modifiedDT')), getFieldValue(fieldMap, ['Modified Date'])),
    'STRATUS.Package.Id': packageId,
    'STRATUS.Model.ShippingAddress.Attention': getFieldValue(fieldMap, ['STRATUS.Model.ShippingAddress.Attention']),
    'STRATUS.Model.ShippingAddress': getFieldValue(fieldMap, ['STRATUS.Model.ShippingAddress']),
    'STRATUS.Package.Status': statusName,
    'STRATUS.Field.PREFAB ESTIMATED BUILD TIME': getFieldValue(fieldMap, ['STRATUS.Field.PREFAB ESTIMATED BUILD TIME']),
    'Project Number': firstNonEmptyString(getFieldValue(fieldMap, ['Project Number']), projectNumber),
    'Project Name': firstNonEmptyString(getFieldValue(fieldMap, ['Project Name']), packageName),
    'STRATUS.Package.TrackingStatusId': trackingStatusId,
    'STRATUS.Package.FieldStartDT': firstNonEmptyString(parseDateToIso(getString(rawPackage, 'startDT')), getFieldValue(fieldMap, ['STRATUS.Package.FieldStartDT'])),
    'STRATUS.Package.ModifiedDT': firstNonEmptyString(parseDateToIso(getString(rawPackage, 'modifiedDT')), getFieldValue(fieldMap, ['STRATUS.Package.ModifiedDT'])),
    'STRATUS.Package.Container': getFieldValue(fieldMap, ['STRATUS.Package.Container']),
  };

  for (const key of REQUESTED_STRATUS_FIELD_KEYS) {
    if (!(key in normalizedFields)) {
      normalizedFields[key] = null;
    }
  }

  return {
    id: packageId,
    projectId: getString(rawPackage, 'projectId'),
    modelId: getString(rawPackage, 'modelId'),
    packageNumber,
    packageName,
    trackingStatusId,
    trackingStatusName: trackingStatusName ?? statusName,
    externalKey: packageNumber ? (projectNumber ? `${projectNumber}-${packageNumber}` : packageNumber) : packageId,
    normalizedFields,
    rawPackage,
  };
}

export function normalizeStratusAssembly(
  packageId: string,
  packageExternalKey: string | null,
  rawAssembly: Record<string, unknown>,
): NormalizedStratusAssembly {
  const fieldMap = getRecord(rawAssembly, 'fieldNameToValueMap');
  const assemblyId = getString(rawAssembly, 'id') ?? '';
  const name =
    firstNonEmptyString(
      getString(rawAssembly, 'nameLabel'),
      getString(rawAssembly, 'name'),
      getFieldValue(fieldMap, ['STRATUS.Assembly.Name']),
    ) ?? null;
  const noteSummary = Array.isArray(rawAssembly.notes)
    ? rawAssembly.notes
        .map((note) => {
          if (isRecord(note)) {
            return firstNonEmptyString(
              toNullableString(note.text),
              toNullableString(note.note),
              toNullableString(note.description),
            );
          }
          return toNullableString(note);
        })
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join('\n')
    : '';

  return {
    id: assemblyId,
    packageId,
    projectId: getString(rawAssembly, 'projectId'),
    modelId: getString(rawAssembly, 'modelId'),
    name,
    externalKey: `${packageExternalKey ?? packageId}::assembly:${assemblyId || 'unknown'}`,
    trackingStatusId: getString(rawAssembly, 'currentTrackingStatusId'),
    trackingStatusName: firstNonEmptyString(
      getString(rawAssembly, 'currentTrackingStatusName'),
      getFieldValue(fieldMap, ['STRATUS.Assembly.TrackingStatus']),
    ),
    notes: noteSummary,
    rawAssembly,
  };
}

export function normalizeStratusProject(rawProject: Record<string, unknown>): NormalizedStratusProject {
  return {
    id: getString(rawProject, 'id') ?? '',
    number: getString(rawProject, 'number'),
    name: getString(rawProject, 'name'),
    status: firstNonEmptyString(getString(rawProject, 'statusName'), toNullableString(rawProject.status)),
    category: getString(rawProject, 'category'),
    phase: getString(rawProject, 'phase'),
    description: getString(rawProject, 'description'),
    city: getString(rawProject, 'city'),
    state: getString(rawProject, 'state'),
    startDate: firstNonEmptyString(
      parseDateToIso(getString(rawProject, 'targetStartDate')),
      parseDateToIso(getString(rawProject, 'actualStartDate')),
    ),
    finishDate: firstNonEmptyString(
      parseDateToIso(getString(rawProject, 'targetEndDate')),
      parseDateToIso(getString(rawProject, 'actualEndDate')),
    ),
    rawProject,
  };
}

export async function fetchPackagesFromStratus(
  config: StratusConfig,
  project: StratusProjectTarget,
): Promise<Record<string, unknown>[]> {
  ensureStratusConfigured(config);
  if (!project.stratusProjectId && !project.stratusModelId) {
    throw new Error('Project is missing a Stratus project id or model id.');
  }

  const where = combineWhereClauses(
    project.stratusProjectId ? `projectId eq '${escapeStratusWhereValue(project.stratusProjectId)}'` : null,
    project.stratusPackageWhere,
  );
  const endpointBase = project.stratusModelId
    ? `/v1/model/${encodeURIComponent(project.stratusModelId)}/packages`
    : '/v1/package';
  const results: Record<string, unknown>[] = [];

  for (let page = 0; ; page++) {
    const searchParams = new URLSearchParams({
      page: String(page),
      pagesize: String(STRATUS_PAGE_SIZE),
      disabletotal: 'true',
    });
    if (where) {
      searchParams.set('where', where);
    }

    const response = await stratusRequestJson<{ data?: unknown[] }>(
      config,
      `${endpointBase}?${searchParams.toString()}`,
    );
    const items = Array.isArray(response.data) ? response.data : [];
    results.push(...items.filter((item): item is Record<string, unknown> => isRecord(item)));
    if (items.length < STRATUS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

export async function fetchActiveProjectsFromStratus(config: StratusConfig): Promise<Record<string, unknown>[]> {
  ensureStratusConfigured(config);
  const results: Record<string, unknown>[] = [];

  for (let page = 0; ; page++) {
    const searchParams = new URLSearchParams({
      page: String(page),
      pagesize: '1000',
      disabletotal: 'true',
      where: 'status eq 1',
    });
    const response = await stratusRequestJson<{ data?: unknown[] }>(
      config,
      `/v2/project?${searchParams.toString()}`,
    );
    const items = Array.isArray(response.data) ? response.data : [];
    results.push(...items.filter((item): item is Record<string, unknown> => isRecord(item)));
    if (items.length < 1000) {
      break;
    }
  }

  return results;
}

export async function fetchAssembliesForPackage(
  config: StratusConfig,
  packageId: string,
): Promise<Record<string, unknown>[]> {
  ensureStratusConfigured(config);
  const results: Record<string, unknown>[] = [];

  for (let page = 0; ; page++) {
    const searchParams = new URLSearchParams({
      page: String(page),
      pagesize: '1000',
      disabletotal: 'true',
    });
    const response = await stratusRequestJson<{ data?: unknown[] }>(
      config,
      `/v2/package/${encodeURIComponent(packageId)}/assemblies?${searchParams.toString()}`,
    );
    const items = Array.isArray(response.data) ? response.data : [];
    results.push(...items.filter((item): item is Record<string, unknown> => isRecord(item)));
    if (items.length < 1000) {
      break;
    }
  }

  return results;
}

export async function fetchCompanyFields(config: StratusConfig): Promise<StratusFieldDefinition[]> {
  ensureStratusConfigured(config);
  const fields = await stratusRequestJson<StratusFieldDefinition[]>(config, '/v1/company/fields');
  return Array.isArray(fields) ? fields : [];
}

export async function testStratusConnection(config: StratusConfig): Promise<{ ok: boolean; message: string }> {
  try {
    ensureStratusConfigured(config);
    await stratusRequestJson(
      config,
      '/v1/company/fields?where=name%20eq%20%27STRATUS.Field.SMC_Package%20Start%20Date%27',
    );
    return { ok: true, message: 'Connection successful.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Connection failed.',
    };
  }
}

export async function stratusRequestJson<T>(
  config: StratusConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await stratusRequest(config, path, init);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    return response.json() as Promise<T>;
  }

  const text = await response.text();
  return JSON.parse(text) as T;
}

async function stratusRequest(
  config: StratusConfig,
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const url = resolveStratusUrl(config.baseUrl, path);
  const headers = new Headers(init.headers ?? {});
  headers.set('accept', 'application/json');
  headers.set('app-key', config.appKey);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });
  if (response.status === 429 && attempt < STRATUS_MAX_429_RETRIES) {
    await delay(parseRetryAfterMs(response.headers.get('retry-after')));
    return stratusRequest(config, path, init, attempt + 1);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Stratus request failed (${response.status})${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}`,
    );
  }

  return response;
}

function resolveStratusUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (/^\/v\d+\//i.test(normalizedPath)) {
    return `${normalizedBase.replace(/\/v\d+$/i, '')}${normalizedPath}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}

export function toDateSignature(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : parseDateValue(typeof value === 'string' ? value : null);
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function parseDateValue(value: string | null): Date | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const nativeDate = new Date(normalized);
  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  const match = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4] ?? '0');
  const minute = Number(match[5] ?? '0');
  const second = Number(match[6] ?? '0');
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDateToIso(value: string | null): string | null {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toISOString() : null;
}

export function parseNumberValue(value: string | null): number | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

export function firstNonEmptyString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function findFieldDefinitionMatch(
  fields: StratusFieldDefinition[],
  expectedNames: string | string[],
): { matchId: string | null; ambiguous: boolean } {
  const candidates = (Array.isArray(expectedNames) ? expectedNames : [expectedNames])
    .map((value) => normalizeOptionalString(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value));

  const matches = fields.filter((field) => {
    const name = normalizeOptionalString(field.name)?.toLowerCase() ?? null;
    const displayName = normalizeOptionalString(field.displayName)?.toLowerCase() ?? null;
    return candidates.some((candidate) => name === candidate || displayName === candidate);
  });

  if (matches.length !== 1) {
    return {
      matchId: matches.length > 0 ? normalizeOptionalString(matches[0]?.id) : null,
      ambiguous: matches.length > 1,
    };
  }

  return {
    matchId: normalizeOptionalString(matches[0]?.id),
    ambiguous: false,
  };
}

function getEquivalentFieldNames(expectedName: string): string[] {
  const normalized = normalizeOptionalString(expectedName);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  const fieldPrefix = 'STRATUS.Field.';
  if (normalized.startsWith(fieldPrefix)) {
    variants.add(normalized.slice(fieldPrefix.length));
  }

  return [...variants];
}

function parseRetryAfterMs(headerValue: string | null): number {
  const seconds = Number(headerValue);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : DEFAULT_429_WAIT_MS;
}

function escapeStratusWhereValue(value: string): string {
  return value.replace(/'/g, "''");
}

function getRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return isRecord(value) ? value : {};
}

function getString(source: Record<string, unknown>, key: string): string | null {
  return toNullableString(source[key]);
}

function getFieldValue(fieldMap: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = toNullableString(fieldMap[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
