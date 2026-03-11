import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { projectsApi, stratusApi } from "../../api";
import type {
  SafeStratusConfigResponse,
  StratusBigDataConnectionTestResponse,
  StratusStatusProgressMapping,
} from "../../api/client";
import { useProjectStore, useUIStore } from "../../stores";

type StatusProgressMappingDraft = {
  statusId: string;
  statusName: string;
  percentCompleteShop: string;
};

function mapStatusProgressRows(
  rows: StratusStatusProgressMapping[],
): StatusProgressMappingDraft[] {
  return rows.map((row) => ({
    statusId: row.statusId,
    statusName: row.statusName,
    percentCompleteShop:
      row.percentCompleteShop === null ? "" : String(row.percentCompleteShop),
  }));
}

function parsePercentInput(value: string): number | null {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "n/a") {
    return null;
  }

  const parsed = Number(normalized.replace(/%/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

const StratusSettingsDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === "stratusSettings");
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingBigData, setTestingBigData] = useState(false);
  const [appKeySet, setAppKeySet] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [appKey, setAppKey] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [importReadSource, setImportReadSource] = useState<
    "sqlPreferred" | "apiOnly"
  >("apiOnly");
  const [bigDataServer, setBigDataServer] = useState("");
  const [bigDataDatabase, setBigDataDatabase] = useState("");
  const [bigDataUsername, setBigDataUsername] = useState("");
  const [bigDataPassword, setBigDataPassword] = useState("");
  const [bigDataPasswordSet, setBigDataPasswordSet] = useState(false);
  const [bigDataEncrypt, setBigDataEncrypt] = useState(false);
  const [bigDataTrustServerCertificate, setBigDataTrustServerCertificate] =
    useState(true);
  const [bigDataTaskNameColumn, setBigDataTaskNameColumn] = useState("");
  const [bigDataDurationDaysColumn, setBigDataDurationDaysColumn] =
    useState("");
  const [bigDataDurationHoursColumn, setBigDataDurationHoursColumn] =
    useState("");
  const [bigDataStartDateColumn, setBigDataStartDateColumn] = useState("");
  const [bigDataFinishDateColumn, setBigDataFinishDateColumn] = useState("");
  const [bigDataDeadlineColumn, setBigDataDeadlineColumn] = useState("");
  const [bigDataStatus, setBigDataStatus] =
    useState<StratusBigDataConnectionTestResponse | null>(null);
  const [taskNameField, setTaskNameField] = useState("");
  const [durationDaysField, setDurationDaysField] = useState("");
  const [durationHoursField, setDurationHoursField] = useState("");
  const [startDateField, setStartDateField] = useState("");
  const [finishDateField, setFinishDateField] = useState("");
  const [deadlineField, setDeadlineField] = useState("");
  const [startDateFieldIdOverride, setStartDateFieldIdOverride] = useState("");
  const [finishDateFieldIdOverride, setFinishDateFieldIdOverride] =
    useState("");
  const [deadlineFieldIdOverride, setDeadlineFieldIdOverride] = useState("");
  const [cachedStartDateFieldId, setCachedStartDateFieldId] = useState("");
  const [cachedFinishDateFieldId, setCachedFinishDateFieldId] = useState("");
  const [cachedDeadlineFieldId, setCachedDeadlineFieldId] = useState("");
  const [statusProgressMappings, setStatusProgressMappings] = useState<
    StatusProgressMappingDraft[]
  >([]);
  const [stratusProjectId, setStratusProjectId] = useState("");
  const [stratusModelId, setStratusModelId] = useState("");
  const [stratusPackageWhere, setStratusPackageWhere] = useState("");

  const applyConfig = (config: SafeStratusConfigResponse) => {
    setBaseUrl(config.baseUrl);
    setAppKey("");
    setAppKeySet(config.appKeySet);
    setCompanyId(config.companyId ?? "");
    setImportReadSource(config.importReadSource ?? "apiOnly");
    setBigDataServer(config.bigDataServer ?? "");
    setBigDataDatabase(config.bigDataDatabase ?? "");
    setBigDataUsername(config.bigDataUsername ?? "");
    setBigDataPassword("");
    setBigDataPasswordSet(config.bigDataPasswordSet ?? false);
    setBigDataEncrypt(config.bigDataEncrypt ?? false);
    setBigDataTrustServerCertificate(
      config.bigDataTrustServerCertificate ?? true,
    );
    setBigDataTaskNameColumn(config.bigDataTaskNameColumn ?? "");
    setBigDataDurationDaysColumn(config.bigDataDurationDaysColumn ?? "");
    setBigDataDurationHoursColumn(config.bigDataDurationHoursColumn ?? "");
    setBigDataStartDateColumn(config.bigDataStartDateColumn ?? "");
    setBigDataFinishDateColumn(config.bigDataFinishDateColumn ?? "");
    setBigDataDeadlineColumn(config.bigDataDeadlineColumn ?? "");
    setTaskNameField(config.taskNameField ?? "");
    setDurationDaysField(config.durationDaysField ?? "");
    setDurationHoursField(config.durationHoursField ?? "");
    setStartDateField(config.startDateField ?? "");
    setFinishDateField(config.finishDateField ?? "");
    setDeadlineField(config.deadlineField ?? "");
    setStartDateFieldIdOverride(config.startDateFieldIdOverride ?? "");
    setFinishDateFieldIdOverride(config.finishDateFieldIdOverride ?? "");
    setDeadlineFieldIdOverride(config.deadlineFieldIdOverride ?? "");
    setCachedStartDateFieldId(config.cachedStartDateFieldId ?? "");
    setCachedFinishDateFieldId(config.cachedFinishDateFieldId ?? "");
    setCachedDeadlineFieldId(config.cachedDeadlineFieldId ?? "");
    setStatusProgressMappings(
      mapStatusProgressRows(config.statusProgressMappings ?? []),
    );
    setBigDataStatus(null);
    setStratusProjectId(activeProject?.stratusProjectId ?? "");
    setStratusModelId(activeProject?.stratusModelId ?? "");
    setStratusPackageWhere(activeProject?.stratusPackageWhere ?? "");
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    stratusApi
      .getConfig()
      .then((config) => {
        if (!cancelled) {
          applyConfig(config);
          if (
            config.bigDataServer &&
            config.bigDataDatabase &&
            config.bigDataUsername &&
            config.bigDataPasswordSet
          ) {
            void stratusApi
              .testBigDataConnection()
              .then((result) => {
                if (!cancelled) {
                  setBigDataStatus(result);
                }
              })
              .catch(() => {
                if (!cancelled) {
                  setBigDataStatus(null);
                }
              });
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showSnackbar(
            error instanceof Error
              ? error.message
              : "Failed to load Stratus settings",
            "error",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeProjectId, activeProject, showSnackbar]);

  const updateStatusRow = (
    index: number,
    field: keyof StatusProgressMappingDraft,
    value: string,
  ) => {
    setStatusProgressMappings((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const buildConfigPayload = () => {
    const payload: Record<string, unknown> = {
      baseUrl: baseUrl.trim(),
      companyId: companyId.trim(),
      importReadSource,
      bigDataServer: bigDataServer.trim(),
      bigDataDatabase: bigDataDatabase.trim(),
      bigDataUsername: bigDataUsername.trim(),
      bigDataEncrypt,
      bigDataTrustServerCertificate,
      bigDataTaskNameColumn: bigDataTaskNameColumn.trim(),
      bigDataDurationDaysColumn: bigDataDurationDaysColumn.trim(),
      bigDataDurationHoursColumn: bigDataDurationHoursColumn.trim(),
      bigDataStartDateColumn: bigDataStartDateColumn.trim(),
      bigDataFinishDateColumn: bigDataFinishDateColumn.trim(),
      bigDataDeadlineColumn: bigDataDeadlineColumn.trim(),
      taskNameField: taskNameField.trim(),
      durationDaysField: durationDaysField.trim(),
      durationHoursField: durationHoursField.trim(),
      startDateField: startDateField.trim(),
      finishDateField: finishDateField.trim(),
      deadlineField: deadlineField.trim(),
      startDateFieldIdOverride: startDateFieldIdOverride.trim(),
      finishDateFieldIdOverride: finishDateFieldIdOverride.trim(),
      deadlineFieldIdOverride: deadlineFieldIdOverride.trim(),
      statusProgressMappings: statusProgressMappings
        .map((row) => ({
          statusId: row.statusId.trim(),
          statusName: row.statusName.trim(),
          percentCompleteShop: parsePercentInput(row.percentCompleteShop),
        }))
        .filter((row) => row.statusId.length > 0 || row.statusName.length > 0),
    };
    if (appKey.trim().length > 0 || !appKeySet) {
      payload.appKey = appKey.trim();
    }
    if (bigDataPassword.trim().length > 0 || !bigDataPasswordSet) {
      payload.bigDataPassword = bigDataPassword.trim();
    }
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await stratusApi.updateConfig(buildConfigPayload());
      if (activeProjectId) {
        await projectsApi.update(activeProjectId, {
          stratusProjectId: stratusProjectId.trim() || null,
          stratusModelId: stratusModelId.trim() || null,
          stratusPackageWhere: stratusPackageWhere.trim() || null,
        });
        await useProjectStore.getState().setActiveProject(activeProjectId);
      }
      closeDialog();
      showSnackbar("Stratus settings saved", "success");
    } catch (error: unknown) {
      showSnackbar(
        error instanceof Error
          ? error.message
          : "Failed to save Stratus settings",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const updated = await stratusApi.updateConfig(buildConfigPayload());
      applyConfig(updated);
      const result = await stratusApi.testConnection();
      showSnackbar(result.message, result.ok ? "success" : "error");
    } catch (error: unknown) {
      showSnackbar(
        error instanceof Error ? error.message : "Connection test failed",
        "error",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleTestBigData = async () => {
    setTestingBigData(true);
    try {
      const updated = await stratusApi.updateConfig(buildConfigPayload());
      applyConfig(updated);
      const result = await stratusApi.testBigDataConnection();
      setBigDataStatus(result);
      showSnackbar(result.message ?? "Big Data test complete", result.ok ? "success" : "error");
    } catch (error: unknown) {
      setBigDataStatus(null);
      showSnackbar(
        error instanceof Error ? error.message : "Big Data connection test failed",
        "error",
      );
    } finally {
      setTestingBigData(false);
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Stratus Settings</DialogTitle>
      <DialogContent dividers sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle2">Connection</Typography>
          <TextField
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <Alert severity="info">
            Use the Stratus API root URL or the legacy `/v1` URL. Versioned
            Stratus endpoints are handled automatically.
          </Alert>
          <TextField
            label="App Key"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            size="small"
            type="password"
            fullWidth
            disabled={loading || saving}
            helperText={
              appKeySet
                ? "A key is already stored. Leave blank to keep it unchanged."
                : "Required for Stratus API access."
            }
          />
          <TextField
            label="Company Id"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />

          <Divider />

          <Typography variant="subtitle2">Big Data Import</Typography>
          <TextField
            select
            label="Read Source"
            value={importReadSource}
            onChange={(e) =>
              setImportReadSource(
                e.target.value as "sqlPreferred" | "apiOnly",
              )
            }
            size="small"
            fullWidth
            disabled={loading || saving}
            helperText="SQL preferred uses Stratus Big Data for import and pull when configured, then falls back to the Stratus API."
          >
            <MenuItem value="sqlPreferred">SQL Big Data Preferred</MenuItem>
            <MenuItem value="apiOnly">API Only</MenuItem>
          </TextField>
          <TextField
            label="Big Data Server"
            value={bigDataServer}
            onChange={(e) => setBigDataServer(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Big Data Database"
            value={bigDataDatabase}
            onChange={(e) => setBigDataDatabase(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Big Data Username"
            value={bigDataUsername}
            onChange={(e) => setBigDataUsername(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Big Data Password"
            value={bigDataPassword}
            onChange={(e) => setBigDataPassword(e.target.value)}
            size="small"
            type="password"
            fullWidth
            disabled={loading || saving}
            helperText={
              bigDataPasswordSet
                ? "A password is already stored. Leave blank to keep it unchanged."
                : "Required for SQL-backed import."
            }
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              label="Encrypt"
              value={String(bigDataEncrypt)}
              onChange={(e) => setBigDataEncrypt(e.target.value === "true")}
              size="small"
              fullWidth
              disabled={loading || saving}
            >
              <MenuItem value="false">False</MenuItem>
              <MenuItem value="true">True</MenuItem>
            </TextField>
            <TextField
              select
              label="Trust Server Certificate"
              value={String(bigDataTrustServerCertificate)}
              onChange={(e) =>
                setBigDataTrustServerCertificate(e.target.value === "true")
              }
              size="small"
              fullWidth
              disabled={loading || saving}
            >
              <MenuItem value="true">True</MenuItem>
              <MenuItem value="false">False</MenuItem>
            </TextField>
          </Stack>
          <Alert severity="info">
            Big Data reads are read-only. Push still goes through the Stratus
            API. Projects with a custom package filter will automatically fall
            back to the API.
          </Alert>
          {bigDataStatus && (
            <Alert severity={bigDataStatus.ok ? "success" : "warning"}>
              {bigDataStatus.message || "Big Data status loaded."}
              <br />
              Freshness: {formatDateTime(bigDataStatus.freshness)}
              <br />
              Package report: {bigDataStatus.packageReportName || "-"}
              <br />
              Assembly report: {bigDataStatus.assemblyReportName || "-"}
            </Alert>
          )}

          <Typography variant="subtitle2">Advanced SQL Column Overrides</Typography>
          <TextField
            label="Task Name SQL Column"
            value={bigDataTaskNameColumn}
            onChange={(e) => setBigDataTaskNameColumn(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
            helperText="Optional. Example: Packages.Name"
          />
          <TextField
            label="Duration Days SQL Column"
            value={bigDataDurationDaysColumn}
            onChange={(e) => setBigDataDurationDaysColumn(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Duration Hours SQL Column"
            value={bigDataDurationHoursColumn}
            onChange={(e) => setBigDataDurationHoursColumn(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Start SQL Column"
            value={bigDataStartDateColumn}
            onChange={(e) => setBigDataStartDateColumn(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Finish SQL Column"
            value={bigDataFinishDateColumn}
            onChange={(e) => setBigDataFinishDateColumn(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Deadline SQL Column"
            value={bigDataDeadlineColumn}
            onChange={(e) => setBigDataDeadlineColumn(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          {bigDataStatus?.fieldMappings?.length ? (
            <Box
              sx={{
                maxHeight: 240,
                overflow: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Mapping</TableCell>
                    <TableCell>Configured Field</TableCell>
                    <TableCell>Override</TableCell>
                    <TableCell>Resolved SQL Column</TableCell>
                    <TableCell>Warning</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bigDataStatus.fieldMappings.map((mapping) => (
                    <TableRow key={mapping.mappingKey}>
                      <TableCell>{mapping.label}</TableCell>
                      <TableCell>{mapping.configuredField || "-"}</TableCell>
                      <TableCell>{mapping.overrideColumn || "-"}</TableCell>
                      <TableCell>{mapping.resolvedColumn || "-"}</TableCell>
                      <TableCell>{mapping.warning || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : null}

          <Divider />

          <Typography variant="subtitle2">
            Task Field Mapping Defaults
          </Typography>
          <TextField
            label="Task Name Field"
            value={taskNameField}
            onChange={(e) => setTaskNameField(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Duration Days Field"
            value={durationDaysField}
            onChange={(e) => setDurationDaysField(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
            helperText="This value wins when both duration fields are present."
          />
          <TextField
            label="Duration Hours Field"
            value={durationHoursField}
            onChange={(e) => setDurationHoursField(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Start Field"
            value={startDateField}
            onChange={(e) => setStartDateField(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Finish Field"
            value={finishDateField}
            onChange={(e) => setFinishDateField(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Deadline Field"
            value={deadlineField}
            onChange={(e) => setDeadlineField(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
            helperText="Use STRATUS.Package.RequiredDT to patch the package property, or a company field name to patch a field."
          />

          <Divider />

          <Typography variant="subtitle2">Push Field Overrides</Typography>
          <TextField
            label="Start Date Field Id Override"
            value={startDateFieldIdOverride}
            onChange={(e) => setStartDateFieldIdOverride(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Finish Date Field Id Override"
            value={finishDateFieldIdOverride}
            onChange={(e) => setFinishDateFieldIdOverride(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <TextField
            label="Deadline Field Id Override"
            value={deadlineFieldIdOverride}
            onChange={(e) => setDeadlineFieldIdOverride(e.target.value)}
            size="small"
            fullWidth
            disabled={loading || saving}
          />
          <Alert severity="info">
            Cached field ids: start{" "}
            {cachedStartDateFieldId || "not resolved yet"}, finish{" "}
            {cachedFinishDateFieldId || "not resolved yet"}, deadline{" "}
            {cachedDeadlineFieldId ||
              (deadlineField.trim() === "STRATUS.Package.RequiredDT"
                ? "property mode"
                : "not resolved yet")}
          </Alert>

          <Divider />

          <Typography variant="subtitle2">Status Progress Mapping</Typography>
          <Alert severity="info">
            `% Done` uses the seeded Sullivan McLaughlin `PercentCompleteShop`
            values. Blank cells save as no value and resolve to 0 during pull.
          </Alert>
          <Box
            sx={{
              maxHeight: 320,
              overflow: "auto",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Status Id</TableCell>
                  <TableCell>Status Name</TableCell>
                  <TableCell>Percent Complete Shop</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statusProgressMappings.map((row, index) => (
                  <TableRow key={`${row.statusId || "row"}-${index}`}>
                    <TableCell sx={{ minWidth: 240 }}>
                      <TextField
                        value={row.statusId}
                        onChange={(e) =>
                          updateStatusRow(index, "statusId", e.target.value)
                        }
                        size="small"
                        fullWidth
                        disabled={loading || saving}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <TextField
                        value={row.statusName}
                        onChange={(e) =>
                          updateStatusRow(index, "statusName", e.target.value)
                        }
                        size="small"
                        fullWidth
                        disabled={loading || saving}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>
                      <TextField
                        value={row.percentCompleteShop}
                        onChange={(e) =>
                          updateStatusRow(
                            index,
                            "percentCompleteShop",
                            e.target.value,
                          )
                        }
                        size="small"
                        fullWidth
                        disabled={loading || saving}
                        type="number"
                        inputProps={{ min: 0, max: 100, step: 1 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {activeProjectId ? (
            <>
              <Divider />

              <Typography variant="subtitle2">Project Target</Typography>
              <TextField
                label="Stratus Project Id"
                value={stratusProjectId}
                onChange={(e) => setStratusProjectId(e.target.value)}
                size="small"
                fullWidth
                disabled={loading || saving}
                helperText="Use a project id, a model id, or both."
              />
              <TextField
                label="Stratus Model Id"
                value={stratusModelId}
                onChange={(e) => setStratusModelId(e.target.value)}
                size="small"
                fullWidth
                disabled={loading || saving}
              />
              <TextField
                label="Package Where Filter"
                value={stratusPackageWhere}
                onChange={(e) => setStratusPackageWhere(e.target.value)}
                size="small"
                fullWidth
                disabled={loading || saving}
                multiline
                minRows={2}
                placeholder="Optional Stratus where clause"
              />
            </>
          ) : (
            <Alert severity="info">
              Select a project if you want to edit that project&apos;s Stratus
              target. Global connection settings can be saved here without an
              active project.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Box sx={{ flex: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button onClick={handleTest} disabled={loading || saving || testing}>
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button
            onClick={handleTestBigData}
            disabled={loading || saving || testingBigData}
          >
            {testingBigData ? "Testing Big Data..." : "Test Big Data"}
          </Button>
        </Box>
        <Button onClick={closeDialog} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || saving}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusSettingsDialog;
