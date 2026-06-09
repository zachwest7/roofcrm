import type { WorkflowSnapshot } from "./types";

export type SavedJobSummary = {
  id: string;
  address: string;
  status: WorkflowSnapshot["property"]["status"];
  roofSquares: number;
  confidenceScore: number;
  updatedAt: string;
  persisted: boolean;
  hasManualAdjustments: boolean;
};

export function createSavedJobSummary(snapshot: WorkflowSnapshot): SavedJobSummary {
  return {
    id: snapshot.property.id,
    address: snapshot.property.address,
    status: snapshot.property.status,
    roofSquares: snapshot.approval?.approvedRoofSquares ?? snapshot.draft.roofSquares,
    confidenceScore: snapshot.approval?.confidenceScore ?? snapshot.draft.confidenceScore,
    updatedAt: snapshot.property.updatedAt,
    persisted: snapshot.persisted,
    hasManualAdjustments: Boolean(snapshot.approval?.manualMeasurements),
  };
}

export function sortSavedJobSummaries(summaries: SavedJobSummary[]): SavedJobSummary[] {
  return [...summaries].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
