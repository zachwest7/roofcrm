"use client";

import { FileText, Printer } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildMeasurementReport,
  formatFeetAndInches,
  type MaterialEstimateSection,
  type MeasurementLengthTotals,
  type MeasurementReport,
  type MeasurementReportFacet,
} from "@/lib/measurements/report";
import {
  buildGoogleSatelliteRoofPreviewUrl,
} from "@/lib/measurements/roof-preview-url";
import type { ComplexityClass, PitchClass } from "@/lib/measurements/draft-provider";
import type { WorkflowSnapshot } from "@/lib/workflow/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const googleSatellitePreviewKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();

export type MeasurementReportApprovalDraft = {
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  reviewerName: string;
  reviewerNotes: string;
};

export function MeasurementReportView({
  snapshot,
  approvalDraft,
}: {
  snapshot: WorkflowSnapshot;
  approvalDraft: MeasurementReportApprovalDraft;
}) {
  const approvedOrDraft = snapshot.approval ?? approvalDraft;
  const report = useMemo(
    () =>
      buildMeasurementReport({
        propertyAddress: snapshot.property.address,
        customerNotes: snapshot.property.customerNotes,
        jobNotes: snapshot.property.jobNotes,
        reviewerName: approvedOrDraft.reviewerName,
        reviewerNotes: approvedOrDraft.reviewerNotes,
        approvedRoofSquares: approvedOrDraft.approvedRoofSquares,
        approvedPitchClass: approvedOrDraft.approvedPitchClass,
        approvedWastePercent: approvedOrDraft.approvedWastePercent,
        approvedComplexityClass: approvedOrDraft.approvedComplexityClass,
        confidenceScore: approvedOrDraft.confidenceScore,
        includedStructures: snapshot.draft.includedStructures,
        sourceStackQuality: snapshot.draft.sourceStackQuality,
        accuracyBand: snapshot.draft.accuracyBand,
        roofSegments: snapshot.draft.roofSegments,
        autoRoofOutline: snapshot.draft.autoRoofOutline,
        generatedAt: snapshot.approval?.approvedAt ?? snapshot.draft.generatedAt,
      }),
    [approvedOrDraft, snapshot],
  );
  const satelliteImageUrl = useMemo(
    () =>
      buildGoogleSatelliteRoofPreviewUrl({
        apiKey: googleSatellitePreviewKey,
        propertyMatch: snapshot.property.propertyMatch,
        fallbackAddress: snapshot.property.address,
      }),
    [snapshot.property.address, snapshot.property.propertyMatch],
  );
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const hasSatelliteImage = Boolean(satelliteImageUrl && failedImageUrl !== satelliteImageUrl);

  return (
    <div className="space-y-4">
      <div className="measurement-report-controls flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700">
            <FileText className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-950">Printable report output</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Seven-page measurement packet with summary, diagrams, waste scenarios, and material quantities.
            </p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="measurement-report-print space-y-4">
        <ReportPage report={report} pageNumber={1}>
          <CoverPage
            report={report}
            imageUrl={hasSatelliteImage ? satelliteImageUrl : null}
            onImageError={setFailedImageUrl}
          />
        </ReportPage>

        <ReportPage report={report} pageNumber={2} title="Diagram">
          <div className="mt-8 flex min-h-[430px] items-center justify-center">
            <RoofReportDiagram report={report} variant="area" />
          </div>
          <SourceLedger report={report} />
          <ReportNote>
            Roof facets and auto outline polygons are tracked separately. The outline is an image-mask proposal; it is
            not a confirmed facet takeoff until reviewed.
          </ReportNote>
        </ReportPage>

        <ReportPage report={report} pageNumber={3} title="Length Measurement Report">
          <LengthLegend measurements={report.measurements} />
          <div className="mt-12 flex min-h-[520px] items-center justify-center">
            <RoofReportDiagram report={report} variant="length" />
          </div>
          <ReportNote>
            The diagram contains rounded measurements for quoting review. Some edge length totals may be hidden when
            they would crowd the drawing.
          </ReportNote>
        </ReportPage>

        <ReportPage report={report} pageNumber={4} title="Area Measurement Report">
          <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
            <div className="flex min-h-[590px] items-center justify-center">
              <RoofReportDiagram report={report} variant="area" />
            </div>
            <MetricList
              title="Area"
              rows={getAreaMetricRows(report)}
            />
          </div>
          <FacetTable report={report} />
        </ReportPage>

        <ReportPage report={report} pageNumber={5} title="Pitch & Direction Measurement Report">
          <div className="mt-8 flex min-h-[610px] items-center justify-center">
            <RoofReportDiagram report={report} variant="pitch" />
          </div>
          <SimpleTable
            headers={["Pitch", "Area (sqft)", "Squares"]}
            rows={report.pitchRows.map((row) => [
              formatPitch(row.pitch),
              row.areaSqft.toLocaleString(),
              row.squares.toFixed(1),
            ])}
          />
          <ReportNote>
            Pitch labels are generated from approved manager inputs unless provider segment pitch is available.
          </ReportNote>
        </ReportPage>

        <ReportPage report={report} pageNumber={6} title="All Structures Summary">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="flex min-h-[420px] items-center justify-center">
              <RoofReportDiagram report={report} variant="summary" />
            </div>
            <MetricList
              title="Measurements"
              rows={getSummaryMetricRows(report)}
            />
          </div>
          <WasteTable report={report} />
          <ReportNote>
            Waste percentages include roof complexity, roof size, and approved review assumptions. These values are
            planning estimates and should be checked before ordering.
          </ReportNote>
        </ReportPage>

        <ReportPage report={report} pageNumber={7} title="Material Estimate">
          <MaterialEstimateTable report={report} />
          <ReportNote>
            Material quantities are approximations derived from reviewed measurements. Confirm manufacturer coverage,
            product rules, laps, and final field conditions before purchase.
          </ReportNote>
        </ReportPage>
      </div>
    </div>
  );
}

function ReportPage({
  report,
  pageNumber,
  title,
  children,
}: {
  report: MeasurementReport;
  pageNumber: number;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="measurement-report-page mx-auto min-h-[1056px] w-full max-w-[816px] rounded-lg border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div>
          {title ? <h2 className="text-3xl font-medium text-sky-600">{title}</h2> : null}
          {title ? <p className="mt-2 text-sm text-slate-700">{report.cover.propertyAddress}</p> : null}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <span>Prepared by</span>
          <span className="rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white">RMA</span>
        </div>
      </div>
      <div className={title ? "mt-6" : ""}>{children}</div>
      <div className="mt-8 flex items-center justify-between border-t pt-3 text-xs text-slate-500">
        <span>Prepared by Roof Measurement Assistant. Internal quote review packet.</span>
        <span>{pageNumber}</span>
      </div>
    </section>
  );
}

function CoverPage({
  report,
  imageUrl,
  onImageError,
}: {
  report: MeasurementReport;
  imageUrl: string | null;
  onImageError: (url: string) => void;
}) {
  return (
    <div className="space-y-10">
      <div className="flex justify-center">
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-600 text-lg font-semibold text-white">
            RMA
          </div>
          <div className="text-5xl font-semibold text-slate-800">Roof Report</div>
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-[1fr_220px]">
        <div>
          <h1 className="text-5xl font-light text-sky-600">{report.cover.title}</h1>
          <p className="mt-3 text-lg text-slate-700">Prepared by Roof Measurement Assistant</p>
          <div className="mt-9 space-y-2 text-lg leading-7 text-slate-800">
            <p>{report.cover.propertyAddress}</p>
            <p>Reviewer: {report.reviewer.name}</p>
            <p>Generated: {report.cover.generatedAtLabel}</p>
          </div>
        </div>

        <div className="space-y-3 pt-20 text-right text-lg font-semibold text-slate-800">
          <p>{report.cover.totalRoofAreaSqft.toLocaleString()} sqft</p>
          <p>{formatCount(report.cover.totalFacets, "facet")}</p>
          {report.cover.autoOutlinePolygons ? (
            <p className="text-sm font-medium text-slate-600">
              {formatCount(report.cover.autoOutlinePolygons, "outline polygon")}
            </p>
          ) : null}
          <p>Predominant Pitch {formatPitch(report.cover.predominantPitch)}</p>
          <p>{report.cover.confidenceScore}% confidence</p>
        </div>
      </div>

      <div className="relative mx-auto aspect-[32/21] w-full max-w-[620px] overflow-hidden rounded-md border bg-slate-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`Satellite roof preview for ${report.cover.propertyAddress}`}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            onError={() => onImageError(imageUrl)}
          />
        ) : null}
        <div className="absolute inset-0 z-10 bg-slate-950/10" />
        <div className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded bg-black/65 px-2.5 py-1.5 text-xs leading-5 text-white">
          Satellite preview only. Measurement diagrams appear on the following report pages.
        </div>
      </div>
    </div>
  );
}

function LengthLegend({ measurements }: { measurements: MeasurementLengthTotals }) {
  const rows = [
    ["Eaves", measurements.eavesFt, "bg-emerald-500"],
    ["Valleys", measurements.valleysFt, "bg-red-500"],
    ["Hips", measurements.hipsFt, "bg-purple-500"],
    ["Ridges", measurements.ridgesFt, "bg-lime-400"],
    ["Rakes", measurements.rakesFt, "bg-amber-400"],
    ["Wall Flashing", measurements.wallFlashingFt, "bg-sky-400"],
    ["Step Flashing", measurements.stepFlashingFt, "bg-orange-700"],
    ["Transitions", measurements.transitionsFt, "bg-fuchsia-400"],
    ["Unspecified", measurements.unspecifiedFt, "bg-cyan-400"],
  ];

  return (
    <div className="grid gap-x-10 gap-y-3 sm:grid-cols-3">
      {rows.map(([label, value, colorClass]) => (
        <div key={label as string} className="flex items-center gap-4 text-lg text-slate-800">
          <span className={`h-1.5 w-5 ${colorClass}`} />
          <span>
            {label} {formatFeetAndInches(value as number)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RoofReportDiagram({
  report,
  variant,
  compact = false,
}: {
  report: MeasurementReport;
  variant: "area" | "cover" | "length" | "pitch" | "summary";
  compact?: boolean;
}) {
  const labelFill = variant === "cover" ? "fill-white" : "fill-slate-800";
  const shapeFill = variant === "cover" ? "fill-sky-400/30" : "fill-sky-100";
  const stroke = variant === "cover" ? "stroke-white" : "stroke-sky-500";
  const textSize = compact ? "text-[5px]" : "text-[4px]";
  const hasSegmentBoxes = report.facetRows.some((facet) => facet.boundingBox);

  if (report.autoRoofOutline) {
    return <AutoRoofOutlineDiagram report={report} variant={variant} />;
  }

  if (hasSegmentBoxes) {
    return (
      <SegmentBoxDiagram
        report={report}
        labelFill={labelFill}
        shapeFill={shapeFill}
        stroke={stroke}
        textSize={textSize}
      />
    );
  }

  return (
    <svg className="h-full min-h-[360px] w-full max-w-[640px]" viewBox="0 0 120 90" role="img" aria-label="Roof measurement diagram">
      <g className={`${shapeFill} ${stroke} stroke-[0.8]`} vectorEffect="non-scaling-stroke">
        <polygon points="12,28 33,28 45,18 59,28 78,28 95,45 78,62 59,62 45,72 33,62 12,62" />
        <polygon points="78,28 108,28 108,73 88,73 88,55 95,45" />
        <polygon points="33,28 43,18 51,28 42,37" />
        <polygon points="33,62 42,53 51,62 42,73" />
        <polygon points="50,62 59,52 68,62 59,73" />
        <polygon points="52,28 60,39 68,28" />
      </g>

      {variant === "length" ? <LengthLines /> : null}
      {variant === "pitch" ? <PitchLabels report={report} /> : null}
      {variant === "area" || variant === "summary" || variant === "cover" ? (
        <AreaLabels report={report} labelFill={labelFill} textSize={textSize} />
      ) : null}
    </svg>
  );
}

function AutoRoofOutlineDiagram({
  report,
  variant,
}: {
  report: MeasurementReport;
  variant: "area" | "cover" | "length" | "pitch" | "summary";
}) {
  const outline = report.autoRoofOutline;

  if (!outline) {
    return null;
  }

  return (
    <svg
      className="h-full min-h-[360px] w-full max-w-[640px]"
      viewBox={`0 0 ${outline.imageWidth} ${outline.imageHeight}`}
      role="img"
      aria-label="Auto roof outline diagram"
    >
      <rect width={outline.imageWidth} height={outline.imageHeight} className="fill-slate-50" />
      {outline.polygons.map((polygon) => (
        <g key={polygon.id}>
          <polygon
            points={polygon.points.map((point) => `${point.x},${point.y}`).join(" ")}
            className="fill-sky-100 stroke-sky-600 stroke-[1.5]"
            vectorEffect="non-scaling-stroke"
          />
          {variant === "length" ? (
            <polyline
              points={polygon.points.map((point) => `${point.x},${point.y}`).join(" ")}
              className="fill-none stroke-emerald-500 stroke-[2]"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <text
            x={getPolygonCentroid(polygon.points).x}
            y={getPolygonCentroid(polygon.points).y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-900 text-[4px] font-semibold"
          >
            {variant === "pitch" ? formatPitch(report.cover.predominantPitch) : `${report.cover.totalRoofAreaSqft.toLocaleString()} sqft`}
          </text>
        </g>
      ))}
      <text x="3" y={outline.imageHeight - 4} className="fill-slate-500 text-[3px]">
        Auto outline proposal from Google Solar roof mask. Review required.
      </text>
    </svg>
  );
}

function SegmentBoxDiagram({
  report,
  labelFill,
  shapeFill,
  stroke,
  textSize,
}: {
  report: MeasurementReport;
  labelFill: string;
  shapeFill: string;
  stroke: string;
  textSize: string;
}) {
  const boxes = getSegmentBoxShapes(report.facetRows);

  return (
    <svg className="h-full min-h-[360px] w-full max-w-[640px]" viewBox="0 0 100 100" role="img" aria-label="Roof measurement diagram">
      <g className={`${shapeFill} ${stroke} stroke-[0.9]`} vectorEffect="non-scaling-stroke">
        {boxes.map((box) => (
          <rect key={box.label} x={box.x} y={box.y} width={box.width} height={box.height} rx="1.5" />
        ))}
      </g>
      <g className={`${labelFill} ${textSize} font-semibold`} textAnchor="middle" dominantBaseline="middle">
        {boxes.map((box) => (
          <text key={`${box.label}-label`} x={box.labelX} y={box.labelY}>
            {box.label} {box.areaSqft.toLocaleString()}
          </text>
        ))}
      </g>
    </svg>
  );
}

function getSegmentBoxShapes(facets: MeasurementReportFacet[]) {
  const boxes = facets
    .map((facet) => facet.boundingBox)
    .filter((box): box is NonNullable<MeasurementReportFacet["boundingBox"]> => Boolean(box));

  if (!boxes.length) {
    return [];
  }

  const bounds = boxes.reduce(
    (current, box) => ({
      minLatitude: Math.min(current.minLatitude, box.sw.latitude),
      maxLatitude: Math.max(current.maxLatitude, box.ne.latitude),
      minLongitude: Math.min(current.minLongitude, box.sw.longitude),
      maxLongitude: Math.max(current.maxLongitude, box.ne.longitude),
    }),
    {
      minLatitude: boxes[0].sw.latitude,
      maxLatitude: boxes[0].ne.latitude,
      minLongitude: boxes[0].sw.longitude,
      maxLongitude: boxes[0].ne.longitude,
    },
  );

  return facets
    .filter((facet): facet is MeasurementReportFacet & { boundingBox: NonNullable<MeasurementReportFacet["boundingBox"]> } =>
      Boolean(facet.boundingBox),
    )
    .map((facet) => {
      const left = mapLongitudeToDiagramX(facet.boundingBox.sw.longitude, bounds);
      const right = mapLongitudeToDiagramX(facet.boundingBox.ne.longitude, bounds);
      const top = mapLatitudeToDiagramY(facet.boundingBox.ne.latitude, bounds);
      const bottom = mapLatitudeToDiagramY(facet.boundingBox.sw.latitude, bounds);
      const x = Math.min(left, right);
      const y = Math.min(top, bottom);
      const width = Math.max(8, Math.abs(right - left));
      const height = Math.max(8, Math.abs(bottom - top));

      return {
        label: facet.label,
        areaSqft: facet.areaSqft,
        x,
        y,
        width,
        height,
        labelX: x + width / 2,
        labelY: y + height / 2,
      };
    });
}

function mapLongitudeToDiagramX(
  longitude: number,
  bounds: { minLongitude: number; maxLongitude: number },
) {
  const span = bounds.maxLongitude - bounds.minLongitude || 1;

  return Math.round((12 + ((longitude - bounds.minLongitude) / span) * 76) * 10) / 10;
}

function mapLatitudeToDiagramY(latitude: number, bounds: { minLatitude: number; maxLatitude: number }) {
  const span = bounds.maxLatitude - bounds.minLatitude || 1;

  return Math.round((88 - ((latitude - bounds.minLatitude) / span) * 76) * 10) / 10;
}

function getPolygonCentroid(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return { x: 0, y: 0 };
  }

  const totals = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
  };
}

function LengthLines() {
  return (
    <g className="fill-slate-800 text-[3.5px]">
      <polyline points="12,28 33,28 45,18 59,28 78,28" className="fill-none stroke-emerald-500 stroke-[1.1]" />
      <polyline points="78,28 95,45 78,62" className="fill-none stroke-red-500 stroke-[1.1]" />
      <polyline points="33,28 42,37 33,62" className="fill-none stroke-purple-500 stroke-[1.1]" />
      <polyline points="33,62 42,53 51,62" className="fill-none stroke-amber-400 stroke-[1.1]" />
      <line x1="45" x2="78" y1="18" y2="62" className="stroke-lime-400 stroke-[1]" />
      <line x1="88" x2="108" y1="73" y2="73" className="stroke-emerald-500 stroke-[1.1]" />
      <text x="23" y="26">18</text>
      <text x="47" y="20">20</text>
      <text x="83" y="37">24</text>
      <text x="40" y="45">16</text>
      <text x="43" y="60">14</text>
      <text x="62" y="42">22</text>
      <text x="95" y="77">21</text>
    </g>
  );
}

function AreaLabels({
  report,
  labelFill,
  textSize,
}: {
  report: MeasurementReport;
  labelFill: string;
  textSize: string;
}) {
  const positions = [
    [33, 44],
    [68, 44],
    [92, 50],
    [42, 67],
    [58, 67],
    [51, 31],
  ];

  return (
    <g className={`${labelFill} ${textSize} font-semibold`} textAnchor="middle" dominantBaseline="middle">
      {report.facetRows.slice(0, positions.length).map((facet, index) => {
        const [x, y] = positions[index];

        return (
          <text key={facet.label} x={x} y={y}>
            {facet.label} {facet.areaSqft.toLocaleString()}
          </text>
        );
      })}
    </g>
  );
}

function PitchLabels({ report }: { report: MeasurementReport }) {
  const positions = [
    [28, 44],
    [65, 44],
    [91, 51],
    [42, 67],
    [58, 68],
  ];

  return (
    <g className="fill-slate-800 text-[4px] font-semibold" textAnchor="middle" dominantBaseline="middle">
      {positions.map(([x, y], index) => (
        <text key={`${x}-${y}`} x={x} y={y}>
          {report.facetRows[index]?.pitchLabel ?? formatPitch(report.cover.predominantPitch)}
        </text>
      ))}
    </g>
  );
}

function MetricList({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-sm border border-slate-100">
      <div className="bg-slate-100 px-5 py-3 text-xl font-medium text-sky-600">{title}</div>
      <div className="space-y-4 p-5 text-lg">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-5">
            <span className="text-slate-700">{label}</span>
            <span className="text-right font-medium text-slate-900">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacetTable({ report }: { report: MeasurementReport }) {
  return (
    <div className="mt-6">
      <SimpleTable
        headers={["Facet", "Structure", "Pitch", "Area (sqft)", "Squares"]}
        rows={report.facetRows.map((facet) => [
          facet.label,
          facet.structure,
          facet.pitchLabel,
          facet.areaSqft.toLocaleString(),
          facet.squares.toFixed(1),
        ])}
      />
    </div>
  );
}

function SourceLedger({ report }: { report: MeasurementReport }) {
  return (
    <div className="mt-8 overflow-hidden rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100 hover:bg-slate-100">
            <TableHead className="w-[150px] text-sky-600">Measurement</TableHead>
            <TableHead className="w-[140px] text-sky-600">Value</TableHead>
            <TableHead className="w-[150px] text-sky-600">Status</TableHead>
            <TableHead className="text-sky-600">Source / note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.sourceRows.map((row) => (
            <TableRow key={`${row.label}-${row.value}`}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell>{row.value}</TableCell>
              <TableCell>
                <Badge variant={row.status === "review_input" ? "default" : "secondary"}>
                  {formatSourceStatus(row.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="font-medium text-slate-800">{row.source}</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">{row.detail}</div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WasteTable({ report }: { report: MeasurementReport }) {
  return (
    <div className="mt-8 overflow-hidden rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100 hover:bg-slate-100">
            <TableHead className="text-sky-600">Waste %</TableHead>
            {report.wasteScenarios.map((scenario) => (
              <TableHead key={scenario.percent} className="text-center text-sky-600">
                <div className="flex flex-col items-center gap-1">
                  {scenario.isRecommended ? <Badge variant="secondary">Recommended</Badge> : null}
                  <span>{scenario.percent}%</span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">Area (sqft)</TableCell>
            {report.wasteScenarios.map((scenario) => (
              <TableCell key={scenario.percent} className="text-center">
                {scenario.areaSqft.toLocaleString()}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Squares</TableCell>
            {report.wasteScenarios.map((scenario) => (
              <TableCell key={scenario.percent} className="text-center">
                {scenario.squares.toFixed(1)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function MaterialEstimateTable({ report }: { report: MeasurementReport }) {
  return (
    <div className="overflow-hidden rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100 hover:bg-slate-100">
            <TableHead className="w-[260px] text-sky-600">Product</TableHead>
            <TableHead className="text-sky-600">Unit</TableHead>
            {report.wasteScenarios.slice(0, 4).map((scenario) => (
              <TableHead key={scenario.percent} className="text-right text-sky-600">
                Waste ({scenario.percent}%)
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.materialSections.map((section) => (
            <MaterialSectionRows key={section.title} section={section} report={report} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MaterialSectionRows({
  section,
  report,
}: {
  section: MaterialEstimateSection;
  report: MeasurementReport;
}) {
  return (
    <>
      <TableRow className="bg-slate-50 hover:bg-slate-50">
        <TableCell colSpan={6} className="font-semibold text-slate-800">
          {section.title}
        </TableCell>
      </TableRow>
      {section.rows.map((row) => (
        <TableRow key={`${section.title}-${row.product}`} className={row.isGroup ? "bg-slate-50/70 hover:bg-slate-50/70" : ""}>
          <TableCell className={row.isGroup ? "font-medium" : ""}>{row.product}</TableCell>
          <TableCell>{row.unit}</TableCell>
          {report.wasteScenarios.slice(0, 4).map((scenario) => (
            <TableCell key={scenario.percent} className="text-right">
              {row.quantities[scenario.percent]}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function getAreaMetricRows(report: MeasurementReport): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Total Roof Area", `${report.cover.totalRoofAreaSqft.toLocaleString()} sqft`],
    ["Pitched Roof Area", `${report.cover.totalRoofAreaSqft.toLocaleString()} sqft`],
    ["Flat Roof Area", "0 sqft"],
    ["Roof Facets", formatCount(report.cover.totalFacets, "facet")],
  ];

  if (report.cover.autoOutlinePolygons) {
    rows.push(["Auto Outline", formatCount(report.cover.autoOutlinePolygons, "polygon")]);
  }

  rows.push(
    ["Predominant Pitch", formatPitch(report.cover.predominantPitch)],
    ["Confidence", `${report.cover.confidenceScore}%`],
  );

  return rows;
}

function getSummaryMetricRows(report: MeasurementReport): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Total Roof Area", `${report.cover.totalRoofAreaSqft.toLocaleString()} sqft`],
    ["Total Roof Facets", formatCount(report.cover.totalFacets, "facet")],
  ];

  if (report.cover.autoOutlinePolygons) {
    rows.push(["Auto Outline", formatCount(report.cover.autoOutlinePolygons, "polygon")]);
  }

  rows.push(
    ["Predominant Pitch", formatPitch(report.cover.predominantPitch)],
    ["Total Eaves", formatFeetAndInches(report.measurements.eavesFt)],
    ["Total Valleys", formatFeetAndInches(report.measurements.valleysFt)],
    ["Total Hips", formatFeetAndInches(report.measurements.hipsFt)],
    ["Total Ridges", formatFeetAndInches(report.measurements.ridgesFt)],
    ["Total Rakes", formatFeetAndInches(report.measurements.rakesFt)],
    ["Wall Flashing", formatFeetAndInches(report.measurements.wallFlashingFt)],
    ["Step Flashing", formatFeetAndInches(report.measurements.stepFlashingFt)],
    ["Hips + Ridges", formatFeetAndInches(report.measurements.hipsAndRidgesFt)],
    ["Eaves + Rakes", formatFeetAndInches(report.measurements.eavesAndRakesFt)],
  );

  return rows;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100 hover:bg-slate-100">
            {headers.map((header) => (
              <TableHead key={header} className="text-sky-600">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.join("-")}>
              {row.map((cell, index) => (
                <TableCell key={`${cell}-${index}`}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReportNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 text-sm leading-6 text-slate-600">{children}</p>;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatSourceStatus(status: MeasurementReport["sourceRows"][number]["status"]) {
  const labels: Record<MeasurementReport["sourceRows"][number]["status"], string> = {
    review_input: "Review input",
    provider_estimate: "Provider estimate",
    proposed: "Proposed",
    heuristic: "Heuristic",
  };

  return labels[status];
}

function formatPitch(pitch: PitchClass) {
  const labels: Record<PitchClass, string> = {
    low: "3/12",
    medium: "6/12",
    steep: "9/12",
    unknown: "Unknown",
  };

  return labels[pitch];
}
