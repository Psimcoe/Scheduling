import { describe, expect, it } from 'vitest';
import { rerankScheduleCitations } from './scheduleKnowledgeService.js';

describe('scheduleKnowledgeService', () => {
  it('prefers metadata and keyword matches when ranking citations', () => {
    const citations = rerankScheduleCitations(
      [
        {
          chunkId: 'chunk-1',
          projectId: 'project-1',
          projectName: 'Hospital East',
          title: 'Concrete pour outcomes',
          content: 'Concrete pour durations and curing sequence for hospital tower floors.',
          chunkType: 'outcome-summary',
          projectType: 'commercial',
          sector: 'healthcare',
          region: 'northeast',
        },
        {
          chunkId: 'chunk-2',
          projectId: 'project-2',
          projectName: 'Warehouse West',
          title: 'Steel framing notes',
          content: 'Steel framing dependencies for warehouse fit-out.',
          chunkType: 'dependency-pattern',
          projectType: 'industrial',
          sector: 'logistics',
          region: 'southwest',
        },
      ],
      {
        projectType: 'commercial',
        sector: 'healthcare',
        region: 'northeast',
      },
      'duration for concrete pour sequencing',
    );

    expect(citations).toHaveLength(2);
    expect(citations[0]?.chunkId).toBe('chunk-1');
    expect(citations[0]?.score).toBeGreaterThan(citations[1]?.score ?? 0);
    expect(citations[0]?.excerpt.toLowerCase()).toContain('concrete');
  });
});
