import React, { useEffect, useState } from 'react';
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
  TextField,
  Typography,
} from '@mui/material';
import { projectsApi, stratusApi } from '../../api';
import { useProjectStore, useUIStore } from '../../stores';

const StratusSettingsDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusSettings');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [appKeySet, setAppKeySet] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [appKey, setAppKey] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [startDateFieldIdOverride, setStartDateFieldIdOverride] = useState('');
  const [finishDateFieldIdOverride, setFinishDateFieldIdOverride] = useState('');
  const [cachedStartDateFieldId, setCachedStartDateFieldId] = useState('');
  const [cachedFinishDateFieldId, setCachedFinishDateFieldId] = useState('');
  const [stratusProjectId, setStratusProjectId] = useState('');
  const [stratusModelId, setStratusModelId] = useState('');
  const [stratusPackageWhere, setStratusPackageWhere] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    stratusApi.getConfig()
      .then((config) => {
        if (cancelled) {
          return;
        }
        setBaseUrl(config.baseUrl);
        setAppKey('');
        setAppKeySet(config.appKeySet);
        setCompanyId(config.companyId ?? '');
        setStartDateFieldIdOverride(config.startDateFieldIdOverride ?? '');
        setFinishDateFieldIdOverride(config.finishDateFieldIdOverride ?? '');
        setCachedStartDateFieldId(config.cachedStartDateFieldId ?? '');
        setCachedFinishDateFieldId(config.cachedFinishDateFieldId ?? '');
        setStratusProjectId(activeProject?.stratusProjectId ?? '');
        setStratusModelId(activeProject?.stratusModelId ?? '');
        setStratusPackageWhere(activeProject?.stratusPackageWhere ?? '');
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showSnackbar(error instanceof Error ? error.message : 'Failed to load Stratus settings', 'error');
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

  const buildConfigPayload = () => {
    const payload: Record<string, unknown> = {
      baseUrl: baseUrl.trim(),
      companyId: companyId.trim(),
      startDateFieldIdOverride: startDateFieldIdOverride.trim(),
      finishDateFieldIdOverride: finishDateFieldIdOverride.trim(),
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
      showSnackbar('Stratus settings saved', 'success');
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to save Stratus settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const updated = await stratusApi.updateConfig(buildConfigPayload());
      setAppKeySet(updated.appKeySet);
      setCachedStartDateFieldId(updated.cachedStartDateFieldId ?? '');
      setCachedFinishDateFieldId(updated.cachedFinishDateFieldId ?? '');
      const result = await stratusApi.testConnection();
      showSnackbar(result.message, result.ok ? 'success' : 'error');
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="md" fullWidth>
      <DialogTitle>Stratus Settings</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
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
            Use the Stratus API root URL or the legacy `/v1` URL. Versioned Stratus endpoints are handled automatically.
          </Alert>
          <TextField
            label="App Key"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            size="small"
            type="password"
            fullWidth
            disabled={loading || saving}
            helperText={appKeySet ? 'A key is already stored. Leave blank to keep it unchanged.' : 'Required for Stratus API access.'}
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
          <Alert severity="info">
            Cached field ids: start {cachedStartDateFieldId || 'not resolved yet'}, finish {cachedFinishDateFieldId || 'not resolved yet'}
          </Alert>

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
              Select a project if you want to edit that project&apos;s Stratus target. Global connection settings can be saved here without an active project.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Button onClick={handleTest} disabled={loading || saving || testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
        </Box>
        <Button onClick={closeDialog} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={loading || saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusSettingsDialog;
