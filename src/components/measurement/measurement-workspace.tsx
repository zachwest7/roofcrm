"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileDown,
  History,
  MapPinned,
  Search,
  Ruler,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { approveMeasurement, createPropertyWithDraft } from "@/app/actions";
import { generateDraftMeasurement, type ComplexityClass, type PitchClass } from "@/lib/measurements/draft-provider";
import {
  buildSourceSignalsFromPropertyMatch,
  createTypedOnlyPropertyMatch,
  type PropertyMatch,
} from "@/lib/measurements/property-match";
import type { MeasurementSourceReadiness } from "@/lib/measurements/source-stack";
import { formatApprovedMeasurementSummary } from "@/lib/measurements/summary";
import type {
  ApprovalInput,
  PropertyIntake,
  WorkflowApproval,
  WorkflowAuditEvent,
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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { AddressAutocompleteInput } from "./address-autocomplete-input";

const DEFAULT_INTAKE: PropertyIntake = {
  address: "123 Cypress Point Dr, Boca Raton, FL",
  customerNotes: "Homeowner asked for a pre-quote range before scheduling inspection.",
  jobNotes: "Original roof suspected. Check attached garage and rear flat section.",
  includeGarage: true,
  includeShed: false,
  mode: "pre_quote_screening",
  propertyMatch: createTypedOnlyPropertyMatch("123 Cypress Point Dr, Boca Raton, FL"),
};

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
    ),
  );
  const [approvalDraft, setApprovalDraft] = useState(() => createApprovalDraft(snapshot));
  const [isPending, startTransition] = useTransition();

  const facets = useMemo(() => buildFacetRows(snapshot.draft.roofSquares), [snapshot.draft.roofSquares]);
  const approved = Boolean(snapshot.approval);

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
      return;
    }

    startTransition(async () => {
      const nextSnapshot = await createPropertyWithDraft(intake);
      setSnapshot(nextSnapshot);
      setIntake(nextSnapshot.property);
      setApprovalDraft(createApprovalDraft(nextSnapshot));
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
      includedStructures: snapshot.draft.includedStructures,
      reviewerName: approvalDraft.reviewerName,
      reviewerNotes: approvalDraft.reviewerNotes,
    };

    if (!serverWritesEnabled) {
      const result = createLocalApprovalResult(payload);
      setSnapshot((current) => ({
        ...current,
        property: { ...current.property, status: "approved", updatedAt: result.approval.approvedAt },
        draft: { ...current.draft, status: "approved" },
        approval: result.approval,
        auditEvents: [...current.auditEvents, result.auditEvent],
        approvedSummary: result.approvedSummary,
        persisted: false,
        persistenceMessage: "Supabase server writes are not configured. Approval is shown as a local demo state.",
      }));
      return;
    }

    startTransition(async () => {
      const result = await approveMeasurement(payload);
      setSnapshot((current) => ({
        ...current,
        property: { ...current.property, status: "approved", updatedAt: result.approval.approvedAt },
        draft: { ...current.draft, status: "approved" },
        approval: result.approval,
        auditEvents: [...current.auditEvents, result.auditEvent],
        approvedSummary: result.approvedSummary,
        persisted: result.persisted,
        persistenceMessage: result.persistenceMessage,
      }));
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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_36%,#f7f7f5_100%)] text-foreground">
      <header className="border-b bg-white/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-900">
                <Building2 className="size-3.5" />
                Internal
              </Badge>
              <Badge variant={approved ? "default" : "secondary"} className="gap-1">
                {approved ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                {approved ? "Approved" : "Needs review"}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Database className="size-3.5" />
                {snapshot.persisted ? "Supabase saved" : serverWritesEnabled ? "Not saved" : "Demo state"}
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                Roof Measurement Assistant
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{snapshot.property.address}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[520px] sm:grid-cols-4">
            <Metric label="Draft" value={`${snapshot.draft.roofSquares.toFixed(1)} sq`} />
            <Metric label="Waste" value={`${snapshot.draft.wastePercent}%`} />
            <Metric label="Confidence" value={`${snapshot.draft.confidenceScore}%`} />
            <Metric label="Accuracy" value={formatAccuracyBand(snapshot.draft.accuracyBand)} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[380px_1fr] lg:px-8">
        <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="size-4 text-sky-700" />
              Property Intake
            </CardTitle>
            <CardDescription>Address, review mode, structures, and job notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Address">
              <AddressAutocompleteInput
                value={intake.address}
                onValueChange={handleAddressChange}
                onPlaceSelected={handlePlaceSelected}
              />
              <PropertyMatchPanel match={intake.propertyMatch} />
            </Field>

            <Field label="Mode">
              <Select value={intake.mode} onValueChange={(value) => updateIntake("mode", value as PropertyIntake["mode"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_quote_screening">Pre-Quote Screening</SelectItem>
                  <SelectItem value="quote_ready_review">Quote-Ready Review</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-3 rounded-lg border bg-slate-50 p-3">
              <SwitchRow
                label="Include attached garage"
                checked={intake.includeGarage}
                onCheckedChange={(value) => updateIntake("includeGarage", value)}
              />
              <SwitchRow
                label="Include detached shed"
                checked={intake.includeShed}
                onCheckedChange={(value) => updateIntake("includeShed", value)}
              />
            </div>

            <Field label="Customer notes">
              <Textarea
                value={intake.customerNotes}
                onChange={(event) => updateIntake("customerNotes", event.target.value)}
                rows={4}
              />
            </Field>

            <Field label="Job notes">
              <Textarea
                value={intake.jobNotes}
                onChange={(event) => updateIntake("jobNotes", event.target.value)}
                rows={5}
              />
            </Field>

            <Button className="w-full gap-2" onClick={handleGenerateDraft} disabled={isPending}>
              <Send className="size-4" />
              {isPending ? "Working" : "Generate Draft"}
            </Button>

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
              {snapshot.persistenceMessage}
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="review" className="min-w-0">
          <TabsList className="grid w-full grid-cols-3 bg-white">
            <TabsTrigger value="review" className="gap-2">
              <Ruler className="size-4" />
              Review
            </TabsTrigger>
            <TabsTrigger value="approval" className="gap-2">
              <ClipboardCheck className="size-4" />
              Approval
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="size-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPinned className="size-4 text-sky-700" />
                    Evidence Packet
                  </CardTitle>
                  <CardDescription>
                    Provider data, assumptions, source confidence, and rough facet split.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1fr_300px]">
                  <div className="overflow-hidden rounded-lg border bg-slate-950 p-4 text-white">
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
                      <span>Address-only map placeholder</span>
                      <span>{snapshot.draft.provider}</span>
                    </div>
                    <div className="relative h-72 rounded-md bg-[linear-gradient(135deg,#1e293b_25%,#334155_25%,#334155_50%,#1e293b_50%,#1e293b_75%,#334155_75%,#334155_100%)] bg-[length:32px_32px]">
                      <div className="absolute left-[18%] top-[24%] h-24 w-44 rotate-[-8deg] rounded border border-sky-200/70 bg-sky-400/20" />
                      <div className="absolute left-[34%] top-[37%] h-28 w-52 rotate-[11deg] rounded border border-lime-200/70 bg-lime-400/20" />
                      <div className="absolute left-[52%] top-[22%] h-20 w-28 rotate-[18deg] rounded border border-amber-200/70 bg-amber-400/20" />
                      <div className="absolute bottom-4 left-4 rounded bg-black/40 px-2 py-1 text-xs text-slate-200">
                        Facets require visual confirmation
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-950">Source quality</p>
                        <Badge variant="outline">{snapshot.draft.sourceStackQuality.replaceAll("_", " ")}</Badge>
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-slate-600">
                        <SummaryRow label="Expected error" value={formatAccuracyBand(snapshot.draft.accuracyBand)} />
                        <SummaryRow
                          label="Source spread"
                          value={
                            typeof snapshot.draft.sourceDisagreementPercent === "number"
                              ? `${snapshot.draft.sourceDisagreementPercent.toFixed(1)}%`
                              : "No cross-check"
                          }
                        />
                      </div>
                    </div>

                    {snapshot.draft.evidence.map((item) => (
                      <div key={item.label} className="rounded-lg border bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-950">{item.label}</p>
                          <Badge variant="outline">
                            {item.confidenceImpact > 0 ? "+" : ""}
                            {item.confidenceImpact}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Database className="size-4 text-sky-700" />
                      Source Stack
                    </CardTitle>
                    <CardDescription>Configured data providers and public fallbacks.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                        {source.expectedAccuracyBand ? (
                          <div className="mt-2 text-xs font-medium text-slate-700">
                            {formatAccuracyBand(source.expectedAccuracyBand)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="size-4 text-amber-600" />
                      Risk Flags
                    </CardTitle>
                    <CardDescription>Items blocking no-review quote inputs.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {snapshot.draft.riskFlags.map((flag) => (
                      <div key={flag.code} className="rounded-lg border bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{flag.label}</p>
                          <SeverityBadge severity={flag.severity} />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{flag.detail}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ruler className="size-4 text-sky-700" />
                  Draft Measurement
                </CardTitle>
                <CardDescription>Surface area split before manager correction.</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approval" className="mt-4">
            <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-emerald-700" />
                  Approval Panel
                </CardTitle>
                <CardDescription>Approved quote inputs stored separately from the draft.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[1fr_320px]">
                <div className="grid gap-4 sm:grid-cols-2">
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
                  <div className="space-y-3 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label>Confidence</Label>
                      <span className="text-sm font-medium">{approvalDraft.confidenceScore}%</span>
                    </div>
                    <Slider
                      value={[approvalDraft.confidenceScore]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([value]) => setApprovalDraft((current) => ({ ...current, confidenceScore: value }))}
                    />
                  </div>
                  <Field label="Reviewer">
                    <Input
                      value={approvalDraft.reviewerName}
                      onChange={(event) => setApprovalDraft((current) => ({ ...current, reviewerName: event.target.value }))}
                    />
                  </Field>
                  <Field label="Included structures">
                    <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                      {snapshot.draft.includedStructures.map((structure) => (
                        <Badge key={structure} variant="secondary">
                          {structure}
                        </Badge>
                      ))}
                    </div>
                  </Field>
                  <Field label="Reviewer notes" className="sm:col-span-2">
                    <Textarea
                      rows={5}
                      value={approvalDraft.reviewerNotes}
                      onChange={(event) =>
                        setApprovalDraft((current) => ({ ...current, reviewerNotes: event.target.value }))
                      }
                    />
                  </Field>
                </div>

                <div className="rounded-lg border bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ClipboardCheck className="size-4 text-emerald-700" />
                    Quote Inputs
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-3 text-sm">
                    <SummaryRow label="Roof area" value={`${approvalDraft.approvedRoofSquares.toFixed(1)} squares`} />
                    <SummaryRow label="Pitch" value={approvalDraft.approvedPitchClass} />
                    <SummaryRow label="Waste" value={`${approvalDraft.approvedWastePercent}%`} />
                    <SummaryRow label="Complexity" value={approvalDraft.approvedComplexityClass} />
                    <SummaryRow label="Confidence" value={`${approvalDraft.confidenceScore}%`} />
                  </div>
                  <Button className="mt-5 w-full gap-2" onClick={handleApprove} disabled={isPending}>
                    <Save className="size-4" />
                    {approved ? "Update Approval" : "Approve Inputs"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-4">
            <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="size-4 text-sky-700" />
                  Audit Trail
                </CardTitle>
                <CardDescription>Source data, manual edits, and approval events.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Summary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.auditEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="whitespace-nowrap">{formatDate(event.createdAt)}</TableCell>
                          <TableCell>{event.eventType.replaceAll("_", " ")}</TableCell>
                          <TableCell>{event.actorName}</TableCell>
                          <TableCell>{event.summary}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileDown className="size-4 text-emerald-700" />
                  Approved Summary
                </CardTitle>
                <CardDescription>Export-ready measurement text.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  readOnly
                  rows={snapshot.approvedSummary ? 10 : 4}
                  value={snapshot.approvedSummary ?? "No approved measurement summary yet."}
                  className="font-mono text-xs"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950">{value}</span>
    </div>
  );
}

function createLocalSnapshot(
  input: PropertyIntake,
  sourceReadiness: MeasurementSourceReadiness[],
  message = "Supabase server writes are not configured. Workflow is running in local demo mode.",
): WorkflowSnapshot {
  const now = new Date().toISOString();
  const draft = generateDraftMeasurement({
    address: input.address,
    includeGarage: input.includeGarage,
    includeShed: input.includeShed,
    mode: input.mode,
    notes: `${input.customerNotes}\n${input.jobNotes}`,
    sourceSignals: buildSourceSignalsFromPropertyMatch(input.propertyMatch ?? createTypedOnlyPropertyMatch(input.address)),
  });
  const propertyId = `local-property-${crypto.randomUUID()}`;
  const draftId = `local-draft-${crypto.randomUUID()}`;

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
        id: `local-audit-${crypto.randomUUID()}`,
        propertyId,
        draftId,
        eventType: "property_created",
        actorName: "Owner",
        summary: `Property intake created for ${input.address}.`,
        createdAt: now,
      },
      {
        id: `local-audit-${crypto.randomUUID()}`,
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
      summary: `Approved quote inputs at ${input.approvedRoofSquares.toFixed(1)} squares.`,
      createdAt: now,
    },
  };
}

function createApprovalDraft(snapshot: WorkflowSnapshot) {
  return {
    approvedRoofSquares: snapshot.draft.roofSquares,
    approvedPitchClass: snapshot.draft.pitchClass,
    approvedWastePercent: snapshot.draft.wastePercent,
    approvedComplexityClass: snapshot.draft.complexityClass,
    confidenceScore: Math.min(82, snapshot.draft.confidenceScore + 28),
    reviewerName: "Zach",
    reviewerNotes: "Reviewed draft assumptions and confirmed quote inputs.",
  };
}

function buildFacetRows(totalSquares: number) {
  const rows = [
    { name: "A", structure: "main roof", assumption: "front plane", share: 0.36 },
    { name: "B", structure: "main roof", assumption: "rear plane", share: 0.34 },
    { name: "C", structure: "garage/addition", assumption: "included structure", share: 0.2 },
    { name: "D", structure: "small facets", assumption: "hips/valleys allowance", share: 0.1 },
  ];

  return rows.map((row) => ({
    ...row,
    squares: Math.round(totalSquares * row.share * 10) / 10,
  }));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
