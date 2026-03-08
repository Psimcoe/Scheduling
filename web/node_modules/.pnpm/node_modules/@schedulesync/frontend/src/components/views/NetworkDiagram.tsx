/**
 * NetworkDiagram — PERT-style precedence diagram.
 * Shows tasks as boxes with dependency arrows between them.
 * Uses a simple layered layout based on topological order.
 */

import React, { useMemo, useRef } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { useProjectStore, useUIStore, type TaskRow, type DependencyRow } from '../../stores';
import { shortDate, durationDays, pctLabel } from '../../utils/format';

dayjs.extend(utc);

const NODE_WIDTH = 180;
const NODE_HEIGHT = 90;
const H_GAP = 60;
const V_GAP = 30;
const PADDING = 40;

interface LayoutNode {
  task: TaskRow;
  x: number;
  y: number;
  layer: number;
}

function buildLayout(tasks: TaskRow[], dependencies: DependencyRow[]): LayoutNode[] {
  if (tasks.length === 0) return [];

  // Build adjacency
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    inDeg.set(t.id, 0);
    adj.set(t.id, []);
  }
  for (const d of dependencies) {
    if (!adj.has(d.fromTaskId) || !inDeg.has(d.toTaskId)) continue;
    adj.get(d.fromTaskId)!.push(d.toTaskId);
    inDeg.set(d.toTaskId, (inDeg.get(d.toTaskId) ?? 0) + 1);
  }

  // Topological layering (Kahn's algorithm)
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const t of tasks) {
    if ((inDeg.get(t.id) ?? 0) === 0) {
      queue.push(t.id);
      layer.set(t.id, 0);
    }
  }

  let maxLayer = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const currentLayer = layer.get(id) ?? 0;
    for (const succ of adj.get(id) ?? []) {
      const newLayer = currentLayer + 1;
      if (!layer.has(succ) || layer.get(succ)! < newLayer) {
        layer.set(succ, newLayer);
      }
      inDeg.set(succ, (inDeg.get(succ) ?? 0) - 1);
      if (inDeg.get(succ) === 0) {
        queue.push(succ);
        maxLayer = Math.max(maxLayer, newLayer);
      }
    }
  }

  // Assign layers to any remaining (cycles or disconnected)
  for (const t of tasks) {
    if (!layer.has(t.id)) {
      layer.set(t.id, maxLayer + 1);
    }
  }

  // Group by layer
  const layers: TaskRow[][] = [];
  for (const t of tasks) {
    const l = layer.get(t.id) ?? 0;
    while (layers.length <= l) layers.push([]);
    layers[l].push(t);
  }

  // Position nodes
  const nodes: LayoutNode[] = [];
  for (let l = 0; l < layers.length; l++) {
    const layerTasks = layers[l];
    for (let i = 0; i < layerTasks.length; i++) {
      nodes.push({
        task: layerTasks[i],
        x: PADDING + l * (NODE_WIDTH + H_GAP),
        y: PADDING + i * (NODE_HEIGHT + V_GAP),
        layer: l,
      });
    }
  }

  return nodes;
}

interface NodeBoxProps {
  node: LayoutNode;
  isSelected: boolean;
  isCritical: boolean;
  showCriticalPath: boolean;
  onClick: (id: string, multi: boolean) => void;
  onDoubleClick: (task: TaskRow) => void;
}

const NodeBox: React.FC<NodeBoxProps> = ({
  node,
  isSelected,
  isCritical,
  showCriticalPath,
  onClick,
  onDoubleClick,
}) => {
  const { task } = node;
  const borderColor =
    showCriticalPath && isCritical
      ? '#D32F2F'
      : isSelected
        ? '#1B6B3A'
        : '#999';

  return (
    <Paper
      elevation={isSelected ? 4 : 1}
      onClick={(e) => onClick(task.id, e.ctrlKey || e.metaKey)}
      onDoubleClick={() => onDoubleClick(task)}
      sx={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        border: `2px solid ${borderColor}`,
        borderRadius: 1,
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': { boxShadow: 3 },
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          bgcolor: showCriticalPath && isCritical ? '#D32F2F' : '#1B6B3A',
          color: '#fff',
          px: 1,
          py: 0.25,
          fontSize: '0.7rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {task.name}
      </Box>

      {/* Body */}
      <Box sx={{ px: 1, py: 0.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            {shortDate(task.start)}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            {shortDate(task.finish)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Dur: {durationDays(task.durationMinutes)}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            {pctLabel(task.percentComplete)}
          </Typography>
        </Box>
        {/* Progress bar */}
        <Box sx={{ width: '100%', height: 3, bgcolor: '#E0E0E0', borderRadius: 1 }}>
          <Box
            sx={{
              width: `${Math.min(task.percentComplete, 100)}%`,
              height: '100%',
              bgcolor: showCriticalPath && isCritical ? '#D32F2F' : '#4CAF50',
              borderRadius: 1,
            }}
          />
        </Box>
      </Box>
    </Paper>
  );
};

const NetworkDiagram: React.FC = () => {
  const tasks = useProjectStore((s) => s.tasks);
  const dependencies = useProjectStore((s) => s.dependencies);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const selectTask = useProjectStore((s) => s.selectTask);
  const showCriticalPath = useUIStore((s) => s.showCriticalPath);
  const openDialogWith = useUIStore((s) => s.openDialogWith);
  const containerRef = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => buildLayout(tasks, dependencies), [tasks, dependencies]);

  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.task.id, n])),
    [nodes],
  );

  // Compute canvas size
  const canvasWidth = nodes.reduce((max, n) => Math.max(max, n.x + NODE_WIDTH + PADDING), 600);
  const canvasHeight = nodes.reduce((max, n) => Math.max(max, n.y + NODE_HEIGHT + PADDING), 400);

  // Build arrows
  const arrows = useMemo(() => {
    return dependencies
      .map((dep) => {
        const from = nodeMap.get(dep.fromTaskId);
        const to = nodeMap.get(dep.toTaskId);
        if (!from || !to) return null;

        const sx = from.x + NODE_WIDTH;
        const sy = from.y + NODE_HEIGHT / 2;
        const tx = to.x;
        const ty = to.y + NODE_HEIGHT / 2;

        const midX = (sx + tx) / 2;
        const path = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;

        return { path, id: dep.id, tx, ty };
      })
      .filter(Boolean) as { path: string; id: string; tx: number; ty: number }[];
  }, [dependencies, nodeMap]);

  if (tasks.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">No tasks. Add tasks to see the network diagram.</Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{ height: '100%', overflow: 'auto', position: 'relative', bgcolor: '#FAFAFA' }}
    >
      <Box sx={{ position: 'relative', width: canvasWidth, height: canvasHeight }}>
        {/* Arrows */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            pointerEvents: 'none',
          }}
        >
          <defs>
            <marker
              id="net-arrow"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#666" />
            </marker>
          </defs>
          {arrows.map((a) => (
            <path
              key={a.id}
              d={a.path}
              fill="none"
              stroke="#666"
              strokeWidth={1.5}
              markerEnd="url(#net-arrow)"
            />
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map((n) => (
          <NodeBox
            key={n.task.id}
            node={n}
            isSelected={selectedTaskIds.has(n.task.id)}
            isCritical={n.task.isCritical}
            showCriticalPath={showCriticalPath}
            onClick={selectTask}
            onDoubleClick={(t) => openDialogWith('taskInfo', t)}
          />
        ))}
      </Box>
    </Box>
  );
};

export default NetworkDiagram;
