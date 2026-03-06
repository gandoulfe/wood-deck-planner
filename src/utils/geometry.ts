import { Point, Segment } from '../types';

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function polygonArea(points: Point[]): number {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

export function polygonPerimeter(points: Point[]): number {
  const n = points.length;
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    perimeter += distance(points[i], points[(i + 1) % n]);
  }
  return perimeter;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  const n = polygon.length;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

/**
 * Find parameter t on the infinite line (origin + t*dir) where it intersects
 * the segment [segA, segB]. Returns null if no intersection or outside segment.
 */
function lineSegmentT(
  origin: Point,
  dir: Point,
  segA: Point,
  segB: Point,
): number | null {
  const r = { x: segB.x - segA.x, y: segB.y - segA.y };
  const q = { x: origin.x - segA.x, y: origin.y - segA.y };
  // det = dir × r  (2D cross product)
  const det = dir.x * r.y - dir.y * r.x;
  if (Math.abs(det) < 1e-10) return null; // parallel

  // segParam: position on segment [0..1]
  const segParam = (dir.x * q.y - dir.y * q.x) / det;
  if (segParam < -1e-8 || segParam > 1 + 1e-8) return null;

  // lineParam: t value on the infinite line
  const lineParam = (r.x * q.y - r.y * q.x) / det;
  return lineParam;
}

/**
 * Clip an infinite line to a polygon. Returns array of inside segments.
 */
export function clipLineToPolygon(
  origin: Point,
  dir: Point,
  polygon: Point[],
): Segment[] {
  const n = polygon.length;
  const tValues: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = lineSegmentT(origin, dir, polygon[i], polygon[(i + 1) % n]);
    if (t !== null) tValues.push(t);
  }

  if (tValues.length < 2) return [];

  tValues.sort((a, b) => a - b);

  // Remove near-duplicates (polygon vertices hit two edges simultaneously)
  const unique: number[] = [tValues[0]];
  for (let i = 1; i < tValues.length; i++) {
    if (Math.abs(tValues[i] - unique[unique.length - 1]) > 1e-8) {
      unique.push(tValues[i]);
    }
  }

  const segments: Segment[] = [];
  for (let i = 0; i + 1 < unique.length; i++) {
    const tMid = (unique[i] + unique[i + 1]) / 2;
    const mid: Point = {
      x: origin.x + tMid * dir.x,
      y: origin.y + tMid * dir.y,
    };
    if (pointInPolygon(mid, polygon)) {
      segments.push({
        start: { x: origin.x + unique[i] * dir.x, y: origin.y + unique[i] * dir.y },
        end:   { x: origin.x + unique[i + 1] * dir.x, y: origin.y + unique[i + 1] * dir.y },
        isRive: false,
      });
    }
  }

  return segments;
}

/**
 * Clip an infinite line to a shape = outer polygon minus holes.
 * Returns segments where the line is inside outer AND outside all holes.
 */
export function clipLineToShape(
  origin: Point,
  dir: Point,
  outer: Point[],
  holes: Point[][],
): Segment[] {
  const tValues: number[] = [];

  const collect = (polygon: Point[]) => {
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const t = lineSegmentT(origin, dir, polygon[i], polygon[(i + 1) % n]);
      if (t !== null) tValues.push(t);
    }
  };

  collect(outer);
  for (const hole of holes) collect(hole);

  if (tValues.length < 2) return [];

  tValues.sort((a, b) => a - b);

  const unique: number[] = [tValues[0]];
  for (let i = 1; i < tValues.length; i++) {
    if (Math.abs(tValues[i] - unique[unique.length - 1]) > 1e-8) {
      unique.push(tValues[i]);
    }
  }

  const segments: Segment[] = [];
  for (let i = 0; i + 1 < unique.length; i++) {
    const tMid = (unique[i] + unique[i + 1]) / 2;
    const mid: Point = { x: origin.x + tMid * dir.x, y: origin.y + tMid * dir.y };
    const inShape = pointInPolygon(mid, outer) && !holes.some(h => pointInPolygon(mid, h));
    if (inShape) {
      segments.push({
        start: { x: origin.x + unique[i] * dir.x, y: origin.y + unique[i] * dir.y },
        end:   { x: origin.x + unique[i + 1] * dir.x, y: origin.y + unique[i + 1] * dir.y },
        isRive: false,
      });
    }
  }

  return segments;
}

export function snapToGrid(p: Point, grid = 0.01): Point {
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid,
  };
}
