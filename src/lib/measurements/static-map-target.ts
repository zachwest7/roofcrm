import type { LatLng } from "./source-stack";

type Size = {
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

const TILE_SIZE = 256;
const MAX_MERCATOR_SINE = 0.9999;
const FEET_PER_METER = 3.280839895;
const METERS_PER_LATITUDE_DEGREE = 111_320;

export function getGoogleStaticMapTapTargetCoordinates(input: {
  center: LatLng;
  zoom: number;
  imageSize: Size;
  renderedSize: Size;
  tap: Point;
}): LatLng {
  const imagePoint = getObjectCoverImagePoint({
    imageSize: input.imageSize,
    renderedSize: input.renderedSize,
    tap: input.tap,
  });
  const centerWorldPoint = latLngToWorldPixel(input.center, input.zoom);

  return worldPixelToLatLng(
    {
      x: centerWorldPoint.x + imagePoint.x - input.imageSize.width / 2,
      y: centerWorldPoint.y + imagePoint.y - input.imageSize.height / 2,
    },
    input.zoom,
  );
}

export function getMetricRasterTapTargetCoordinates(input: {
  center: LatLng;
  imageSize: Size;
  renderedSize: Size;
  pixelSizeFeet: number;
  tap: Point;
}): LatLng {
  const imagePoint = getObjectContainImagePoint({
    imageSize: input.imageSize,
    renderedSize: input.renderedSize,
    tap: input.tap,
  });
  const eastFeet = (imagePoint.x - input.imageSize.width / 2) * input.pixelSizeFeet;
  const northFeet = (input.imageSize.height / 2 - imagePoint.y) * input.pixelSizeFeet;

  return {
    latitude: roundCoordinate(input.center.latitude + feetToMeters(northFeet) / METERS_PER_LATITUDE_DEGREE),
    longitude: roundCoordinate(
      input.center.longitude + feetToMeters(eastFeet) / metersPerLongitudeDegree(input.center.latitude),
    ),
  };
}

function getObjectCoverImagePoint(input: { imageSize: Size; renderedSize: Size; tap: Point }): Point {
  const scale = Math.max(
    input.renderedSize.width / input.imageSize.width,
    input.renderedSize.height / input.imageSize.height,
  );
  const renderedImageWidth = input.imageSize.width * scale;
  const renderedImageHeight = input.imageSize.height * scale;
  const offsetX = (input.renderedSize.width - renderedImageWidth) / 2;
  const offsetY = (input.renderedSize.height - renderedImageHeight) / 2;

  return {
    x: clamp((input.tap.x - offsetX) / scale, 0, input.imageSize.width),
    y: clamp((input.tap.y - offsetY) / scale, 0, input.imageSize.height),
  };
}

function getObjectContainImagePoint(input: { imageSize: Size; renderedSize: Size; tap: Point }): Point {
  const scale = Math.min(
    input.renderedSize.width / input.imageSize.width,
    input.renderedSize.height / input.imageSize.height,
  );
  const renderedImageWidth = input.imageSize.width * scale;
  const renderedImageHeight = input.imageSize.height * scale;
  const offsetX = (input.renderedSize.width - renderedImageWidth) / 2;
  const offsetY = (input.renderedSize.height - renderedImageHeight) / 2;

  return {
    x: clamp((input.tap.x - offsetX) / scale, 0, input.imageSize.width),
    y: clamp((input.tap.y - offsetY) / scale, 0, input.imageSize.height),
  };
}

function latLngToWorldPixel(coordinates: LatLng, zoom: number): Point {
  const worldSize = getWorldSize(zoom);
  const sinLatitude = clamp(Math.sin((coordinates.latitude * Math.PI) / 180), -MAX_MERCATOR_SINE, MAX_MERCATOR_SINE);

  return {
    x: ((coordinates.longitude + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize,
  };
}

function worldPixelToLatLng(point: Point, zoom: number): LatLng {
  const worldSize = getWorldSize(zoom);
  const longitude = (point.x / worldSize) * 360 - 180;
  const mercatorY = Math.PI - (2 * Math.PI * point.y) / worldSize;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY));

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

function getWorldSize(zoom: number) {
  return TILE_SIZE * 2 ** Math.round(zoom);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function feetToMeters(value: number) {
  return value / FEET_PER_METER;
}

function metersPerLongitudeDegree(latitude: number) {
  return Math.cos((latitude * Math.PI) / 180) * METERS_PER_LATITUDE_DEGREE;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000_000) / 10_000_000;
}
