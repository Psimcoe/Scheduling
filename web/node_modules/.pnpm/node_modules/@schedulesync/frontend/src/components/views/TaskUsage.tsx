/**
 * TaskUsage — shows tasks with their resource assignments
 * and work distribution.
 */

import React, { useMemo } from 'react';
import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { useProjectStore, type TaskRow, type AssignmentRow, type ResourceRow } from '../../stores';
import { shortDate, durationDays, pctLabel } from '../../utils/format';

interface TaskGroup {
  task: TaskRow;
  assignments: (AssignmentRow & { resourceName: string })[];
  totalWork: number;
}

const TaskUsage: React.FC = () => {
  const tasks = useProjectStore((s) => s.tasks);
  const assignments = useProjectStore((s) => s.assignments);
  const resources = useProjectStore((s) => s.resources);

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => new Set(tasks.map((t) => t.id)),
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resourceMap = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );

  const groups: TaskGroup[] = useMemo(() => {
    return tasks.map((task) => {
      const taskAssignments = assignments
        .filter((a) => a.taskId === task.id)
        .map((a) => {
          const resource = resourceMap.get(a.resourceId);
          return { ...a, resourceName: resource?.name ?? 'Unknown' };
        });
      const totalWork = taskAssignments.reduce((s, a) => s + a.workMinutes, 0);
      return { task, assignments: taskAssignments, totalWork };
    });
  }, [tasks, assignments, resourceMap]);

  if (tasks.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">No tasks defined.</Typography>
      </Box>
    );
  }

  return (
    <TableContainer sx={{ height: '100%', overflow: 'auto' }}>
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 40 }} />
            <TableCell sx={{ minWidth: 200 }}>Task / Resource Name</TableCell>
            <TableCell sx={{ width: 80 }} align="right">
              Work
            </TableCell>
            <TableCell sx={{ width: 80 }} align="right">
              Duration
            </TableCell>
            <TableCell sx={{ width: 100 }}>Start</TableCell>
            <TableCell sx={{ width: 100 }}>Finish</TableCell>
            <TableCell sx={{ width: 60 }} align="right">
              % Done
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((g) => (
            <React.Fragment key={g.task.id}>
              {/* Task row */}
              <TableRow
                hover
                onClick={() => toggleExpand(g.task.id)}
                sx={{ cursor: 'pointer', bgcolor: '#F5F5F5' }}
              >
                <TableCell>
                  {g.assignments.length > 0 && (
                    expandedIds.has(g.task.id) ? (
                      <ExpandMoreIcon sx={{ fontSize: 16 }} />
                    ) : (
                      <ChevronRightIcon sx={{ fontSize: 16 }} />
                    )
                  )}
                </TableCell>
                <TableCell>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      pl: `${g.task.outlineLevel * 16}px`,
                    }}
                  >
                    {g.task.name}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {durationDays(g.totalWork || g.task.durationMinutes)}
                </TableCell>
                <TableCell align="right">
                  {durationDays(g.task.durationMinutes)}
                </TableCell>
                <TableCell>{shortDate(g.task.start)}</TableCell>
                <TableCell>{shortDate(g.task.finish)}</TableCell>
                <TableCell align="right">{pctLabel(g.task.percentComplete)}</TableCell>
              </TableRow>

              {/* Assignment rows */}
              {expandedIds.has(g.task.id) &&
                g.assignments.map((a) => (
                  <TableRow key={a.id} hover sx={{ bgcolor: '#FAFAFA' }}>
                    <TableCell />
                    <TableCell sx={{ pl: 4 }}>
                      <Typography sx={{ fontSize: '0.8125rem', color: '#0078D4' }}>
                        {a.resourceName}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{durationDays(a.workMinutes)}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell align="right">{a.units}%</TableCell>
                  </TableRow>
                ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default TaskUsage;
