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
  pixelSizeMeters?: number;
  areaSqft?: number;
  areaSquares?: number;
  confidenceScore: number;
  polygons: AutoRoofOutlinePolygon[];
  detail: string;
};

type MaskRasterInput = {
  width: number;
  height: number;
  raster: ArrayLike<number>;
  threshold?: number;
  pixelSizeMeters?: number;
  targetPoint?: RoofOutlinePoint;
};

type Component = {
  pixels: number[];
};

type DirectedEdge = {
  start: RoofOutlinePoint;
  end: RoofOutlinePoint;
};

const MIN_ROOF_PIXELS = 4;
const SQUARE_METERS_TO_SQUARE_FEET = 10.76391041671;

export function extractAutoRoofOutlineFromMaskRaster(input: MaskRasterInput): AutoRoofOutline | null {
  const roofPixels = toRoofPixelSet(input);

  if (roofPixels.size < MIN_ROOF_PIXELS) {
    return null;
  }

  const component = selectRoofComponent(
    findComponents(roofPixels, input.width, input.height),
    input.width,
    input.height,
    input.targetPoint,
  );

  if (!component || component.pixels.length < MIN_ROOF_PIXELS) {
    return null;
  }

  const points = traceBoundary(component, input.width);

  if (points.length < 4) {
    return null;
  }

  const areaSqft = getMaskAreaSqft(component.pixels.length, input.pixelSizeMeters);

  return {
    source: "google_solar_mask",
    status: "proposed",
    imageWidth: input.width,
    imageHeight: input.height,
    areaPixels: component.pixels.length,
    pixelSizeMeters: input.pixelSizeMeters,
    areaSqft,
    areaSquares: typeof areaSqft === "number" ? roundToTenth(areaSqft / 100) : undefined,
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
  pixelSizeMeters?: number;
  targetCoordinates?: {
    latitude: number;
    longitude: number;
  };
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
  const targetPoint = getGeoTiffTargetPoint(image, input.targetCoordinates);

  return extractAutoRoofOutlineFromMaskRaster({
    width: image.getWidth(),
    height: image.getHeight(),
    raster,
    threshold: 0,
    pixelSizeMeters: input.pixelSizeMeters,
    targetPoint,
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

function getMaskAreaSqft(areaPixels: number, pixelSizeMeters?: number) {
  if (typeof pixelSizeMeters !== "number" || pixelSizeMeters <= 0) {
    return undefined;
  }

  return Math.round(areaPixels * pixelSizeMeters * pixelSizeMeters * SQUARE_METERS_TO_SQUARE_FEET);
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
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

function findComponents(roofPixels: Set<number>, width: number, height: number): Component[] {
  const seen = new Set<number>();
  const components: Component[] = [];

  for (const pixel of roofPixels) {
    if (seen.has(pixel)) {
      continue;
    }

    const component = floodFill(pixel, roofPixels, seen, width, height);

    components.push(component);
  }

  return components;
}

function selectRoofComponent(
  components: Component[],
  width: number,
  height: number,
  targetPoint?: RoofOutlinePoint,
): Component | null {
  if (!components.length) {
    return null;
  }

  if (!targetPoint) {
    return getLargestComponent(components);
  }

  const targetPixel = getPixelIndexFromPoint(targetPoint, width, height);
  const containingComponent = components.find((component) => component.pixels.includes(targetPixel));

  if (containingComponent) {
    return containingComponent;
  }

  return components
    .map((component) => ({
      component,
      distance: getPointDistance(targetPoint, getComponentCenter(component, width)),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.component ?? getLargestComponent(components);
}

function getLargestComponent(components: Component[]) {
  return [...components].sort((left, right) => right.pixels.length - left.pixels.length)[0] ?? null;
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

function getPixelIndexFromPoint(point: RoofOutlinePoint, width: number, height: number) {
  const x = Math.floor(clamp(point.x, 0, width - 1));
  const y = Math.floor(clamp(point.y, 0, height - 1));

  return y * width + x;
}

function getComponentCenter(component: Component, width: number): RoofOutlinePoint {
  const total = component.pixels.reduce(
    (sum, pixel) => ({
      x: sum.x + (pixel % width) + 0.5,
      y: sum.y + Math.floor(pixel / width) + 0.5,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / component.pixels.length,
    y: total.y / component.pixels.length,
  };
}

function getPointDistance(left: RoofOutlinePoint, right: RoofOutlinePoint) {
  return Math.sqrt((left.x - right.x) ** 2 + (left.y - right.y) ** 2);
}

function getGeoTiffTargetPoint(
  image: {
    getWidth(): number;
    getHeight(): number;
    getBoundingBox(): number[];
  },
  targetCoordinates?: { latitude: number; longitude: number },
): RoofOutlinePoint | undefined {
  if (!targetCoordinates) {
    return undefined;
  }

  let boundingBox: number[];

  try {
    boundingBox = image.getBoundingBox();
  } catch {
    return undefined;
  }

  const [minX, minY, maxX, maxY] = boundingBox;

  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX === maxX || minY === maxY) {
    return undefined;
  }

  const targetWorldPoint = projectCoordinatesForGeoTiff(targetCoordinates, boundingBox);
  const x = ((targetWorldPoint.x - minX) / (maxX - minX)) * image.getWidth();
  const y = ((maxY - targetWorldPoint.y) / (maxY - minY)) * image.getHeight();

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return {
    x: clamp(x, 0, image.getWidth() - 1),
    y: clamp(y, 0, image.getHeight() - 1),
  };
}

function projectCoordinatesForGeoTiff(
  coordinates: { latitude: number; longitude: number },
  boundingBox: number[],
): RoofOutlinePoint {
  const [minX, minY, maxX, maxY] = boundingBox;
  const looksLikeDegrees =
    Math.max(Math.abs(minX), Math.abs(maxX)) <= 180 && Math.max(Math.abs(minY), Math.abs(maxY)) <= 90;

  if (looksLikeDegrees) {
    return {
      x: coordinates.longitude,
      y: coordinates.latitude,
    };
  }

  return projectCoordinatesToWebMercator(coordinates);
}

function projectCoordinatesToWebMercator(coordinates: { latitude: number; longitude: number }): RoofOutlinePoint {
  const earthRadiusMeters = 6_378_137;
  const latitude = clamp(coordinates.latitude, -85.05112878, 85.05112878);

  return {
    x: earthRadiusMeters * (coordinates.longitude * Math.PI / 180),
    y: earthRadiusMeters * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
