/**
 * ProjectRibbon — ribbon content for the Project tab.
 * Contains: Project Info, Calendar, Baseline, Import/Export, Recalculate.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FlagIcon from '@mui/icons-material/Flag';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CalculateIcon from '@mui/icons-material/Calculate';
import TuneIcon from '@mui/icons-material/Tune';
import TableViewIcon from '@mui/icons-material/TableView';
import DataObjectIcon from '@mui/icons-material/DataObject';
import PrintIcon from '@mui/icons-material/Print';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import PreviewIcon from '@mui/icons-material/Preview';
import GridOnIcon from '@mui/icons-material/GridOn';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

import { useProjectStore, useUIStore } from '../../stores';
import { importExportApi, stratusApi } from '../../api';
import type { StratusStatusResponse } from '../../api/client';

const RibbonGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      borderRight: '1px solid #E0E0E0',
      px: 1,
      py: 0.25,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>{children}</Box>
    <Typography
      variant="caption"
      sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, mt: 0.25 }}
    >
      {label}
    </Typography>
  </Box>
);

const ProjectRibbon: React.FC = () => {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const recalculate = useProjectStore((s) => s.recalculate);
  const openDialogWith = useUIStore((s) => s.openDialogWith);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const disabled = !activeProjectId;
  const activeProject = useProjectStore((s) => s.activeProject);
  const [stratusStatus, setStratusStatus] = useState<StratusStatusResponse | null>(null);

  const mspdiInputRef = useRef<HTMLInputElement>(null);
  const updateInputRef = useRef<HTMLInputElement>(null);

  const handleImportMspdi = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeProjectId) return;
      try {
        const result = await importExportApi.importMspdi(activeProjectId, file);
        showSnackbar(
          `Imported ${result.imported.tasks} tasks, ${result.imported.dependencies} dependencies`,
          'success',
        );
        await useProjectStore.getState().setActiveProject(activeProjectId);
      } catch (err: unknown) {
        showSnackbar(err instanceof Error ? err.message : 'Import failed', 'error');
      }
      e.target.value = '';
    },
    [activeProjectId, showSnackbar],
  );

  const handleExportMspdi = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const blob = await importExportApi.exportMspdi(activeProjectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.xml';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }, [activeProjectId, showSnackbar]);

  const handleImportUpdates = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeProjectId) return;
      openDialogWith('importPreview', file);
      e.target.value = '';
    },
    [activeProjectId, openDialogWith],
  );

  const handleExportCsv = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const blob = await importExportApi.exportCsv(activeProjectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : 'CSV export failed', 'error');
    }
  }, [activeProjectId, showSnackbar]);

  const handleExportJson = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const blob = await importExportApi.exportJson(activeProjectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : 'JSON export failed', 'error');
    }
  }, [activeProjectId, showSnackbar]);

  const handleExportExcel = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const blob = await importExportApi.exportExcel(activeProjectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.xls';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : 'Excel export failed', 'error');
    }
  }, [activeProjectId, showSnackbar]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setStratusStatus(null);
      return;
    }

    let cancelled = false;
    stratusApi.getStatus(activeProjectId)
      .then((status) => {
        if (!cancelled) {
          setStratusStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStratusStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    activeProject?.stratusProjectId,
    activeProject?.stratusModelId,
    activeProject?.stratusPackageWhere,
    activeProject?.stratusLastPullAt,
    activeProject?.stratusLastPushAt,
  ]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
      <RibbonGroup label="Properties">
        <Tooltip title="Project Information">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('projectInfo')}
              disabled={disabled}
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Change Working Time">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('calendar')}
              disabled={disabled}
            >
              <CalendarMonthIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <RibbonGroup label="Schedule">
        <Tooltip title="Recalculate Project">
          <span>
            <IconButton
              size="small"
              onClick={() => recalculate()}
              disabled={disabled}
            >
              <CalculateIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Capture Baseline">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('baselineCapture')}
              disabled={disabled}
            >
              <FlagIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <RibbonGroup label="Import / Export">
        <Tooltip title="Import MSPDI XML">
          <span>
            <IconButton
              size="small"
              onClick={() => mspdiInputRef.current?.click()}
              disabled={disabled}
            >
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Export MSPDI XML">
          <span>
            <IconButton
              size="small"
              onClick={handleExportMspdi}
              disabled={disabled}
            >
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Import Updates (CSV/JSON)">
          <span>
            <IconButton
              size="small"
              onClick={() => updateInputRef.current?.click()}
              disabled={disabled}
            >
              <SaveAltIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Bulk CSV Import (Create/Update)">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('bulkImport')}
              disabled={disabled}
            >
              <UploadFileIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Export CSV">
          <span>
            <IconButton
              size="small"
              onClick={handleExportCsv}
              disabled={disabled}
            >
              <TableViewIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Export JSON">
          <span>
            <IconButton
              size="small"
              onClick={handleExportJson}
              disabled={disabled}
            >
              <DataObjectIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Export Excel">
          <span>
            <IconButton
              size="small"
              onClick={handleExportExcel}
              disabled={disabled}
            >
              <GridOnIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <RibbonGroup label="Print">
        <Tooltip title="Print">
          <span>
            <IconButton
              size="small"
              onClick={handlePrint}
              disabled={disabled}
            >
              <PrintIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Print Preview">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('printPreview')}
              disabled={disabled}
            >
              <PreviewIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <RibbonGroup label="Status">
        <Tooltip title="Project Statistics">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('projectStatistics')}
              disabled={disabled}
            >
              <QueryStatsIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <RibbonGroup label="Custom Fields">
        <Tooltip title="Custom Fields">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('customFields')}
              disabled={disabled}
            >
              <TuneIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <RibbonGroup label="Stratus">
        <Tooltip title="Stratus Settings">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('stratusSettings')}
              disabled={disabled}
            >
              <SettingsInputComponentIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={stratusStatus?.warnings[0] ?? 'Pull packages from Stratus'}>
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('stratusPullPreview')}
              disabled={disabled || !stratusStatus?.canPull}
            >
              <CloudDownloadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={stratusStatus?.warnings[0] ?? 'Push adjusted dates to Stratus'}>
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('stratusPushPreview')}
              disabled={disabled || !stratusStatus?.canPush}
            >
              <CloudUploadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </RibbonGroup>

      <input type="file" accept=".xml" hidden ref={mspdiInputRef} onChange={handleImportMspdi} />
      <input type="file" accept=".csv,.json" hidden ref={updateInputRef} onChange={handleImportUpdates} />
    </Box>
  );
};

export default ProjectRibbon;
