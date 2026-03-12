import { describe, expect, it } from "vitest";
import { isImportableBigDataAssemblyRow } from "./stratusBigDataService.js";

describe("stratusBigDataService", () => {
  it("treats assembly tracking statuses as importable", () => {
    expect(
      isImportableBigDataAssemblyRow({
        Status: "Shipped to Jobsite",
      }),
    ).toBe(true);
    expect(
      isImportableBigDataAssemblyRow({
        Status: "Fabrication in Progress",
      }),
    ).toBe(true);
    expect(
      isImportableBigDataAssemblyRow({
        Status: "Design Stage-Prefab Early Planning",
      }),
    ).toBe(true);
  });

  it("rejects assemblies only for explicit lifecycle exclusions", () => {
    expect(
      isImportableBigDataAssemblyRow({
        Status: "Archived",
      }),
    ).toBe(false);
    expect(
      isImportableBigDataAssemblyRow({
        Status: "Inactive",
      }),
    ).toBe(false);
    expect(
      isImportableBigDataAssemblyRow({
        Status: "disabled",
      }),
    ).toBe(false);
  });
});
