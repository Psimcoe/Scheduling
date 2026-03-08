/**
 * CalendarView — shows tasks laid out on a monthly calendar grid.
 * Each day shows tasks that span that date.
 */

import React, { useMemo, useState } from 'react';
import { Box, Typography, IconButton, Paper, Tooltip } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { useProjectStore, useUIStore, type TaskRow } from '../../stores';

dayjs.extend(utc);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarView: React.FC = () => {
  const tasks = useProjectStore((s) => s.tasks);
  const selectTask = useProjectStore((s) => s.selectTask);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const openDialogWith = useUIStore((s) => s.openDialogWith);
  const showCriticalPath = useUIStore((s) => s.showCriticalPath);

  const [currentMonth, setCurrentMonth] = useState(() => dayjs.utc().startOf('month'));

  const monthStart = currentMonth.startOf('month');
  const calStart = monthStart.startOf('week');
  const monthEnd = currentMonth.endOf('month');
  const calEnd = monthEnd.endOf('week');

  // Build array of weeks, each with 7 days
  const weeks = useMemo(() => {
    const result: dayjs.Dayjs[][] = [];
    let cursor = calStart;
    while (cursor.isBefore(calEnd) || cursor.isSame(calEnd, 'day')) {
      const week: dayjs.Dayjs[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(cursor);
        cursor = cursor.add(1, 'day');
      }
      result.push(week);
    }
    return result;
  }, [calStart, calEnd]);

  // Map tasks to days
  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const start = dayjs.utc(task.start).startOf('day');
      const finish = dayjs.utc(task.finish).startOf('day');
      let cursor = start;
      while (cursor.isBefore(finish) || cursor.isSame(finish, 'day')) {
        const key = cursor.format('YYYY-MM-DD');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
        cursor = cursor.add(1, 'day');
      }
    }
    return map;
  }, [tasks]);

  const prevMonth = () => setCurrentMonth((m) => m.subtract(1, 'month'));
  const nextMonth = () => setCurrentMonth((m) => m.add(1, 'month'));
  const goToday = () => setCurrentMonth(dayjs.utc().startOf('month'));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#FAFAFA' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
        <IconButton size="small" onClick={prevMonth}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography sx={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }}>
          {currentMonth.format('MMMM YYYY')}
        </Typography>
        <IconButton size="small" onClick={nextMonth}>
          <ChevronRightIcon />
        </IconButton>
        <Typography
          onClick={goToday}
          sx={{
            cursor: 'pointer',
            color: 'primary.main',
            fontSize: '0.8rem',
            ml: 1,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Today
        </Typography>
      </Box>

      {/* Day headers */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #E0E0E0' }}>
        {DAY_NAMES.map((d) => (
          <Box
            key={d}
            sx={{
              textAlign: 'center',
              py: 0.25,
              fontWeight: 600,
              fontSize: '0.75rem',
              bgcolor: d === 'Sat' || d === 'Sun' ? '#FFF8E1' : '#F5F5F5',
              borderRight: '1px solid #E0E0E0',
            }}
          >
            {d}
          </Box>
        ))}
      </Box>

      {/* Calendar grid */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {weeks.map((week, wi) => (
          <Box
            key={wi}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              minHeight: 80,
              borderBottom: '1px solid #E0E0E0',
            }}
          >
            {week.map((day) => {
              const key = day.format('YYYY-MM-DD');
              const isCurrentMonth = day.month() === currentMonth.month();
              const isToday = day.isSame(dayjs.utc(), 'day');
              const dayTasks = tasksByDay.get(key) ?? [];
              const isWeekend = day.day() === 0 || day.day() === 6;

              return (
                <Box
                  key={key}
                  sx={{
                    borderRight: '1px solid #E0E0E0',
                    p: 0.25,
                    minHeight: 80,
                    bgcolor: isToday
                      ? '#E3F2FD'
                      : isWeekend
                        ? '#FAFAFA'
                        : 'transparent',
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? 'primary.main' : 'text.primary',
                      textAlign: 'right',
                      pr: 0.5,
                    }}
                  >
                    {day.date()}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {dayTasks.slice(0, 4).map((task) => (
                      <Tooltip key={task.id} title={task.name}>
                        <Paper
                          elevation={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectTask(task.id, e.ctrlKey || e.metaKey);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            openDialogWith('taskInfo', task);
                          }}
                          sx={{
                            px: 0.5,
                            py: 0.125,
                            fontSize: '0.6rem',
                            bgcolor:
                              showCriticalPath && task.isCritical
                                ? '#FFCDD2'
                                : selectedTaskIds.has(task.id)
                                  ? '#C8E6C9'
                                  : '#E3F2FD',
                            borderLeft: `3px solid ${
                              showCriticalPath && task.isCritical
                                ? '#D32F2F'
                                : '#1B6B3A'
                            }`,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            '&:hover': { bgcolor: '#BBDEFB' },
                          }}
                        >
                          {task.name}
                        </Paper>
                      </Tooltip>
                    ))}
                    {dayTasks.length > 4 && (
                      <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', pl: 0.5 }}>
                        +{dayTasks.length - 4} more
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default CalendarView;
