export interface RealtimeScheduleJobSummary {
  id: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  revision: number | null;
  calculationTimeMs: number | null;
}

export interface RealtimeStratusJobSummary {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  hasResult: boolean;
}

export type RealtimeEvent =
  | {
      type: "projectRevision";
      projectId: string;
      revision: number;
    }
  | {
      type: "projectSnapshotInvalidated";
      projectId: string;
      revision: number | null;
    }
  | {
      type: "scheduleJobUpdated";
      projectId: string;
      job: RealtimeScheduleJobSummary;
    }
  | {
      type: "stratusJobUpdated";
      projectId: string | null;
      job: RealtimeStratusJobSummary;
    };

type RealtimeEventListener = (event: RealtimeEvent) => void;

const listeners = new Set<RealtimeEventListener>();

export function publishRealtimeEvent(event: RealtimeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeRealtimeEvents(
  listener: RealtimeEventListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

