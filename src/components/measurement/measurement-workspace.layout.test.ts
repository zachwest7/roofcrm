import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./measurement-workspace.tsx", import.meta.url), "utf8");

describe("MeasurementWorkspace workbench layout", () => {
  it("keeps outline editing inside the primary workbench instead of appending a second map section", () => {
    expect(source).not.toContain("manualEditor ? <div");
    expect(source).toContain("manualCanvas={");
    expect(source).toContain("manualPanel={");
  });
});
