import { Point, EssenceType, LameConfig } from '../types';
import { clipLineToShape, distance, pointInPolygon } from './geometry';

// ── Essence data ─────────────────────────────────────────────────────────────

export interface EssenceInfo {
  label: string;
  color: string;
  grainColor: string;
  defaultSection: string;
}

export const ESSENCES: Record<EssenceType, EssenceInfo> = {
  pin_traite: { label: 'Pin traité AC4', color: '#d4c17a', grainColor: '#c0aa5a', defaultSection: '145×27' },
  thermopin:  { label: 'Thermopin',      color: '#a07840', grainColor: '#8a6030', defaultSection: '145×27' },
  douglas:    { label: 'Douglas',        color: '#c08040', grainColor: '#a06828', defaultSection: '145×27' },
  ipe:        { label: 'Ipé',            color: '#5c3a2a', grainColor: '#4a2a1a', defaultSection: '145×21' },
  cumaru:     { label: 'Cumaru',         color: '#9a6030', grainColor: '#7a4820', defaultSection: '145×21' },
  teck:       { label: 'Teck',           color: '#c8a050', grainColor: '#a88030', defaultSection: '145×21' },
  bangkirai:  { label: 'Bangkirai',      color: '#9e6b3a', grainColor: '#7e5020', defaultSection: '145×21' },
  composite:  { label: 'Composite',      color: '#7a6a5a', grainColor: '#6a5a4a', defaultSection: '140×25' },
};

// ── Lame item ─────────────────────────────────────────────────────────────────

export interface LameItem {
  t: number;
  width: number;
  isFinition: boolean;
  isRive: boolean;
}

// ── Rive board ────────────────────────────────────────────────────────────────

export interface RiveBoard {
  edgeIndex: number;
  /** Quad corners: near-start, near-end, far-end, far-start */
  corners: [Point, Point, Point, Point];
  length: number;
}

// ── Axis helpers ──────────────────────────────────────────────────────────────

export function lameAxes(lameAngle: number): { spreadDir: Point; lambDir: Point } {
  const r = (lameAngle * Math.PI) / 180;
  return {
    spreadDir: { x: Math.cos(r), y: Math.sin(r) },
    lambDir:   { x: -Math.sin(r), y: Math.cos(r) },
  };
}

// ── Rive board geometry helpers ───────────────────────────────────────────────

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-10 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

function inwardNormal(a: Point, b: Point, polygon: Point[]): Point {
  const d = normalize({ x: b.x - a.x, y: b.y - a.y });
  const n1 = { x: d.y, y: -d.x };
  const mid = { x: (a.x + b.x) / 2 + n1.x * 0.01, y: (a.y + b.y) / 2 + n1.y * 0.01 };
  return pointInPolygon(mid, polygon) ? n1 : { x: -d.y, y: d.x };
}

function lineIntersect(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-10) return null;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

export function generateRiveBoards(
  polygon: Point[],
  riveEdges: number[],
  riveWidth: number,
): RiveBoard[] {
  if (!riveEdges.length || riveWidth < 0.005) return [];
  const n = polygon.length;
  const riveSet = new Set(riveEdges);
  const boards: RiveBoard[] = [];

  for (const i of riveEdges) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const ni = inwardNormal(a, b, polygon);
    const di = normalize({ x: b.x - a.x, y: b.y - a.y });
    const edgeLen = distance(a, b);

    let farA: Point = { x: a.x + riveWidth * ni.x, y: a.y + riveWidth * ni.y };
    let farB: Point = { x: b.x + riveWidth * ni.x, y: b.y + riveWidth * ni.y };

    // Miter at A with previous rive edge
    const prevEdge = (i - 1 + n) % n;
    if (riveSet.has(prevEdge)) {
      const ap = polygon[prevEdge];
      const np = inwardNormal(ap, polygon[i], polygon);
      const dp = normalize({ x: polygon[i].x - ap.x, y: polygon[i].y - ap.y });
      const miter = lineIntersect(
        { x: ap.x + riveWidth * np.x, y: ap.y + riveWidth * np.y }, dp,
        { x: a.x  + riveWidth * ni.x, y: a.y  + riveWidth * ni.y }, di,
      );
      if (miter) farA = miter;
    }

    // Miter at B with next rive edge
    const nextEdge = (i + 1) % n;
    if (riveSet.has(nextEdge)) {
      const bn = polygon[(i + 2) % n];
      const nn = inwardNormal(b, bn, polygon);
      const dn = normalize({ x: bn.x - b.x, y: bn.y - b.y });
      const miter = lineIntersect(
        { x: a.x + riveWidth * ni.x, y: a.y + riveWidth * ni.y }, di,
        { x: b.x + riveWidth * nn.x, y: b.y + riveWidth * nn.y }, dn,
      );
      if (miter) farB = miter;
    }

    boards.push({ edgeIndex: i, corners: [a, b, farB, farA], length: edgeLen });
  }

  return boards;
}

// ── Main lame generation ──────────────────────────────────────────────────────

export function generateLames(
  polygon: Point[],
  lameAngle: number,
  cfg: LameConfig,
): LameItem[] {
  const { width: lameW, gap, showFinition, riveEdges, riveWidth } = cfg;
  const { lambDir } = lameAxes(lameAngle);

  const lambProjs = polygon.map(p => p.x * lambDir.x + p.y * lambDir.y);
  const lambMin   = Math.min(...lambProjs);
  const lambMax   = Math.max(...lambProjs);
  const lambMid   = (lambMin + lambMax) / 2;

  // Detect which sides have rive boards (start = lambMin side, end = lambMax side)
  let hasRiveStart = false, hasRiveEnd = false;
  for (const i of riveEdges) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const proj = ((a.x + b.x) / 2) * lambDir.x + ((a.y + b.y) / 2) * lambDir.y;
    if (proj < lambMid) hasRiveStart = true; else hasRiveEnd = true;
  }

  // Shrink effective bounds so regular boards don't overlap rive boards
  const effMin = hasRiveStart ? lambMin + riveWidth + gap : lambMin;
  const effMax = hasRiveEnd   ? lambMax - riveWidth - gap : lambMax;

  const step = lameW + gap;
  const lames: LameItem[] = [];
  let t = effMin;

  while (t < effMax - 0.005) {
    const visEnd   = Math.min(t + lameW, effMax);
    const visWidth = visEnd - t;

    if (visWidth > 0.001) {
      const isFinition = visWidth < lameW - 0.001;
      if (isFinition) {
        if (showFinition && visWidth > 0.02) lames.push({ t, width: visWidth, isFinition: true, isRive: false });
      } else {
        lames.push({ t, width: visWidth, isFinition: false, isRive: false });
      }
    }
    t += step;
  }

  return lames;
}

// ── Métrés ────────────────────────────────────────────────────────────────────

export interface LameMetres {
  mainCount: number;
  finitionCount: number;
  riveCount: number;
  totalLinear: number;
  riveTotalLinear: number;
  boardCount: number;     // number of standard-length boards needed (0 if lameLength=0)
  visCount: number;       // estimated number of screws
}

export function computeLameMetres(
  lames: LameItem[],
  polygon: Point[],
  holes: Point[][],
  lameAngle: number,
  riveBoards: RiveBoard[],
  entraxe: number,
  lameLength: number,
): LameMetres {
  const { spreadDir, lambDir } = lameAxes(lameAngle);
  let mainCount = 0, finitionCount = 0, totalLinear = 0, boardCount = 0, visCount = 0;

  for (const lame of lames) {
    if (lame.isFinition) finitionCount++;
    else mainCount++;

    const tMid = lame.t + lame.width / 2;
    const origin: Point = { x: tMid * lambDir.x, y: tMid * lambDir.y };
    const segs = clipLineToShape(origin, spreadDir, polygon, holes);
    for (const seg of segs) {
      const segLen = distance(seg.start, seg.end);
      totalLinear += segLen;
      if (lameLength > 0) boardCount += Math.ceil(segLen / lameLength);
      if (entraxe > 0) visCount += 2 * (Math.floor(segLen / entraxe) + 1);
    }
  }

  return {
    mainCount, finitionCount,
    riveCount: riveBoards.length,
    totalLinear,
    riveTotalLinear: riveBoards.reduce((s, b) => s + b.length, 0),
    boardCount,
    visCount,
  };
}
