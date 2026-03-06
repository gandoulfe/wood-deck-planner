import React, {
  useRef, useState, useEffect, useCallback, useMemo,
} from 'react';
import { Point, LambourdeStructure, BackgroundImage, CalibrationState, LameConfig } from '../types';
import { distance, snapToGrid } from '../utils/geometry';
import { LameItem, RiveBoard, ESSENCES, lameAxes } from '../utils/lames';

interface InactiveSection {
  id: string;
  points: Point[];
  holes: Point[][];
  lames: LameItem[];
  riveBoards: RiveBoard[];
  lameConfig: LameConfig;
  lameAngle: number;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface CanvasProps {
  points: Point[];
  isClosed: boolean;
  structure: LambourdeStructure | null;
  lames: LameItem[];
  lameConfig: LameConfig;
  lameAngle: number;
  bgImage: BackgroundImage | null;
  calibration: CalibrationState;
  holes: Point[][];
  currentHole: Point[];
  isDrawingHole: boolean;
  riveBoards: RiveBoard[];
  showStructure: boolean;
  inactiveSections?: InactiveSection[];
  snapPoints?: Point[];
  onPointAdd: (p: Point) => void;
  onClose: () => void;
  onUndo: () => void;
  onVertexMove: (index: number, p: Point) => void;
  onBgImageMove: (meterX: number, meterY: number) => void;
  onCalibrationPoint: (p: Point) => void;
  onHolePointAdd: (p: Point) => void;
  onHoleClose: () => void;
  onHoleUndo: () => void;
  onCancelHole: () => void;
  onHoleVertexMove: (holeIndex: number, vertexIndex: number, p: Point) => void;
  onToggleRiveEdge: (edgeIndex: number) => void;
  onSelectSection?: (id: string) => void;
}

const CLOSE_PX      = 18;
const VERTEX_HIT_PX = 12;

type Interaction =
  | { type: 'none' }
  | { type: 'pan';         startSvg: Point; startOffset: Point }
  | { type: 'vertex';      index: number }
  | { type: 'hole-vertex'; holeIndex: number; vertexIndex: number }
  | { type: 'image';       startSvg: Point; startMeterX: number; startMeterY: number };

export const Canvas: React.FC<CanvasProps> = ({
  points, isClosed, structure, lames, lameConfig, lameAngle,
  bgImage, calibration,
  holes, currentHole, isDrawingHole, riveBoards, showStructure,
  inactiveSections, snapPoints,
  onPointAdd, onClose, onUndo, onVertexMove, onBgImageMove, onCalibrationPoint,
  onHolePointAdd, onHoleClose, onHoleUndo, onCancelHole,
  onHoleVertexMove, onToggleRiveEdge, onSelectSection,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale,  setScale]  = useState(80);
  const [offset, setOffset] = useState<Point>({ x: 120, y: 120 });
  const [mouse,  setMouse]  = useState<Point | null>(null);
  const [interaction, setInteraction] = useState<Interaction>({ type: 'none' });
  const [nearFirst,     setNearFirst]     = useState(false);
  const [nearFirstHole, setNearFirstHole] = useState(false);
  const [hoverVertex,     setHoverVertex]     = useState<number | null>(null);
  const [hoverHoleVertex, setHoverHoleVertex] = useState<{ hi: number; vi: number } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const isDragging = useRef(false);

  // ── coordinate helpers ──────────────────────────────────────────────────
  const toSvg   = useCallback((m: Point): Point => ({ x: m.x * scale + offset.x, y: m.y * scale + offset.y }), [scale, offset]);
  const toMeter = useCallback((sx: number, sy: number): Point => ({ x: (sx - offset.x) / scale, y: (sy - offset.y) / scale }), [scale, offset]);

  // Snap to cross-section vertices (slightly larger hit area than vertex hit)
  const snapToSectionVertex = useCallback((m: Point, svg: Point): Point => {
    if (!snapPoints?.length) return m;
    for (const sp of snapPoints) {
      const ss = toSvg(sp);
      if (Math.hypot(svg.x - ss.x, svg.y - ss.y) < VERTEX_HIT_PX + 6) return sp;
    }
    return m;
  }, [snapPoints, toSvg]);
  const svgXY   = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  // ── keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'Backspace') {
        e.preventDefault();
        if (isDrawingHole) onHoleUndo();
        else onUndo();
      }
      if (e.key === 'Escape') {
        if (isDrawingHole) {
          if (currentHole.length >= 3) onHoleClose();
          else onCancelHole();
        } else if (!isClosed && points.length >= 3) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [onUndo, onClose, isClosed, points.length, isDrawingHole, currentHole.length, onHoleUndo, onHoleClose, onCancelHole]);

  useEffect(() => {
    const up = () => setInteraction({ type: 'none' });
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // ── mouse events ────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgXY(e);

    if (interaction.type === 'pan') {
      isDragging.current = true;
      setOffset({ x: interaction.startOffset.x + svg.x - interaction.startSvg.x, y: interaction.startOffset.y + svg.y - interaction.startSvg.y });
      return;
    }
    if (interaction.type === 'vertex') {
      isDragging.current = true;
      const m = snapToGrid(toMeter(svg.x, svg.y));
      onVertexMove(interaction.index, m);
      setMouse(m);
      return;
    }
    if (interaction.type === 'hole-vertex') {
      isDragging.current = true;
      const m = snapToGrid(toMeter(svg.x, svg.y));
      onHoleVertexMove(interaction.holeIndex, interaction.vertexIndex, m);
      setMouse(m);
      return;
    }
    if (interaction.type === 'image' && bgImage) {
      isDragging.current = true;
      onBgImageMove(interaction.startMeterX + (svg.x - interaction.startSvg.x) / scale, interaction.startMeterY + (svg.y - interaction.startSvg.y) / scale);
      return;
    }

    const m = snapToSectionVertex(snapToGrid(toMeter(svg.x, svg.y)), svg);
    setMouse(m);

    if (isClosed && !isDrawingHole) {
      // Outer vertex hover
      let foundV: number | null = null;
      for (let i = 0; i < points.length; i++) {
        const vs = toSvg(points[i]);
        if (Math.hypot(svg.x - vs.x, svg.y - vs.y) < VERTEX_HIT_PX) { foundV = i; break; }
      }
      setHoverVertex(foundV);

      // Hole vertex hover (only if no outer vertex hovered)
      let foundHV: { hi: number; vi: number } | null = null;
      if (foundV === null) {
        outer: for (let hi = 0; hi < holes.length; hi++) {
          for (let vi = 0; vi < holes[hi].length; vi++) {
            const vs = toSvg(holes[hi][vi]);
            if (Math.hypot(svg.x - vs.x, svg.y - vs.y) < VERTEX_HIT_PX) { foundHV = { hi, vi }; break outer; }
          }
        }
      }
      setHoverHoleVertex(foundHV);

      // Edge hover (only if no vertex hovered)
      let foundEdge: number | null = null;
      if (foundV === null && foundHV === null) {
        const EDGE_HIT = 8;
        let minD = EDGE_HIT;
        for (let i = 0; i < points.length; i++) {
          const a = toSvg(points[i]), b = toSvg(points[(i + 1) % points.length]);
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((svg.x - a.x) * dx + (svg.y - a.y) * dy) / lenSq));
          const d = Math.hypot(svg.x - (a.x + t * dx), svg.y - (a.y + t * dy));
          if (d < minD) { minD = d; foundEdge = i; }
        }
      }
      setHoverEdge(foundEdge);
    } else {
      setHoverVertex(null);
      setHoverHoleVertex(null);
      setHoverEdge(null);
    }

    if (!isClosed && points.length >= 3) {
      const fs = toSvg(points[0]);
      setNearFirst(Math.hypot(svg.x - fs.x, svg.y - fs.y) < CLOSE_PX);
    } else setNearFirst(false);

    if (isDrawingHole && currentHole.length >= 3) {
      const fs = toSvg(currentHole[0]);
      setNearFirstHole(Math.hypot(svg.x - fs.x, svg.y - fs.y) < CLOSE_PX);
    } else setNearFirstHole(false);
  }, [svgXY, interaction, toMeter, toSvg, snapToSectionVertex, isClosed, points, holes, bgImage, scale, onVertexMove, onBgImageMove, isDrawingHole, currentHole, onHoleVertexMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = false;
    const svg = svgXY(e);
    if (e.button === 0 && e.ctrlKey && bgImage) {
      e.preventDefault();
      setInteraction({ type: 'image', startSvg: svg, startMeterX: bgImage.meterX, startMeterY: bgImage.meterY });
      return;
    }
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setInteraction({ type: 'pan', startSvg: svg, startOffset: offset });
      return;
    }
    if (e.button === 0 && isClosed && !isDrawingHole) {
      // Outer vertices take priority
      for (let i = 0; i < points.length; i++) {
        const vs = toSvg(points[i]);
        if (Math.hypot(svg.x - vs.x, svg.y - vs.y) < VERTEX_HIT_PX) { setInteraction({ type: 'vertex', index: i }); return; }
      }
      // Then hole vertices
      for (let hi = 0; hi < holes.length; hi++) {
        for (let vi = 0; vi < holes[hi].length; vi++) {
          const vs = toSvg(holes[hi][vi]);
          if (Math.hypot(svg.x - vs.x, svg.y - vs.y) < VERTEX_HIT_PX) {
            setInteraction({ type: 'hole-vertex', holeIndex: hi, vertexIndex: vi }); return;
          }
        }
      }
    }
  }, [svgXY, bgImage, offset, isClosed, points, holes, toSvg, isDrawingHole]);

  const handleMouseUp = useCallback(() => setInteraction({ type: 'none' }), []);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0 || isDragging.current) return;
    const svg = svgXY(e);
    const m   = snapToSectionVertex(snapToGrid(toMeter(svg.x, svg.y)), svg);

    if (calibration.phase === 'p1' || calibration.phase === 'p2') { onCalibrationPoint(m); return; }

    if (isDrawingHole) {
      if (currentHole.length >= 3) {
        const fs = toSvg(currentHole[0]);
        if (Math.hypot(svg.x - fs.x, svg.y - fs.y) < CLOSE_PX) { onHoleClose(); return; }
      }
      onHolePointAdd(m);
      return;
    }

    if (isClosed) {
      // Toggle rive edge if hovering one (and no vertex hovered)
      if (hoverEdge !== null && hoverVertex === null && hoverHoleVertex === null) {
        onToggleRiveEdge(hoverEdge);
        return;
      }
      // Click on an inactive section to switch active
      if (hoverVertex === null && hoverHoleVertex === null && hoverEdge === null && onSelectSection) {
        for (const sec of (inactiveSections ?? [])) {
          if (pointInPolygon(m, sec.points)) {
            onSelectSection(sec.id);
            return;
          }
        }
      }
      return;
    }
    if (points.length >= 3) {
      const fs = toSvg(points[0]);
      if (Math.hypot(svg.x - fs.x, svg.y - fs.y) < CLOSE_PX) { onClose(); return; }
    }
    onPointAdd(m);
  }, [svgXY, toMeter, snapToSectionVertex, calibration, isDrawingHole, currentHole, onHolePointAdd, onHoleClose, isClosed, points, toSvg, onCalibrationPoint, onClose, onPointAdd, hoverEdge, hoverVertex, hoverHoleVertex, onToggleRiveEdge, onSelectSection, inactiveSections]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgXY(e);
    const factor = e.deltaY > 0 ? 0.88 : 1.12;
    const ns = Math.max(15, Math.min(600, scale * factor));
    setScale(ns);
    setOffset({ x: svg.x - (svg.x - offset.x) * (ns / scale), y: svg.y - (svg.y - offset.y) * (ns / scale) });
  }, [svgXY, scale, offset]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isDrawingHole) onHoleUndo();
    else if (!isClosed) onUndo();
  }, [isClosed, onUndo, isDrawingHole, onHoleUndo]);

  // ── grid ────────────────────────────────────────────────────────────────
  const gridId = useMemo(() => `g${Math.random().toString(36).slice(2)}`, []);
  const g10 = scale * 0.1, g50 = scale * 0.5, g100 = scale;

  // ── polygon string ──────────────────────────────────────────────────────
  const polyStr = points.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' ');

  // ── SVG path for outer + holes (fillRule=evenodd creates cutouts) ────────
  const ptsToSubpath = useCallback((pts: Point[]) =>
    pts.map((p, i) => { const s = toSvg(p); return `${i === 0 ? 'M' : 'L'}${s.x},${s.y}`; }).join(' ') + ' Z',
  [toSvg]);

  const shapePath = useMemo(() => {
    if (!isClosed || points.length < 3) return '';
    return [points, ...holes].map(ptsToSubpath).join(' ');
  }, [isClosed, points, holes, ptsToSubpath]);

  // ── edge labels ─────────────────────────────────────────────────────────
  const edgeLabels = useMemo(() => {
    const n = points.length;
    const result: { x: number; y: number; len: string }[] = [];
    const limit = isClosed ? n : n - 1;
    for (let i = 0; i < limit; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const sa = toSvg(a), sb = toSvg(b);
      const angle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
      result.push({
        x: (sa.x + sb.x) / 2 - Math.sin(angle) * 14,
        y: (sa.y + sb.y) / 2 + Math.cos(angle) * 14,
        len: `${distance(a, b).toFixed(2)} m`,
      });
    }
    return result;
  }, [points, isClosed, toSvg]);

  // ── lame axes ───────────────────────────────────────────────────────────
  const { spreadDir, lambDir } = useMemo(() => lameAxes(lameAngle), [lameAngle]);
  const EXTENT = 1000;

  // ── derived ─────────────────────────────────────────────────────────────
  const cursorSvg = mouse   ? toSvg(mouse)   : null;
  const prevSvg   = points.length > 0 ? toSvg(points[points.length - 1]) : null;
  const firstSvg  = points.length > 0 ? toSvg(points[0])                 : null;
  const lambW     = Math.max(2, scale * 0.045);
  const riveW     = Math.max(3, scale * 0.06);

  const bgImgSvg = bgImage ? {
    x: toSvg({ x: bgImage.meterX, y: bgImage.meterY }).x,
    y: toSvg({ x: bgImage.meterX, y: bgImage.meterY }).y,
    w: bgImage.meterWidth * scale,
    h: bgImage.meterWidth * (bgImage.naturalHeight / bgImage.naturalWidth) * scale,
  } : null;

  const cal1Svg = calibration.p1 ? toSvg(calibration.p1) : null;
  const cal2Svg = calibration.p2 ? toSvg(calibration.p2) : null;

  let cursorStyle = 'crosshair';
  if (isClosed && !isDrawingHole) {
    cursorStyle = 'default';
    if (hoverEdge !== null) cursorStyle = 'pointer';
    if (hoverHoleVertex !== null) cursorStyle = 'grab';
    if (hoverVertex !== null) cursorStyle = 'grab';
    if (interaction.type === 'vertex') cursorStyle = 'grabbing';
    if (interaction.type === 'hole-vertex') cursorStyle = 'grabbing';
  }
  if (interaction.type === 'pan')   cursorStyle = 'grabbing';
  if (interaction.type === 'image') cursorStyle = 'move';
  if (calibration.phase === 'p1' || calibration.phase === 'p2') cursorStyle = 'crosshair';
  if (!isClosed && nearFirst && points.length >= 3) cursorStyle = 'cell';
  if (isDrawingHole && nearFirstHole && currentHole.length >= 3) cursorStyle = 'cell';

  // ── helpers to build a lame parallelogram ───────────────────────────────
  const lamePoly = (nearBase: Point, farBase: Point, runDir: Point) => {
    const corners = [
      toSvg({ x: nearBase.x - EXTENT * runDir.x, y: nearBase.y - EXTENT * runDir.y }),
      toSvg({ x: nearBase.x + EXTENT * runDir.x, y: nearBase.y + EXTENT * runDir.y }),
      toSvg({ x: farBase.x  + EXTENT * runDir.x, y: farBase.y  + EXTENT * runDir.y }),
      toSvg({ x: farBase.x  - EXTENT * runDir.x, y: farBase.y  - EXTENT * runDir.y }),
    ];
    return corners.map(c => `${c.x},${c.y}`).join(' ');
  };

  const essColor  = ESSENCES[lameConfig.essence].color;
  const essGrain  = ESSENCES[lameConfig.essence].grainColor;
  const lameClipId = `${gridId}-lc`;

  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      <svg
        ref={svgRef} width="100%" height="100%"
        style={{ display: 'block', cursor: cursorStyle, background: '#f8f7f2' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <defs>
          {/* Grid patterns */}
          <pattern id={`${gridId}-10`}
            x={((offset.x % g10) + g10) % g10} y={((offset.y % g10) + g10) % g10}
            width={g10} height={g10} patternUnits="userSpaceOnUse">
            <path d={`M ${g10} 0 L 0 0 0 ${g10}`} fill="none" stroke="#e2e0d8" strokeWidth="0.5" />
          </pattern>
          <pattern id={`${gridId}-50`}
            x={((offset.x % g50) + g50) % g50} y={((offset.y % g50) + g50) % g50}
            width={g50} height={g50} patternUnits="userSpaceOnUse">
            <rect width={g50} height={g50} fill={`url(#${gridId}-10)`} />
            <path d={`M ${g50} 0 L 0 0 0 ${g50}`} fill="none" stroke="#ccc8bd" strokeWidth="0.8" />
          </pattern>
          <pattern id={`${gridId}-100`}
            x={((offset.x % g100) + g100) % g100} y={((offset.y % g100) + g100) % g100}
            width={g100} height={g100} patternUnits="userSpaceOnUse">
            <rect width={g100} height={g100} fill={`url(#${gridId}-50)`} />
            <path d={`M ${g100} 0 L 0 0 0 ${g100}`} fill="none" stroke="#b0ab9e" strokeWidth="1.2" />
          </pattern>

          {/* Lame clip path — uses evenodd so holes are excluded */}
          {isClosed && lameConfig.visible && shapePath && (
            <clipPath id={lameClipId}>
              <path d={shapePath} clipRule="evenodd" fillRule="evenodd" />
            </clipPath>
          )}
          {/* Inactive section clip paths */}
          {inactiveSections?.map((sec, si) => {
            const sp = [sec.points, ...sec.holes].map(ptsToSubpath).join(' ');
            if (!sp) return null;
            return (
              <clipPath key={`ic-clip-${si}`} id={`${gridId}-ic${si}`}>
                <path d={sp} clipRule="evenodd" fillRule="evenodd" />
              </clipPath>
            );
          })}
        </defs>

        {/* Background grid */}
        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${gridId}-100)`} />

        {/* Origin cross */}
        <g stroke="#9e9087" strokeWidth="1">
          <line x1={offset.x - 12} y1={offset.y} x2={offset.x + 12} y2={offset.y} />
          <line x1={offset.x} y1={offset.y - 12} x2={offset.x} y2={offset.y + 12} />
        </g>

        {/* Background image */}
        {bgImgSvg && (
          <>
            <image href={bgImage!.src} x={bgImgSvg.x} y={bgImgSvg.y}
              width={bgImgSvg.w} height={bgImgSvg.h}
              opacity={bgImage!.opacity} style={{ pointerEvents: 'none' }} preserveAspectRatio="none" />
            <rect x={bgImgSvg.x} y={bgImgSvg.y} width={bgImgSvg.w} height={bgImgSvg.h}
              fill="none" stroke="rgba(121,85,72,0.4)" strokeWidth="1" strokeDasharray="6,4"
              style={{ pointerEvents: 'none' }} />
          </>
        )}

        {/* ── Inactive sections ─────────────────────────────────────── */}
        {inactiveSections?.map((sec, si) => {
          const secShapePath = [sec.points, ...sec.holes].map(ptsToSubpath).join(' ');
          if (!secShapePath) return null;
          const secPolyStr = sec.points.map(p => { const sv = toSvg(p); return `${sv.x},${sv.y}`; }).join(' ');
          const clipId = `${gridId}-ic${si}`;
          const secAxes = lameAxes(sec.lameAngle);
          const secColor = ESSENCES[sec.lameConfig.essence].color;
          const secGrain = ESSENCES[sec.lameConfig.essence].grainColor;
          return (
            <g key={`inactive-${si}`} opacity={isClosed && !isDrawingHole ? 1 : 0.6}>
              {/* Fill */}
              <path d={secShapePath} fillRule="evenodd" fill="rgba(139,195,74,0.10)" stroke="none" />
              {/* Lames (simplified — no grain lines) */}
              {sec.lameConfig.visible && sec.lames.length > 0 && (
                <g clipPath={`url(#${clipId})`}>
                  {sec.lames.map((lame, li) => {
                    if (!lame.isRive) {
                      const nb = { x: lame.t * secAxes.lambDir.x, y: lame.t * secAxes.lambDir.y };
                      const fb = { x: (lame.t + lame.width) * secAxes.lambDir.x, y: (lame.t + lame.width) * secAxes.lambDir.y };
                      return <polygon key={li} points={lamePoly(nb, fb, secAxes.spreadDir)}
                        fill={secColor} stroke={secGrain} strokeWidth="0.5" opacity="0.75" />;
                    }
                    const nb = { x: lame.t * secAxes.spreadDir.x, y: lame.t * secAxes.spreadDir.y };
                    const fb = { x: (lame.t + lame.width) * secAxes.spreadDir.x, y: (lame.t + lame.width) * secAxes.spreadDir.y };
                    return <polygon key={li} points={lamePoly(nb, fb, secAxes.lambDir)}
                      fill={secColor} stroke={secGrain} strokeWidth="0.8" opacity="0.80" />;
                  })}
                </g>
              )}
              {/* Outline */}
              <polygon points={secPolyStr} fill="none" stroke="#9e9087" strokeWidth="2" strokeDasharray="6,3" />
              {/* Snap-point vertices */}
              {sec.points.map((p, pi) => {
                const sv = toSvg(p);
                return <circle key={pi} cx={sv.x} cy={sv.y} r={4} fill="#fff" stroke="#9e9087" strokeWidth="1.5" />;
              })}
            </g>
          );
        })}

        {/* Polygon fill (dim, behind lames) — evenodd makes holes transparent */}
        {isClosed && points.length >= 3 && !lameConfig.visible && shapePath && (
          <path d={shapePath} fillRule="evenodd" fill="rgba(139,195,74,0.12)" stroke="none" />
        )}

        {/* ── Lames ─────────────────────────────────────────────────────── */}
        {isClosed && lameConfig.visible && lames.length > 0 && shapePath && (
          <g clipPath={`url(#${lameClipId})`}>
            {lames.map((lame, i) => {
              if (!lame.isRive) {
                const nb = { x: lame.t * lambDir.x, y: lame.t * lambDir.y };
                const fb = { x: (lame.t + lame.width) * lambDir.x, y: (lame.t + lame.width) * lambDir.y };
                const fillColor = lame.isFinition ? `${essColor}bb` : essColor;
                return (
                  <g key={i}>
                    <polygon points={lamePoly(nb, fb, spreadDir)}
                      fill={fillColor} stroke={essGrain} strokeWidth="0.5" opacity="0.88" />
                    {Array.from({ length: Math.floor(lame.width / 0.03) }, (_, gi) => {
                      const gt = lame.t + (gi + 1) * 0.03;
                      const gb = { x: gt * lambDir.x, y: gt * lambDir.y };
                      const gs = toSvg({ x: gb.x - EXTENT * spreadDir.x, y: gb.y - EXTENT * spreadDir.y });
                      const ge = toSvg({ x: gb.x + EXTENT * spreadDir.x, y: gb.y + EXTENT * spreadDir.y });
                      return <line key={gi} x1={gs.x} y1={gs.y} x2={ge.x} y2={ge.y} stroke={essGrain} strokeWidth="0.4" opacity="0.5" />;
                    })}
                  </g>
                );
              }

              const nb = { x: lame.t * spreadDir.x, y: lame.t * spreadDir.y };
              const fb = { x: (lame.t + lame.width) * spreadDir.x, y: (lame.t + lame.width) * spreadDir.y };
              return (
                <g key={i}>
                  <polygon points={lamePoly(nb, fb, lambDir)}
                    fill={essColor} stroke={essGrain} strokeWidth="0.8" opacity="0.92" />
                  {Array.from({ length: Math.floor(lame.width / 0.03) }, (_, gi) => {
                    const gt = lame.t + (gi + 1) * 0.03;
                    const gb = { x: gt * spreadDir.x, y: gt * spreadDir.y };
                    const gs = toSvg({ x: gb.x - EXTENT * lambDir.x, y: gb.y - EXTENT * lambDir.y });
                    const ge = toSvg({ x: gb.x + EXTENT * lambDir.x, y: gb.y + EXTENT * lambDir.y });
                    return <line key={gi} x1={gs.x} y1={gs.y} x2={ge.x} y2={ge.y} stroke={essGrain} strokeWidth="0.4" opacity="0.5" />;
                  })}
                </g>
              );
            })}
          </g>
        )}

        {/* ── Joint lines (calpinage) ─────────────────────────────────────── */}
        {isClosed && lameConfig.visible && lameConfig.lameLength > 0 && lames.length > 0 && shapePath && (() => {
          const spreadProjs = points.map(p => p.x * spreadDir.x + p.y * spreadDir.y);
          const sMin = Math.min(...spreadProjs);
          const sMax = Math.max(...spreadProjs);
          const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
          for (let k = 1; sMin + k * lameConfig.lameLength < sMax; k++) {
            const t = sMin + k * lameConfig.lameLength;
            const origin = { x: t * spreadDir.x, y: t * spreadDir.y };
            const ps = toSvg({ x: origin.x - EXTENT * lambDir.x, y: origin.y - EXTENT * lambDir.y });
            const pe = toSvg({ x: origin.x + EXTENT * lambDir.x, y: origin.y + EXTENT * lambDir.y });
            lines.push({ x1: ps.x, y1: ps.y, x2: pe.x, y2: pe.y });
          }
          return (
            <g clipPath={`url(#${lameClipId})`}>
              {lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeDasharray="4,3" />
              ))}
            </g>
          );
        })()}

        {/* ── Rive boards ─────────────────────────────────────────────────── */}
        {isClosed && lameConfig.visible && riveBoards.length > 0 && shapePath && (
          <g clipPath={`url(#${lameClipId})`}>
            {riveBoards.map(board => {
              const pts = board.corners.map(c => toSvg(c));
              const ptStr = pts.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <g key={board.edgeIndex}>
                  <polygon points={ptStr} fill={essColor} stroke={essGrain} strokeWidth="0.8" opacity="0.92" />
                  {/* Grain lines along board width */}
                  {Array.from({ length: Math.floor(lameConfig.riveWidth / 0.03) }, (_, gi) => {
                    const frac = (gi + 1) * 0.03 / lameConfig.riveWidth;
                    const gA = { x: pts[3].x + frac * (pts[0].x - pts[3].x), y: pts[3].y + frac * (pts[0].y - pts[3].y) };
                    const gB = { x: pts[2].x + frac * (pts[1].x - pts[2].x), y: pts[2].y + frac * (pts[1].y - pts[2].y) };
                    return <line key={gi} x1={gA.x} y1={gA.y} x2={gB.x} y2={gB.y} stroke={essGrain} strokeWidth="0.4" opacity="0.5" />;
                  })}
                </g>
              );
            })}
          </g>
        )}

        {/* ── Lambourde structure ─────────────────────────────────────────── */}
        {structure && showStructure && (
          <g>
            {structure.cadreLambourdes.map((seg, i) => {
              const s = toSvg(seg.start), e2 = toSvg(seg.end);
              return <line key={`c${i}`} x1={s.x} y1={s.y} x2={e2.x} y2={e2.y}
                stroke="#6d4c41" strokeWidth={Math.max(2, scale * 0.04)}
                strokeLinecap="round" opacity="0.85" />;
            })}
            {structure.lambourdes.map((seg, i) => {
              const s = toSvg(seg.start), e2 = toSvg(seg.end);
              return <line key={i} x1={s.x} y1={s.y} x2={e2.x} y2={e2.y}
                stroke={seg.isRive ? '#5d4037' : '#8d6e63'}
                strokeWidth={seg.isRive ? riveW : lambW}
                strokeLinecap="round" opacity="0.9" />;
            })}
            {structure.plots.map((p, i) => {
              const s = toSvg(p);
              return <circle key={i} cx={s.x} cy={s.y} r={Math.max(4, scale * 0.025)}
                fill="#ff9800" stroke="#bf360c" strokeWidth="1.5" />;
            })}
            {structure.cadresPlots.map((p, i) => {
              const s = toSvg(p);
              return <circle key={`cp${i}`} cx={s.x} cy={s.y} r={Math.max(3, scale * 0.02)}
                fill="#ffb74d" stroke="#bf360c" strokeWidth="1" />;
            })}
          </g>
        )}

        {/* ── Polygon outline ─────────────────────────────────────────────── */}
        {points.length >= 2 && (
          <polyline points={polyStr} fill="none" stroke="#388e3c" strokeWidth="2.5" strokeLinejoin="round" />
        )}
        {isClosed && firstSvg && (
          <line x1={toSvg(points[points.length - 1]).x} y1={toSvg(points[points.length - 1]).y}
            x2={firstSvg.x} y2={firstSvg.y} stroke="#388e3c" strokeWidth="2.5" />
        )}

        {/* ── Edge highlights (rive selection) ────────────────────────────── */}
        {isClosed && points.map((p, i) => {
          const b = points[(i + 1) % points.length];
          const sa = toSvg(p), sb = toSvg(b);
          const isRive = lameConfig.riveEdges?.includes(i);
          const isHover = hoverEdge === i;
          if (!isRive && !isHover) return null;
          return (
            <line key={`edge-${i}`}
              x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y}
              stroke={isRive ? '#795548' : 'rgba(121,85,72,0.4)'}
              strokeWidth={isRive ? 6 : 4}
              strokeLinecap="round"
              opacity={isHover && !isRive ? 0.6 : 0.85}
            />
          );
        })}

        {/* ── Hole outlines ───────────────────────────────────────────────── */}
        {isClosed && holes.map((hole, hi) => {
          const hStr = hole.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' ');
          return (
            <g key={`hole-${hi}`}>
              <polygon points={hStr} fill="rgba(21,101,192,0.10)" stroke="#1565c0" strokeWidth="2" strokeDasharray="6,3" />
              {hole.map((p, vi) => {
                const s = toSvg(p);
                const isHov = hoverHoleVertex?.hi === hi && hoverHoleVertex?.vi === vi;
                return <circle key={vi} cx={s.x} cy={s.y}
                  r={isHov ? 7 : 4}
                  fill={isHov ? '#1565c0' : '#fff'}
                  stroke="#1565c0" strokeWidth="1.5" />;
              })}
            </g>
          );
        })}

        {/* ── Current hole being drawn ────────────────────────────────────── */}
        {isDrawingHole && currentHole.length >= 1 && (
          <>
            <polyline
              points={currentHole.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' ')}
              fill="none" stroke="#1565c0" strokeWidth="2.5" strokeLinejoin="round" />
            {/* Preview segment to cursor */}
            {cursorSvg && mouse && calibration.phase === 'idle' && (() => {
              const last = toSvg(currentHole[currentHole.length - 1]);
              const angle = Math.atan2(cursorSvg.y - last.y, cursorSvg.x - last.x);
              const mx = (last.x + cursorSvg.x) / 2 - Math.sin(angle) * 14;
              const my = (last.y + cursorSvg.y) / 2 + Math.cos(angle) * 14;
              const dist = distance(currentHole[currentHole.length - 1], mouse).toFixed(2);
              return (
                <>
                  <line x1={last.x} y1={last.y} x2={cursorSvg.x} y2={cursorSvg.y}
                    stroke="#1565c0" strokeWidth="2" strokeDasharray="6,4" />
                  <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                    fontSize="12" fontFamily="system-ui" fontWeight="600"
                    fill="#1565c0" stroke="white" strokeWidth="3" paintOrder="stroke">
                    {dist} m
                  </text>
                  {nearFirstHole && currentHole.length >= 3 && (() => {
                    const fs = toSvg(currentHole[0]);
                    return <line x1={last.x} y1={last.y} x2={fs.x} y2={fs.y} stroke="#1565c0" strokeWidth="2.5" />;
                  })()}
                </>
              );
            })()}
            {/* Current hole vertices */}
            {currentHole.map((p, i) => {
              const s = toSvg(p);
              const isFirst = i === 0;
              return <circle key={i} cx={s.x} cy={s.y}
                r={isFirst ? 8 : 5}
                fill={isFirst ? (nearFirstHole ? '#1565c0' : '#fff') : '#fff'}
                stroke="#1565c0" strokeWidth="2" />;
            })}
          </>
        )}

        {/* Finition annotation */}
        {isClosed && lameConfig.visible && lameConfig.showFinition && lames.some(l => l.isFinition) && (() => {
          const fl = lames.find(l => l.isFinition)!;
          const tMid = fl.t + fl.width / 2;
          const midM: Point = { x: tMid * lambDir.x, y: tMid * lambDir.y };
          const ms = toSvg(midM);
          return (
            <g>
              <rect x={ms.x - 52} y={ms.y - 10} width={104} height={18} rx="3" fill="rgba(255,152,0,0.85)" />
              <text x={ms.x} y={ms.y} textAnchor="middle" dominantBaseline="middle"
                fontSize="10" fontFamily="system-ui" fill="#fff" fontWeight="700">
                Lame de finition {(fl.width * 100).toFixed(1)} cm
              </text>
            </g>
          );
        })()}

        {/* Preview segment (outer polygon) */}
        {!isClosed && prevSvg && cursorSvg && mouse && calibration.phase === 'idle' && (() => {
          const angle = Math.atan2(cursorSvg.y - prevSvg.y, cursorSvg.x - prevSvg.x);
          const mx = (prevSvg.x + cursorSvg.x) / 2 - Math.sin(angle) * 14;
          const my = (prevSvg.y + cursorSvg.y) / 2 + Math.cos(angle) * 14;
          const dist = distance(points[points.length - 1], mouse).toFixed(2);
          return (
            <g>
              <line x1={prevSvg.x} y1={prevSvg.y} x2={cursorSvg.x} y2={cursorSvg.y}
                stroke="#81c784" strokeWidth="2" strokeDasharray="6,4" />
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                fontSize="12" fontFamily="system-ui" fontWeight="600"
                fill="#1b5e20" stroke="white" strokeWidth="3" paintOrder="stroke">
                {dist} m
              </text>
            </g>
          );
        })()}
        {!isClosed && nearFirst && prevSvg && firstSvg && (
          <line x1={prevSvg.x} y1={prevSvg.y} x2={firstSvg.x} y2={firstSvg.y}
            stroke="#43a047" strokeWidth="2.5" />
        )}

        {/* Vertices (outer polygon) */}
        {points.map((p, i) => {
          const s = toSvg(p);
          const isFirst = i === 0, hov = hoverVertex === i;
          return <circle key={i} cx={s.x} cy={s.y}
            r={isFirst && !isClosed ? 8 : hov ? 8 : 5}
            fill={isFirst && !isClosed ? (nearFirst ? '#43a047' : '#fff') : hov ? '#1565c0' : '#fff'}
            stroke={hov ? '#1565c0' : '#388e3c'} strokeWidth="2" />;
        })}

        {/* Edge labels */}
        {edgeLabels.map((lbl, i) => (
          <text key={i} x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="12" fontFamily="system-ui" fontWeight="600"
            fill="#1b5e20" stroke="white" strokeWidth="3" paintOrder="stroke">
            {lbl.len}
          </text>
        ))}

        {/* Calibration markers */}
        {cal1Svg && (
          <g>
            <line x1={cal1Svg.x - 10} y1={cal1Svg.y} x2={cal1Svg.x + 10} y2={cal1Svg.y} stroke="#d32f2f" strokeWidth="2" />
            <line x1={cal1Svg.x} y1={cal1Svg.y - 10} x2={cal1Svg.x} y2={cal1Svg.y + 10} stroke="#d32f2f" strokeWidth="2" />
            <circle cx={cal1Svg.x} cy={cal1Svg.y} r={6} fill="rgba(211,47,47,0.25)" stroke="#d32f2f" strokeWidth="2" />
            <text x={cal1Svg.x + 12} y={cal1Svg.y - 8} fontSize="12" fontWeight="700"
              fill="#d32f2f" stroke="white" strokeWidth="3" paintOrder="stroke">P1</text>
          </g>
        )}
        {cal2Svg && (
          <g>
            <line x1={cal2Svg.x - 10} y1={cal2Svg.y} x2={cal2Svg.x + 10} y2={cal2Svg.y} stroke="#d32f2f" strokeWidth="2" />
            <line x1={cal2Svg.x} y1={cal2Svg.y - 10} x2={cal2Svg.x} y2={cal2Svg.y + 10} stroke="#d32f2f" strokeWidth="2" />
            <circle cx={cal2Svg.x} cy={cal2Svg.y} r={6} fill="rgba(211,47,47,0.25)" stroke="#d32f2f" strokeWidth="2" />
            <text x={cal2Svg.x + 12} y={cal2Svg.y - 8} fontSize="12" fontWeight="700"
              fill="#d32f2f" stroke="white" strokeWidth="3" paintOrder="stroke">P2</text>
          </g>
        )}
        {cal1Svg && cal2Svg && (
          <line x1={cal1Svg.x} y1={cal1Svg.y} x2={cal2Svg.x} y2={cal2Svg.y}
            stroke="#d32f2f" strokeWidth="1.5" strokeDasharray="5,3" />
        )}

        {/* Snap point indicator */}
        {mouse && snapPoints?.map((sp, i) => {
          const ss = toSvg(sp);
          const curSvg = toSvg(mouse);
          if (Math.hypot(curSvg.x - ss.x, curSvg.y - ss.y) > VERTEX_HIT_PX + 6) return null;
          return <circle key={i} cx={ss.x} cy={ss.y} r={9} fill="none" stroke="#ff9800" strokeWidth="2" strokeDasharray="3,2" />;
        })}

        {/* Cursor coords */}
        {mouse && (
          <g>
            <rect x="8" y="8" width="145" height="22" rx="4" fill="rgba(0,0,0,0.55)" />
            <text x="80" y="19" textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontFamily="monospace" fill="#fff">
              x {mouse.x.toFixed(2)} m  y {mouse.y.toFixed(2)} m
            </text>
          </g>
        )}

        {/* Scale bar */}
        <g transform="translate(20,50)">
          <line x1="0" y1="0" x2={scale} y2="0" stroke="#666" strokeWidth="2" />
          <line x1="0" y1="-5" x2="0" y2="5" stroke="#666" strokeWidth="2" />
          <line x1={scale} y1="-5" x2={scale} y2="5" stroke="#666" strokeWidth="2" />
          <text x={scale / 2} y="-8" textAnchor="middle" fontSize="11" fontFamily="system-ui" fill="#555">1 m</text>
        </g>

        {/* Instruction banners */}
        {(calibration.phase === 'p1' || calibration.phase === 'p2') && (
          <g>
            <rect x="50%" y="0" width="400" height="28" transform="translate(-200,0)" fill="rgba(198,40,40,0.88)" />
            <text x="50%" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontFamily="system-ui" fill="#fff" fontWeight="600">
              {calibration.phase === 'p1' ? 'Cliquez pour placer P1 (premier point connu)' : 'Cliquez pour placer P2 (second point connu)'}
            </text>
          </g>
        )}
        {isDrawingHole && calibration.phase === 'idle' && (
          <g>
            <rect x="50%" y="0" width="400" height="28" transform="translate(-200,0)" fill="rgba(21,101,192,0.88)" />
            <text x="50%" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontFamily="system-ui" fill="#fff" fontWeight="600">
              {currentHole.length < 3 ? 'Dessinez le contour du trou — snap 1 cm'
                : nearFirstHole ? 'Cliquer pour fermer le trou'
                : 'Clic droit / Backspace pour annuler — Escape pour fermer'}
            </text>
          </g>
        )}
        {!isClosed && calibration.phase === 'idle' && (
          <g>
            <rect x="50%" y="0" width="340" height="28" transform="translate(-170,0)" fill="rgba(33,33,33,0.75)" />
            <text x="50%" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontFamily="system-ui" fill="#fff">
              {points.length < 3 ? 'Cliquez pour ajouter des points — snap 1 cm'
                : nearFirst ? 'Cliquer pour fermer le polygone'
                : 'Clic droit / Backspace pour annuler — Escape pour fermer'}
            </text>
          </g>
        )}
        {isClosed && !isDrawingHole && calibration.phase === 'idle' && (
          <g>
            <rect x="50%" y="0" width="340" height="28" transform="translate(-170,0)" fill="rgba(33,33,33,0.65)" />
            <text x="50%" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontFamily="system-ui" fill="#fff">
              Glisser un point pour le déplacer · Alt+glisser = pan · Molette = zoom
              {bgImage ? ' · Ctrl+glisser = déplacer le plan' : ''}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
