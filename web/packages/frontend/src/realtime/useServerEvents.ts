import { useEffect } from "react";
import { queryClient } from "../queryClient";
import { useAuthStore } from "../stores/useAuthStore";
import { useProjectStore } from "../stores/useProjectStore";
import { projectQueryKeys } from "../data/projectQueries";
import {
  emitServerEvent,
  setServerEventsConnected,
  type ServerEventPayload,
} from "./serverEventsClient";

const SERVER_EVENT_TYPES = [
  "projectRevision",
  "projectSnapshotInvalidated",
  "scheduleJobUpdated",
  "stratusJobUpdated",
] as const;

export function useServerEvents(): void {
  const authStatus = useAuthStore((state) => state.status);

  useEffect(() => {
    if (authStatus !== "authenticated" || typeof window === "undefined") {
      setServerEventsConnected(false);
      return;
    }

    if (typeof EventSource === "undefined") {
      setServerEventsConnected(false);
      return;
    }

    const source = new EventSource("/api/events");
    const handleEvent = (message: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(message.data) as ServerEventPayload;
        emitServerEvent(payload);

        if (
          payload.type === "projectRevision" ||
          payload.type === "projectSnapshotInvalidated"
        ) {
          void queryClient.invalidateQueries({
            queryKey: projectQueryKeys.snapshotBase(payload.projectId),
          });
          void queryClient.invalidateQueries({
            queryKey: projectQueryKeys.list(),
          });
          return;
        }

        if (payload.type === "scheduleJobUpdated") {
          useProjectStore.getState().syncScheduleJob(payload.projectId, {
            id: payload.job.id,
            status: payload.job.status,
            startedAt: payload.job.startedAt,
            finishedAt: payload.job.finishedAt,
            error: payload.job.error,
            revision: payload.job.revision,
            calculationTimeMs: payload.job.calculationTimeMs,
          });

          if (
            payload.job.status === "succeeded" ||
            payload.job.status === "failed"
          ) {
            void queryClient.invalidateQueries({
              queryKey: projectQueryKeys.snapshotBase(payload.projectId),
            });
          }
        }
      } catch {
        // Ignore malformed events; the polling fallback remains available.
      }
    };

    source.onopen = () => {
      setServerEventsConnected(true);
    };

    source.onerror = () => {
      setServerEventsConnected(false);
    };

    for (const eventType of SERVER_EVENT_TYPES) {
      source.addEventListener(eventType, handleEvent as EventListener);
    }

    return () => {
      setServerEventsConnected(false);
      for (const eventType of SERVER_EVENT_TYPES) {
        source.removeEventListener(eventType, handleEvent as EventListener);
      }
      source.close();
    };
  }, [authStatus]);
}
