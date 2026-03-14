import React, { useDeferredValue, useEffect, useId, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { DataGrid, type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import {
  stratusApi,
  type StratusProjectImportApplyResponse,
  type StratusProjectImportPreviewResponse,
  type StratusProjectImportPreviewRow,
} from '../../api/client';
import { useStratusJob } from '../../hooks/useStratusJob';
import {
  useProjectBrowserStore,
  useProjectStore,
  useUIStore,
  type LocalProjectSourceFilter,
  type ProjectBrowserTab,
} from '../../stores';
import type {
  ProjectBrowserLocalSort,
  ProjectBrowserLocalSortField,
} from '../../stores/useProjectBrowserStore';
import {
  buildLocalProjectBrowserRows,
  deriveFacetOptions,
  filterLocalProjectRows,
  filterStratusProjectPreviewRows,
  selectImportedProjectId,
  sortLocalProjectRows,
  sortStratusProjectPreviewRows,
  type LocalProjectBrowserRow,
} from '../../utils/projectBrowser';
import StratusJobStatusCard from './StratusJobStatusCard';

interface ProjectBrowserDialogPayload {
  initialTab?: ProjectBrowserTab;
}

interface ImportSuccessSummary {
  result: StratusProjectImportApplyResponse;
  selectedProjectId: string | null;
}

function readDialogPayload(payload: unknown): ProjectBrowserDialogPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  return {
    initialTab:
      candidate.initialTab === 'stratus' || candidate.initialTab === 'local'
        ? candidate.initialTab
        : undefined,
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatSourceLabel(source: LocalProjectBrowserRow['source']): string {
  return source === 'stratus-linked' ? 'Stratus Linked' : 'Manual';
}

function getActionChipColor(
  action: StratusProjectImportPreviewRow['action'],
): 'default' | 'primary' | 'success' | 'warning' {
  if (action === 'create') {
    return 'success';
  }
  if (action === 'update') {
    return 'primary';
  }
  if (action === 'exclude') {
    return 'warning';
  }
  return 'default';
}

function getExcludedProjectIds(
  preview: StratusProjectImportPreviewResponse | null,
): string[] {
  return (
    preview?.rows
      .filter((row) => row.action === 'exclude')
      .map((row) => row.stratusProjectId) ?? []
  );
}

function TabPanel({
  active,
  value,
  children,
}: {
  active: ProjectBrowserTab;
  value: ProjectBrowserTab;
  children: React.ReactNode;
}) {
  if (active !== value) {
    return null;
  }

  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

const defaultLocalSort: ProjectBrowserLocalSort = {
  field: 'updatedAt',
  direction: 'desc',
};

const stratusActionOptions: Array<
  'all' | StratusProjectImportPreviewRow['action']
> = ['all', 'create', 'update', 'skip', 'exclude'];

const ProjectBrowserDialog: React.FC = () => {
  const openDialog = useUIStore((state) => state.openDialog);
  const dialogPayload = useUIStore((state) => state.dialogPayload);
  const closeDialog = useUIStore((state) => state.closeDialog);
  const openDialogWith = useUIStore((state) => state.openDialogWith);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const loadingProjects = useProjectStore((state) => state.loadingProjects);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const pinnedProjectIds = useProjectBrowserStore((state) => state.pinnedProjectIds);
  const lastOpenedTab = useProjectBrowserStore((state) => state.lastOpenedTab);
  const localSearch = useProjectBrowserStore((state) => state.localSearch);
  const localSourceFilter = useProjectBrowserStore((state) => state.localSourceFilter);
  const localProjectTypeFilter = useProjectBrowserStore(
    (state) => state.localProjectTypeFilter,
  );
  const localSectorFilter = useProjectBrowserStore((state) => state.localSectorFilter);
  const localRegionFilter = useProjectBrowserStore((state) => state.localRegionFilter);
  const localSort = useProjectBrowserStore((state) => state.localSort);
  const setLastOpenedTab = useProjectBrowserStore((state) => state.setLastOpenedTab);
  const setLocalSearch = useProjectBrowserStore((state) => state.setLocalSearch);
  const setLocalSourceFilter = useProjectBrowserStore(
    (state) => state.setLocalSourceFilter,
  );
  const setLocalProjectTypeFilter = useProjectBrowserStore(
    (state) => state.setLocalProjectTypeFilter,
  );
  const setLocalSectorFilter = useProjectBrowserStore((state) => state.setLocalSectorFilter);
  const setLocalRegionFilter = useProjectBrowserStore((state) => state.setLocalRegionFilter);
  const setLocalSort = useProjectBrowserStore((state) => state.setLocalSort);
  const resetLocalFilters = useProjectBrowserStore((state) => state.resetLocalFilters);
  const togglePinnedProject = useProjectBrowserStore(
    (state) => state.togglePinnedProject,
  );
  const markProjectOpened = useProjectBrowserStore((state) => state.markProjectOpened);

  const { job, startJob, clearJob, isRunning } = useStratusJob();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const localFilterLabelId = useId();
  const projectTypeFilterLabelId = useId();
  const sectorFilterLabelId = useId();
  const regionFilterLabelId = useId();
  const stratusActionLabelId = useId();
  const open =
    openDialog === 'projectBrowser' || openDialog === 'stratusProjectImport';
  const payload = readDialogPayload(dialogPayload);

  const [activeTab, setActiveTab] = useState<ProjectBrowserTab>('local');
  const [selectedLocalProjectId, setSelectedLocalProjectId] = useState<string | null>(
    null,
  );
  const [stratusSearch, setStratusSearch] = useState('');
  const [stratusActionFilter, setStratusActionFilter] = useState<
    'all' | StratusProjectImportPreviewRow['action']
  >('all');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [preview, setPreview] = useState<StratusProjectImportPreviewResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [handledJobId, setHandledJobId] = useState<string | null>(null);
  const [savingOverrideProjectId, setSavingOverrideProjectId] = useState<
    string | null
  >(null);
  const [hasAutoLoadedStratusPreview, setHasAutoLoadedStratusPreview] =
    useState(false);
  const [importSuccess, setImportSuccess] = useState<ImportSuccessSummary | null>(
    null,
  );

  const deferredLocalSearch = useDeferredValue(localSearch);
  const deferredStratusSearch = useDeferredValue(stratusSearch);

  const localRows = buildLocalProjectBrowserRows(projects);
  const filteredLocalRows = sortLocalProjectRows(
    filterLocalProjectRows(localRows, {
      search: deferredLocalSearch,
      sourceFilter: localSourceFilter,
      projectTypeFilter: localProjectTypeFilter,
      sectorFilter: localSectorFilter,
      regionFilter: localRegionFilter,
    }),
    localSort,
  );
  const projectTypeOptions = deriveFacetOptions(localRows, 'projectType');
  const sectorOptions = deriveFacetOptions(localRows, 'sector');
  const regionOptions = deriveFacetOptions(localRows, 'region');

  const filteredPreviewRows = sortStratusProjectPreviewRows(
    filterStratusProjectPreviewRows(
      preview?.rows ?? [],
      deferredStratusSearch,
      stratusActionFilter,
      warningsOnly,
    ),
  );

  useEffect(() => {
    if (!open) {
      setActiveTab('local');
      setSelectedLocalProjectId(null);
      setStratusSearch('');
      setStratusActionFilter('all');
      setWarningsOnly(false);
      setPreview(null);
      setError(null);
      setHandledJobId(null);
      setSavingOverrideProjectId(null);
      setHasAutoLoadedStratusPreview(false);
      setImportSuccess(null);
      clearJob();
      return;
    }

    const initialTab =
      payload?.initialTab ??
      (openDialog === 'stratusProjectImport' ? 'stratus' : lastOpenedTab);
    setActiveTab(initialTab);
    setLastOpenedTab(initialTab);
    setSelectedLocalProjectId((current) => current ?? activeProjectId);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setLastOpenedTab(activeTab);
  }, [activeTab, open, setLastOpenedTab]);

  useEffect(() => {
    if (!open || activeTab !== 'stratus' || hasAutoLoadedStratusPreview) {
      return;
    }

    setHasAutoLoadedStratusPreview(true);
    void startJob(() => stratusApi.createProjectImportJob('preview')).catch(
      (requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to preview Stratus projects.',
        );
      },
    );
  }, [activeTab, hasAutoLoadedStratusPreview, open, startJob]);

  useEffect(() => {
    if (!open || filteredLocalRows.length === 0) {
      if (open && filteredLocalRows.length === 0 && selectedLocalProjectId !== null) {
        setSelectedLocalProjectId(null);
      }
      return;
    }

    const selectedVisible = filteredLocalRows.some(
      (project) => project.id === selectedLocalProjectId,
    );
    if (selectedVisible) {
      return;
    }

    const preferredProject =
      filteredLocalRows.find((project) => project.id === activeProjectId) ??
      filteredLocalRows[0] ??
      null;
    if (preferredProject) {
      setSelectedLocalProjectId(preferredProject.id);
    }
  }, [activeProjectId, filteredLocalRows, open, selectedLocalProjectId]);

  useEffect(() => {
    if (!job || job.id === handledJobId) {
      return;
    }

    if (job.status === 'failed') {
      setHandledJobId(job.id);
      setError(job.error || 'Stratus job failed.');
      showSnackbar(job.error || 'Stratus job failed.', 'error');
      return;
    }

    if (job.status !== 'succeeded' || !job.result) {
      return;
    }

    setHandledJobId(job.id);
    if (job.kind === 'projectImportPreview') {
      setPreview(job.result as StratusProjectImportPreviewResponse);
      setError(null);
      return;
    }

    if (job.kind === 'projectImportApply') {
      const result = job.result as StratusProjectImportApplyResponse;
      const selectedProjectId = selectImportedProjectId(result);

      setImportSuccess({ result, selectedProjectId });
      setError(null);
      resetLocalFilters();
      setLocalSort(defaultLocalSort);
      setActiveTab('local');
      setSelectedLocalProjectId(selectedProjectId);

      void useProjectStore.getState().fetchProjects();

      showSnackbar(
        `Imported active Stratus projects. Created ${result.summary.created}, updated ${result.summary.updated}, skipped ${result.summary.skipped}, excluded ${result.summary.excluded}, failed ${result.summary.failed}.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    }
  }, [handledJobId, job, resetLocalFilters, setLocalSort, showSnackbar]);

  const localSortModel: GridSortModel = [
    {
      field: localSort.field,
      sort: localSort.direction,
    },
  ];

  const previewImportableRows =
    preview?.rows.filter((row) => row.action !== 'exclude').length ?? 0;
  const selectedLocalRow =
    filteredLocalRows.find((project) => project.id === selectedLocalProjectId) ?? null;

  const openProject = async (projectId: string, closeBrowser: boolean) => {
    markProjectOpened(projectId);
    if (closeBrowser) {
      closeDialog();
    }

    try {
      await setActiveProject(projectId);
    } catch (requestError: unknown) {
      showSnackbar(
        requestError instanceof Error
          ? requestError.message
          : 'Project could not be opened.',
        'error',
      );
    }
  };

  const handleRunPreview = async () => {
    setError(null);
    try {
      await startJob(() => stratusApi.createProjectImportJob('preview'));
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Failed to preview Stratus projects.';
      setError(message);
      showSnackbar(message, 'error');
    }
  };

  const handleImportAllActive = async () => {
    setError(null);
    try {
      await startJob(() => stratusApi.createProjectImportJob('apply'));
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Failed to import active Stratus projects.';
      setError(message);
      showSnackbar(message, 'error');
    }
  };

  const handleOverrideToggle = async (row: StratusProjectImportPreviewRow) => {
    const excludedProjectIds = new Set(getExcludedProjectIds(preview));
    if (row.action === 'exclude') {
      excludedProjectIds.delete(row.stratusProjectId);
    } else {
      excludedProjectIds.add(row.stratusProjectId);
    }

    setSavingOverrideProjectId(row.stratusProjectId);
    try {
      await stratusApi.updateConfig({
        excludedProjectIds: [...excludedProjectIds],
      });
      setPreview(null);
      await handleRunPreview();
      showSnackbar(
        row.action === 'exclude'
          ? 'Project restored for future Stratus imports.'
          : 'Project excluded from future Stratus imports.',
        'success',
      );
    } catch (requestError: unknown) {
      showSnackbar(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to save Stratus import override.',
        'error',
      );
    } finally {
      setSavingOverrideProjectId(null);
    }
  };

  const handleLocalSortChange = (nextModel: GridSortModel) => {
    const nextSort = nextModel[0];
    if (!nextSort?.field || !nextSort.sort) {
      setLocalSort(defaultLocalSort);
      return;
    }

    setLocalSort({
      field: nextSort.field as ProjectBrowserLocalSortField,
      direction: nextSort.sort,
    });
  };

  const localColumns: GridColDef<LocalProjectBrowserRow>[] = [
    {
      field: 'name',
      headerName: 'Name',
      minWidth: 260,
      flex: 1.4,
    },
    {
      field: 'source',
      headerName: 'Source',
      width: 140,
      valueGetter: (_value, row) => formatSourceLabel(row.source),
    },
    {
      field: 'projectType',
      headerName: 'Project Type',
      minWidth: 160,
      flex: 0.8,
      valueGetter: (_value, row) => row.projectType || '-',
    },
    {
      field: 'sector',
      headerName: 'Sector',
      minWidth: 150,
      flex: 0.7,
      valueGetter: (_value, row) => row.sector || '-',
    },
    {
      field: 'region',
      headerName: 'Region',
      minWidth: 140,
      flex: 0.7,
      valueGetter: (_value, row) => row.region || '-',
    },
    {
      field: 'startDate',
      headerName: 'Start',
      width: 120,
      valueGetter: (_value, row) => formatDate(row.startDate),
    },
    {
      field: 'finishDate',
      headerName: 'Finish',
      width: 120,
      valueGetter: (_value, row) => formatDate(row.finishDate),
    },
    {
      field: 'updatedAt',
      headerName: 'Updated',
      width: 170,
      valueGetter: (_value, row) => formatDateTime(row.updatedAt),
    },
    {
      field: 'stratusLastPullAt',
      headerName: 'Last Pull',
      width: 170,
      valueGetter: (_value, row) => formatDateTime(row.stratusLastPullAt),
    },
    {
      field: 'stratusLastPushAt',
      headerName: 'Last Push',
      width: 170,
      valueGetter: (_value, row) => formatDateTime(row.stratusLastPushAt),
    },
    {
      field: 'pin',
      headerName: '',
      width: 96,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: 'center',
      renderCell: (params) => {
        const isPinned = pinnedProjectIds.includes(params.row.id);

        return (
          <Tooltip title={isPinned ? 'Unpin project' : 'Pin project'}>
            <Button
              size="small"
              color={isPinned ? 'primary' : 'inherit'}
              startIcon={isPinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
              onClick={(event) => {
                event.stopPropagation();
                togglePinnedProject(params.row.id);
              }}
            >
              {isPinned ? 'Unpin' : 'Pin'}
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  const stratusColumns: GridColDef<StratusProjectImportPreviewRow>[] = [
    {
      field: 'action',
      headerName: 'Action',
      width: 130,
      sortable: false,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.row.action}
          color={getActionChipColor(params.row.action)}
        />
      ),
    },
    {
      field: 'projectNumber',
      headerName: 'Stratus Project',
      minWidth: 260,
      flex: 1.2,
      sortable: false,
      renderCell: (params) => (
        <Stack spacing={0.25} sx={{ py: 0.75, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {params.row.projectNumber || params.row.stratusProjectId}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {params.row.projectName || params.row.stratusProjectId}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Stratus Id: {params.row.stratusProjectId}
          </Typography>
        </Stack>
      ),
    },
    {
      field: 'localProjectName',
      headerName: 'Local Project',
      minWidth: 220,
      flex: 1,
      sortable: false,
      renderCell: (params) => (
        <Stack spacing={0.25} sx={{ py: 0.75, minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {params.row.localProjectName || 'New local project'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {params.row.localProjectId || 'Will be created'}
          </Typography>
        </Stack>
      ),
    },
    {
      field: 'mappedProject',
      headerName: 'Mapped Values',
      minWidth: 260,
      flex: 1.2,
      sortable: false,
      valueGetter: (_value, row) =>
        `${row.mappedProject.name} | ${row.mappedProject.projectType || '-'} | ${row.mappedProject.sector || '-'} | ${row.mappedProject.region || '-'}`,
      renderCell: (params) => (
        <Stack spacing={0.25} sx={{ py: 0.75, minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {params.row.mappedProject.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Start {formatDate(params.row.mappedProject.startDate)} | Finish{' '}
            {formatDate(params.row.mappedProject.finishDate)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Type {params.row.mappedProject.projectType || '-'} | Sector{' '}
            {params.row.mappedProject.sector || '-'} | Region{' '}
            {params.row.mappedProject.region || '-'}
          </Typography>
        </Stack>
      ),
    },
    {
      field: 'warnings',
      headerName: 'Warnings',
      minWidth: 220,
      flex: 1,
      sortable: false,
      valueGetter: (_value, row) => row.warnings.join(' | ') || '-',
      renderCell: (params) => (
        <Stack spacing={0.25} sx={{ py: 0.75, minWidth: 0 }}>
          {params.row.warnings.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              None
            </Typography>
          ) : (
            params.row.warnings.map((warning) => (
              <Typography
                key={warning}
                variant="caption"
                color={
                  params.row.action === 'exclude' ? 'info.main' : 'warning.main'
                }
                noWrap
              >
                {warning}
              </Typography>
            ))
          )}
        </Stack>
      ),
    },
    {
      field: 'toggle',
      headerName: '',
      width: 120,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Button
          size="small"
          variant={params.row.action === 'exclude' ? 'contained' : 'outlined'}
          color={params.row.action === 'exclude' ? 'warning' : 'inherit'}
          disabled={isRunning || savingOverrideProjectId !== null}
          onClick={(event) => {
            event.stopPropagation();
            void handleOverrideToggle(params.row);
          }}
        >
          {savingOverrideProjectId === params.row.stratusProjectId
            ? 'Saving...'
            : params.row.action === 'exclude'
              ? 'Include'
              : 'Exclude'}
        </Button>
      ),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={isRunning ? undefined : closeDialog}
      fullWidth
      maxWidth="xl"
      fullScreen={fullScreen}
    >
      <DialogTitle>Project Browser</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Tabs
          value={activeTab}
          onChange={(_event, nextValue: ProjectBrowserTab) => setActiveTab(nextValue)}
          aria-label="Project browser tabs"
        >
          <Tab value="local" label="Local" />
          <Tab value="stratus" label="Stratus" />
        </Tabs>

        <TabPanel active={activeTab} value="local">
          <Stack spacing={2}>
            {importSuccess && (
              <Alert severity={importSuccess.result.summary.failed > 0 ? 'warning' : 'success'}>
                Imported active Stratus projects. Created {importSuccess.result.summary.created},
                updated {importSuccess.result.summary.updated}, skipped{' '}
                {importSuccess.result.summary.skipped}, excluded{' '}
                {importSuccess.result.summary.excluded}, failed{' '}
                {importSuccess.result.summary.failed}.
              </Alert>
            )}

            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', lg: 'center' }}
            >
              <TextField
                label="Search projects"
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder="Name, Stratus id, type, sector, or region"
                InputProps={{
                  startAdornment: (
                    <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                  ),
                }}
                sx={{ minWidth: { xs: '100%', lg: 320 } }}
              />
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel id={localFilterLabelId}>Source</InputLabel>
                <Select
                  labelId={localFilterLabelId}
                  label="Source"
                  value={localSourceFilter}
                  onChange={(event) =>
                    setLocalSourceFilter(event.target.value as LocalProjectSourceFilter)
                  }
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="manual">Manual</MenuItem>
                  <MenuItem value="stratus-linked">Stratus Linked</MenuItem>
                </Select>
              </FormControl>
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel id={projectTypeFilterLabelId}>Project Type</InputLabel>
                <Select
                  labelId={projectTypeFilterLabelId}
                  label="Project Type"
                  value={localProjectTypeFilter}
                  onChange={(event) => setLocalProjectTypeFilter(event.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {projectTypeOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel id={sectorFilterLabelId}>Sector</InputLabel>
                <Select
                  labelId={sectorFilterLabelId}
                  label="Sector"
                  value={localSectorFilter}
                  onChange={(event) => setLocalSectorFilter(event.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {sectorOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel id={regionFilterLabelId}>Region</InputLabel>
                <Select
                  labelId={regionFilterLabelId}
                  label="Region"
                  value={localRegionFilter}
                  onChange={(event) => setLocalRegionFilter(event.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {regionOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button onClick={resetLocalFilters}>Reset Filters</Button>
            </Stack>

            <Box sx={{ height: fullScreen ? 'calc(100vh - 280px)' : 560 }}>
              <DataGrid
                rows={filteredLocalRows}
                columns={localColumns}
                loading={loadingProjects}
                getRowId={(row) => row.id}
                sortingMode="server"
                sortModel={localSortModel}
                onSortModelChange={handleLocalSortChange}
                rowSelectionModel={selectedLocalProjectId ? [selectedLocalProjectId] : []}
                onRowSelectionModelChange={(selection) => {
                  const nextSelection = selection[0];
                  setSelectedLocalProjectId(
                    typeof nextSelection === 'string' ? nextSelection : null,
                  );
                }}
                onRowDoubleClick={(params) => {
                  void openProject(params.row.id, true);
                }}
                onCellKeyDown={(params, event) => {
                  if (event.key === 'Enter') {
                    void openProject(params.row.id, true);
                  }
                }}
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: {
                    paginationModel: {
                      pageSize: 25,
                      page: 0,
                    },
                  },
                }}
                keepNonExistentRowsSelected={false}
                hideFooterSelectedRowCount
              />
            </Box>
          </Stack>
        </TabPanel>

        <TabPanel active={activeTab} value="stratus">
          <Stack spacing={2}>
            <Alert severity="info">
              Preview runs against active Stratus projects the first time this tab opens.
              Use <strong>Exclude</strong> to keep a project out of future imports, or{' '}
              <strong>Import All Active</strong> when the preview looks right.
            </Alert>

            {job && <StratusJobStatusCard job={job} />}

            {preview && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={
                    preview.sourceInfo.source === 'sqlBigData'
                      ? 'Source SQL Big Data'
                      : preview.sourceInfo.fallbackUsed
                        ? 'Source API Fallback'
                        : 'Source Stratus API'
                  }
                  size="small"
                  color={
                    preview.sourceInfo.source === 'sqlBigData' ? 'primary' : 'default'
                  }
                />
                <Chip label={`Projects ${preview.summary.totalProjects}`} size="small" />
                <Chip label={`Create ${preview.summary.createCount}`} size="small" color="success" />
                <Chip label={`Update ${preview.summary.updateCount}`} size="small" color="primary" />
                <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
                <Chip
                  label={`Excluded ${preview.summary.excludedCount}`}
                  size="small"
                  color="warning"
                />
                <Chip
                  label={`Runtime ${(preview.meta.durationMs / 1000).toFixed(1)}s`}
                  size="small"
                />
              </Box>
            )}

            {preview && (
              <Alert severity={preview.sourceInfo.fallbackUsed ? 'warning' : 'info'}>
                {preview.sourceInfo.message || 'Import source ready.'}
                <br />
                Freshness {formatDateTime(preview.sourceInfo.freshness)} | Package report{' '}
                {preview.sourceInfo.packageReportName || '-'} | Assembly report{' '}
                {preview.sourceInfo.assemblyReportName || '-'}
              </Alert>
            )}

            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', lg: 'center' }}
            >
              <TextField
                label="Search Stratus projects"
                value={stratusSearch}
                onChange={(event) => setStratusSearch(event.target.value)}
                placeholder="Project number, name, local name, or Stratus id"
                InputProps={{
                  startAdornment: (
                    <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                  ),
                }}
                sx={{ minWidth: { xs: '100%', lg: 320 } }}
              />
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel id={stratusActionLabelId}>Action</InputLabel>
                <Select
                  labelId={stratusActionLabelId}
                  label="Action"
                  value={stratusActionFilter}
                  onChange={(event) =>
                    setStratusActionFilter(
                      event.target.value as 'all' | StratusProjectImportPreviewRow['action'],
                    )
                  }
                >
                  {stratusActionOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option === 'all' ? 'All' : option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant={warningsOnly ? 'contained' : 'outlined'}
                onClick={() => setWarningsOnly((current) => !current)}
                startIcon={
                  <Checkbox
                    checked={warningsOnly}
                    sx={{ p: 0, pointerEvents: 'none' }}
                  />
                }
              >
                Warnings Only
              </Button>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}
            {!isRunning && !error && preview && preview.rows.length === 0 && (
              <Alert severity="info">No active Stratus projects were returned.</Alert>
            )}

            <Box sx={{ height: fullScreen ? 'calc(100vh - 360px)' : 560 }}>
              <DataGrid
                rows={filteredPreviewRows}
                columns={stratusColumns}
                getRowId={(row) => row.stratusProjectId}
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: {
                    paginationModel: {
                      pageSize: 25,
                      page: 0,
                    },
                  },
                }}
                hideFooterSelectedRowCount
              />
            </Box>
          </Stack>
        </TabPanel>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => openDialogWith('stratusSettings')}>Stratus Settings</Button>
          {activeTab === 'local' && (
            <Button
              startIcon={<FolderOpenOutlinedIcon />}
              variant="contained"
              disabled={!selectedLocalRow}
              onClick={() => {
                if (!selectedLocalRow) {
                  return;
                }
                void openProject(selectedLocalRow.id, true);
              }}
            >
              Open Project
            </Button>
          )}
          {activeTab === 'stratus' && (
            <>
              <Button
                onClick={() => {
                  void handleRunPreview();
                }}
                disabled={isRunning || savingOverrideProjectId !== null}
              >
                Preview
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  void handleImportAllActive();
                }}
                disabled={
                  isRunning ||
                  savingOverrideProjectId !== null ||
                  (preview !== null && previewImportableRows === 0)
                }
              >
                Import All Active
              </Button>
            </>
          )}
        </Box>
        <Button onClick={closeDialog} disabled={isRunning || savingOverrideProjectId !== null}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectBrowserDialog;
