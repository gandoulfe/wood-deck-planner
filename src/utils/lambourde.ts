import { Point, Segment, LambourdeStructure, AppConfig } from '../types';
import { clipLineToShape, distance, pointInPolygon } from './geometry';
import { lameAxes } from './lames';

/**
 * French deck construction recommendations (DTU 51.4):
 * - Pose droite   : entraxe ≤ 50 cm, plots ≤ 80 cm
 * - Pose 45°      : entraxe ≤ 40 cm, plots ≤ 60 cm
 * - Lambourdes de rive always at perimeter
 * - Max lame overhang: 5 cm past last lambourde
 */

export function getRecommendedEntraxe(lameAngle: number): number {
  const n = ((lameAngle % 180) + 180) % 180;
  return n > 22.5 && n < 67.5 ? 0.40 : 0.50;
}

export function generateStructure(
  polygon: Point[],
  holes: Point[][],
  config: AppConfig,
): LambourdeStructure {
  const { lameAngle, entraxe, plotSpacing, lameConfig } = config;
  const { spreadDir, lambDir } = lameAxes(lameAngle);

  // ── Project polygon onto spreadDir to get main lambourde range ───────────
  const spreadProjs = polygon.map(p => p.x * spreadDir.x + p.y * spreadDir.y);
  const projMin = Math.min(...spreadProjs);
  const projMax = Math.max(...spreadProjs);

  const lambourdes: Segment[] = [];
  const plots:       Point[]  = [];

  const positions: { t: number; isRive: boolean }[] = [];

  positions.push({ t: projMin, isRive: true });

  if (projMax - projMin > entraxe * 0.1) {
    const firstGrid = Math.ceil((projMin + 1e-6) / entraxe) * entraxe;
    for (let t = firstGrid; t < projMax - entraxe * 0.1; t += entraxe) {
      positions.push({ t, isRive: false });
    }
    positions.push({ t: projMax, isRive: true });
  }

  // Inner rive supports when lames de rive are enabled
  if (lameConfig.riveEdges.length > 0 && lameConfig.riveWidth > 0.005) {
    const rw = lameConfig.riveWidth;
    for (const innerT of [projMin + rw, projMax - rw]) {
      if (innerT > projMin + 0.001 && innerT < projMax - 0.001) {
        positions.push({ t: innerT, isRive: false });
      }
    }
  }

  // Sort positions and remove near-duplicates
  positions.sort((a, b) => a.t - b.t);
  const dedupPositions = [positions[0]];
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].t - dedupPositions[dedupPositions.length - 1].t > 0.01) {
      dedupPositions.push(positions[i]);
    }
  }

  for (const { t, isRive } of dedupPositions) {
    const origin: Point = { x: t * spreadDir.x, y: t * spreadDir.y };
    const segs = clipLineToShape(origin, lambDir, polygon, holes);

    for (const seg of segs) {
      const len = distance(seg.start, seg.end);
      if (len < 0.01) continue;

      lambourdes.push({ ...seg, isRive });

      const n = Math.max(1, Math.ceil(len / plotSpacing));
      const sp = len / n;
      const dx = (seg.end.x - seg.start.x) / len;
      const dy = (seg.end.y - seg.start.y) / len;
      for (let j = 0; j <= n; j++) {
        plots.push({ x: seg.start.x + j * sp * dx, y: seg.start.y + j * sp * dy });
      }
    }
  }

  // ── Cadre lambourdes (support for perpendicular rive lames) ─────────────
  const cadreLambourdes: Segment[] = [];
  const cadresPlots:     Point[]   = [];

  if (lameConfig.riveEdges.length > 0 && lameConfig.riveWidth > 0.005) {
    const rw = lameConfig.riveWidth;

    const lambProjs = polygon.map(p => p.x * lambDir.x + p.y * lambDir.y);
    const lambMin   = Math.min(...lambProjs);
    const lambMax   = Math.max(...lambProjs);

    const nCadre = Math.max(1, Math.ceil((lambMax - lambMin) / plotSpacing));
    const cadreStep = (lambMax - lambMin) / nCadre;

    const riveRanges = [
      { from: projMin, to: projMin + rw },
      { from: projMax - rw, to: projMax },
    ];

    for (let i = 0; i <= nCadre; i++) {
      const y = lambMin + i * cadreStep;

      for (const range of riveRanges) {
        const segStart: Point = {
          x: y * lambDir.x + range.from * spreadDir.x,
          y: y * lambDir.y + range.from * spreadDir.y,
        };
        const segEnd: Point = {
          x: y * lambDir.x + range.to * spreadDir.x,
          y: y * lambDir.y + range.to * spreadDir.y,
        };
        const mid: Point = { x: (segStart.x + segEnd.x) / 2, y: (segStart.y + segEnd.y) / 2 };

        const inShape = pointInPolygon(mid, polygon) && !holes.some(h => pointInPolygon(mid, h));
        if (inShape) {
          cadreLambourdes.push({ start: segStart, end: segEnd, isRive: false });
          cadresPlots.push(segStart);
          cadresPlots.push(segEnd);
        }
      }
    }
  }

  const totalLength      = lambourdes.reduce((s, sg) => s + distance(sg.start, sg.end), 0);
  const cadreTotalLength = cadreLambourdes.reduce((s, sg) => s + distance(sg.start, sg.end), 0);

  return {
    lambourdes,
    cadreLambourdes,
    plots,
    cadresPlots,
    totalLength,
    cadreTotalLength,
    count: lambourdes.length,
    plotCount: plots.length,
  };
}
