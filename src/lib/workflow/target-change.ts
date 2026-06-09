import type { PropertyMatch } from "../measurements/property-match";
import type { PropertyIntake, WorkflowSnapshot } from "./types";

export function applyPropertyTargetChange(input: {
  intake: PropertyIntake;
  snapshot: WorkflowSnapshot;
  propertyMatch: PropertyMatch;
  message: string;
  now?: string;
}): { intake: PropertyIntake; snapshot: WorkflowSnapshot } {
  const now = input.now ?? input.propertyMatch.checkedAt ?? new Date().toISOString();

  return {
    intake: {
      ...input.intake,
      propertyMatch: input.propertyMatch,
    },
    snapshot: {
      ...input.snapshot,
      property: {
        ...input.snapshot.property,
        propertyMatch: input.propertyMatch,
        status: "needs_review",
        updatedAt: now,
      },
      draft: {
        ...input.snapshot.draft,
        status: "needs_review",
      },
      approval: undefined,
      approvedSummary: undefined,
      persisted: false,
      persistenceMessage: input.message,
    },
  };
}

export function buildPropertyTargetChangeAuditSummary(propertyMatch: PropertyMatch): string {
  const correction = propertyMatch.targetCorrection;

  if (!correction) {
    return "Manual roof target changed.";
  }

  const methodLabel =
    correction.method === "map_tap"
      ? "Manual roof target selected on satellite map."
      : "Manual roof target nudged on satellite map.";
  const offset = formatTargetOffset(correction.totalEastFeet, correction.totalNorthFeet);

  return offset ? `${methodLabel} Offset: ${offset}.` : methodLabel;
}

function formatTargetOffset(totalEastFeet: number, totalNorthFeet: number) {
  const parts = [];

  if (totalEastFeet !== 0) {
    parts.push(`${Math.abs(totalEastFeet).toFixed(0)} ft ${totalEastFeet > 0 ? "east" : "west"}`);
  }

  if (totalNorthFeet !== 0) {
    parts.push(`${Math.abs(totalNorthFeet).toFixed(0)} ft ${totalNorthFeet > 0 ? "north" : "south"}`);
  }

  return parts.join(", ");
}
