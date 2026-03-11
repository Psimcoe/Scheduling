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

const StratusSettingsDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === "stratusSettings");
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [appKeySet, setAppKeySet] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [appKey, setAppKey] = useState("");
  const [companyId, setCompanyId] = useState("");
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
        <Box sx={{ flex: 1 }}>
          <Button onClick={handleTest} disabled={loading || saving || testing}>
            {testing ? "Testing..." : "Test Connection"}
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
