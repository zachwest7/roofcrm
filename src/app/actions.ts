"use server";

import { revalidatePath } from "next/cache";

import { generateDraftMeasurement } from "@/lib/measurements/draft-provider";
import { buildMeasurementSourceContext } from "@/lib/measurements/measurement-source-context";
import {
  createTypedOnlyPropertyMatch,
  validatePropertyAddress,
  type PropertyMatch,
} from "@/lib/measurements/property-match";
import { formatApprovedMeasurementSummary } from "@/lib/measurements/summary";
import { createServerWriteClient } from "@/lib/supabase/server";
import { getGoogleMapsApiKey, getMeasurementSourceReadiness } from "@/lib/supabase/env";
import type { Json } from "@/lib/supabase/database.types";
import type {
  ApprovalInput,
  PropertyIntake,
  WorkflowApproval,
  WorkflowAuditEvent,
  WorkflowDraft,
  WorkflowProperty,
  WorkflowSnapshot,
} from "@/lib/workflow/types";

export async function createPropertyWithDraft(input: PropertyIntake): Promise<WorkflowSnapshot> {
  const cleanInput = normalizePropertyIntake(input);
  const now = new Date().toISOString();
  const sourceReadiness = getMeasurementSourceReadiness();
  const propertyMatch = await validatePropertyAddress({
    address: cleanInput.address,
    existingMatch: cleanInput.propertyMatch,
  });
  const sourceContext = await buildMeasurementSourceContext({
    propertyMatch,
    googleMapsApiKey: getGoogleMapsApiKey(),
  });
  const draft = generateDraftMeasurement({
    address: propertyMatch.formattedAddress ?? cleanInput.address,
    includeGarage: cleanInput.includeGarage,
    includeShed: cleanInput.includeShed,
    mode: cleanInput.mode,
    notes: `${cleanInput.customerNotes}\n${cleanInput.jobNotes}`,
    sourceSignals: sourceContext.signals,
  });
  const matchedInput = { ...cleanInput, propertyMatch };

  const supabase = createServerWriteClient();

  if (!supabase) {
    return buildDemoSnapshot(matchedInput, draft, now, sourceReadiness);
  }

  const { data: propertyRow, error: propertyError } = await supabase
    .from("properties")
    .insert({
      address: cleanInput.address,
      customer_notes: cleanInput.customerNotes,
      job_notes: cleanInput.jobNotes,
      include_garage: cleanInput.includeGarage,
      include_shed: cleanInput.includeShed,
      workflow_mode: cleanInput.mode,
      status: "needs_review",
      updated_at: now,
      ...propertyMatchToColumns(propertyMatch, now),
    })
    .select()
    .single();

  if (propertyError) {
    return buildDemoSnapshot(matchedInput, draft, now, sourceReadiness, `Supabase write failed: ${propertyError.message}`);
  }

  const { data: draftRow, error: draftError } = await supabase
    .from("measurement_drafts")
    .insert({
      property_id: propertyRow.id,
      provider: draft.provider,
      status: draft.status,
      roof_squares: draft.roofSquares,
      pitch_class: draft.pitchClass,
      waste_percent: draft.wastePercent,
      complexity_class: draft.complexityClass,
      confidence_score: draft.confidenceScore,
      included_structures: draft.includedStructures,
      assumptions: draft.assumptions,
      raw_provider_payload: draft as unknown as Json,
      accuracy_min_percent: draft.accuracyBand.minPercent,
      accuracy_max_percent: draft.accuracyBand.maxPercent,
      source_stack_quality: draft.sourceStackQuality,
      source_disagreement_percent: draft.sourceDisagreementPercent ?? null,
      generated_at: now,
    })
    .select()
    .single();

  if (draftError) {
    return buildDemoSnapshot(
      matchedInput,
      draft,
      now,
      sourceReadiness,
      `Supabase draft write failed: ${draftError.message}`,
    );
  }

  await supabase.from("measurement_source_runs").insert(
    sourceReadiness.map((source) => ({
      property_id: propertyRow.id,
      draft_id: draftRow.id,
      source_code: source.code,
      source_label: source.label,
      source_status: source.status,
      source_type: source.sourceType,
      source_role: source.role,
      detail: sourceContext.details[source.code] ?? source.detail,
      expected_accuracy_min_percent: source.expectedAccuracyBand?.minPercent ?? null,
      expected_accuracy_max_percent: source.expectedAccuracyBand?.maxPercent ?? null,
      payload: (sourceContext.payloads[source.code] ?? {}) as Json,
      checked_at: now,
    })),
  );

  await supabase.from("measurement_evidence").insert(
    draft.evidence.map((evidence) => ({
      property_id: propertyRow.id,
      draft_id: draftRow.id,
      source_type: evidence.sourceType,
      label: evidence.label,
      detail: evidence.detail,
      confidence_impact: evidence.confidenceImpact,
    })),
  );

  await supabase.from("measurement_risk_flags").insert(
    draft.riskFlags.map((flag) => ({
      property_id: propertyRow.id,
      draft_id: draftRow.id,
      code: flag.code,
      label: flag.label,
      severity: flag.severity,
      detail: flag.detail,
    })),
  );

  const auditRows = [
    {
      property_id: propertyRow.id,
      draft_id: draftRow.id,
      event_type: "property_created" as const,
      actor_name: "Owner",
      summary: `Property intake created for ${cleanInput.address}.`,
      payload: matchedInput as unknown as Json,
    },
    {
      property_id: propertyRow.id,
      draft_id: draftRow.id,
      event_type: "draft_generated" as const,
      actor_name: draft.provider === "google_solar_v1" ? "Google Solar source stack" : "Address-only provider",
      summary: `Draft measurement generated at ${draft.roofSquares.toFixed(1)} squares.`,
      payload: draft as unknown as Json,
    },
  ];

  const { data: auditData } = await supabase
    .from("measurement_audit_events")
    .insert(auditRows)
    .select();

  revalidatePath("/");

  return {
    property: {
      id: propertyRow.id,
      address: propertyRow.address,
      customerNotes: propertyRow.customer_notes,
      jobNotes: propertyRow.job_notes,
      includeGarage: propertyRow.include_garage,
      includeShed: propertyRow.include_shed,
      mode: propertyRow.workflow_mode,
      propertyMatch: propertyMatchFromRow(propertyRow),
      status: propertyRow.status,
      createdAt: propertyRow.created_at,
      updatedAt: propertyRow.updated_at,
    },
    draft: {
      ...draft,
      id: draftRow.id,
      propertyId: propertyRow.id,
      generatedAt: draftRow.generated_at,
    },
    sourceReadiness,
    auditEvents: mapAuditRows(auditData ?? []),
    persisted: true,
    persistenceMessage: "Saved to Supabase.",
  };
}

export async function approveMeasurement(input: ApprovalInput): Promise<{
  approval: WorkflowApproval;
  auditEvent: WorkflowAuditEvent;
  approvedSummary: string;
  persisted: boolean;
  persistenceMessage: string;
}> {
  const now = new Date().toISOString();
  const approval: WorkflowApproval = {
    id: crypto.randomUUID(),
    propertyId: input.propertyId,
    draftId: input.draftId,
    approvedRoofSquares: input.approvedRoofSquares,
    approvedPitchClass: input.approvedPitchClass,
    approvedWastePercent: input.approvedWastePercent,
    approvedComplexityClass: input.approvedComplexityClass,
    confidenceScore: input.confidenceScore,
    includedStructures: input.includedStructures,
    correctionSummary: input.correctionSummary,
    reviewerName: input.reviewerName || "Owner",
    reviewerNotes: input.reviewerNotes,
    approvedAt: now,
  };

  const approvedSummary = formatApprovedMeasurementSummary({
    propertyAddress: input.propertyAddress,
    approvedRoofSquares: input.approvedRoofSquares,
    approvedPitchClass: input.approvedPitchClass,
    approvedWastePercent: input.approvedWastePercent,
    approvedComplexityClass: input.approvedComplexityClass,
    confidenceScore: input.confidenceScore,
    includedStructures: input.includedStructures,
    correctionSummary: input.correctionSummary,
    reviewerName: approval.reviewerName,
    reviewerNotes: input.reviewerNotes,
    approvedAt: new Date(now),
  });

  const demoAuditEvent = buildAuditEvent({
    propertyId: input.propertyId,
    draftId: input.draftId,
    approvalId: approval.id,
    eventType: "approved",
    actorName: approval.reviewerName,
    summary: formatApprovalAuditSummary(input.approvedRoofSquares, input.correctionSummary),
    createdAt: now,
  });

  const supabase = createServerWriteClient();

  if (!supabase) {
    return {
      approval,
      auditEvent: demoAuditEvent,
      approvedSummary,
      persisted: false,
      persistenceMessage: "Supabase keys are not configured. Approval is shown as a local demo state.",
    };
  }

  const { data: approvalRow, error: approvalError } = await supabase
    .from("measurement_approvals")
    .insert({
      property_id: input.propertyId,
      draft_id: input.draftId,
      approved_roof_squares: input.approvedRoofSquares,
      approved_pitch_class: input.approvedPitchClass,
      approved_waste_percent: input.approvedWastePercent,
      approved_complexity_class: input.approvedComplexityClass,
      confidence_score: input.confidenceScore,
      included_structures: input.includedStructures,
      reviewer_name: approval.reviewerName,
      reviewer_notes: input.reviewerNotes,
      approved_at: now,
    })
    .select()
    .single();

  if (approvalError) {
    return {
      approval,
      auditEvent: demoAuditEvent,
      approvedSummary,
      persisted: false,
      persistenceMessage: `Supabase approval write failed: ${approvalError.message}`,
    };
  }

  await supabase.from("properties").update({ status: "approved", updated_at: now }).eq("id", input.propertyId);
  await supabase.from("measurement_drafts").update({ status: "approved" }).eq("id", input.draftId);

  const { data: auditRow } = await supabase
    .from("measurement_audit_events")
    .insert({
      property_id: input.propertyId,
      draft_id: input.draftId,
      approval_id: approvalRow.id,
      event_type: "approved",
      actor_name: approval.reviewerName,
      summary: `Approved quote inputs at ${input.approvedRoofSquares.toFixed(1)} squares.`,
      payload: {
        approval: approvalRow,
        approvedSummary,
        correctionSummary: input.correctionSummary,
      } as unknown as Json,
    })
    .select()
    .single();

  revalidatePath("/");

  return {
    approval: {
      id: approvalRow.id,
      propertyId: approvalRow.property_id,
      draftId: approvalRow.draft_id ?? input.draftId,
      approvedRoofSquares: Number(approvalRow.approved_roof_squares),
      approvedPitchClass: approvalRow.approved_pitch_class,
      approvedWastePercent: Number(approvalRow.approved_waste_percent),
      approvedComplexityClass: approvalRow.approved_complexity_class,
      confidenceScore: approvalRow.confidence_score,
      includedStructures: approvalRow.included_structures,
      correctionSummary: input.correctionSummary,
      reviewerName: approvalRow.reviewer_name,
      reviewerNotes: approvalRow.reviewer_notes,
      approvedAt: approvalRow.approved_at,
    },
    auditEvent: auditRow ? mapAuditRows([auditRow])[0] : demoAuditEvent,
    approvedSummary,
    persisted: true,
    persistenceMessage: "Approval saved to Supabase.",
  };
}

function normalizePropertyIntake(input: PropertyIntake): PropertyIntake {
  return {
    address: input.address.trim() || "Address pending",
    customerNotes: input.customerNotes.trim(),
    jobNotes: input.jobNotes.trim(),
    includeGarage: input.includeGarage,
    includeShed: input.includeShed,
    mode: input.mode,
    propertyMatch: input.propertyMatch,
  };
}

function formatApprovalAuditSummary(approvedRoofSquares: number, correctionSummary: string[]) {
  const correctionLabel =
    correctionSummary.length && correctionSummary[0] !== "Reviewer kept the draft quote inputs."
      ? ` Corrections: ${correctionSummary.join(" ")}`
      : "";

  return `Approved quote inputs at ${approvedRoofSquares.toFixed(1)} squares.${correctionLabel}`;
}

function buildDemoSnapshot(
  input: PropertyIntake,
  draft: ReturnType<typeof generateDraftMeasurement>,
  now: string,
  sourceReadiness = getMeasurementSourceReadiness(),
  message = "Supabase keys are not configured. Workflow is running in local demo mode.",
): WorkflowSnapshot {
  const propertyId = `demo-property-${crypto.randomUUID()}`;
  const draftId = `demo-draft-${crypto.randomUUID()}`;
  const property: WorkflowProperty = {
    ...input,
    propertyMatch: input.propertyMatch ?? createTypedOnlyPropertyMatch(input.address),
    id: propertyId,
    status: "needs_review",
    createdAt: now,
    updatedAt: now,
  };
  const workflowDraft: WorkflowDraft = {
    ...draft,
    id: draftId,
    propertyId,
    generatedAt: now,
  };

  return {
    property,
    draft: workflowDraft,
    sourceReadiness,
    auditEvents: [
      buildAuditEvent({
        propertyId,
        draftId,
        eventType: "property_created",
        actorName: "Owner",
        summary: `Property intake created for ${input.address}.`,
        createdAt: now,
      }),
      buildAuditEvent({
        propertyId,
        draftId,
        eventType: "draft_generated",
        actorName: "Address-only provider",
        summary: `Draft measurement generated at ${draft.roofSquares.toFixed(1)} squares.`,
        createdAt: now,
      }),
    ],
    persisted: false,
    persistenceMessage: message,
  };
}

function propertyMatchToColumns(match: PropertyMatch, now: string) {
  return {
    formatted_address: match.formattedAddress ?? null,
    google_place_id: match.placeId ?? null,
    latitude: match.latitude ?? null,
    longitude: match.longitude ?? null,
    property_match_status: match.status,
    property_match_source: match.source,
    validation_granularity: match.validationGranularity ?? null,
    geocode_granularity: match.geocodeGranularity ?? null,
    address_complete: match.addressComplete ?? null,
    validation_next_action: match.possibleNextAction ?? null,
    property_match_detail: match.detail,
    property_match_payload: match as unknown as Json,
    property_match_checked_at: match.checkedAt ?? now,
  };
}

function propertyMatchFromRow(row: {
  address: string;
  formatted_address: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  property_match_status: PropertyMatch["status"];
  property_match_source: PropertyMatch["source"];
  validation_granularity: string | null;
  geocode_granularity: string | null;
  address_complete: boolean | null;
  validation_next_action: string | null;
  property_match_detail: string;
  property_match_checked_at: string | null;
}): PropertyMatch {
  return {
    status: row.property_match_status,
    source: row.property_match_source,
    formattedAddress: row.formatted_address ?? row.address,
    placeId: row.google_place_id ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    validationGranularity: row.validation_granularity ?? undefined,
    geocodeGranularity: row.geocode_granularity ?? undefined,
    addressComplete: row.address_complete ?? undefined,
    possibleNextAction: row.validation_next_action ?? undefined,
    detail: row.property_match_detail,
    checkedAt: row.property_match_checked_at ?? undefined,
  };
}

function buildAuditEvent(input: Omit<WorkflowAuditEvent, "id">): WorkflowAuditEvent {
  return {
    ...input,
    id: `audit-${crypto.randomUUID()}`,
  };
}

function mapAuditRows(
  rows: Array<{
    id: string;
    property_id: string;
    draft_id: string | null;
    approval_id: string | null;
    event_type: WorkflowAuditEvent["eventType"];
    actor_name: string;
    summary: string;
    created_at: string;
  }>,
): WorkflowAuditEvent[] {
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    draftId: row.draft_id ?? undefined,
    approvalId: row.approval_id ?? undefined,
    eventType: row.event_type,
    actorName: row.actor_name,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}
