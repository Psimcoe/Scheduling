import { useMutation } from "@tanstack/react-query";
import {
  ApiError,
  stratusApi,
  type ProjectSnapshotResponse,
  type StratusProjectTargetPayload,
  type StratusStatusMappingsSaveResponse,
  type StratusStatusProgressMapping,
} from "../api/client";
import { projectQueryKeys } from "../data/projectQueries";
import { queryClient } from "../queryClient";
import { useProjectStore } from "../stores/useProjectStore";
import { useUIStore } from "../stores/useUIStore";

export interface SaveStratusSettingsMutationVariables {
  projectId: string;
  config: Record<string, unknown>;
  project: StratusProjectTargetPayload;
  originalStatusProgressMappings: StratusStatusProgressMapping[];
  nextStatusProgressMappings: StratusStatusProgressMapping[];
  localMetadataVersion: number;
}

interface SaveStratusSettingsMutationContext {
  previousSnapshot: ProjectSnapshotResponse | null;
}

function buildStatusPercentMap(
  mappings: StratusStatusProgressMapping[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const mapping of mappings) {
    const statusId = mapping.statusId.trim();
    if (!statusId) {
      continue;
    }
    result.set(statusId, mapping.percentCompleteShop ?? 0);
  }
  return result;
}

export function diffChangedStatusIds(
  previousMappings: StratusStatusProgressMapping[],
  nextMappings: StratusStatusProgressMapping[],
): string[] {
  const previousMap = buildStatusPercentMap(previousMappings);
  const nextMap = buildStatusPercentMap(nextMappings);
  const changedIds = new Set<string>();

  for (const statusId of previousMap.keys()) {
    if ((previousMap.get(statusId) ?? 0) !== (nextMap.get(statusId) ?? 0)) {
      changedIds.add(statusId);
    }
  }

  for (const statusId of nextMap.keys()) {
    if ((previousMap.get(statusId) ?? 0) !== (nextMap.get(statusId) ?? 0)) {
      changedIds.add(statusId);
    }
  }

  return [...changedIds];
}

export function applyOptimisticStatusRemap(
  snapshot: ProjectSnapshotResponse,
  project: StratusProjectTargetPayload,
  changedStatusIds: string[],
  nextMappings: StratusStatusProgressMapping[],
  shouldRemapPercentComplete: boolean,
): ProjectSnapshotResponse {
  const changedStatusIdSet = new Set(changedStatusIds);
  const nextPercentByStatusId = buildStatusPercentMap(nextMappings);

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      ...project,
    },
    tasks: snapshot.tasks.map((task) => {
      if (!shouldRemapPercentComplete) {
        return task;
      }

      const trackingStatusId = task.stratusStatus?.trackingStatusId ?? null;
      if (!trackingStatusId || !changedStatusIdSet.has(trackingStatusId)) {
        return task;
      }

      return {
        ...task,
        percentComplete: nextPercentByStatusId.get(trackingStatusId) ?? 0,
      };
    }),
  };
}

function getSaveErrorSeverity(error: unknown): "warning" | "error" {
  if (
    error instanceof ApiError &&
    (error.code === "RATE_LIMITED" || error.code === "STRATUS_REMAP_BUSY")
  ) {
    return "warning";
  }

  return "error";
}

export function useSaveStratusSettingsMutation() {
  const closeDialog = useUIStore((state) => state.closeDialog);
  const openDialogWith = useUIStore((state) => state.openDialogWith);
  const showSnackbar = useUIStore((state) => state.showSnackbar);

  return useMutation<
    StratusStatusMappingsSaveResponse,
    unknown,
    SaveStratusSettingsMutationVariables,
    SaveStratusSettingsMutationContext
  >({
    mutationFn: ({ projectId, config, project }) =>
      stratusApi.saveStatusMappings(projectId, {
        config,
        project,
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: projectQueryKeys.snapshot(variables.projectId),
      });

      const previousSnapshot =
        queryClient.getQueryData<ProjectSnapshotResponse>(
          projectQueryKeys.snapshot(variables.projectId),
        ) ?? null;

      if (!previousSnapshot) {
        return { previousSnapshot: null };
      }

      const changedStatusIds = diffChangedStatusIds(
        variables.originalStatusProgressMappings,
        variables.nextStatusProgressMappings,
      );
      const shouldRemapPercentComplete =
        variables.localMetadataVersion >= 1 && changedStatusIds.length > 0;

      if (!shouldRemapPercentComplete && changedStatusIds.length > 0) {
        showSnackbar(
          "One-time Stratus data upgrade required. Starting a full seed refresh.",
          "info",
        );
      }

      const optimisticSnapshot = applyOptimisticStatusRemap(
        previousSnapshot,
        variables.project,
        changedStatusIds,
        variables.nextStatusProgressMappings,
        shouldRemapPercentComplete,
      );

      queryClient.setQueryData(
        projectQueryKeys.snapshot(variables.projectId),
        optimisticSnapshot,
      );
      useProjectStore.getState().syncSnapshot(optimisticSnapshot);

      return { previousSnapshot };
    },
    onError: (error, variables, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          projectQueryKeys.snapshot(variables.projectId),
          context.previousSnapshot,
        );
        useProjectStore.getState().syncSnapshot(context.previousSnapshot);
      }

      showSnackbar(
        error instanceof Error
          ? error.message
          : "Failed to save Stratus settings",
        getSaveErrorSeverity(error),
      );
    },
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(
        projectQueryKeys.snapshot(variables.projectId),
        result.snapshot,
      );
      useProjectStore.getState().syncSnapshot(result.snapshot);
      await queryClient.invalidateQueries({
        queryKey: projectQueryKeys.list(),
      });

      if (result.mode === "seedRequired" && result.jobId) {
        closeDialog();
        openDialogWith("stratusPullPreview", {
          jobId: result.jobId,
          mode: "seedUpgrade",
        });
        showSnackbar(
          "Stratus settings saved. One-time data upgrade started.",
          "info",
        );
        return;
      }

      closeDialog();
      if (result.mode === "localRemap") {
        showSnackbar(
          `Stratus settings saved. Remapped ${result.affectedPackages} package tasks and ${result.affectedAssemblies} assembly tasks.`,
          "success",
        );
        return;
      }

      showSnackbar("Stratus settings saved", "success");
    },
  });
}
