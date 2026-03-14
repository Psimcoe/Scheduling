/// <reference lib="webworker" />

import {
  buildVisibleTaskRowsModel,
  type RowModelDependencyShell,
  type RowModelTaskShell,
  type VisibleTaskRowsModel,
} from '../hooks/visibleTaskRowsModel';
import type {
  FilterCriteria,
  GroupByOption,
  SortCriteria,
} from '../stores';

interface VisibleTaskRowsWorkerRequest {
  projectId: string | null;
  revision: number;
  requestId: number;
  tasks: RowModelTaskShell[];
  dependencies: RowModelDependencyShell[];
  selectedTaskIds: string[];
  collapsedIds: string[];
  filters: FilterCriteria[];
  sortCriteria: SortCriteria[];
  groupBy: GroupByOption | null;
}

interface VisibleTaskRowsWorkerResponse {
  projectId: string | null;
  revision: number;
  requestId: number;
  model: VisibleTaskRowsModel;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<VisibleTaskRowsWorkerRequest>) => {
  const {
    projectId,
    revision,
    requestId,
    tasks,
    dependencies,
    selectedTaskIds,
    collapsedIds,
    filters,
    sortCriteria,
    groupBy,
  } = event.data;

  const model = buildVisibleTaskRowsModel({
    tasks,
    dependencies,
    selectedTaskIds: new Set(selectedTaskIds),
    collapsedIds: new Set(collapsedIds),
    filters,
    sortCriteria,
    groupBy,
  });

  self.postMessage({
    projectId,
    revision,
    requestId,
    model,
  } satisfies VisibleTaskRowsWorkerResponse);
};

export {};
