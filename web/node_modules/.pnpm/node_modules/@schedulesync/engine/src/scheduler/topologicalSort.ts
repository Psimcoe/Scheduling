/**
 * Topological sort using Kahn's algorithm with cycle detection.
 * O(V+E) time complexity.
 */

export interface GraphNode {
  id: string;
}

/**
 * Perform topological sort on a directed acyclic graph.
 * @param nodeIds All node IDs in the graph.
 * @param edges Array of [fromId, toId] pairs.
 * @returns Sorted node IDs or throws if a cycle is detected.
 */
export function topologicalSort(
  nodeIds: string[],
  edges: [string, string][],
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Build graph
  for (const [from, to] of edges) {
    adjacency.get(from)?.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  // Collect nodes with no incoming edges
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodeIds.length) {
    // Find nodes in the cycle for diagnostics
    const inCycle = nodeIds.filter((id) => !sorted.includes(id));
    throw new Error(
      `Circular dependency detected involving tasks: ${inCycle.join(', ')}`,
    );
  }

  return sorted;
}

/**
 * Build adjacency lists (successors and predecessors) from dependency edges.
 */
export function buildAdjacencyLists(
  edges: [string, string][],
): {
  successors: Map<string, string[]>;
  predecessors: Map<string, string[]>;
} {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  for (const [from, to] of edges) {
    if (!successors.has(from)) successors.set(from, []);
    if (!predecessors.has(to)) predecessors.set(to, []);
    successors.get(from)!.push(to);
    predecessors.get(to)!.push(from);
  }

  return { successors, predecessors };
}
