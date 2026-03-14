import { describe, expect, it } from 'vitest';
import {
  buildIndentTaskUpdates,
  buildOutdentTaskUpdates,
} from './taskHierarchy';

function makeTask(
  id: string,
  sortOrder: number,
  parentId: string | null = null,
) {
  return {
    id,
    sortOrder,
    parentId,
  };
}

describe('taskHierarchy', () => {
  it('indents consecutive selected roots under the same previous unselected task', () => {
    const tasks = [
      makeTask('anchor', 0),
      makeTask('first', 1),
      makeTask('second', 2),
      makeTask('third', 3),
    ];

    expect(
      buildIndentTaskUpdates(tasks, new Set(['first', 'second'])),
    ).toEqual([
      { id: 'first', data: { parentId: 'anchor' } },
      { id: 'second', data: { parentId: 'anchor' } },
    ]);
  });

  it('excludes selected descendants when indenting a selected parent subtree', () => {
    const tasks = [
      makeTask('anchor', 0),
      makeTask('parent', 1),
      makeTask('child', 2, 'parent'),
      makeTask('grandchild', 3, 'child'),
    ];

    expect(
      buildIndentTaskUpdates(tasks, new Set(['parent', 'child'])),
    ).toEqual([
      { id: 'parent', data: { parentId: 'anchor' } },
    ]);
  });

  it('outdents only selected roots and keeps their descendants attached', () => {
    const tasks = [
      makeTask('package', 0),
      makeTask('assembly', 1, 'package'),
      makeTask('piece', 2, 'assembly'),
      makeTask('standalone', 3),
    ];

    expect(
      buildOutdentTaskUpdates(tasks, new Set(['assembly', 'piece'])),
    ).toEqual([
      { id: 'assembly', data: { parentId: null } },
    ]);
  });
});
