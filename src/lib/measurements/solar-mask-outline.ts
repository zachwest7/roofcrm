export type RoofOutlinePoint = {
  x: number;
  y: number;
};

export type AutoRoofOutlinePolygon = {
  id: string;
  label: string;
  areaPixels: number;
  points: RoofOutlinePoint[];
};

export type AutoRoofOutline = {
  source: "google_solar_mask";
  status: "proposed";
  imageWidth: number;
  imageHeight: number;
  areaPixels: number;
  confidenceScore: number;
  polygons: AutoRoofOutlinePolygon[];
  detail: string;
};

type MaskRasterInput = {
  width: number;
  height: number;
  raster: ArrayLike<number>;
  threshold?: number;
};

type Component = {
  pixels: number[];
};

type DirectedEdge = {
  start: RoofOutlinePoint;
  end: RoofOutlinePoint;
};

const MIN_ROOF_PIXELS = 4;

export function extractAutoRoofOutlineFromMaskRaster(input: MaskRasterInput): AutoRoofOutline | null {
  const roofPixels = toRoofPixelSet(input);

  if (roofPixels.size < MIN_ROOF_PIXELS) {
    return null;
  }

  const component = findLargestComponent(roofPixels, input.width, input.height);

  if (!component || component.pixels.length < MIN_ROOF_PIXELS) {
    return null;
  }

  const points = traceBoundary(component, input.width);

  if (points.length < 4) {
    return null;
  }

  return {
    source: "google_solar_mask",
    status: "proposed",
    imageWidth: input.width,
    imageHeight: input.height,
    areaPixels: component.pixels.length,
    confidenceScore: 76,
    polygons: [
      {
        id: "auto-roof-outline-1",
        label: "Auto roof outline",
        areaPixels: component.pixels.length,
        points,
      },
    ],
    detail: "Auto outline extracted from Google Solar roof mask pixels. Manager review is still required.",
  };
}

export async function fetchGoogleSolarMaskOutline(input: {
  maskUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<AutoRoofOutline | null> {
  const maskUrl = input.maskUrl?.trim();
  const apiKey = input.apiKey?.trim();

  if (!maskUrl || !apiKey) {
    return null;
  }

  const fetchFn = input.fetchFn ?? fetch;
  const response = await fetchFn(appendGoogleSolarApiKey(maskUrl, apiKey));

  if (!response.ok) {
    return null;
  }

  const { fromArrayBuffer } = await import("geotiff");
  const tiff = await fromArrayBuffer(await response.arrayBuffer());
  const image = await tiff.getImage();
  const raster = await image.readRasters({ interleave: true });

  return extractAutoRoofOutlineFromMaskRaster({
    width: image.getWidth(),
    height: image.getHeight(),
    raster,
    threshold: 0,
  });
}

export function appendGoogleSolarApiKey(url: string, apiKey: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("key", apiKey);

  return parsed.toString();
}

export function simplifyOrthogonalPolygon(points: RoofOutlinePoint[]) {
  if (points.length <= 3) {
    return points;
  }

  const simplified: RoofOutlinePoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const sameHorizontal = previous.y === current.y && current.y === next.y;
    const sameVertical = previous.x === current.x && current.x === next.x;

    if (!sameHorizontal && !sameVertical) {
      simplified.push(current);
    }
  }

  return simplified;
}

function toRoofPixelSet(input: MaskRasterInput) {
  const threshold = input.threshold ?? 0;
  const pixels = new Set<number>();

  for (let index = 0; index < input.raster.length; index += 1) {
    if (input.raster[index] > threshold) {
      pixels.add(index);
    }
  }

  return pixels;
}

function findLargestComponent(roofPixels: Set<number>, width: number, height: number): Component | null {
  const seen = new Set<number>();
  let largest: Component | null = null;

  for (const pixel of roofPixels) {
    if (seen.has(pixel)) {
      continue;
    }

    const component = floodFill(pixel, roofPixels, seen, width, height);

    if (!largest || component.pixels.length > largest.pixels.length) {
      largest = component;
    }
  }

  return largest;
}

function floodFill(
  start: number,
  roofPixels: Set<number>,
  seen: Set<number>,
  width: number,
  height: number,
): Component {
  const queue = [start];
  const pixels: number[] = [];
  seen.add(start);

  for (let index = 0; index < queue.length; index += 1) {
    const pixel = queue[index];
    pixels.push(pixel);

    for (const neighbor of getNeighbors(pixel, width, height)) {
      if (!roofPixels.has(neighbor) || seen.has(neighbor)) {
        continue;
      }

      seen.add(neighbor);
      queue.push(neighbor);
    }
  }

  return { pixels };
}

function getNeighbors(pixel: number, width: number, height: number) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  const neighbors = [];

  if (x > 0) {
    neighbors.push(pixel - 1);
  }

  if (x < width - 1) {
    neighbors.push(pixel + 1);
  }

  if (y > 0) {
    neighbors.push(pixel - width);
  }

  if (y < height - 1) {
    neighbors.push(pixel + width);
  }

  return neighbors;
}

function traceBoundary(component: Component, width: number) {
  const componentPixels = new Set(component.pixels);
  const edges = buildBoundaryEdges(componentPixels, width);
  const loops = traceBoundaryLoops(edges);
  const longestLoop = loops.sort((left, right) => right.length - left.length)[0] ?? [];

  return simplifyOrthogonalPolygon(longestLoop);
}

function buildBoundaryEdges(componentPixels: Set<number>, width: number) {
  const edges: DirectedEdge[] = [];

  for (const pixel of componentPixels) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (!componentPixels.has(pixel - width)) {
      edges.push({ start: { x, y }, end: { x: x + 1, y } });
    }

    if (!componentPixels.has(pixel + 1)) {
      edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 } });
    }

    if (!componentPixels.has(pixel + width)) {
      edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 } });
    }

    if (!componentPixels.has(pixel - 1)) {
      edges.push({ start: { x, y: y + 1 }, end: { x, y } });
    }
  }

  return edges;
}

function traceBoundaryLoops(edges: DirectedEdge[]) {
  const unused = new Map(edges.map((edge) => [edgeKey(edge), edge]));
  const starts = new Map<string, DirectedEdge[]>();

  for (const edge of edges) {
    const key = pointKey(edge.start);
    starts.set(key, [...(starts.get(key) ?? []), edge]);
  }

  const loops: RoofOutlinePoint[][] = [];

  while (unused.size) {
    const first = unused.values().next().value as DirectedEdge | undefined;

    if (!first) {
      break;
    }

    const loop: RoofOutlinePoint[] = [first.start];
    let current = first;
    unused.delete(edgeKey(current));

    while (pointKey(current.end) !== pointKey(first.start)) {
      loop.push(current.end);
      const candidates = starts.get(pointKey(current.end)) ?? [];
      const next = candidates.find((candidate) => unused.has(edgeKey(candidate)));

      if (!next) {
        break;
      }

      current = next;
      unused.delete(edgeKey(current));
    }

    loops.push(loop);
  }

  return loops;
}

function pointKey(point: RoofOutlinePoint) {
  return `${point.x},${point.y}`;
}

function edgeKey(edge: DirectedEdge) {
  return `${pointKey(edge.start)}>${pointKey(edge.end)}`;
}
