"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Database,
  History,
  Loader2,
  MapPinned,
  MousePointer2,
  RotateCcw,
  Search,
  Ruler,
  Save,
  Send,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  approveMeasurement,
  createPropertyWithDraft,
  listSavedJobSnapshots,
  updatePropertyTargetAndDraft,
} from "@/app/actions";
import {
  buildApprovalChangeSummary,
  compareApprovedMeasurementToDraft,
  type ApprovalAreaComparison,
  type CalibrationSeverity,
} from "@/lib/measurements/calibration";
import {
  generateDraftMeasurement,
  type ComplexityClass,
  type PitchClass,
  type RoofSegmentMeasurement,
} from "@/lib/measurements/draft-provider";
import {
  buildManualRoofGeometryForDraft,
  calculateManualRoofMeasurements,
  replaceManualRoofGeometryPoint,
  type ManualRoofGeometry,
  type ManualRoofMeasurements,
} from "@/lib/measurements/manual-geometry";
import {
  buildSourceSignalsFromPropertyMatch,
  createManuallyAdjustedPropertyMatch,
  createManuallySelectedPropertyTarget,
  createTypedOnlyPropertyMatch,
  type PropertyTargetAdjustmentDirection,
  type PropertyMatch,
} from "@/lib/measurements/property-match";
import {
  buildGoogleSatelliteRoofPreviewUrl,
  getGoogleSatellitePreviewCenterCoordinates,
  GOOGLE_SATELLITE_PREVIEW,
  normalizeGoogleSatellitePreviewZoom,
} from "@/lib/measurements/roof-preview-url";
import {
  buildSourceDiagnostics,
  type SourceDiagnostic,
  type SourceDiagnosticStatus,
} from "@/lib/measurements/source-diagnostics";
import type { LatLng, MeasurementSourceReadiness } from "@/lib/measurements/source-stack";
import {
  getGoogleStaticMapTapTargetCoordinates,
  getMetricRasterTapTargetCoordinates,
} from "@/lib/measurements/static-map-target";
import { formatApprovedMeasurementSummary } from "@/lib/measurements/summary";
import { createSavedJobSummary, sortSavedJobSummaries } from "@/lib/workflow/saved-jobs";
import { applyPropertyTargetChange } from "@/lib/workflow/target-change";
import type {
  ApprovalInput,
  PropertyIntake,
  WorkflowApproval,
  WorkflowAuditEvent,
  WorkflowDraft,
  WorkflowSnapshot,
} from "@/lib/workflow/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { AddressAutocompleteInput } from "./address-autocomplete-input";
import { MeasurementReportView } from "./measurement-report";

const googleSatellitePreviewKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();
const APPROVED_STRUCTURE_OPTIONS = ["main roof", "attached garage", "detached shed"];

type ApprovalDraftState = {
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures: string[];
  manualMeasurements?: ManualRoofMeasurements;
  reviewerName: string;
  reviewerNotes: string;
};

type OutlineEditorMode = "edit_trace" | "change_house";

const DEFAULT_INTAKE: PropertyIntake = {
  address: "123 Cypress Point Dr, Boca Raton, FL",
  customerNotes: "Homeowner asked for a pre-quote range before scheduling inspection.",
  jobNotes: "Original roof suspected. Check attached garage and rear flat section.",
  includeGarage: true,
  includeShed: false,
  mode: "pre_quote_screening",
  propertyMatch: createTypedOnlyPropertyMatch("123 Cypress Point Dr, Boca Raton, FL"),
};
const INITIAL_DEMO_CREATED_AT = "2026-06-08T12:00:00.000Z";

export function MeasurementWorkspace({
  serverWritesEnabled,
  sourceReadiness,
}: {
  serverWritesEnabled: boolean;
  sourceReadiness: MeasurementSourceReadiness[];
}) {
  const [intake, setIntake] = useState<PropertyIntake>(DEFAULT_INTAKE);
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() =>
    createLocalSnapshot(
      DEFAULT_INTAKE,
      sourceReadiness,
      serverWritesEnabled
        ? "Draft preview. Generate Draft will save a review packet to Supabase."
        : "Supabase server writes are not configured. Workflow is running in local demo mode.",
      {
        now: INITIAL_DEMO_CREATED_AT,
        propertyId: "local-demo-property",
        draftId: "local-demo-draft",
      },
    ),
  );
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraftState>(() => createApprovalDraft(snapshot));
  const [manualGeometry, setManualGeometry] = useState(() => createManualGeometryForSnapshot(snapshot));
  const [savedSnapshots, setSavedSnapshots] = useState<WorkflowSnapshot[]>(() => [snapshot]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [outlineEditorMode, setOutlineEditorMode] = useState<OutlineEditorMode>("edit_trace");
  const [mapZoom, setMapZoom] = useState(GOOGLE_SATELLITE_PREVIEW.zoom);
  const [isPending, startTransition] = useTransition();

  const facets = useMemo(() => buildFacetRows(snapshot.draft), [snapshot.draft]);
  const manualMeasurements = useMemo(() => calculateManualRoofMeasurements(manualGeometry), [manualGeometry]);
  const sourceDiagnostics = useMemo(
    () =>
      buildSourceDiagnostics({
        propertyMatch: snapshot.property.propertyMatch,
        sourceReadiness: snapshot.sourceReadiness,
        draft: snapshot.draft,
      }),
    [snapshot],
  );
  const approvalChangeSummary = useMemo(
    () =>
      buildApprovalChangeSummary({
        draftRoofSquares: snapshot.draft.roofSquares,
        approvedRoofSquares: approvalDraft.approvedRoofSquares,
        draftPitchClass: snapshot.draft.pitchClass,
        approvedPitchClass: approvalDraft.approvedPitchClass,
        draftWastePercent: snapshot.draft.wastePercent,
        approvedWastePercent: approvalDraft.approvedWastePercent,
        draftComplexityClass: snapshot.draft.complexityClass,
        approvedComplexityClass: approvalDraft.approvedComplexityClass,
        draftIncludedStructures: snapshot.draft.includedStructures,
        approvedIncludedStructures: approvalDraft.includedStructures,
      }),
    [approvalDraft, snapshot.draft],
  );
  const areaComparison = useMemo(
    () =>
      compareApprovedMeasurementToDraft({
        draftRoofSquares: snapshot.draft.roofSquares,
        approvedRoofSquares: approvalDraft.approvedRoofSquares,
      }),
    [approvalDraft.approvedRoofSquares, snapshot.draft.roofSquares],
  );
  const approved = Boolean(snapshot.approval);
  const savedJobSummaries = useMemo(
    () => sortSavedJobSummaries(savedSnapshots.map((savedSnapshot) => createSavedJobSummary(savedSnapshot))),
    [savedSnapshots],
  );
  useEffect(() => {
    let isDisposed = false;

    listSavedJobSnapshots().then((savedJobs) => {
      if (isDisposed || !savedJobs.length) {
        return;
      }

      setSavedSnapshots((current) => mergeSnapshots(savedJobs, current));
    });

    return () => {
      isDisposed = true;
    };
  }, []);

  function updateIntake<T extends keyof PropertyIntake>(key: T, value: PropertyIntake[T]) {
    setIntake((current) => ({ ...current, [key]: value }));
  }

  function handleGenerateDraft() {
    if (!serverWritesEnabled) {
      const nextSnapshot = createLocalSnapshot(
        intake,
        sourceReadiness,
        "Supabase server writes are not configured. Workflow is running in local demo mode.",
      );
      setSnapshot(nextSnapshot);
      setIntake(nextSnapshot.property);
      setApprovalDraft(createApprovalDraft(nextSnapshot));
      setManualGeometry(createManualGeometryForSnapshot(nextSnapshot));
      setOutlineEditorMode("edit_trace");
      setSavedSnapshots((current) => mergeSnapshots([nextSnapshot], current));
      return;
    }

    startTransition(async () => {
      const nextSnapshot = await createPropertyWithDraft(intake);
      setSnapshot(nextSnapshot);
      setIntake(nextSnapshot.property);
      setApprovalDraft(createApprovalDraft(nextSnapshot));
      setManualGeometry(createManualGeometryForSnapshot(nextSnapshot));
      setOutlineEditorMode("edit_trace");
      setSavedSnapshots((current) => mergeSnapshots([nextSnapshot], current));
    });
  }

  function handleApprove() {
    const payload: ApprovalInput = {
      propertyId: snapshot.property.id,
      draftId: snapshot.draft.id,
      propertyAddress: snapshot.property.address,
      approvedRoofSquares: approvalDraft.approvedRoofSquares,
      approvedPitchClass: approvalDraft.approvedPitchClass,
      approvedWastePercent: approvalDraft.approvedWastePercent,
      approvedComplexityClass: approvalDraft.approvedComplexityClass,
      confidenceScore: approvalDraft.confidenceScore,
      includedStructures: approvalDraft.includedStructures,
      correctionSummary: approvalChangeSummary,
      manualMeasurements: approvalDraft.manualMeasurements,
      reviewerName: approvalDraft.reviewerName,
      reviewerNotes: approvalDraft.reviewerNotes,
    };

    if (!serverWritesEnabled) {
      const result = createLocalApprovalResult(payload);
      setSnapshot((current) => {
        const nextSnapshot: WorkflowSnapshot = {
        ...current,
        property: { ...current.property, status: "approved" as const, updatedAt: result.approval.approvedAt },
        draft: { ...current.draft, status: "approved" },
        approval: result.approval,
        auditEvents: [...current.auditEvents, result.auditEvent],
        approvedSummary: result.approvedSummary,
        persisted: false,
        persistenceMessage: "Supabase server writes are not configured. Approval is shown as a local demo state.",
        };
        setSavedSnapshots((saved) => mergeSnapshots([nextSnapshot], saved));
        return nextSnapshot;
      });
      return;
    }

    startTransition(async () => {
      const result = await approveMeasurement(payload);
      setSnapshot((current) => {
        const nextSnapshot: WorkflowSnapshot = {
        ...current,
        property: { ...current.property, status: "approved" as const, updatedAt: result.approval.approvedAt },
        draft: { ...current.draft, status: "approved" },
        approval: result.approval,
        auditEvents: [...current.auditEvents, result.auditEvent],
        approvedSummary: result.approvedSummary,
        persisted: result.persisted,
        persistenceMessage: result.persistenceMessage,
        };
        setSavedSnapshots((saved) => mergeSnapshots([nextSnapshot], saved));
        return nextSnapshot;
      });
    });
  }

  function handleAddressChange(value: string) {
    setIntake((current) => ({
      ...current,
      address: value,
      propertyMatch:
        current.propertyMatch?.formattedAddress === value
          ? current.propertyMatch
          : createTypedOnlyPropertyMatch(value),
    }));
  }

  function handlePlaceSelected(match: PropertyMatch) {
    setIntake((current) => ({
      ...current,
      address: match.formattedAddress ?? current.address,
      propertyMatch: match,
    }));
  }

  function handleApplyManualGeometry() {
    setApprovalDraft((current) => ({
      ...current,
      approvedRoofSquares: manualMeasurements.roofSquares,
      manualMeasurements,
    }));
  }

  function adjustMapZoom(delta: number) {
    setMapZoom((current) => normalizeGoogleSatellitePreviewZoom(current + delta));
  }

  function resetMapZoom() {
    setMapZoom(GOOGLE_SATELLITE_PREVIEW.zoom);
  }

  function commitPropertyTargetChange(propertyMatch: PropertyMatch, message: string) {
    const result = applyPropertyTargetChange({
      intake,
      snapshot,
      propertyMatch,
      message,
    });

    setIntake(result.intake);
    setSnapshot(result.snapshot);
    setApprovalDraft(createApprovalDraft(result.snapshot));
    setManualGeometry(createManualGeometryForSnapshot(result.snapshot));
    setOutlineEditorMode("edit_trace");
    setShowManualEditor(false);

    return result;
  }

  function applyGeneratedSnapshot(nextSnapshot: WorkflowSnapshot) {
    setSnapshot(nextSnapshot);
    setIntake(nextSnapshot.property);
    setApprovalDraft(createApprovalDraft(nextSnapshot));
    setManualGeometry(createManualGeometryForSnapshot(nextSnapshot));
    setOutlineEditorMode("edit_trace");
    setShowManualEditor(false);
    setSavedSnapshots((current) => mergeSnapshots([nextSnapshot], current));
  }

  function rerunAfterPropertyTargetChange(propertyMatch: PropertyMatch, pendingMessage: string) {
    const currentPropertyId = snapshot.property.id;
    const currentDraftId = snapshot.draft.id;
    const result = commitPropertyTargetChange(propertyMatch, pendingMessage);

    if (!serverWritesEnabled) {
      const nextSnapshot = createLocalSnapshot(
        result.intake,
        sourceReadiness,
        "Target changed and local roof snapshot rerun. Supabase server writes are not configured.",
        {
          propertyId: currentPropertyId,
        },
      );
      applyGeneratedSnapshot(nextSnapshot);
      return;
    }

    startTransition(async () => {
      const nextSnapshot = await updatePropertyTargetAndDraft({
        propertyId: currentPropertyId,
        previousDraftId: currentDraftId,
        intake: result.intake,
        propertyMatch,
      });

      applyGeneratedSnapshot(nextSnapshot);
    });
  }

  function handleNudgePropertyTarget(direction: PropertyTargetAdjustmentDirection) {
    const baseMatch = intake.propertyMatch ?? snapshot.property.propertyMatch;
    const adjustedMatch = createManuallyAdjustedPropertyMatch(baseMatch, {
      direction,
      distanceFeet: 35,
    });

    rerunAfterPropertyTargetChange(
      adjustedMatch,
      "Target adjusted. Rerunning roof snapshot on this structure.",
    );
  }

  function handleTapPropertyTarget(coordinates: LatLng) {
    const baseMatch = intake.propertyMatch ?? snapshot.property.propertyMatch;
    const adjustedMatch = createManuallySelectedPropertyTarget(baseMatch, {
      coordinates,
    });

    rerunAfterPropertyTargetChange(
      adjustedMatch,
      "Target moved to your tap. Rerunning roof snapshot on this structure.",
    );
  }

  function handleSelectSavedJob(jobId: string) {
    const selected = savedSnapshots.find((savedSnapshot) => savedSnapshot.property.id === jobId);

    if (!selected) {
      return;
    }

    setSnapshot(selected);
    setIntake(selected.property);
    setApprovalDraft(createApprovalDraft(selected));
    setManualGeometry(createManualGeometryForSnapshot(selected));
    setOutlineEditorMode("edit_trace");
    setShowManualEditor(false);
  }

  return (
    <div className="min-h-screen bg-[#f5f7f8] pb-24 text-foreground lg:pb-0">
      <header className="sticky top-0 z-30 border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-900">
                  <Building2 className="size-3.5" />
                  Field lookup
                </Badge>
                <Badge variant={approved ? "default" : "secondary"} className="gap-1">
                  {approved ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                  {approved ? "Saved quote inputs" : "Draft snapshot"}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Database className="size-3.5" />
                  {snapshot.persisted ? "Saved" : serverWritesEnabled ? "Unsaved" : "Demo"}
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">Roof Snapshot</h1>
                <p className="mt-1 truncate text-sm leading-6 text-slate-600">{snapshot.property.address}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[460px]">
              <Metric label="Roof" value={`${approvalDraft.approvedRoofSquares.toFixed(1)} sq`} />
              <Metric label="Waste" value={`${approvalDraft.approvedWastePercent}%`} />
              <Metric label="Confidence" value={`${approvalDraft.confidenceScore}%`} />
            </div>
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
            <div className="min-w-0">
              <Label className="sr-only">Address</Label>
              <AddressAutocompleteInput
                value={intake.address}
                onValueChange={handleAddressChange}
                onPlaceSelected={handlePlaceSelected}
              />
              <PropertyMatchPanel match={intake.propertyMatch} />
            </div>
            <Button className="h-11 w-full gap-2" onClick={handleGenerateDraft} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {isPending ? "Getting snapshot" : "Get Roof Snapshot"}
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <SwitchRow
                label="Include garage"
                checked={intake.includeGarage}
                onCheckedChange={(value) => updateIntake("includeGarage", value)}
              />
              <SwitchRow
                label="Include shed"
                checked={intake.includeShed}
                onCheckedChange={(value) => updateIntake("includeShed", value)}
              />
            </div>
            <p className="text-xs leading-5 text-slate-600 lg:max-w-xl">{snapshot.persistenceMessage}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl min-w-0 space-y-4 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
        <MapWorkbenchPanel
          snapshot={snapshot}
          facets={facets}
          zoom={mapZoom}
          onZoomIn={() => adjustMapZoom(1)}
          onZoomOut={() => adjustMapZoom(-1)}
          onResetZoom={resetMapZoom}
          onNudge={handleNudgePropertyTarget}
          onTapTarget={handleTapPropertyTarget}
          showManualEditor={showManualEditor}
          onToggleManualEditor={() => setShowManualEditor((current) => !current)}
          manualCanvas={
            showManualEditor ? (
              <ManualGeometryCanvas
                snapshot={snapshot}
                geometry={manualGeometry}
                measurements={manualMeasurements}
                zoom={mapZoom}
                editorMode={outlineEditorMode}
                onEditorModeChange={setOutlineEditorMode}
                onGeometryChange={setManualGeometry}
                onSelectTarget={handleTapPropertyTarget}
              />
            ) : null
          }
          manualPanel={
            showManualEditor ? (
              <ManualGeometryMeasurementsPanel
                measurements={manualMeasurements}
                editorMode={outlineEditorMode}
                onApply={handleApplyManualGeometry}
                applied={approvalDraft.manualMeasurements === manualMeasurements}
              />
            ) : null
          }
        />

        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="min-w-0 rounded-lg border-slate-200 bg-white shadow-sm">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck className="size-4 text-sky-700" />
                    Quote Inputs
                  </CardTitle>
                  <CardDescription>Save the roof size and scope you want to use for the quote.</CardDescription>
                </div>
                <CalibrationSeverityBadge severity={areaComparison.severity} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div>
                  <p className="text-sm font-medium text-slate-600">Roof size</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-normal text-slate-950">
                      {approvalDraft.approvedRoofSquares.toFixed(1)}
                    </span>
                    <span className="pb-1 text-sm font-medium text-slate-500">squares</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {Math.round(approvalDraft.approvedRoofSquares * 100).toLocaleString()} sq ft estimated surface area.
                  </p>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="Roof squares">
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      value={approvalDraft.approvedRoofSquares}
                      onChange={(event) =>
                        setApprovalDraft((current) => ({
                          ...current,
                          approvedRoofSquares: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Waste percent">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="40"
                      value={approvalDraft.approvedWastePercent}
                      onChange={(event) =>
                        setApprovalDraft((current) => ({
                          ...current,
                          approvedWastePercent: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Pitch class">
                    <Select
                      value={approvalDraft.approvedPitchClass}
                      onValueChange={(value) =>
                        setApprovalDraft((current) => ({ ...current, approvedPitchClass: value as PitchClass }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="steep">Steep</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Complexity">
                    <Select
                      value={approvalDraft.approvedComplexityClass}
                      onValueChange={(value) =>
                        setApprovalDraft((current) => ({
                          ...current,
                          approvedComplexityClass: value as ComplexityClass,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="complex">Complex</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Included structures">
                  <ApprovedStructureChecklist
                    structures={approvalDraft.includedStructures}
                    onChange={(structures) =>
                      setApprovalDraft((current) => ({
                        ...current,
                        includedStructures: structures,
                      }))
                    }
                  />
                </Field>
                <Field label="Reviewer notes">
                  <Textarea
                    rows={5}
                    value={approvalDraft.reviewerNotes}
                    onChange={(event) =>
                      setApprovalDraft((current) => ({ ...current, reviewerNotes: event.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 text-sm sm:min-w-[420px]">
                  <SummaryRow label="Pitch" value={approvalDraft.approvedPitchClass} />
                  <SummaryRow label="Waste" value={`${approvalDraft.approvedWastePercent}%`} />
                  <SummaryRow label="Complexity" value={approvalDraft.approvedComplexityClass} />
                  <SummaryRow label="Accuracy" value={formatAccuracyBand(snapshot.draft.accuracyBand)} />
                </div>
                <Button className="h-11 gap-2 sm:min-w-[220px]" onClick={handleApprove} disabled={isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {approved ? "Update Saved Inputs" : "Save Quote Inputs"}
                </Button>
              </div>

              <ApprovalCalibrationPanel areaComparison={areaComparison} changes={approvalChangeSummary} />
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card className="min-w-0 rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SlidersHorizontal className="size-4 text-sky-700" />
                  Job Details
                </CardTitle>
                <CardDescription>Notes and current status for this saved lookup.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Job notes">
                  <Textarea
                    value={intake.jobNotes}
                    onChange={(event) => updateIntake("jobNotes", event.target.value)}
                    rows={4}
                    placeholder="Anything you noticed on site"
                  />
                </Field>
                <Field label="Customer notes">
                  <Textarea
                    value={intake.customerNotes}
                    onChange={(event) => updateIntake("customerNotes", event.target.value)}
                    rows={3}
                    placeholder="Customer context"
                  />
                </Field>
                <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                  <SummaryRow label="Status" value={snapshot.property.status.replaceAll("_", " ")} />
                  <SummaryRow label="Updated" value={formatDate(snapshot.property.updatedAt)} />
                </div>
              </CardContent>
            </Card>

            <SavedJobsPanel
              jobs={savedJobSummaries}
              activeJobId={snapshot.property.id}
              onSelectJob={handleSelectSavedJob}
            />
          </div>
        </section>

        <Card className="min-w-0 rounded-lg border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 text-left"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                <span>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="size-4 text-sky-700" />
                    Advanced Details
                  </CardTitle>
                  <CardDescription>Diagnostics, source evidence, audit history, and printable report.</CardDescription>
                </span>
                <ChevronDown
                  className={`size-5 shrink-0 text-slate-500 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
              </button>
            </CardHeader>
            {showAdvanced ? (
              <CardContent className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-3">
                  <AdvancedSection title="Diagnostics" icon={<Search className="size-4 text-sky-700" />}>
                    <SourceDiagnosticsPanel diagnostics={sourceDiagnostics} />
                  </AdvancedSection>

                  <AdvancedSection title="Risk flags" icon={<AlertTriangle className="size-4 text-amber-600" />}>
                    <div className="space-y-2">
                      {snapshot.draft.riskFlags.map((flag) => (
                        <div key={flag.code} className="rounded-lg border bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{flag.label}</p>
                            <SeverityBadge severity={flag.severity} />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">{flag.detail}</p>
                        </div>
                      ))}
                    </div>
                  </AdvancedSection>

                  <AdvancedSection title="Sources" icon={<Database className="size-4 text-sky-700" />}>
                    <div className="space-y-2">
                      {snapshot.sourceReadiness.map((source) => (
                        <div key={source.code} className="rounded-lg border bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{source.label}</p>
                              <p className="mt-1 text-xs text-slate-500">{source.role.replaceAll("_", " ")}</p>
                            </div>
                            <SourceStatusBadge status={source.status} />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">{source.detail}</p>
                        </div>
                      ))}
                    </div>
                  </AdvancedSection>
                </div>

                <AdvancedSection title="Draft facets" icon={<Ruler className="size-4 text-sky-700" />}>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Facet</TableHead>
                          <TableHead>Structure</TableHead>
                          <TableHead>Assumption</TableHead>
                          <TableHead className="text-right">Squares</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {facets.map((facet) => (
                          <TableRow key={facet.name}>
                            <TableCell className="font-medium">{facet.name}</TableCell>
                            <TableCell>{facet.structure}</TableCell>
                            <TableCell>{facet.assumption}</TableCell>
                            <TableCell className="text-right">{facet.squares.toFixed(1)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AdvancedSection>

                <AdvancedSection title="Audit and export" icon={<History className="size-4 text-sky-700" />}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[620px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Summary</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshot.auditEvents.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(event.createdAt)}</TableCell>
                              <TableCell>{event.eventType.replaceAll("_", " ")}</TableCell>
                              <TableCell>{event.summary}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Textarea
                      readOnly
                      rows={8}
                      value={snapshot.approvedSummary ?? "No approved measurement summary yet."}
                      className="font-mono text-xs"
                    />
                  </div>
                </AdvancedSection>

                <MeasurementReportView snapshot={snapshot} approvalDraft={approvalDraft} />
              </CardContent>
            ) : null}
          </Card>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 py-3 shadow-lg lg:hidden">
        <div className="mx-auto flex max-w-7xl gap-2">
          <Button className="h-11 flex-1 gap-2" onClick={handleGenerateDraft} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Snapshot
          </Button>
          <Button className="h-11 flex-1 gap-2" variant="outline" onClick={handleApprove} disabled={isPending}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SavedJobsPanel({
  jobs,
  activeJobId,
  onSelectJob,
}: {
  jobs: ReturnType<typeof createSavedJobSummary>[];
  activeJobId: string;
  onSelectJob: (jobId: string) => void;
}) {
  return (
    <Card className="min-w-0 rounded-lg border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-sky-700" />
          Saved Jobs
        </CardTitle>
        <CardDescription>Reopen a previous lookup or adjusted quote input.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
              job.id === activeJobId
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
            onClick={() => onSelectJob(job.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-950">{job.address}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(job.updatedAt)}</p>
              </div>
              <Badge variant={job.status === "approved" ? "default" : "secondary"} className="shrink-0">
                {job.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-900">{job.roofSquares.toFixed(1)} squares</span>
              <span>{job.confidenceScore}% confidence</span>
              {job.hasManualAdjustments ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                  adjusted
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function AdvancedSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" }) {
  const classes = {
    low: "border-sky-200 bg-sky-50 text-sky-900",
    medium: "border-amber-200 bg-amber-50 text-amber-950",
    high: "border-red-200 bg-red-50 text-red-950",
  };

  return (
    <Badge variant="outline" className={classes[severity]}>
      {severity}
    </Badge>
  );
}

function SourceStatusBadge({ status }: { status: MeasurementSourceReadiness["status"] }) {
  const classes = {
    available: "border-emerald-200 bg-emerald-50 text-emerald-900",
    configured: "border-sky-200 bg-sky-50 text-sky-900",
    unconfigured: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <Badge variant="outline" className={classes[status]}>
      {status}
    </Badge>
  );
}

function SourceDiagnosticsPanel({ diagnostics }: { diagnostics: SourceDiagnostic[] }) {
  return (
    <div className="space-y-2">
      {diagnostics.map((diagnostic) => (
        <div key={diagnostic.id} className="rounded-lg border bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-950">{diagnostic.label}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{diagnostic.value}</p>
            </div>
            <DiagnosticStatusBadge status={diagnostic.status} />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{diagnostic.detail}</p>
        </div>
      ))}
    </div>
  );
}

function DiagnosticStatusBadge({ status }: { status: SourceDiagnosticStatus }) {
  const classes = {
    pass: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    fail: "border-red-200 bg-red-50 text-red-950",
    info: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <Badge variant="outline" className={classes[status]}>
      {status}
    </Badge>
  );
}

function ApprovedStructureChecklist({
  structures,
  onChange,
}: {
  structures: string[];
  onChange: (structures: string[]) => void;
}) {
  function setStructure(structure: string, checked: boolean) {
    if (structure === "main roof") {
      return;
    }

    const next = checked
      ? Array.from(new Set(["main roof", ...structures, structure]))
      : structures.filter((item) => item !== structure);

    onChange(next.includes("main roof") ? next : ["main roof", ...next]);
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      {APPROVED_STRUCTURE_OPTIONS.map((structure) => (
        <SwitchRow
          key={structure}
          label={structure}
          checked={structures.includes(structure)}
          onCheckedChange={(checked) => setStructure(structure, checked)}
        />
      ))}
      <p className="text-xs leading-5 text-slate-500">
        Main roof remains required; optional structures can be excluded from approved quote scope.
      </p>
    </div>
  );
}

function ApprovalCalibrationPanel({
  areaComparison,
  changes,
}: {
  areaComparison: ApprovalAreaComparison;
  changes: string[];
}) {
  return (
    <div className="mt-4 rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-950">Reviewer calibration</p>
        <CalibrationSeverityBadge severity={areaComparison.severity} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{areaComparison.detail}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
        {changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </div>
  );
}

function CalibrationSeverityBadge({ severity }: { severity: CalibrationSeverity }) {
  const classes = {
    none: "border-emerald-200 bg-emerald-50 text-emerald-900",
    minor: "border-sky-200 bg-sky-50 text-sky-900",
    material: "border-amber-200 bg-amber-50 text-amber-950",
    major: "border-red-200 bg-red-50 text-red-950",
  };

  return (
    <Badge variant="outline" className={classes[severity]}>
      {severity}
    </Badge>
  );
}

function PropertyMatchPanel({ match }: { match?: PropertyMatch }) {
  const display = getPropertyMatchDisplay(match);

  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-5 ${display.classes}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-medium">
          {display.icon === "check" ? <CheckCircle2 className="size-3.5" /> : <Search className="size-3.5" />}
          {display.label}
        </span>
        {match?.placeId ? <span className="font-mono text-[11px] opacity-80">{match.placeId.slice(0, 10)}...</span> : null}
      </div>
      <p className="mt-1">{match?.detail ?? "No Google property match has been selected yet."}</p>
      {typeof match?.latitude === "number" && typeof match.longitude === "number" ? (
        <p className="mt-1 font-mono text-[11px] opacity-80">
          {match.latitude.toFixed(6)}, {match.longitude.toFixed(6)}
        </p>
      ) : null}
    </div>
  );
}

function PropertyTargetNudgePanel({
  match,
  onNudge,
}: {
  match?: PropertyMatch;
  onNudge: (direction: PropertyTargetAdjustmentDirection) => void;
}) {
  const canNudge = typeof match?.latitude === "number" && typeof match.longitude === "number";
  const correction = match?.targetCorrection;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-950">Wrong house?</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Move the target 35 ft at a time, then get the roof snapshot again.
          </p>
        </div>
        {correction ? (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-950">
            adjusted
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-[44px_44px_44px] justify-center gap-2">
        <span />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canNudge}
          aria-label="Move roof target up"
          onClick={() => onNudge("up")}
        >
          <ArrowUp className="size-4" />
        </Button>
        <span />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canNudge}
          aria-label="Move roof target left"
          onClick={() => onNudge("left")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canNudge}
          aria-label="Move roof target down"
          onClick={() => onNudge("down")}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canNudge}
          aria-label="Move roof target right"
          onClick={() => onNudge("right")}
        >
          <ArrowRight className="size-4" />
        </Button>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        {canNudge
          ? correction
            ? `Current offset: ${formatTargetOffset(correction.totalEastFeet, correction.totalNorthFeet)}.`
            : "Use this when the image or roof outline lands on a neighboring address."
          : "Select an address suggestion first so the app has map coordinates to move."}
      </p>
    </div>
  );
}

function getPropertyMatchDisplay(match?: PropertyMatch): {
  label: string;
  classes: string;
  icon: "check" | "search";
} {
  if (!match || match.status === "typed_only") {
    return {
      label: "Typed address only",
      classes: "border-amber-200 bg-amber-50 text-amber-950",
      icon: "search",
    };
  }

  if (match.status === "validated") {
    return {
      label: "Validated property",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-950",
      icon: "check",
    };
  }

  if (match.status === "selected_from_google") {
    return {
      label: "Selected from Google",
      classes: "border-sky-200 bg-sky-50 text-sky-950",
      icon: "check",
    };
  }

  return {
    label: match.status === "validation_failed" ? "Validation failed" : "Needs confirmation",
    classes: "border-amber-200 bg-amber-50 text-amber-950",
    icon: "search",
  };
}

function MapWorkbenchPanel({
  snapshot,
  facets,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onNudge,
  onTapTarget,
  showManualEditor,
  onToggleManualEditor,
  manualCanvas,
  manualPanel,
}: {
  snapshot: WorkflowSnapshot;
  facets: FacetRow[];
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onNudge: (direction: PropertyTargetAdjustmentDirection) => void;
  onTapTarget: (coordinates: LatLng) => void;
  showManualEditor: boolean;
  onToggleManualEditor: () => void;
  manualCanvas: React.ReactNode;
  manualPanel: React.ReactNode;
}) {
  const hasMapCoordinates =
    typeof snapshot.property.propertyMatch?.latitude === "number" &&
    typeof snapshot.property.propertyMatch.longitude === "number";
  const hasConfirmedMapTarget = Boolean(hasMapCoordinates && snapshot.property.propertyMatch?.status !== "typed_only");
  const imageUrl = useMemo(
    () =>
      hasConfirmedMapTarget
        ? buildGoogleSatelliteRoofPreviewUrl({
            apiKey: googleSatellitePreviewKey,
            propertyMatch: snapshot.property.propertyMatch,
            fallbackAddress: snapshot.property.address,
            zoom,
          })
        : null,
    [hasConfirmedMapTarget, snapshot.property.address, snapshot.property.propertyMatch, zoom],
  );
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const hasSatelliteImage = Boolean(imageUrl && failedImageUrl !== imageUrl);
  const matchDisplay = getPropertyMatchDisplay(snapshot.property.propertyMatch);
  const canZoomOut = zoom > GOOGLE_SATELLITE_PREVIEW.minZoom;
  const canZoomIn = zoom < GOOGLE_SATELLITE_PREVIEW.maxZoom;
  const centerCoordinates = snapshot.property.propertyMatch
    ? getGoogleSatellitePreviewCenterCoordinates(snapshot.property.propertyMatch)
    : undefined;
  const hasManualCanvas = Boolean(manualCanvas);

  function handleMapTap(event: React.MouseEvent<HTMLDivElement>) {
    if (!hasConfirmedMapTarget || !centerCoordinates || !hasSatelliteImage) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    onTapTarget(
      getGoogleStaticMapTapTargetCoordinates({
        center: centerCoordinates,
        zoom,
        imageSize: {
          width: GOOGLE_SATELLITE_PREVIEW.width,
          height: GOOGLE_SATELLITE_PREVIEW.height,
        },
        renderedSize: {
          width: rect.width,
          height: rect.height,
        },
        tap: {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
      }),
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
              <MapPinned className="mr-1 size-3.5" />
              Satellite workbench
            </Badge>
            <Badge variant="outline" className={matchDisplay.classes}>
              {matchDisplay.label}
            </Badge>
          </div>
          <p className="mt-2 truncate text-sm text-slate-300">{snapshot.property.address}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
            zoom {zoom}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9"
            onClick={onZoomOut}
            disabled={!hasConfirmedMapTarget || !canZoomOut}
            aria-label="Zoom map out"
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9"
            onClick={onZoomIn}
            disabled={!hasConfirmedMapTarget || !canZoomIn}
            aria-label="Zoom map in"
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9"
            onClick={onResetZoom}
            disabled={!hasConfirmedMapTarget}
            aria-label="Reset map zoom"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button type="button" variant="secondary" className="h-9 gap-2" onClick={onToggleManualEditor}>
            <MousePointer2 className="size-4" />
            {showManualEditor ? "Hide Outline" : "Adjust Outline"}
          </Button>
        </div>
      </div>
      <div
        className={`relative min-h-[360px] overflow-hidden bg-[linear-gradient(135deg,#1e293b_25%,#334155_25%,#334155_50%,#1e293b_50%,#1e293b_75%,#334155_75%,#334155_100%)] bg-[length:32px_32px] sm:min-h-[520px] xl:min-h-[620px] ${
          hasSatelliteImage && !hasManualCanvas ? "cursor-crosshair" : ""
        }`}
        onClick={hasManualCanvas ? undefined : handleMapTap}
        aria-label={
          hasManualCanvas
            ? "Roof outline editor."
            : "Satellite map. Tap the correct roof to move the property target."
        }
      >
        {manualCanvas ? (
          manualCanvas
        ) : (
          <>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={`Satellite preview for ${snapshot.property.address}`}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setFailedImageUrl(imageUrl)}
              />
            ) : null}
            <div className="absolute inset-0 bg-slate-950/10" />
            {hasSatelliteImage ? (
              <div className="pointer-events-none absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(14,165,233,0.8),0_12px_28px_rgba(15,23,42,0.35)]">
                <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
              </div>
            ) : null}
            {!imageUrl ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-md rounded-lg border border-white/15 bg-slate-950/80 p-5 text-center shadow-xl">
                  <Search className="mx-auto size-7 text-sky-200" />
                  <p className="mt-3 text-base font-medium text-white">Address target not confirmed</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Pick an address from the Google suggestions so the workbench can center on map coordinates before
                    showing roof imagery.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-md bg-black/65 px-3 py-2 text-xs leading-5 text-slate-100">
              {hasSatelliteImage
                ? "Tap the correct roof to move the target, use arrows for small nudges, or open Adjust Outline to trace it."
                : hasConfirmedMapTarget
                ? "Satellite imagery is unavailable. Check the Google Maps browser key or address match."
                : "The map will appear after the address resolves to a property target."}
            </div>
          </>
        )}
      </div>
      <div className="grid gap-4 border-t border-white/10 bg-white p-4 text-slate-950 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-950">Draft roof areas</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                These are quote inputs until the outline is manually corrected or replaced by a better source.
              </p>
            </div>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              {formatAccuracyBand(snapshot.draft.accuracyBand)}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {facets.map((facet) => (
              <div key={facet.name} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="font-medium text-slate-950">{facet.name}</div>
                <div className="mt-0.5 text-slate-600">{facet.squares.toFixed(1)} sq</div>
              </div>
            ))}
          </div>
        </div>

        {manualPanel ?? <PropertyTargetNudgePanel match={snapshot.property.propertyMatch} onNudge={onNudge} />}
      </div>
    </section>
  );
}

function ManualGeometryCanvas({
  snapshot,
  geometry,
  measurements,
  onGeometryChange,
  onSelectTarget,
  editorMode,
  onEditorModeChange,
  zoom,
}: {
  snapshot: WorkflowSnapshot;
  geometry: ManualRoofGeometry;
  measurements: ManualRoofMeasurements;
  onGeometryChange: (geometry: ManualRoofGeometry) => void;
  onSelectTarget: (coordinates: LatLng) => void;
  editorMode: OutlineEditorMode;
  onEditorModeChange: (mode: OutlineEditorMode) => void;
  zoom: number;
}) {
  const [activePoint, setActivePoint] = useState<{ facetId: string; pointIndex: number } | null>(null);
  const satelliteImageUrl = useMemo(
    () =>
      buildGoogleSatelliteRoofPreviewUrl({
        apiKey: googleSatellitePreviewKey,
        propertyMatch: snapshot.property.propertyMatch,
        fallbackAddress: snapshot.property.address,
        zoom,
      }),
    [snapshot.property.address, snapshot.property.propertyMatch, zoom],
  );
  const centerCoordinates = snapshot.property.propertyMatch
    ? getGoogleSatellitePreviewCenterCoordinates(snapshot.property.propertyMatch)
    : undefined;
  const isChangingHouse = editorMode === "change_house";
  const rasterPreview = snapshot.draft.solarRasterPreview;
  const solarRasterImageUrl =
    rasterPreview?.imageWidth === geometry.imageWidth && rasterPreview.imageHeight === geometry.imageHeight
      ? rasterPreview.imageDataUrl
      : null;
  const editTraceBackgroundImageUrl = solarRasterImageUrl ?? satelliteImageUrl;
  const canUseSolarRasterTarget = Boolean(centerCoordinates && solarRasterImageUrl && geometry.pixelSizeFeet > 0);
  const canSelectTarget = Boolean(centerCoordinates && (canUseSolarRasterTarget || satelliteImageUrl));

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!activePoint) {
      return;
    }

    onGeometryChange(
      replaceManualRoofGeometryPoint(geometry, {
        facetId: activePoint.facetId,
        pointIndex: activePoint.pointIndex,
        point: getSvgPointerPoint(event, geometry),
      }),
    );
  }

  function handleTargetSurfaceClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!centerCoordinates || !canSelectTarget) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const renderedSize = {
      width: rect.width,
      height: rect.height,
    };
    const tap = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (canUseSolarRasterTarget) {
      onSelectTarget(
        getMetricRasterTapTargetCoordinates({
          center: centerCoordinates,
          imageSize: {
            width: geometry.imageWidth,
            height: geometry.imageHeight,
          },
          renderedSize,
          pixelSizeFeet: geometry.pixelSizeFeet,
          tap,
        }),
      );
      return;
    }

    onSelectTarget(
      getGoogleStaticMapTapTargetCoordinates({
        center: centerCoordinates,
        zoom,
        imageSize: {
          width: GOOGLE_SATELLITE_PREVIEW.width,
          height: GOOGLE_SATELLITE_PREVIEW.height,
        },
        renderedSize,
        tap,
      }),
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-950 p-4 text-white">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <span>{geometry.source === "google_solar_mask" ? "Solar mask outline" : "Manual fallback outline"}</span>
          <span>{geometry.pixelSizeFeet.toFixed(2)} ft / px</span>
        </div>
        <div className="flex rounded-md border border-white/10 bg-white/10 p-1">
          <Button
            type="button"
            size="sm"
            variant={editorMode === "edit_trace" ? "secondary" : "ghost"}
            className={editorMode === "edit_trace" ? "" : "text-slate-200 hover:bg-white/10 hover:text-white"}
            onClick={() => onEditorModeChange("edit_trace")}
          >
            <MousePointer2 className="size-3.5" />
            Edit trace
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isChangingHouse ? "secondary" : "ghost"}
            className={isChangingHouse ? "" : "text-slate-200 hover:bg-white/10 hover:text-white"}
            onClick={() => onEditorModeChange("change_house")}
            disabled={!canSelectTarget}
          >
            <MapPinned className="size-3.5" />
            Change house
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {isChangingHouse ? (
          <button
            type="button"
            className="relative h-full w-full overflow-hidden rounded-md border border-white/10 bg-slate-900 text-left disabled:cursor-not-allowed"
            onClick={handleTargetSurfaceClick}
            disabled={!canSelectTarget}
            aria-label="Select a different roof target from the satellite image"
          >
            {canUseSolarRasterTarget ? (
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${geometry.imageWidth} ${geometry.imageHeight}`}
                aria-hidden="true"
              >
                <image
                  href={solarRasterImageUrl ?? undefined}
                  width={geometry.imageWidth}
                  height={geometry.imageHeight}
                  preserveAspectRatio="none"
                />
              </svg>
            ) : satelliteImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={satelliteImageUrl}
                alt={`Satellite preview for ${snapshot.property.address}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-slate-800" />
            )}
            <div className="absolute inset-0 bg-slate-950/10" />
            {canSelectTarget ? (
              <div className="pointer-events-none absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(14,165,233,0.8),0_12px_28px_rgba(15,23,42,0.35)]">
                <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
              </div>
            ) : null}
            <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-black/65 px-3 py-2 text-xs leading-5 text-slate-100">
              {canSelectTarget
                ? canUseSolarRasterTarget
                  ? "Select the correct roof in this same trace view, then get a fresh snapshot."
                  : "Select the roof target here, then get a fresh snapshot."
                : "Satellite target unavailable for this address."}
            </div>
          </button>
        ) : (
          <svg
            className="h-full w-full rounded-md border border-white/10 bg-slate-900"
            viewBox={`0 0 ${geometry.imageWidth} ${geometry.imageHeight}`}
            role="img"
            aria-label="Editable roof geometry outline"
            onPointerMove={handlePointerMove}
            onPointerUp={() => setActivePoint(null)}
            onPointerLeave={() => setActivePoint(null)}
          >
            {editTraceBackgroundImageUrl ? (
              <image
                href={editTraceBackgroundImageUrl}
                width={geometry.imageWidth}
                height={geometry.imageHeight}
                preserveAspectRatio="none"
              />
            ) : (
              <rect width={geometry.imageWidth} height={geometry.imageHeight} className="fill-slate-800" />
            )}
            <rect width={geometry.imageWidth} height={geometry.imageHeight} className="fill-black/25" />
            {measurements.edgeRows.map((edge) => (
              <line
                key={edge.id}
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                className={getManualEdgeStrokeClass(edge.type)}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {geometry.facets.map((facet) => (
              <g key={facet.id}>
                <polygon
                  points={facet.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  className="fill-sky-300/20 stroke-white"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
                {facet.points.map((point, pointIndex) => (
                  <circle
                    key={`${facet.id}-${pointIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={Math.max(1.6, geometry.imageWidth * 0.012)}
                    className="cursor-move fill-white stroke-sky-600"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setActivePoint({ facetId: facet.id, pointIndex });
                    }}
                  />
                ))}
              </g>
            ))}
          </svg>
        )}
      </div>
      {!isChangingHouse ? (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
          <LegendItem className="bg-emerald-400" label="Eaves" />
          <LegendItem className="bg-amber-400" label="Rakes" />
          <LegendItem className="bg-purple-400" label="Hips" />
          <LegendItem className="bg-lime-400" label="Ridges" />
          <LegendItem className="bg-red-400" label="Valleys" />
        </div>
      ) : null}
    </div>
  );
}

function ManualGeometryMeasurementsPanel({
  measurements,
  editorMode,
  onApply,
  applied,
}: {
  measurements: ManualRoofMeasurements;
  editorMode: OutlineEditorMode;
  onApply: () => void;
  applied: boolean;
}) {
  const isChangingHouse = editorMode === "change_house";

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-950">Traced measurements</p>
          <Badge variant={applied && !isChangingHouse ? "default" : "secondary"}>
            {isChangingHouse ? "Target mode" : applied ? "Applied" : "Draft trace"}
          </Badge>
        </div>
        {isChangingHouse ? (
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Changing houses clears this trace before the next snapshot.
          </p>
        ) : null}
        <div className="mt-3 space-y-2 text-sm">
          <SummaryRow label="Area" value={`${measurements.areaSqft.toLocaleString()} sqft`} />
          <SummaryRow label="Squares" value={`${measurements.roofSquares.toFixed(1)} sq`} />
          <SummaryRow label="Eaves" value={formatFeetAndInches(measurements.lengthTotals.eavesFt)} />
          <SummaryRow label="Rakes" value={formatFeetAndInches(measurements.lengthTotals.rakesFt)} />
          <SummaryRow label="Hips" value={formatFeetAndInches(measurements.lengthTotals.hipsFt)} />
          <SummaryRow label="Ridges" value={formatFeetAndInches(measurements.lengthTotals.ridgesFt)} />
          <SummaryRow label="Valleys" value={formatFeetAndInches(measurements.lengthTotals.valleysFt)} />
        </div>
        <Button className="mt-4 w-full gap-2" onClick={onApply} disabled={isChangingHouse}>
          <ClipboardCheck className="size-4" />
          Apply Trace To Approval
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Edge</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Length</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {measurements.edgeRows.slice(0, 8).map((edge, index) => (
              <TableRow key={edge.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{edge.type}</TableCell>
                <TableCell className="text-right">{formatFeetAndInches(edge.lengthFt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-5 ${className}`} />
      {label}
    </span>
  );
}

function getManualEdgeStrokeClass(type: string) {
  const classes: Record<string, string> = {
    eave: "stroke-emerald-400",
    rake: "stroke-amber-400",
    hip: "stroke-purple-400",
    ridge: "stroke-lime-400",
    valley: "stroke-red-400",
    flashing: "stroke-cyan-400",
  };

  return classes[type] ?? "stroke-white";
}

function getSvgPointerPoint(event: React.PointerEvent<SVGSVGElement>, geometry: ManualRoofGeometry) {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * geometry.imageWidth,
    y: ((event.clientY - rect.top) / rect.height) * geometry.imageHeight,
  };
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950">{value}</span>
    </div>
  );
}

type FacetRow = {
  name: string;
  structure: string;
  assumption: string;
  squares: number;
  segment?: RoofSegmentMeasurement;
};

type LocalSnapshotOptions = {
  now?: string;
  propertyId?: string;
  draftId?: string;
};

function mergeSnapshots(nextSnapshots: WorkflowSnapshot[], currentSnapshots: WorkflowSnapshot[]) {
  const snapshotsById = new Map<string, WorkflowSnapshot>();

  [...nextSnapshots, ...currentSnapshots].forEach((snapshot) => {
    const existing = snapshotsById.get(snapshot.property.id);

    if (!existing || new Date(snapshot.property.updatedAt) >= new Date(existing.property.updatedAt)) {
      snapshotsById.set(snapshot.property.id, snapshot);
    }
  });

  return [...snapshotsById.values()].sort(
    (a, b) => new Date(b.property.updatedAt).getTime() - new Date(a.property.updatedAt).getTime(),
  );
}

function createLocalSnapshot(
  input: PropertyIntake,
  sourceReadiness: MeasurementSourceReadiness[],
  message = "Supabase server writes are not configured. Workflow is running in local demo mode.",
  options: LocalSnapshotOptions = {},
): WorkflowSnapshot {
  const now = options.now ?? new Date().toISOString();
  const draft = generateDraftMeasurement({
    address: input.address,
    includeGarage: input.includeGarage,
    includeShed: input.includeShed,
    mode: input.mode,
    notes: `${input.customerNotes}\n${input.jobNotes}`,
    sourceSignals: buildSourceSignalsFromPropertyMatch(input.propertyMatch ?? createTypedOnlyPropertyMatch(input.address)),
  });
  const propertyId = options.propertyId ?? `local-property-${crypto.randomUUID()}`;
  const draftId = options.draftId ?? `local-draft-${crypto.randomUUID()}`;
  const stableIdBase = options.propertyId ?? undefined;

  return {
    property: {
      ...input,
      propertyMatch: input.propertyMatch ?? createTypedOnlyPropertyMatch(input.address),
      id: propertyId,
      status: "needs_review",
      createdAt: now,
      updatedAt: now,
    },
    draft: {
      ...draft,
      id: draftId,
      propertyId,
      generatedAt: now,
    },
    sourceReadiness,
    auditEvents: [
      {
        id: stableIdBase ? `${stableIdBase}-audit-created` : `local-audit-${crypto.randomUUID()}`,
        propertyId,
        draftId,
        eventType: "property_created",
        actorName: "Owner",
        summary: `Property intake created for ${input.address}.`,
        createdAt: now,
      },
      {
        id: stableIdBase ? `${stableIdBase}-audit-draft` : `local-audit-${crypto.randomUUID()}`,
        propertyId,
        draftId,
        eventType: "draft_generated",
        actorName: "Address-only provider",
        summary: `Draft measurement generated at ${draft.roofSquares.toFixed(1)} squares.`,
        createdAt: now,
      },
    ],
    persisted: false,
    persistenceMessage: message,
  };
}

function formatAccuracyBand(band: { minPercent: number; maxPercent: number }) {
  if (band.minPercent === band.maxPercent) {
    return `+/- ${band.maxPercent}%`;
  }

  return `+/- ${band.minPercent}-${band.maxPercent}%`;
}

function formatFeetAndInches(value: number): string {
  const feet = Math.floor(value);
  const inches = Math.round((value - feet) * 12);

  if (inches === 12) {
    return `${feet + 1}ft 0in`;
  }

  return `${feet}ft ${inches}in`;
}

function formatTargetOffset(totalEastFeet: number, totalNorthFeet: number) {
  const parts = [];

  if (totalEastFeet !== 0) {
    parts.push(`${Math.abs(totalEastFeet).toFixed(0)} ft ${totalEastFeet > 0 ? "east" : "west"}`);
  }

  if (totalNorthFeet !== 0) {
    parts.push(`${Math.abs(totalNorthFeet).toFixed(0)} ft ${totalNorthFeet > 0 ? "north" : "south"}`);
  }

  return parts.length ? parts.join(", ") : "none";
}

function createLocalApprovalResult(input: ApprovalInput): {
  approval: WorkflowApproval;
  auditEvent: WorkflowAuditEvent;
  approvedSummary: string;
} {
  const now = new Date().toISOString();
  const approval: WorkflowApproval = {
    id: `local-approval-${crypto.randomUUID()}`,
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

  return {
    approval,
    approvedSummary,
    auditEvent: {
      id: `local-audit-${crypto.randomUUID()}`,
      propertyId: input.propertyId,
      draftId: input.draftId,
      approvalId: approval.id,
      eventType: "approved",
      actorName: approval.reviewerName,
      summary: formatLocalApprovalAuditSummary(input.approvedRoofSquares, input.correctionSummary),
      createdAt: now,
    },
  };
}

function createApprovalDraft(snapshot: WorkflowSnapshot) {
  if (snapshot.approval) {
    return {
      approvedRoofSquares: snapshot.approval.approvedRoofSquares,
      approvedPitchClass: snapshot.approval.approvedPitchClass,
      approvedWastePercent: snapshot.approval.approvedWastePercent,
      approvedComplexityClass: snapshot.approval.approvedComplexityClass,
      confidenceScore: snapshot.approval.confidenceScore,
      includedStructures: snapshot.approval.includedStructures,
      manualMeasurements: snapshot.approval.manualMeasurements,
      reviewerName: snapshot.approval.reviewerName,
      reviewerNotes: snapshot.approval.reviewerNotes,
    };
  }

  return {
    approvedRoofSquares: snapshot.draft.roofSquares,
    approvedPitchClass: snapshot.draft.pitchClass,
    approvedWastePercent: snapshot.draft.wastePercent,
    approvedComplexityClass: snapshot.draft.complexityClass,
    confidenceScore: Math.min(82, snapshot.draft.confidenceScore + 28),
    includedStructures: snapshot.draft.includedStructures,
    manualMeasurements: undefined,
    reviewerName: "Zach",
    reviewerNotes: "Reviewed draft assumptions and confirmed quote inputs.",
  };
}

function createManualGeometryForSnapshot(snapshot: WorkflowSnapshot) {
  return buildManualRoofGeometryForDraft({
    roofSquares: snapshot.draft.roofSquares,
    autoRoofOutline: snapshot.draft.autoRoofOutline,
  });
}

function formatLocalApprovalAuditSummary(approvedRoofSquares: number, correctionSummary: string[]) {
  const correctionLabel =
    correctionSummary.length && correctionSummary[0] !== "Reviewer kept the draft quote inputs."
      ? ` Corrections: ${correctionSummary.join(" ")}`
      : "";

  return `Approved quote inputs at ${approvedRoofSquares.toFixed(1)} squares.${correctionLabel}`;
}

function buildFacetRows(draft: WorkflowDraft): FacetRow[] {
  if (draft.roofSegments.length) {
    return draft.roofSegments.map((segment, index) => ({
      name: String.fromCharCode(65 + index),
      structure: "main roof",
      assumption: formatRoofSegmentAssumption(segment),
      squares: segment.squares,
      segment,
    }));
  }

  const rows = [
    { name: "A", structure: "main roof", assumption: "front plane", share: 0.36 },
    { name: "B", structure: "main roof", assumption: "rear plane", share: 0.34 },
    { name: "C", structure: "garage/addition", assumption: "included structure", share: 0.2 },
    { name: "D", structure: "small facets", assumption: "hips/valleys allowance", share: 0.1 },
  ];

  return rows.map((row) => ({
    ...row,
    squares: Math.round(draft.roofSquares * row.share * 10) / 10,
    segment: undefined,
  }));
}

function formatRoofSegmentAssumption(segment: RoofSegmentMeasurement) {
  const details = [];

  if (typeof segment.pitchDegrees === "number") {
    details.push(`${Math.round(segment.pitchDegrees)} deg pitch`);
  }

  if (typeof segment.azimuthDegrees === "number") {
    details.push(`${Math.round(segment.azimuthDegrees)} deg azimuth`);
  }

  return details.length ? details.join(", ") : "Google Solar segment";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
