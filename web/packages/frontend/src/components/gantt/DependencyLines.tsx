/**
 * DependencyLines - SVG overlay that draws dependency arrows between visible bars.
 */

import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { type DependencyRow, type TaskRow } from '../../stores';

dayjs.extend(utc);

interface DependencyLinesProps {
  tasks: TaskRow[];
  dependencies: DependencyRow[];
  timelineStart: string;
  dayWidth: number;
  taskYMap: Map<string, number>;
  totalHeight: number;
  totalWidth: number;
}

const DependencyLines: React.FC<DependencyLinesProps> = ({
  tasks,
  dependencies,
  timelineStart,
  dayWidth,
  taskYMap,
  totalHeight,
  totalWidth,
}) => {
  const timelineStartDate = useMemo(() => dayjs.utc(timelineStart), [timelineStart]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const lines = useMemo(
    () =>
      dependencies
        .map((dependency) => {
          const fromTask = taskMap.get(dependency.fromTaskId);
          const toTask = taskMap.get(dependency.toTaskId);
          const sourceY = taskYMap.get(dependency.fromTaskId);
          const targetY = taskYMap.get(dependency.toTaskId);

          if (!fromTask || !toTask || sourceY == null || targetY == null) {
            return null;
          }

          const fromStart = dayjs.utc(fromTask.start);
          const fromFinish = dayjs.utc(fromTask.finish);
          const toStart = dayjs.utc(toTask.start);
          const toFinish = dayjs.utc(toTask.finish);

          const sourceX =
            dependency.type === 'FF' || dependency.type === 'FS'
              ? fromFinish.diff(timelineStartDate, 'day', true) * dayWidth
              : fromStart.diff(timelineStartDate, 'day', true) * dayWidth;
          const targetX =
            dependency.type === 'FS' || dependency.type === 'SS'
              ? toStart.diff(timelineStartDate, 'day', true) * dayWidth
              : toFinish.diff(timelineStartDate, 'day', true) * dayWidth;

          const midX =
            dependency.type === 'FS' || dependency.type === 'FF'
              ? sourceX + 8
              : sourceX - 8;
          const arrowDirection =
            dependency.type === 'FS' || dependency.type === 'SS' ? 'right' : 'left';

          return {
            id: dependency.id,
            arrowDirection,
            path: `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`,
          };
        })
        .filter((line): line is { id: string; arrowDirection: 'left' | 'right'; path: string } => Boolean(line)),
    [dayWidth, dependencies, taskMap, taskYMap, timelineStartDate],
  );

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: totalWidth,
        height: totalHeight,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker id="arrow-right" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#666" />
        </marker>
        <marker id="arrow-left" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
          <polygon points="8 0, 0 3, 8 6" fill="#666" />
        </marker>
      </defs>
      {lines.map((line) => (
        <path
          key={line.id}
          d={line.path}
          fill="none"
          stroke="#666"
          strokeWidth={1.2}
          markerEnd={`url(#arrow-${line.arrowDirection})`}
        />
      ))}
    </svg>
  );
};

export default DependencyLines;
