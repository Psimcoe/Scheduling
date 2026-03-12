import mssql from "mssql";
import type {
  NormalizedStratusAssembly,
  NormalizedStratusPackage,
  NormalizedStratusProject,
} from "./stratusApi.js";
import {
  STRATUS_DEADLINE_FIELD_NAME,
  STRATUS_DURATION_HOURS_FIELD_NAME,
  STRATUS_FINISH_DATE_FIELD_NAME,
  STRATUS_START_DATE_FIELD_NAME,
  STRATUS_TASK_NAME_FIELD_NAME,
  type StratusConfig,
  isStratusBigDataConfigured,
  normalizeOptionalString,
} from "./stratusConfig.js";

type BigDataSupportedTable =
  | "Packages"
  | "Models"
  | "Projects"
  | "Assemblies"
  | "TrackingStatuses"
  | "PackageTrackingUpdates"
  | "AssemblyTrackingUpdates"
  | "BigDataUpdates";

type BigDataMappingKey =
  | "taskName"
  | "durationDays"
  | "durationHours"
  | "startDate"
  | "finishDate"
  | "deadline";

interface BigDataColumnRef {
  tableName: "Packages" | "Models" | "Projects";
  columnName: string;
  selectAlias: string;
}

interface BigDataSchema {
  tables: Map<string, Map<string, string>>;
}

interface BigDataQueryContext {
  metadata: StratusReadSourceInfo;
  fieldMappings: BigDataFieldValidation[];
  resolvedColumns: Record<BigDataMappingKey, BigDataColumnRef | null>;
}

interface BigDataProjectTarget {
  id: string;
  stratusProjectId: string | null;
  stratusModelId: string | null;
  stratusPackageWhere: string | null;
}

interface BigDataMetadataRow {
  CreatedDT?: unknown;
  TrackingStartDT?: unknown;
  PackageReportName?: unknown;
  AssemblyReportName?: unknown;
  IsFullRebuild?: unknown;
}

export interface StratusPackageBundle {
  package: NormalizedStratusPackage;
  assemblies: NormalizedStratusAssembly[];
}

export interface StratusProjectBundleGroup {
  stratusProject: NormalizedStratusProject;
  bundles: StratusPackageBundle[];
}

export interface StratusReadSourceInfo {
  source: "sqlBigData" | "stratusApi";
  fallbackUsed: boolean;
  message: string | null;
  warnings: string[];
  freshness: string | null;
  trackingStart: string | null;
  packageReportName: string | null;
  assemblyReportName: string | null;
  isFullRebuild: boolean | null;
}

export interface BigDataFieldValidation {
  mappingKey: BigDataMappingKey;
  label: string;
  configuredField: string;
  overrideColumn: string | null;
  resolvedColumn: string | null;
  warning: string | null;
}

export interface StratusBigDataConnectionTestResult
  extends StratusReadSourceInfo {
  ok: boolean;
  configured: boolean;
  fieldMappings: BigDataFieldValidation[];
}

export interface StratusBigDataProjectImportSnapshot {
  projects: NormalizedStratusProject[];
  sourceInfo: StratusReadSourceInfo;
}

export interface StratusBigDataPackageBundleSnapshot {
  bundles: StratusPackageBundle[];
  sourceInfo: StratusReadSourceInfo;
}

export interface StratusBigDataProjectGroupSnapshot {
  groups: StratusProjectBundleGroup[];
  sourceInfo: StratusReadSourceInfo;
}

const BIG_DATA_TABLES: readonly BigDataSupportedTable[] = [
  "Packages",
  "Models",
  "Projects",
  "Assemblies",
  "TrackingStatuses",
  "PackageTrackingUpdates",
  "AssemblyTrackingUpdates",
  "BigDataUpdates",
] as const;

const BIG_DATA_MAPPING_LABELS: Record<BigDataMappingKey, string> = {
  taskName: "Task Name",
  durationDays: "Duration Days",
  durationHours: "Duration Hours",
  startDate: "Start",
  finishDate: "Finish",
  deadline: "Deadline",
};

const BIG_DATA_MAPPING_SELECT_ALIASES: Record<BigDataMappingKey, string> = {
  taskName: "__MapTaskName",
  durationDays: "__MapDurationDays",
  durationHours: "__MapDurationHours",
  startDate: "__MapStartDate",
  finishDate: "__MapFinishDate",
  deadline: "__MapDeadline",
};

const BIG_DATA_SPECIAL_FIELD_ALIASES = new Map<string, string>([
  [normalizeBigDataKey(STRATUS_TASK_NAME_FIELD_NAME), "Packages.Name"],
  [
    normalizeBigDataKey(STRATUS_DURATION_HOURS_FIELD_NAME),
    "Packages.PREFABESTIMATEDBUILDTIME",
  ],
  [
    normalizeBigDataKey(STRATUS_START_DATE_FIELD_NAME),
    "Packages.PrefabBuildStartDate",
  ],
  [
    normalizeBigDataKey(STRATUS_FINISH_DATE_FIELD_NAME),
    "Packages.PrefabBuildFinishDate",
  ],
  [normalizeBigDataKey(STRATUS_DEADLINE_FIELD_NAME), "Packages.RequiredEndDT"],
  [normalizeBigDataKey("STRATUS.Package.Notes"), "Packages.Notes"],
  [normalizeBigDataKey("STRATUS.Package.Description"), "Packages.Description"],
  [
    normalizeBigDataKey("STRATUS.Package.TrackingStatusId"),
    "Packages.PackageTrackingStatusId",
  ],
]);

const TABLE_ALIAS_BY_NAME: Record<BigDataColumnRef["tableName"], string> = {
  Packages: "p",
  Models: "m",
  Projects: "pr",
};

const poolCache = new Map<string, Promise<mssql.ConnectionPool>>();
const schemaCache = new Map<string, Promise<BigDataSchema>>();

export async function testStratusBigDataConnection(
  config: StratusConfig,
): Promise<StratusBigDataConnectionTestResult> {
  if (!isStratusBigDataConfigured(config)) {
    return {
      ok: false,
      configured: false,
      source: "sqlBigData",
      fallbackUsed: false,
      message:
        "Configure the Stratus Big Data server, database, username, and password first.",
      warnings: [],
      freshness: null,
      trackingStart: null,
      packageReportName: null,
      assemblyReportName: null,
      isFullRebuild: null,
      fieldMappings: [],
    };
  }

  try {
    const [schema, metadata] = await Promise.all([
      getBigDataSchema(config),
      loadBigDataMetadata(config),
    ]);
    const fieldMappings = buildBigDataFieldValidations(config, schema);
    const warnings = fieldMappings
      .map((mapping) => mapping.warning)
      .filter((warning): warning is string => Boolean(warning));

    return {
      ok: true,
      configured: true,
      source: "sqlBigData",
      fallbackUsed: false,
      message: "Big Data connection successful.",
      warnings,
      freshness: metadata.freshness,
      trackingStart: metadata.trackingStart,
      packageReportName: metadata.packageReportName,
      assemblyReportName: metadata.assemblyReportName,
      isFullRebuild: metadata.isFullRebuild,
      fieldMappings,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      source: "sqlBigData",
      fallbackUsed: false,
      message:
        error instanceof Error ? error.message : "Big Data connection failed.",
      warnings: [],
      freshness: null,
      trackingStart: null,
      packageReportName: null,
      assemblyReportName: null,
      isFullRebuild: null,
      fieldMappings: [],
    };
  }
}

export async function loadBigDataProjectImportSnapshot(
  config: StratusConfig,
): Promise<StratusBigDataProjectImportSnapshot> {
  const [context, projectRows] = await Promise.all([
    loadBigDataQueryContext(config),
    queryActiveProjectRows(config),
  ]);

  return {
    projects: projectRows.map(normalizeBigDataProjectRow).sort(compareProjects),
    sourceInfo: context.metadata,
  };
}

export async function loadBigDataPackageBundleSnapshot(
  config: StratusConfig,
  project: BigDataProjectTarget,
): Promise<StratusBigDataPackageBundleSnapshot> {
  assertBigDataPackageFilterSupported(project);

  const [context, packageRows, assemblyRows] = await Promise.all([
    loadBigDataQueryContext(config),
    queryPackageRows(config, project, true),
    queryAssemblyRows(config, project, true),
  ]);

  return {
    bundles: buildBundleListFromRows(
      config,
      project,
      context,
      packageRows,
      assemblyRows,
    ),
    sourceInfo: context.metadata,
  };
}

export async function loadBigDataPrefabProjectGroupSnapshot(
  config: StratusConfig,
): Promise<StratusBigDataProjectGroupSnapshot> {
  const prefabScope: BigDataProjectTarget = {
    id: "prefab",
    stratusProjectId: null,
    stratusModelId: null,
    stratusPackageWhere: null,
  };
  const [context, projectRows, packageRows, assemblyRows] = await Promise.all([
    loadBigDataQueryContext(config),
    queryActiveProjectRows(config),
    queryPackageRows(config, prefabScope, true),
    queryAssemblyRows(config, prefabScope, true),
  ]);

  const projectsById = new Map<string, NormalizedStratusProject>();
  for (const row of projectRows) {
    const project = normalizeBigDataProjectRow(row);
    if (project.id) {
      projectsById.set(project.id, project);
    }
  }

  const groupsByProjectId = new Map<
    string,
    {
      project: NormalizedStratusProject;
      bundlesByPackageId: Map<string, StratusPackageBundle>;
      unmatchedAssemblies: Record<string, unknown>[];
    }
  >();

  for (const row of packageRows) {
    if (!isImportableBigDataPackageRow(row)) {
      continue;
    }
    const projectId =
      normalizeSqlString(row.__ProjectId) ??
      normalizeSqlString(row.__ModelProjectId);
    if (!projectId) {
      continue;
    }

    const project =
      projectsById.get(projectId) ??
      normalizeBigDataProjectRow({
        Id: row.__ProjectId ?? projectId,
        Number: row.__ProjectNumber,
        Name: row.__ProjectName,
        Status: row.__ProjectStatus,
        TargetStartDT: row.__ProjectTargetStartDT,
        ActualStartDT: row.__ProjectActualStartDT,
        TargetEndDT: row.__ProjectTargetEndDT,
        ActualEndDT: row.__ProjectActualEndDT,
      });
    projectsById.set(projectId, project);

    const bucket =
      groupsByProjectId.get(projectId) ??
      {
        project,
        bundlesByPackageId: new Map<string, StratusPackageBundle>(),
        unmatchedAssemblies: [],
      };
    const normalizedPackage = normalizeBigDataPackageRow(row, config, context);
    bucket.bundlesByPackageId.set(normalizedPackage.id, {
      package: normalizedPackage,
      assemblies: [],
    });
    groupsByProjectId.set(projectId, bucket);
  }

  for (const row of assemblyRows) {
    if (!isImportableBigDataAssemblyRow(row)) {
      continue;
    }
    const projectId =
      normalizeSqlString(row.__ProjectId) ??
      normalizeSqlString(row.__ModelProjectId);
    if (!projectId) {
      continue;
    }

    const bucket =
      groupsByProjectId.get(projectId) ??
      (() => {
        const project =
          projectsById.get(projectId) ??
          normalizeBigDataProjectRow({
            Id: row.__ProjectId ?? projectId,
            Number: row.__ProjectNumber,
            Name: row.__ProjectName,
            Status: null,
          });
        projectsById.set(projectId, project);
        const created = {
          project,
          bundlesByPackageId: new Map<string, StratusPackageBundle>(),
          unmatchedAssemblies: [],
        };
        groupsByProjectId.set(projectId, created);
        return created;
      })();

    const joinedPackageId = normalizeSqlString(row.__JoinedPackageId);
    if (joinedPackageId) {
      const bundle = bucket.bundlesByPackageId.get(joinedPackageId);
      if (bundle) {
        bundle.assemblies.push(
          normalizeBigDataAssemblyRow(
            row,
            bundle.package.id,
            bundle.package.externalKey,
            bundle.package.percentCompleteShop,
          ),
        );
        continue;
      }
      if (!isImportableBigDataJoinedPackageRow(row)) {
        continue;
      }
    }

    bucket.unmatchedAssemblies.push(row);
  }

  const groups = [...groupsByProjectId.values()]
    .map((bucket) => {
      const bundles = [...bucket.bundlesByPackageId.values()].sort(
        compareBundles,
      );
      if (bucket.unmatchedAssemblies.length > 0) {
        const undefinedPackage = createUndefinedBigDataPackage(bucket.project);
        bundles.push({
          package: undefinedPackage,
          assemblies: bucket.unmatchedAssemblies
            .map((row) =>
              normalizeBigDataAssemblyRow(
                row,
                undefinedPackage.id,
                undefinedPackage.externalKey,
                undefinedPackage.percentCompleteShop,
              ),
            )
            .sort(compareAssemblies),
        });
      }

      return {
        stratusProject: bucket.project,
        bundles,
      };
    })
    .sort((left, right) =>
      compareProjects(left.stratusProject, right.stratusProject),
    );

  return {
    groups,
    sourceInfo: context.metadata,
  };
}

function buildBundleListFromRows(
  config: StratusConfig,
  project: BigDataProjectTarget,
  context: BigDataQueryContext,
  packageRows: Record<string, unknown>[],
  assemblyRows: Record<string, unknown>[],
): StratusPackageBundle[] {
  const bundlesByPackageId = new Map<string, StratusPackageBundle>();

  for (const row of packageRows) {
    if (!isImportableBigDataPackageRow(row)) {
      continue;
    }
    const normalizedPackage = normalizeBigDataPackageRow(row, config, context);
    bundlesByPackageId.set(normalizedPackage.id, {
      package: normalizedPackage,
      assemblies: [],
    });
  }

  const unmatchedAssemblies: Record<string, unknown>[] = [];
  for (const row of assemblyRows) {
    if (!isImportableBigDataAssemblyRow(row)) {
      continue;
    }
    const joinedPackageId = normalizeSqlString(row.__JoinedPackageId);
    if (joinedPackageId) {
      const bundle = bundlesByPackageId.get(joinedPackageId);
      if (bundle) {
        bundle.assemblies.push(
          normalizeBigDataAssemblyRow(
            row,
            bundle.package.id,
            bundle.package.externalKey,
            bundle.package.percentCompleteShop,
          ),
        );
        continue;
      }
      if (!isImportableBigDataJoinedPackageRow(row)) {
        continue;
      }
    }

    unmatchedAssemblies.push(row);
  }

  const bundles = [...bundlesByPackageId.values()].sort(compareBundles);
  if (unmatchedAssemblies.length > 0) {
    const undefinedPackage = createUndefinedBigDataPackage({
      id: project.stratusProjectId ?? project.stratusModelId ?? project.id,
    });
    bundles.push({
      package: undefinedPackage,
      assemblies: unmatchedAssemblies
        .map((row) =>
          normalizeBigDataAssemblyRow(
            row,
            undefinedPackage.id,
            undefinedPackage.externalKey,
            undefinedPackage.percentCompleteShop,
          ),
        )
        .sort(compareAssemblies),
    });
  }

  return bundles;
}

async function loadBigDataQueryContext(
  config: StratusConfig,
): Promise<BigDataQueryContext> {
  const [schema, metadata] = await Promise.all([
    getBigDataSchema(config),
    loadBigDataMetadata(config),
  ]);
  const fieldMappings = buildBigDataFieldValidations(config, schema);

  return {
    metadata: {
      source: "sqlBigData",
      fallbackUsed: false,
      message: null,
      warnings: fieldMappings
        .map((mapping) => mapping.warning)
        .filter((warning): warning is string => Boolean(warning)),
      freshness: metadata.freshness,
      trackingStart: metadata.trackingStart,
      packageReportName: metadata.packageReportName,
      assemblyReportName: metadata.assemblyReportName,
      isFullRebuild: metadata.isFullRebuild,
    },
    fieldMappings,
    resolvedColumns: {
      taskName: findResolvedColumn(fieldMappings, "taskName"),
      durationDays: findResolvedColumn(fieldMappings, "durationDays"),
      durationHours: findResolvedColumn(fieldMappings, "durationHours"),
      startDate: findResolvedColumn(fieldMappings, "startDate"),
      finishDate: findResolvedColumn(fieldMappings, "finishDate"),
      deadline: findResolvedColumn(fieldMappings, "deadline"),
    },
  };
}

async function queryActiveProjectRows(
  config: StratusConfig,
): Promise<Record<string, unknown>[]> {
  const pool = await getBigDataPool(config);
  const result = await pool.request().query<Record<string, unknown>>(
    `
      SELECT pr.*
      FROM Projects pr
      WHERE ${buildActiveProjectCondition("pr")}
      ORDER BY
        COALESCE(CONVERT(nvarchar(255), pr.Number), CONVERT(nvarchar(255), pr.Id)),
        CONVERT(nvarchar(255), pr.Name)
    `,
  );
  return result.recordset;
}

async function queryPackageRows(
  config: StratusConfig,
  target: BigDataProjectTarget,
  activeOnly = false,
): Promise<Record<string, unknown>[]> {
  const pool = await getBigDataPool(config);
  const schema = await getBigDataSchema(config);
  const request = pool.request();
  const whereClauses = buildTargetWhereClauses(request, target, activeOnly);
  if (activeOnly) {
    whereClauses.push(buildActivePackageCondition("p"));
  }
  const selectSql = buildPackageMappingSelectSql(
    buildBigDataFieldValidations(config, schema),
  );
  const result = await request.query<Record<string, unknown>>(
    `
      SELECT
        p.*,
        m.ProjectId AS [__ModelProjectId],
        m.Name AS [__ModelName],
        pr.Id AS [__ProjectId],
        pr.Number AS [__ProjectNumber],
        pr.Name AS [__ProjectName],
        pr.Status AS [__ProjectStatus],
        pr.TargetStartDT AS [__ProjectTargetStartDT],
        pr.ActualStartDT AS [__ProjectActualStartDT],
        pr.TargetEndDT AS [__ProjectTargetEndDT],
        pr.ActualEndDT AS [__ProjectActualEndDT],
        pts.Name AS [__PackageTrackingStatusName],
        pts.PercentCompleteShop AS [__PackagePercentCompleteShop]
        ${selectSql}
      FROM Packages p
      INNER JOIN Models m ON m.Id = p.ModelId
      LEFT JOIN Projects pr ON pr.Id = m.ProjectId
      LEFT JOIN TrackingStatuses pts ON pts.Id = p.PackageTrackingStatusId
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY
        COALESCE(
          CONVERT(nvarchar(255), p.ProjectNumberOverride),
          CONVERT(nvarchar(255), p.ProjectNumber),
          CONVERT(nvarchar(255), pr.Number),
          CONVERT(nvarchar(255), pr.Id)
        ),
        CONVERT(nvarchar(255), p.Number),
        CONVERT(nvarchar(255), p.Name)
    `,
  );
  return result.recordset;
}

async function queryAssemblyRows(
  config: StratusConfig,
  target: BigDataProjectTarget,
  activeOnly = false,
): Promise<Record<string, unknown>[]> {
  const pool = await getBigDataPool(config);
  const request = pool.request();
  const whereClauses = buildTargetWhereClauses(request, target, activeOnly);
  if (activeOnly) {
    // Assembly Status in Big Data carries tracking workflow values such as
    // "Shipped to Jobsite", not an active/archive lifecycle flag. Filter on
    // the joined package lifecycle instead so SQL stays aligned with the API.
    whereClauses.push("p.Id IS NOT NULL");
    whereClauses.push(buildActivePackageCondition("p"));
  }
  const result = await request.query<Record<string, unknown>>(
    `
      WITH LatestAssemblyUpdates AS (
        SELECT
          atu.AssemblyId,
          atu.TrackingStatusId,
          atu.CreatedDT,
          ROW_NUMBER() OVER (
            PARTITION BY atu.AssemblyId
            ORDER BY atu.CreatedDT DESC, atu.Id DESC
          ) AS rn
        FROM AssemblyTrackingUpdates atu
      )
      SELECT
        a.*,
        m.ProjectId AS [__ModelProjectId],
        pr.Id AS [__ProjectId],
        pr.Number AS [__ProjectNumber],
        pr.Name AS [__ProjectName],
        p.Id AS [__JoinedPackageId],
        p.Name AS [__JoinedPackageName],
        p.Number AS [__JoinedPackageNumber],
        p.ProjectNumberOverride AS [__JoinedProjectNumberOverride],
        p.ProjectNumber AS [__JoinedProjectNumber],
        p.Status AS [__JoinedPackageStatus],
        p.PackageTrackingStatusId AS [__JoinedPackageTrackingStatusId],
        pts.Name AS [__JoinedPackageTrackingStatusName],
        pts.PercentCompleteShop AS [__JoinedPackagePercentCompleteShop],
        lau.TrackingStatusId AS [__AssemblyTrackingStatusId],
        ts.Name AS [__AssemblyTrackingStatusName],
        ts.PercentCompleteShop AS [__AssemblyPercentCompleteShop]
      FROM Assemblies a
      INNER JOIN Models m ON m.Id = a.ModelId
      LEFT JOIN Projects pr ON pr.Id = m.ProjectId
      LEFT JOIN Packages p
        ON p.ModelId = a.ModelId
        AND p.Name = a.PackageName
      LEFT JOIN TrackingStatuses pts ON pts.Id = p.PackageTrackingStatusId
      LEFT JOIN LatestAssemblyUpdates lau
        ON lau.AssemblyId = a.Id
        AND lau.rn = 1
      LEFT JOIN TrackingStatuses ts ON ts.Id = lau.TrackingStatusId
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY
        COALESCE(CONVERT(nvarchar(255), pr.Number), CONVERT(nvarchar(255), pr.Id)),
        CONVERT(nvarchar(255), a.PackageName),
        CONVERT(nvarchar(255), a.Name),
        CONVERT(nvarchar(255), a.Id)
    `,
  );
  return result.recordset;
}

async function loadBigDataMetadata(
  config: StratusConfig,
): Promise<{
  freshness: string | null;
  trackingStart: string | null;
  packageReportName: string | null;
  assemblyReportName: string | null;
  isFullRebuild: boolean | null;
}> {
  const pool = await getBigDataPool(config);
  const result = await pool.request().query<BigDataMetadataRow>(
    `
      SELECT TOP (1)
        CreatedDT,
        TrackingStartDT,
        PackageReportName,
        AssemblyReportName,
        IsFullRebuild
      FROM BigDataUpdates
      ORDER BY CreatedDT DESC, Id DESC
    `,
  );
  const row = result.recordset[0];

  return {
    freshness: toIsoString(row?.CreatedDT),
    trackingStart: toIsoString(row?.TrackingStartDT),
    packageReportName: normalizeSqlString(row?.PackageReportName),
    assemblyReportName: normalizeSqlString(row?.AssemblyReportName),
    isFullRebuild:
      typeof row?.IsFullRebuild === "boolean"
        ? row.IsFullRebuild
        : row?.IsFullRebuild == null
          ? null
          : Boolean(row.IsFullRebuild),
  };
}

async function getBigDataPool(
  config: StratusConfig,
): Promise<mssql.ConnectionPool> {
  if (!isStratusBigDataConfigured(config)) {
    throw new Error("Stratus Big Data is not configured.");
  }

  const key = JSON.stringify({
    server: config.bigDataServer,
    database: config.bigDataDatabase,
    username: config.bigDataUsername,
    password: config.bigDataPassword,
    encrypt: config.bigDataEncrypt,
    trustServerCertificate: config.bigDataTrustServerCertificate,
  });
  const existing = poolCache.get(key);
  if (existing) {
    return existing;
  }

  const poolPromise = new mssql.ConnectionPool({
    server: config.bigDataServer,
    database: config.bigDataDatabase,
    user: config.bigDataUsername,
    password: config.bigDataPassword,
    connectionTimeout: 30_000,
    requestTimeout: 120_000,
    pool: {
      max: 4,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    options: {
      encrypt: config.bigDataEncrypt,
      trustServerCertificate: config.bigDataTrustServerCertificate,
    },
  })
    .connect()
    .then((pool: mssql.ConnectionPool) => {
      pool.on("error", () => {
        poolCache.delete(key);
        schemaCache.delete(key);
      });
      return pool;
    })
    .catch((error: unknown) => {
      poolCache.delete(key);
      schemaCache.delete(key);
      throw error;
    });

  poolCache.set(key, poolPromise);
  return poolPromise;
}

async function getBigDataSchema(config: StratusConfig): Promise<BigDataSchema> {
  if (!isStratusBigDataConfigured(config)) {
    throw new Error("Stratus Big Data is not configured.");
  }

  const key = JSON.stringify({
    server: config.bigDataServer,
    database: config.bigDataDatabase,
    username: config.bigDataUsername,
  });
  const existing = schemaCache.get(key);
  if (existing) {
    return existing;
  }

  const schemaPromise = getBigDataPool(config)
    .then((pool) =>
      pool.request().query<{ TABLE_NAME: string; COLUMN_NAME: string }>(
        `
          SELECT TABLE_NAME, COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = 'dbo'
            AND TABLE_NAME IN (${BIG_DATA_TABLES.map((table) => `'${table}'`).join(", ")})
        `,
      ),
    )
    .then((result) => {
      const tables = new Map<string, Map<string, string>>();
      for (const row of result.recordset) {
        const table = tables.get(row.TABLE_NAME) ?? new Map<string, string>();
        table.set(normalizeBigDataKey(row.COLUMN_NAME), row.COLUMN_NAME);
        tables.set(row.TABLE_NAME, table);
      }
      return { tables };
    })
    .catch((error) => {
      schemaCache.delete(key);
      throw error;
    });

  schemaCache.set(key, schemaPromise);
  return schemaPromise;
}

function buildTargetWhereClauses(
  request: mssql.Request,
  target: BigDataProjectTarget,
  activeOnly: boolean,
): string[] {
  const clauses: string[] = [];
  if (activeOnly) {
    clauses.push(buildActiveProjectCondition("pr"));
  }

  const projectId = normalizeOptionalString(target.stratusProjectId);
  if (projectId) {
    request.input("projectId", mssql.NVarChar, projectId);
    clauses.push("m.ProjectId = @projectId");
  }

  const modelId = normalizeOptionalString(target.stratusModelId);
  if (modelId) {
    request.input("modelId", mssql.NVarChar, modelId);
    clauses.push("m.Id = @modelId");
  }

  return clauses;
}

function buildActiveProjectCondition(projectAlias: string): string {
  return `(
    TRY_CONVERT(int, ${projectAlias}.Status) = 1
    OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(100), ${projectAlias}.Status)))) = 'active'
  )`;
}

function buildActivePackageCondition(packageAlias: string): string {
  return buildActiveStatusCondition(`${packageAlias}.Status`, [0]);
}

function buildActiveStatusCondition(
  expression: string,
  activeNumericValues: number[],
): string {
  const normalized = `LOWER(LTRIM(RTRIM(CONVERT(nvarchar(100), ${expression}))))`;
  const numericChecks =
    activeNumericValues.length > 0
      ? activeNumericValues
          .map((value) => `TRY_CONVERT(int, ${expression}) = ${value}`)
          .join(" OR ")
      : "1 = 0";
  return `(
    ${expression} IS NULL
    OR ${normalized} = ''
    OR ${normalized} = 'active'
    OR ${normalized} = 'activated'
    OR ${numericChecks}
  )`;
}

function buildPackageMappingSelectSql(
  fieldMappings: BigDataFieldValidation[],
): string {
  const expressions = fieldMappings
    .map((mapping) => parseResolvedColumn(mapping.mappingKey, mapping.resolvedColumn))
    .filter((value): value is BigDataColumnRef => value !== null)
    .map((column) => {
      const tableAlias = TABLE_ALIAS_BY_NAME[column.tableName];
      return `${tableAlias}.${quoteIdentifier(column.columnName)} AS ${quoteIdentifier(column.selectAlias)}`;
    });

  return expressions.length > 0 ? `,\n        ${expressions.join(",\n        ")}` : "";
}

function buildBigDataFieldValidations(
  config: StratusConfig,
  schema: BigDataSchema,
): BigDataFieldValidation[] {
  return [
    resolveBigDataFieldValidation(
      schema,
      "taskName",
      config.taskNameField,
      config.bigDataTaskNameColumn,
      ["Packages", "Models", "Projects"],
    ),
    resolveBigDataFieldValidation(
      schema,
      "durationDays",
      config.durationDaysField,
      config.bigDataDurationDaysColumn,
      ["Packages", "Models", "Projects"],
    ),
    resolveBigDataFieldValidation(
      schema,
      "durationHours",
      config.durationHoursField,
      config.bigDataDurationHoursColumn,
      ["Packages", "Models", "Projects"],
    ),
    resolveBigDataFieldValidation(
      schema,
      "startDate",
      config.startDateField,
      config.bigDataStartDateColumn,
      ["Packages", "Models", "Projects"],
    ),
    resolveBigDataFieldValidation(
      schema,
      "finishDate",
      config.finishDateField,
      config.bigDataFinishDateColumn,
      ["Packages", "Models", "Projects"],
    ),
    resolveBigDataFieldValidation(
      schema,
      "deadline",
      config.deadlineField,
      config.bigDataDeadlineColumn,
      ["Packages", "Models", "Projects"],
    ),
  ];
}

function resolveBigDataFieldValidation(
  schema: BigDataSchema,
  mappingKey: BigDataMappingKey,
  configuredField: string,
  overrideColumn: string,
  preferredTables: BigDataColumnRef["tableName"][],
): BigDataFieldValidation {
  const normalizedField = normalizeOptionalString(configuredField) ?? "";
  const normalizedOverride = normalizeOptionalString(overrideColumn);
  const resolved = normalizedOverride
    ? resolveColumnSpecifier(schema, normalizedOverride, preferredTables)
    : resolveConfiguredField(schema, normalizedField, preferredTables);
  const warning =
    normalizedOverride && !resolved
      ? `${BIG_DATA_MAPPING_LABELS[mappingKey]} SQL override "${normalizedOverride}" is not published to Stratus Big Data.`
      : !normalizedOverride && !resolved
        ? `${BIG_DATA_MAPPING_LABELS[mappingKey]} field "${normalizedField}" is not published to Stratus Big Data.`
        : null;

  return {
    mappingKey,
    label: BIG_DATA_MAPPING_LABELS[mappingKey],
    configuredField: normalizedField,
    overrideColumn: normalizedOverride,
    resolvedColumn: resolved
      ? `${resolved.tableName}.${resolved.columnName}`
      : null,
    warning,
  };
}

function resolveConfiguredField(
  schema: BigDataSchema,
  configuredField: string,
  preferredTables: BigDataColumnRef["tableName"][],
): BigDataColumnRef | null {
  if (!configuredField) {
    return null;
  }

  const explicitAlias = BIG_DATA_SPECIAL_FIELD_ALIASES.get(
    normalizeBigDataKey(configuredField),
  );
  if (explicitAlias) {
    return resolveColumnSpecifier(schema, explicitAlias, preferredTables);
  }

  return resolveColumnSpecifier(
    schema,
    stripStratusFieldPrefixes(configuredField),
    preferredTables,
  );
}

function resolveColumnSpecifier(
  schema: BigDataSchema,
  specifier: string,
  preferredTables: BigDataColumnRef["tableName"][],
): BigDataColumnRef | null {
  const trimmed = normalizeOptionalString(specifier);
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(".")) {
    const [rawTableName, rawColumnName] = trimmed.split(".", 2);
    const tableName = preferredTables.find(
      (candidate) => candidate.toLowerCase() === rawTableName.toLowerCase(),
    );
    if (!tableName) {
      return null;
    }
    const columnName = findColumnName(schema, tableName, rawColumnName);
    return columnName
      ? {
          tableName,
          columnName,
          selectAlias: BIG_DATA_MAPPING_SELECT_ALIASES.taskName,
        }
      : null;
  }

  for (const tableName of preferredTables) {
    const columnName = findColumnName(schema, tableName, trimmed);
    if (columnName) {
      return {
        tableName,
        columnName,
        selectAlias: BIG_DATA_MAPPING_SELECT_ALIASES.taskName,
      };
    }
  }

  return null;
}

function findResolvedColumn(
  fieldMappings: BigDataFieldValidation[],
  mappingKey: BigDataMappingKey,
): BigDataColumnRef | null {
  const mapping = fieldMappings.find((row) => row.mappingKey === mappingKey);
  return parseResolvedColumn(mappingKey, mapping?.resolvedColumn ?? null);
}

function parseResolvedColumn(
  mappingKey: BigDataMappingKey,
  value: string | null,
): BigDataColumnRef | null {
  if (!value) {
    return null;
  }

  const [tableName, columnName] = value.split(".", 2) as [
    BigDataColumnRef["tableName"],
    string,
  ];
  if (!tableName || !columnName) {
    return null;
  }

  return {
    tableName,
    columnName,
    selectAlias: BIG_DATA_MAPPING_SELECT_ALIASES[mappingKey],
  };
}

function normalizeBigDataPackageRow(
  row: Record<string, unknown>,
  config: StratusConfig,
  context: BigDataQueryContext,
): NormalizedStratusPackage {
  const packageId = normalizeSqlString(row.Id) ?? "";
  const packageNumber = normalizeSqlString(row.Number);
  const packageName = normalizeSqlString(row.Name);
  const projectNumber =
    normalizeSqlString(row.ProjectNumberOverride) ??
    normalizeSqlString(row.ProjectNumber) ??
    normalizeSqlString(row.__ProjectNumber) ??
    normalizeSqlString(row.__ProjectId);
  const trackingStatusId = normalizeSqlString(row.PackageTrackingStatusId);
  const trackingStatusName = normalizeSqlString(row.__PackageTrackingStatusName);

  const normalizedFields: Record<string, string | null> = {
    "STRATUS.Package.Name": packageName,
    "STRATUS.Package.Number": packageNumber,
    "STRATUS.Package.Description": normalizeSqlString(row.Description),
    "STRATUS.Package.Notes": normalizeSqlString(row.Notes),
    "STRATUS.Package.RequiredDT": toIsoString(row.RequiredEndDT),
    "STRATUS.Field.PREFAB ESTIMATED BUILD TIME": normalizeSqlScalar(
      row.PREFABESTIMATEDBUILDTIME,
    ),
    "Work Days (Reference)": normalizeSqlScalar(row.WorkDays_Reference_),
    "Project Number":
      normalizeSqlString(row.ProjectNumber) ??
      normalizeSqlString(row.__ProjectNumber),
    "Project Name":
      normalizeSqlString(row.ProjectName) ??
      normalizeSqlString(row.__ProjectName),
    "STRATUS.Field.Project Number Override": normalizeSqlString(
      row.ProjectNumberOverride,
    ),
    "STRATUS.Field.Project Name Override": normalizeSqlString(
      row.ProjectNameOverride,
    ),
    "STRATUS.Package.TrackingStatusId": trackingStatusId,
    "STRATUS.Package.TrackingStatus": trackingStatusName,
    "STRATUS.Package.Status": normalizeSqlString(row.Status),
    [STRATUS_START_DATE_FIELD_NAME]: toIsoString(row.PrefabBuildStartDate),
    [STRATUS_FINISH_DATE_FIELD_NAME]: toIsoString(row.PrefabBuildFinishDate),
  };

  applyResolvedMappingValue(
    normalizedFields,
    config.taskNameField,
    context.resolvedColumns.taskName,
    row,
  );
  applyResolvedMappingValue(
    normalizedFields,
    config.durationDaysField,
    context.resolvedColumns.durationDays,
    row,
  );
  applyResolvedMappingValue(
    normalizedFields,
    config.durationHoursField,
    context.resolvedColumns.durationHours,
    row,
  );
  applyResolvedMappingValue(
    normalizedFields,
    config.startDateField,
    context.resolvedColumns.startDate,
    row,
  );
  applyResolvedMappingValue(
    normalizedFields,
    config.finishDateField,
    context.resolvedColumns.finishDate,
    row,
  );
  applyResolvedMappingValue(
    normalizedFields,
    config.deadlineField,
    context.resolvedColumns.deadline,
    row,
  );

  return {
    id: packageId,
    projectId:
      normalizeSqlString(row.__ProjectId) ??
      normalizeSqlString(row.__ModelProjectId),
    modelId: normalizeSqlString(row.ModelId),
    packageNumber,
    packageName,
    trackingStatusId,
    trackingStatusName,
    percentCompleteShop: normalizeSqlNumber(row.__PackagePercentCompleteShop),
    externalKey: packageNumber ? `${projectNumber}-${packageNumber}` : packageId,
    normalizedFields,
    rawPackage: row,
  };
}

function normalizeBigDataAssemblyRow(
  row: Record<string, unknown>,
  packageId: string,
  packageExternalKey: string | null,
  packagePercentCompleteShop: number | null | undefined,
): NormalizedStratusAssembly {
  const assemblyId = normalizeSqlString(row.Id) ?? "";
  return {
    id: assemblyId,
    packageId,
    projectId:
      normalizeSqlString(row.__ProjectId) ??
      normalizeSqlString(row.__ModelProjectId),
    modelId: normalizeSqlString(row.ModelId),
    name:
      normalizeSqlString(row.Name) ??
      normalizeSqlString(row.AssemblyName) ??
      normalizeSqlString(row.PackageName),
    externalKey: `${packageExternalKey ?? packageId}::assembly:${assemblyId || "unknown"}`,
    trackingStatusId:
      normalizeSqlString(row.__AssemblyTrackingStatusId) ??
      normalizeSqlString(row.__JoinedPackageTrackingStatusId),
    trackingStatusName:
      normalizeSqlString(row.__AssemblyTrackingStatusName) ??
      normalizeSqlString(row.__JoinedPackageTrackingStatusName),
    percentCompleteShop:
      normalizeSqlNumber(row.__AssemblyPercentCompleteShop) ??
      packagePercentCompleteShop ??
      normalizeSqlNumber(row.__JoinedPackagePercentCompleteShop),
    notes: "",
    rawAssembly: row,
  };
}

function normalizeBigDataProjectRow(
  row: Record<string, unknown>,
): NormalizedStratusProject {
  return {
    id: normalizeSqlString(row.Id) ?? "",
    number: normalizeSqlString(row.Number),
    name: normalizeSqlString(row.Name),
    status: normalizeSqlString(row.Status),
    category: normalizeSqlString(row.Category),
    phase: normalizeSqlString(row.Phase),
    description: normalizeSqlString(row.Description),
    city: normalizeSqlString(row.City),
    state: normalizeSqlString(row.State),
    startDate:
      toIsoString(row.TargetStartDT) ??
      toIsoString(row.ActualStartDT) ??
      toIsoString(row.TargetStartDate) ??
      toIsoString(row.ActualStartDate),
    finishDate:
      toIsoString(row.TargetEndDT) ??
      toIsoString(row.ActualEndDT) ??
      toIsoString(row.TargetEndDate) ??
      toIsoString(row.ActualEndDate),
    rawProject: row,
  };
}

function isImportableBigDataPackageRow(row: Record<string, unknown>): boolean {
  return isImportableBigDataStatusValue(row.Status, [0], true);
}

export function isImportableBigDataAssemblyRow(
  row: Record<string, unknown>,
): boolean {
  return !isExcludedBigDataLifecycleStatusValue(row.Status);
}

function isImportableBigDataJoinedPackageRow(
  row: Record<string, unknown>,
): boolean {
  if (row.__JoinedPackageStatus == null) {
    return true;
  }
  return isImportableBigDataStatusValue(row.__JoinedPackageStatus, [0], true);
}

function isImportableBigDataStatusValue(
  value: unknown,
  activeNumericValues: number[],
  defaultWhenUnknown: boolean,
): boolean {
  const normalized = normalizeBigDataStatusValue(value);
  if (!normalized) {
    return defaultWhenUnknown;
  }
  if (normalized === "active" || normalized === "activated") {
    return true;
  }
  if (
    normalized === "archived" ||
    normalized === "inactive" ||
    normalized === "deleted" ||
    normalized === "disabled" ||
    normalized.includes("archiv")
  ) {
    return false;
  }
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    return activeNumericValues.includes(numeric);
  }
  return false;
}

function normalizeBigDataStatusValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function isExcludedBigDataLifecycleStatusValue(value: unknown): boolean {
  const normalized = normalizeBigDataStatusValue(value);
  if (!normalized) {
    return false;
  }

  return (
    normalized === "archived" ||
    normalized === "inactive" ||
    normalized === "deleted" ||
    normalized === "disabled" ||
    normalized.includes("archiv")
  );
}

function createUndefinedBigDataPackage(
  project: Pick<NormalizedStratusProject, "id">,
): NormalizedStratusPackage {
  const externalKey = `stratus-undefined-package:${project.id}`;
  return {
    id: externalKey,
    projectId: project.id,
    modelId: null,
    packageNumber: "Undefined Package",
    packageName: "Undefined Package",
    trackingStatusId: null,
    trackingStatusName: null,
    percentCompleteShop: null,
    externalKey,
    normalizedFields: {
      "STRATUS.Package.Name": "Undefined Package",
      "STRATUS.Package.Number": "Undefined Package",
    },
    rawPackage: {},
  };
}

function applyResolvedMappingValue(
  normalizedFields: Record<string, string | null>,
  fieldName: string,
  resolvedColumn: BigDataColumnRef | null,
  row: Record<string, unknown>,
) {
  const normalizedFieldName = normalizeOptionalString(fieldName);
  if (!normalizedFieldName || !resolvedColumn) {
    return;
  }

  normalizedFields[normalizedFieldName] = normalizeSqlScalar(
    row[resolvedColumn.selectAlias],
  );
}

function findColumnName(
  schema: BigDataSchema,
  tableName: BigDataColumnRef["tableName"],
  specifier: string,
): string | null {
  const columns = schema.tables.get(tableName);
  if (!columns) {
    return null;
  }
  return columns.get(normalizeBigDataKey(specifier)) ?? null;
}

function compareProjects(
  left: NormalizedStratusProject,
  right: NormalizedStratusProject,
): number {
  return (
    compareNullableStrings(left.number, right.number) ||
    compareNullableStrings(left.name, right.name) ||
    compareNullableStrings(left.id, right.id)
  );
}

function compareBundles(
  left: StratusPackageBundle,
  right: StratusPackageBundle,
): number {
  return (
    compareNullableStrings(left.package.packageNumber, right.package.packageNumber) ||
    compareNullableStrings(left.package.packageName, right.package.packageName) ||
    compareNullableStrings(left.package.id, right.package.id)
  );
}

function compareAssemblies(
  left: NormalizedStratusAssembly,
  right: NormalizedStratusAssembly,
): number {
  return (
    compareNullableStrings(left.name, right.name) ||
    compareNullableStrings(left.id, right.id)
  );
}

function compareNullableStrings(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return (left ?? "").localeCompare(right ?? "", undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function assertBigDataPackageFilterSupported(project: BigDataProjectTarget) {
  if (normalizeOptionalString(project.stratusPackageWhere)) {
    throw new Error(
      "SQL Big Data import does not support custom Stratus package filters yet.",
    );
  }
}

function quoteIdentifier(identifier: string): string {
  return `[${identifier.replace(/]/g, "]]")}]`;
}

function normalizeBigDataKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function stripStratusFieldPrefixes(value: string): string {
  return value
    .replace(/^STRATUS\.(Field|Package|Model)\./i, "")
    .replace(/^STRATUS\./i, "");
}

function normalizeSqlScalar(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return normalizeOptionalString(String(value)) ?? null;
}

function normalizeSqlString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return normalizeOptionalString(String(value)) ?? null;
}

function normalizeSqlNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = normalizeSqlString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const normalized = normalizeSqlString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString();
}
