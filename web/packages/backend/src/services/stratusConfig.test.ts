import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_PROGRESS_MAPPINGS,
  STRATUS_DEADLINE_FIELD_NAME,
  STRATUS_DURATION_DAYS_FIELD_NAME,
  STRATUS_DURATION_HOURS_FIELD_NAME,
  STRATUS_FINISH_DATE_FIELD_NAME,
  STRATUS_START_DATE_FIELD_NAME,
  STRATUS_TASK_NAME_FIELD_NAME,
  normalizeStratusConfig,
} from "./stratusConfig.js";

describe("stratusConfig", () => {
  it("normalizes missing config to the new Stratus task mapping defaults", () => {
    const config = normalizeStratusConfig();

    expect(config.taskNameField).toBe(STRATUS_TASK_NAME_FIELD_NAME);
    expect(config.durationDaysField).toBe(STRATUS_DURATION_DAYS_FIELD_NAME);
    expect(config.durationHoursField).toBe(STRATUS_DURATION_HOURS_FIELD_NAME);
    expect(config.startDateField).toBe(STRATUS_START_DATE_FIELD_NAME);
    expect(config.finishDateField).toBe(STRATUS_FINISH_DATE_FIELD_NAME);
    expect(config.deadlineField).toBe(STRATUS_DEADLINE_FIELD_NAME);
    expect(config.statusProgressMappings).toEqual(
      DEFAULT_STATUS_PROGRESS_MAPPINGS,
    );
  });

  it("preserves legacy start and finish field id overrides while adding new defaults", () => {
    const config = normalizeStratusConfig({
      startDateFieldIdOverride: "start-field-id",
      finishDateFieldIdOverride: "finish-field-id",
    });

    expect(config.startDateFieldIdOverride).toBe("start-field-id");
    expect(config.finishDateFieldIdOverride).toBe("finish-field-id");
    expect(config.deadlineFieldIdOverride).toBe("");
    expect(config.taskNameField).toBe(STRATUS_TASK_NAME_FIELD_NAME);
    expect(config.statusProgressMappings.length).toBeGreaterThan(0);
  });
});
