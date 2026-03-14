export interface ServerScheduleJobSummary {
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

export interface ServerStratusJobSummary {
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

export type ServerEventPayload =
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
      job: ServerScheduleJobSummary;
    }
  | {
      type: "stratusJobUpdated";
      projectId: string | null;
      job: ServerStratusJobSummary;
    };

type ServerEventListener = (event: ServerEventPayload) => void;
type ConnectionListener = (connected: boolean) => void;

const eventListeners = new Set<ServerEventListener>();
const connectionListeners = new Set<ConnectionListener>();
let connected = false;

export function emitServerEvent(event: ServerEventPayload): void {
  for (const listener of eventListeners) {
    listener(event);
  }
}

export function subscribeToServerEvents(
  listener: ServerEventListener,
): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

export function setServerEventsConnected(value: boolean): void {
  if (connected === value) {
    return;
  }

  connected = value;
  for (const listener of connectionListeners) {
    listener(connected);
  }
}

export function getServerEventsConnected(): boolean {
  return connected;
}

export function subscribeToServerEventConnection(
  listener: ConnectionListener,
): () => void {
  connectionListeners.add(listener);
  listener(connected);
  return () => {
    connectionListeners.delete(listener);
  };
}

