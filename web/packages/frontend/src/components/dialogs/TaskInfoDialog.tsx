/**
 * TaskInfoDialog — MS Project-style tabbed task editing dialog.
 *
 * Tabs: General · Predecessors · Resources · Advanced · Notes
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Grid2 as Grid,
  Tabs,
  Tab,
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Typography,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

import { tasksApi } from '../../api/client';
import { projectQueryKeys } from '../../data/projectQueries';
import {
  useProjectStore,
  useUIStore,
  type TaskRow,
  type DependencyRow,
  type AssignmentRow,
} from '../../stores';
import { constraintLabel, isoDate, durationDays, parseDuration } from '../../utils/format';
import AiSuggestButton from '../ai/AiSuggestButton';

const CONSTRAINT_TYPES = [0, 1, 2, 3, 4, 5, 6, 7];
const DEP_TYPE_LABELS: Record<string, string> = {
  FS: 'Finish-to-Start (FS)',
  SS: 'Start-to-Start (SS)',
  FF: 'Finish-to-Finish (FF)',
  SF: 'Start-to-Finish (SF)',
};

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ pt: 2 }}>
    {value === index && children}
  </Box>
);

function parseStratusAssemblyExternalKey(externalKey: string | null | undefined): {
  packageKey: string;
  assemblyId: string;
} | null {
  if (!externalKey) {
    return null;
  }

  const marker = '::assembly:';
  const markerIndex = externalKey.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const packageKey = externalKey.slice(0, markerIndex);
  const assemblyId = externalKey.slice(markerIndex + marker.length);
  if (!assemblyId) {
    return null;
  }

  return {
    packageKey,
    assemblyId,
  };
}

function parseStratusProjectExternalKey(externalKey: string | null | undefined): string | null {
  if (!externalKey?.startsWith('stratus-project:')) {
    return null;
  }

  const projectId = externalKey.slice('stratus-project:'.length);
  return projectId || null;
}

const TaskInfoDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'taskInfo');
  const payload = useUIStore((s) => s.dialogPayload) as TaskRow | null;
  const closeDialog = useUIStore((s) => s.closeDialog);
  const updateTask = useProjectStore((s) => s.updateTask);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const tasks = useProjectStore((s) => s.tasks);
  const dependencies = useProjectStore((s) => s.dependencies);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const createDependency = useProjectStore((s) => s.createDependency);
  const deleteDependency = useProjectStore((s) => s.deleteDependency);
  const createAssignment = useProjectStore((s) => s.createAssignment);
  const deleteAssignment = useProjectStore((s) => s.deleteAssignment);

  const [tab, setTab] = useState(0);

  // General tab state
  const [name, setName] = useState('');
  const [durationStr, setDurationStr] = useState('');
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [percentComplete, setPercentComplete] = useState(0);
  const [isManuallyScheduled, setIsManuallyScheduled] = useState(false);

  // Advanced tab state
  const [constraintType, setConstraintType] = useState(0);
  const [constraintDate, setConstraintDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [wbsCode, setWbsCode] = useState('');

  // Notes tab state
  const [notes, setNotes] = useState('');

  // Predecessors tab state
  const [newPredTaskId, setNewPredTaskId] = useState('');
  const [newPredType, setNewPredType] = useState('FS');
  const [newPredLag, setNewPredLag] = useState('0d');

  // Resources tab state
  const [newResId, setNewResId] = useState('');
  const [newResUnits, setNewResUnits] = useState(100);
  const [saving, setSaving] = useState(false);
  const [addingPredecessor, setAddingPredecessor] = useState(false);
  const [addingResource, setAddingResource] = useState(false);
  const [deletingDependencyId, setDeletingDependencyId] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);

  const requiresTaskDetail = Boolean(payload && payload.detailLevel !== 'full');
  const taskDetailQuery = useQuery({
    queryKey:
      activeProjectId && payload
        ? projectQueryKeys.taskDetail(activeProjectId, payload.id)
        : ['projects', 'task', 'idle'],
    queryFn: () => tasksApi.get(activeProjectId!, payload!.id),
    enabled: open && Boolean(activeProjectId && payload && requiresTaskDetail),
  });
  const task = payload?.detailLevel === 'full' ? payload : taskDetailQuery.data ?? null;
  const displayTask = task ?? payload;

  useEffect(() => {
    if (open && task) {
      setName(task.name);
      setDurationStr(durationDays(task.durationMinutes));
      setStart(isoDate(task.start));
      setFinish(isoDate(task.finish));
      setPercentComplete(task.percentComplete);
      setIsManuallyScheduled(task.isManuallyScheduled);
      setConstraintType(task.constraintType);
      setConstraintDate(task.constraintDate ? isoDate(task.constraintDate) : '');
      setDeadline(task.deadline ? isoDate(task.deadline) : '');
      setWbsCode(task.wbsCode ?? '');
      setNotes(task.notes ?? '');
      setTab(0);
      setNewPredTaskId('');
      setNewResId('');
    }
  }, [open, task]);

  // Predecessors for this task
  const predecessors = useMemo(
    () =>
      payload
        ? dependencies.filter((d: DependencyRow) => d.toTaskId === payload.id)
        : [],
    [dependencies, payload],
  );

  // Successors for this task
  const successors = useMemo(
    () =>
      payload
        ? dependencies.filter((d: DependencyRow) => d.fromTaskId === payload.id)
        : [],
    [dependencies, payload],
  );

  // Assignments for this task
  const taskAssignments = useMemo(
    () =>
      payload
        ? assignments.filter((a: AssignmentRow) => a.taskId === payload.id)
        : [],
    [assignments, payload],
  );

  // Task name lookup
  const taskName = (id: string) =>
    tasks.find((t) => t.id === id)?.name ?? id;
  const resourceName = (id: string) =>
    resources.find((r) => r.id === id)?.name ?? id;

  // Available tasks for predecessor selection (exclude self)
  const availablePredTasks = useMemo(
    () => (displayTask ? tasks.filter((t) => t.id !== displayTask.id) : []),
    [displayTask, tasks],
  );
  const stratusAssemblyRef = useMemo(
    () => parseStratusAssemblyExternalKey(displayTask?.externalKey),
    [displayTask?.externalKey],
  );
  const stratusProjectRef = useMemo(
    () => parseStratusProjectExternalKey(displayTask?.externalKey),
    [displayTask?.externalKey],
  );

  const handleSave = async () => {
    if (!displayTask || !activeProjectId) return;
    setSaving(true);
    try {
      const mins = parseDuration(durationStr);
      await updateTask(displayTask.id, {
        name,
        durationMinutes: mins !== null ? mins : displayTask.durationMinutes,
        start: new Date(start).toISOString(),
        finish: new Date(finish).toISOString(),
        percentComplete,
        constraintType,
        constraintDate: constraintDate
          ? new Date(constraintDate).toISOString()
          : null,
        isManuallyScheduled,
        notes,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      });
      closeDialog();
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPredecessor = async () => {
    if (!payload || !newPredTaskId) return;
    setAddingPredecessor(true);
    try {
      const lagMins = parseDuration(newPredLag) ?? 0;
      await createDependency({
        fromTaskId: newPredTaskId,
        toTaskId: payload.id,
        type: newPredType,
        lagMinutes: lagMins,
      });
      setNewPredTaskId('');
      setNewPredLag('0d');
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to add predecessor', 'error');
    } finally {
      setAddingPredecessor(false);
    }
  };

  const handleAddResource = async () => {
    if (!payload || !newResId) return;
    setAddingResource(true);
    try {
      await createAssignment({
        taskId: payload.id,
        resourceId: newResId,
        units: newResUnits / 100,
      });
      setNewResId('');
      setNewResUnits(100);
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to add resource', 'error');
    } finally {
      setAddingResource(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : closeDialog}
      maxWidth="md"
      fullWidth
      aria-busy={saving || taskDetailQuery.isFetching || undefined}
    >
      <DialogTitle sx={{ pb: 0 }}>
        Task Information — {displayTask?.name ?? payload?.name ?? ''}
      </DialogTitle>
      <DialogContent sx={{ minHeight: 400 }}>
        {requiresTaskDetail && !task && (
          <Box
            sx={{
              minHeight: 320,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {taskDetailQuery.isError ? (
              <Typography color="error">
                {taskDetailQuery.error instanceof Error
                  ? taskDetailQuery.error.message
                  : 'Failed to load task details'}
              </Typography>
            ) : (
              <CircularProgress size={24} />
            )}
          </Box>
        )}
        {(!requiresTaskDetail || task) && (
          <>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="General" />
          <Tab label="Predecessors" />
          <Tab label="Resources" />
          <Tab label="Advanced" />
          <Tab label="Notes" />
        </Tabs>

        {/* ─── General ─── */}
        <TabPanel value={tab} index={0}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  label="Task Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  size="small"
                />
                <AiSuggestButton
                  taskId={displayTask?.id}
                  taskName={name}
                  field="name"
                  onAccept={(s) => setName(s)}
                />
              </Box>
            </Grid>
            <Grid size={4}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  label="Duration"
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                  fullWidth
                  size="small"
                  helperText="e.g. 5d, 2w, 4h"
                />
                <AiSuggestButton
                  taskId={displayTask?.id}
                  taskName={name}
                  field="duration"
                  context={`Task: "${name}", Current duration: ${durationStr}`}
                  onAccept={(s) => setDurationStr(s)}
                />
              </Box>
            </Grid>
            <Grid size={4}>
              <TextField
                label="Start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Finish"
                type="date"
                value={finish}
                onChange={(e) => setFinish(e.target.value)}
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="% Complete"
                type="number"
                value={percentComplete}
                onChange={(e) =>
                  setPercentComplete(
                    Math.min(100, Math.max(0, Number(e.target.value))),
                  )
                }
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isManuallyScheduled}
                    onChange={(e) => setIsManuallyScheduled(e.target.checked)}
                    size="small"
                  />
                }
                label="Manually Scheduled"
              />
            </Grid>
            <Grid size={4}>
              <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
                WBS: {wbsCode || '—'}
              </Typography>
            </Grid>
            {/* Read-only scheduling info */}
            <Grid size={12}>
              <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                {displayTask?.isCritical && (
                  <Chip label="Critical" color="error" size="small" />
                )}
                {displayTask?.totalSlackMinutes !== undefined && (
                  <Typography variant="body2" color="text.secondary">
                    Total Slack: {durationDays(displayTask.totalSlackMinutes)}
                  </Typography>
                )}
                {displayTask?.freeSlackMinutes !== undefined && (
                  <Typography variant="body2" color="text.secondary">
                    Free Slack: {durationDays(displayTask.freeSlackMinutes)}
                  </Typography>
                )}
              </Box>
            </Grid>
            {displayTask?.stratusSync && (
              <Grid size={12}>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'grey.100' }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                    Stratus
                  </Typography>
                  <Typography variant="caption" display="block">
                    Package: {displayTask.stratusSync.packageNumber || displayTask.stratusSync.packageId}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Package Id: {displayTask.stratusSync.packageId}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Name: {displayTask.stratusSync.packageName || '-'}
                  </Typography>
                  <Typography variant="caption" display="block">
                    External Key: {displayTask?.externalKey || '-'}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Tracking: {displayTask.stratusSync.trackingStatusName || displayTask.stratusSync.trackingStatusId || '-'}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Pulled dates: {displayTask.stratusSync.pulledStart || '-'} / {displayTask.stratusSync.pulledFinish || '-'} / {displayTask.stratusSync.pulledDeadline || '-'}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Last pull: {displayTask.stratusSync.lastPulledAt.slice(0, 10)}
                    {displayTask.stratusSync.lastPushedAt ? ` | Last push: ${displayTask.stratusSync.lastPushedAt.slice(0, 10)}` : ''}
                  </Typography>
                </Box>
              </Grid>
            )}
            {!displayTask?.stratusSync && stratusAssemblyRef && (
              <Grid size={12}>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'grey.100' }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                    Stratus Assembly Reference
                  </Typography>
                  <Typography variant="caption" display="block">
                    Assembly Id: {stratusAssemblyRef.assemblyId}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Package Key: {stratusAssemblyRef.packageKey}
                  </Typography>
                  <Typography variant="caption" display="block">
                    External Key: {displayTask?.externalKey || '-'}
                  </Typography>
                </Box>
              </Grid>
            )}
            {!displayTask?.stratusSync && !stratusAssemblyRef && stratusProjectRef && (
              <Grid size={12}>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'grey.100' }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                    Stratus Project Reference
                  </Typography>
                  <Typography variant="caption" display="block">
                    Project Id: {stratusProjectRef}
                  </Typography>
                  <Typography variant="caption" display="block">
                    External Key: {displayTask?.externalKey || '-'}
                  </Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* ─── Predecessors ─── */}
        <TabPanel value={tab} index={1}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Task Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Lag</TableCell>
                <TableCell width={50} />
              </TableRow>
            </TableHead>
            <TableBody>
              {predecessors.map((dep, i) => (
                <TableRow key={dep.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{taskName(dep.fromTaskId)}</TableCell>
                  <TableCell>
                    {DEP_TYPE_LABELS[String(dep.type)] ?? String(dep.type)}
                  </TableCell>
                  <TableCell>{durationDays(dep.lagMinutes)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      aria-label={`Delete predecessor ${taskName(dep.fromTaskId)}`}
                      aria-busy={deletingDependencyId === dep.id || undefined}
                      disabled={deletingDependencyId !== null}
                      onClick={() => {
                        setDeletingDependencyId(dep.id);
                        void deleteDependency(dep.id)
                          .catch((error: unknown) => {
                            showSnackbar(error instanceof Error ? error.message : 'Failed to delete predecessor', 'error');
                          })
                          .finally(() => {
                            setDeletingDependencyId((current) => (current === dep.id ? null : current));
                          });
                      }}
                    >
                      {deletingDependencyId === dep.id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {predecessors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No predecessors
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Add predecessor */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Task</InputLabel>
              <Select
                value={newPredTaskId}
                onChange={(e) => setNewPredTaskId(e.target.value as string)}
                label="Task"
              >
                {availablePredTasks.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={newPredType}
                onChange={(e) => setNewPredType(e.target.value as string)}
                label="Type"
              >
                <MenuItem value="FS">Finish-to-Start</MenuItem>
                <MenuItem value="SS">Start-to-Start</MenuItem>
                <MenuItem value="FF">Finish-to-Finish</MenuItem>
                <MenuItem value="SF">Start-to-Finish</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Lag"
              value={newPredLag}
              onChange={(e) => setNewPredLag(e.target.value)}
              size="small"
              sx={{ width: 80 }}
            />
            <IconButton
              color="primary"
              aria-label="Add predecessor"
              aria-busy={addingPredecessor || undefined}
              onClick={handleAddPredecessor}
              disabled={!newPredTaskId || addingPredecessor}
            >
              {addingPredecessor ? <CircularProgress size={18} /> : <AddIcon />}
            </IconButton>
          </Box>

          {/* Successors (read-only) */}
          {successors.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Successors
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Task Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Lag</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {successors.map((dep, i) => (
                    <TableRow key={dep.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{taskName(dep.toTaskId)}</TableCell>
                      <TableCell>
                        {DEP_TYPE_LABELS[String(dep.type)] ?? String(dep.type)}
                      </TableCell>
                      <TableCell>{durationDays(dep.lagMinutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </TabPanel>

        {/* ─── Resources ─── */}
        <TabPanel value={tab} index={2}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Resource Name</TableCell>
                <TableCell>Units</TableCell>
                <TableCell>Work</TableCell>
                <TableCell width={50} />
              </TableRow>
            </TableHead>
            <TableBody>
              {taskAssignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{resourceName(a.resourceId)}</TableCell>
                  <TableCell>{Math.round(a.units * 100)}%</TableCell>
                  <TableCell>{durationDays(a.workMinutes)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      aria-label={`Delete assignment ${resourceName(a.resourceId)}`}
                      aria-busy={deletingAssignmentId === a.id || undefined}
                      disabled={deletingAssignmentId !== null}
                      onClick={() => {
                        setDeletingAssignmentId(a.id);
                        void deleteAssignment(a.id)
                          .catch((error: unknown) => {
                            showSnackbar(error instanceof Error ? error.message : 'Failed to delete assignment', 'error');
                          })
                          .finally(() => {
                            setDeletingAssignmentId((current) => (current === a.id ? null : current));
                          });
                      }}
                    >
                      {deletingAssignmentId === a.id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {taskAssignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No resources assigned
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Add resource */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Resource</InputLabel>
              <Select
                value={newResId}
                onChange={(e) => setNewResId(e.target.value as string)}
                label="Resource"
              >
                {resources.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Units %"
              type="number"
              value={newResUnits}
              onChange={(e) => setNewResUnits(Number(e.target.value))}
              size="small"
              sx={{ width: 80 }}
            />
            <IconButton
              color="primary"
              aria-label="Add resource"
              aria-busy={addingResource || undefined}
              onClick={handleAddResource}
              disabled={!newResId || addingResource}
            >
              {addingResource ? <CircularProgress size={18} /> : <AddIcon />}
            </IconButton>
          </Box>
        </TabPanel>

        {/* ─── Advanced ─── */}
        <TabPanel value={tab} index={3}>
          <Grid container spacing={2}>
            <Grid size={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>Constraint Type</InputLabel>
                <Select
                  value={constraintType}
                  onChange={(e) => setConstraintType(Number(e.target.value))}
                  label="Constraint Type"
                >
                  {CONSTRAINT_TYPES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {constraintLabel(c)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={6}>
              <TextField
                label="Constraint Date"
                type="date"
                value={constraintDate}
                onChange={(e) => setConstraintDate(e.target.value)}
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                disabled={constraintType === 0 || constraintType === 1}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="WBS Code"
                value={wbsCode}
                disabled
                fullWidth
                size="small"
              />
            </Grid>
            {/* Read-only scheduling dates */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                Scheduling Dates (calculated)
              </Typography>
            </Grid>
            <Grid size={3}>
              <TextField
                label="Early Start"
                value={displayTask?.earlyStart ? isoDate(displayTask.earlyStart) : '—'}
                disabled
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={3}>
              <TextField
                label="Early Finish"
                value={displayTask?.earlyFinish ? isoDate(displayTask.earlyFinish) : '—'}
                disabled
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={3}>
              <TextField
                label="Late Start"
                value={displayTask?.lateStart ? isoDate(displayTask.lateStart) : '—'}
                disabled
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={3}>
              <TextField
                label="Late Finish"
                value={displayTask?.lateFinish ? isoDate(displayTask.lateFinish) : '—'}
                disabled
                fullWidth
                size="small"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* ─── Notes ─── */}
        <TabPanel value={tab} index={4}>
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={10}
            placeholder="Enter task notes here..."
          />
        </TabPanel>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || (requiresTaskDetail && !task)}
          aria-busy={saving || undefined}
        >
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskInfoDialog;
