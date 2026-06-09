"use server";

import { revalidatePath } from "next/cache";

import { generateDraftMeasurement, type DraftMeasurement } from "@/lib/measurements/draft-provider";
import { buildMeasurementSourceContext } from "@/lib/measurements/measurement-source-context";
import {
  createTypedOnlyPropertyMatch,
  validatePropertyAddress,
  type PropertyMatch,
} from "@/lib/measurements/property-match";
import { formatApprovedMeasurementSummary } from "@/lib/measurements/summary";
import { createServerWriteClient } from "@/lib/supabase/server";
import { getGoogleMapsApiKey, getMeasurementSourceReadiness } from "@/lib/supabase/env";
import { buildPropertyTargetChangeAuditSummary } from "@/lib/workflow/target-change";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ApprovalInput,
  PropertyIntake,
  WorkflowApproval,
  WorkflowAuditEvent,
  WorkflowDraft,
  WorkflowProperty,
  WorkflowSnapshot,
} from "@/lib/workflow/types";

type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type DraftRow = Database["public"]["Tables"]["measurement_drafts"]["Row"];
type ApprovalRow = Database["public"]["Tables"]["measurement_approvals"]["Row"];
type AuditRow = Database["public"]["Tables"]["measurement_audit_events"]["Row"];

export async function listSavedJobSnapshots(limit = 12): Promise<WorkflowSnapshot[]> {
  const supabase = createServerWriteClient();

  if (!supabase) {
    return [];
  }

  const sourceReadiness = getMeasurementSourceReadiness();
  const { data: propertyRows, error: propertyError } = await supabase
    .from("properties")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (propertyError || !propertyRows?.length) {
    return [];
  }

  const propertyIds = propertyRows.map((property) => property.id);

  const [draftResult, approvalResult, auditResult] = await Promise.all([
    supabase
      .from("measurement_drafts")
      .select("*")
      .in("property_id", propertyIds)
      .order("generated_at", { ascending: false }),
    supabase
      .from("measurement_approvals")
      .select("*")
      .in("property_id", propertyIds)
      .order("approved_at", { ascending: false }),
    supabase
      .from("measurement_audit_events")
      .select("*")
      .in("property_id", propertyIds)
      .order("created_at", { ascending: true }),
  ]);

  const latestDraftByProperty = getLatestRowByProperty(draftResult.data ?? [], "generated_at");
  const latestApprovalByProperty = getLatestRowByProperty(approvalResult.data ?? [], "approved_at");
  const auditRowsByProperty = groupRowsByProperty(auditResult.data ?? []);

  return propertyRows.map((propertyRow) => {
    const property = mapPropertyRow(propertyRow);
    const draftRow = latestDraftByProperty.get(property.id);
    const fallbackDraft = generateDraftMeasurement({
      address: property.address,
      includeGarage: property.includeGarage,
      includeShed: property.includeShed,
      mode: property.mode,
      notes: `${property.customerNotes}\n${property.jobNotes}`,
    });
    const draft = draftRow
      ? mapDraftRow(draftRow, property.mode, fallbackDraft)
      : {
          ...fallbackDraft,
          id: `missing-draft-${property.id}`,
          propertyId: property.id,
          generatedAt: property.updatedAt,
        };
    const auditEvents = mapAuditRows(auditRowsByProperty.get(property.id) ?? []);
    const latestApprovalRow = latestApprovalByProperty.get(property.id);
    const approvalRow =
      latestApprovalRow && new Date(latestApprovalRow.approved_at) >= new Date(draft.generatedAt)
        ? latestApprovalRow
        : undefined;
    const approvalAudit = approvalRow
      ? (auditRowsByProperty.get(property.id) ?? [])
          .filter((event) => event.event_type === "approved" && event.approval_id === approvalRow.id)
          .at(-1)
      : undefined;
    const approval = approvalRow ? mapApprovalRow(approvalRow, approvalAudit) : undefined;
    const approvedSummary = getAuditPayloadString(approvalAudit, "approvedSummary");

    return {
      property,
      draft,
      approval,
      approvedSummary,
      sourceReadiness,
      auditEvents,
      persisted: true,
      persistenceMessage: "Loaded from Supabase.",
    };
  });
}

export async function updatePropertyTargetAndDraft(input: {
  propertyId: string;
  intake: PropertyIntake;
  propertyMatch: PropertyMatch;
  previousDraftId?: string;
}): Promise<WorkflowSnapshot> {
  const cleanInput = normalizePropertyIntake({
    ...input.intake,
    propertyMatch: input.propertyMatch,
  });
  const now = new Date().toISOString();
  const sourceReadiness = getMeasurementSourceReadiness();
  const sourceContext = await buildMeasurementSourceContext({
    propertyMatch: input.propertyMatch,
    googleMapsApiKey: getGoogleMapsApiKey(),
  });
  const draft = generateDraftMeasurement({
    address: input.propertyMatch.formattedAddress ?? cleanInput.address,
    includeGarage: cleanInput.includeGarage,
    includeShed: cleanInput.includeShed,
    mode: cleanInput.mode,
    notes: `${cleanInput.customerNotes}\n${cleanInput.jobNotes}`,
    sourceSignals: sourceContext.signals,
  });
  const supabase = createServerWriteClient();

  if (!supabase) {
    return buildDemoSnapshot(
      cleanInput,
      draft,
      now,
      sourceReadiness,
      "Supabase keys are not configured. Target change was rerun locally.",
    );
  }

  const { data: propertyRow, error: propertyError } = await supabase
    .from("properties")
    .update({
      address: cleanInput.address,
      customer_notes: cleanInput.customerNotes,
      job_notes: cleanInput.jobNotes,
      include_garage: cleanInput.includeGarage,
      include_shed: cleanInput.includeShed,
      workflow_mode: cleanInput.mode,
      status: "needs_review",
      updated_at: now,
      ...propertyMatchToColumns(input.propertyMatch, now),
    })
    .eq("id", input.propertyId)
    .select()
    .single();

  if (propertyError) {
    return buildDemoSnapshot(
      cleanInput,
      draft,
      now,
      sourceReadiness,
      `Supabase target update failed: ${propertyError.message}`,
    );
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
      cleanInput,
      draft,
      now,
      sourceReadiness,
      `Supabase draft rerun failed: ${draftError.message}`,
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

  if (draft.evidence.length) {
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
  }

  if (draft.riskFlags.length) {
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
  }

  const auditRows = [
    {
      property_id: propertyRow.id,
      draft_id: input.previousDraftId ?? null,
      event_type: "manual_edit" as const,
      actor_name: "Owner",
      summary: buildPropertyTargetChangeAuditSummary(input.propertyMatch),
      payload: {
        propertyMatch: input.propertyMatch,
        previousPropertyMatch: input.intake.propertyMatch,
      } as unknown as Json,
      created_at: now,
    },
    {
      property_id: propertyRow.id,
      draft_id: draftRow.id,
      event_type: "draft_generated" as const,
      actor_name: draft.provider === "google_solar_v1" ? "Google Solar source stack" : "Address-only provider",
      summary: `Draft measurement rerun at ${draft.roofSquares.toFixed(1)} squares after target correction.`,
      payload: draft as unknown as Json,
      created_at: now,
    },
  ];

  await supabase.from("measurement_audit_events").insert(auditRows);

  const { data: auditRowsForProperty } = await supabase
    .from("measurement_audit_events")
    .select("*")
    .eq("property_id", propertyRow.id)
    .order("created_at", { ascending: true });

  revalidatePath("/");

  return {
    property: mapPropertyRow(propertyRow),
    draft: {
      ...draft,
      id: draftRow.id,
      propertyId: propertyRow.id,
      generatedAt: draftRow.generated_at,
    },
    sourceReadiness,
    auditEvents: mapAuditRows(auditRowsForProperty ?? []),
    persisted: true,
    persistenceMessage: "Target correction saved and roof snapshot rerun.",
  };
}

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
    manualMeasurements: input.manualMeasurements,
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
    manualMeasurements: input.manualMeasurements,
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
        manualMeasurements: input.manualMeasurements,
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
      manualMeasurements: input.manualMeasurements,
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
  property_match_payload: Json;
  property_match_checked_at: string | null;
}): PropertyMatch {
  const targetCorrection = getPropertyTargetCorrection(row.property_match_payload);

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
    targetCorrection,
  };
}

function mapPropertyRow(row: PropertyRow): WorkflowProperty {
  return {
    id: row.id,
    address: row.address,
    customerNotes: row.customer_notes,
    jobNotes: row.job_notes,
    includeGarage: row.include_garage,
    includeShed: row.include_shed,
    mode: row.workflow_mode,
    propertyMatch: propertyMatchFromRow(row),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDraftRow(row: DraftRow, mode: PropertyIntake["mode"], fallback: DraftMeasurement): WorkflowDraft {
  const rawDraft = getJsonRecord(row.raw_provider_payload) as Partial<DraftMeasurement> | undefined;

  return {
    ...fallback,
    ...rawDraft,
    id: row.id,
    propertyId: row.property_id,
    provider: row.provider as DraftMeasurement["provider"],
    status: row.status,
    mode: rawDraft?.mode ?? mode,
    roofSquares: Number(row.roof_squares),
    pitchClass: row.pitch_class,
    wastePercent: Number(row.waste_percent),
    complexityClass: row.complexity_class,
    confidenceScore: row.confidence_score,
    includedStructures: row.included_structures,
    assumptions: row.assumptions,
    accuracyBand: {
      minPercent: Number(row.accuracy_min_percent),
      maxPercent: Number(row.accuracy_max_percent),
    },
    sourceStackQuality: row.source_stack_quality as DraftMeasurement["sourceStackQuality"],
    sourceDisagreementPercent:
      typeof row.source_disagreement_percent === "number" ? Number(row.source_disagreement_percent) : undefined,
    roofSegments: rawDraft?.roofSegments ?? fallback.roofSegments,
    evidence: rawDraft?.evidence ?? fallback.evidence,
    riskFlags: rawDraft?.riskFlags ?? fallback.riskFlags,
    generatedAt: row.generated_at,
  };
}

function mapApprovalRow(row: ApprovalRow, auditRow?: AuditRow): WorkflowApproval {
  const correctionSummary = getAuditPayloadStringArray(auditRow, "correctionSummary");

  return {
    id: row.id,
    propertyId: row.property_id,
    draftId: row.draft_id ?? "",
    approvedRoofSquares: Number(row.approved_roof_squares),
    approvedPitchClass: row.approved_pitch_class,
    approvedWastePercent: Number(row.approved_waste_percent),
    approvedComplexityClass: row.approved_complexity_class,
    confidenceScore: row.confidence_score,
    includedStructures: row.included_structures,
    correctionSummary: correctionSummary.length ? correctionSummary : ["Reviewer kept the draft quote inputs."],
    manualMeasurements: getAuditPayloadManualMeasurements(auditRow),
    reviewerName: row.reviewer_name,
    reviewerNotes: row.reviewer_notes,
    approvedAt: row.approved_at,
  };
}

function groupRowsByProperty<T extends { property_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  rows.forEach((row) => {
    const current = grouped.get(row.property_id) ?? [];
    current.push(row);
    grouped.set(row.property_id, current);
  });

  return grouped;
}

function getLatestRowByProperty<T extends { property_id: string }>(
  rows: T[],
  dateKey: keyof T,
): Map<string, T> {
  const latest = new Map<string, T>();

  rows.forEach((row) => {
    const current = latest.get(row.property_id);
    const rowDate = new Date(String(row[dateKey])).getTime();
    const currentDate = current ? new Date(String(current[dateKey])).getTime() : Number.NEGATIVE_INFINITY;

    if (!current || rowDate > currentDate) {
      latest.set(row.property_id, row);
    }
  });

  return latest;
}

function getAuditPayloadString(row: AuditRow | undefined, key: string): string | undefined {
  const value = getJsonRecord(row?.payload)?.[key];

  return typeof value === "string" ? value : undefined;
}

function getAuditPayloadStringArray(row: AuditRow | undefined, key: string): string[] {
  const value = getJsonRecord(row?.payload)?.[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getAuditPayloadManualMeasurements(row: AuditRow | undefined): WorkflowApproval["manualMeasurements"] {
  const value = getJsonRecord(row?.payload)?.manualMeasurements;

  if (!isJsonRecord(value) || value.source !== "manual_geometry" || typeof value.roofSquares !== "number") {
    return undefined;
  }

  return value as WorkflowApproval["manualMeasurements"];
}

function getJsonRecord(value: unknown): Record<string, unknown> | undefined {
  return isJsonRecord(value) ? value : undefined;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getPropertyTargetCorrection(value: unknown): PropertyMatch["targetCorrection"] {
  const correction = getJsonRecord(getJsonRecord(value)?.targetCorrection);

  if (
    !correction ||
    typeof correction.direction !== "string" ||
    typeof correction.distanceFeet !== "number" ||
    typeof correction.totalEastFeet !== "number" ||
    typeof correction.totalNorthFeet !== "number" ||
    typeof correction.correctedAt !== "string"
  ) {
    return undefined;
  }

  if (!["left", "right", "up", "down"].includes(correction.direction)) {
    return undefined;
  }

  return correction as PropertyMatch["targetCorrection"];
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
