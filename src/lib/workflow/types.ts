import type {
  ComplexityClass,
  DraftMeasurement,
  MeasurementMode,
  PitchClass,
} from "@/lib/measurements/draft-provider";
import type { MeasurementSourceReadiness } from "@/lib/measurements/source-stack";

export type PropertyIntake = {
  address: string;
  customerNotes: string;
  jobNotes: string;
  includeGarage: boolean;
  includeShed: boolean;
  mode: MeasurementMode;
};

export type WorkflowProperty = PropertyIntake & {
  id: string;
  status: "draft" | "needs_review" | "approved" | "exported";
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDraft = DraftMeasurement & {
  id: string;
  propertyId: string;
  generatedAt: string;
};

export type WorkflowApproval = {
  id: string;
  propertyId: string;
  draftId: string;
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures: string[];
  reviewerName: string;
  reviewerNotes: string;
  approvedAt: string;
};

export type WorkflowAuditEvent = {
  id: string;
  propertyId: string;
  draftId?: string;
  approvalId?: string;
  eventType: "property_created" | "draft_generated" | "manual_edit" | "approved" | "exported";
  actorName: string;
  summary: string;
  createdAt: string;
};

export type WorkflowSnapshot = {
  property: WorkflowProperty;
  draft: WorkflowDraft;
  sourceReadiness: MeasurementSourceReadiness[];
  approval?: WorkflowApproval;
  auditEvents: WorkflowAuditEvent[];
  approvedSummary?: string;
  persisted: boolean;
  persistenceMessage: string;
};

export type ApprovalInput = {
  propertyId: string;
  draftId: string;
  propertyAddress: string;
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures: string[];
  reviewerName: string;
  reviewerNotes: string;
};
