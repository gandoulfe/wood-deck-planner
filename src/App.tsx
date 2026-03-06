import { useState, useMemo, useCallback, useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { Panel } from './components/Panel';
import { Point, AppConfig, BackgroundImage, CalibrationState } from './types';
import { generateStructure, getRecommendedEntraxe } from './utils/lambourde';
import { renderPdfPage } from './utils/pdf';
import { generateLames, computeLameMetres, generateRiveBoards } from './utils/lames';
import { saveProject, loadProject, exportProject, importProject } from './utils/storage';
import { Lang, LANGS, t, s, detectLang } from './i18n';
import { UnitSystem, detectUnit } from './utils/units';

const DEFAULT_CONFIG: AppConfig = {
  lameAngle: 0,
  entraxe: 0.50,
  plotSpacing: 0.60,
  showStructure: true,
  lameConfig: {
    visible: true,
    width: 0.145,
    thickness: 0.027,
    gap: 0.006,
    essence: 'pin_traite',
    showFinition: true,
    riveWidth: 0.145,
    riveEdges: [],
    lameLength: 4,
  },
};

const DEFAULT_CALIBRATION: CalibrationState = { phase: 'idle', p1: null, p2: null, realDistance: 1 };

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('lang') as Lang | null;
    return saved && LANGS.some(l => l.code === saved) ? saved : detectLang();
  });

  const handleLangChange = useCallback((l: Lang) => {
    setLang(l);
    localStorage.setItem('lang', l);
  }, []);

  const [unit, setUnit] = useState<UnitSystem>(() => {
    const saved = localStorage.getItem('unit') as UnitSystem | null;
    return saved === 'metric' || saved === 'imperial' ? saved : detectUnit();
  });

  const handleUnitChange = useCallback((u: UnitSystem) => {
    setUnit(u);
    localStorage.setItem('unit', u);
  }, []);

  const [points,   setPoints]   = useState<Point[]>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [config,   setConfig]   = useState<AppConfig>(DEFAULT_CONFIG);
  const [bgImage,  setBgImage]  = useState<BackgroundImage | null>(null);
  const [calibration, setCalibration] = useState<CalibrationState>(DEFAULT_CALIBRATION);

  // ── holes ─────────────────────────────────────────────────────────────
  const [holes,         setHoles]         = useState<Point[][]>([]);
  const [currentHole,   setCurrentHole]   = useState<Point[]>([]);
  const [isDrawingHole, setIsDrawingHole] = useState(false);

  // ── restore on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadProject();
    if (!saved) return;
    setPoints(saved.points ?? []);
    setIsClosed(saved.isClosed ?? false);
    setConfig(prev => ({ ...prev, ...saved.config, lameConfig: { ...prev.lameConfig, ...saved.config?.lameConfig } }));
    setHoles(saved.holes ?? []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto-save ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isClosed && points.length === 0) return;
    saveProject({ points, isClosed, config, holes });
  }, [points, isClosed, config, holes]);

  // ── polygon ───────────────────────────────────────────────────────────
  const handlePointAdd   = useCallback((p: Point) => setPoints(prev => [...prev, p]), []);
  const handleClose      = useCallback(() => { if (points.length >= 3) setIsClosed(true); }, [points.length]);
  const handleUndo       = useCallback(() => {
    if (isClosed) {
      setIsClosed(false);
      setConfig(prev => ({ ...prev, lameConfig: { ...prev.lameConfig, riveEdges: [] } }));
    } else {
      setPoints(prev => prev.slice(0, -1));
    }
  }, [isClosed]);
  const handleReset      = useCallback(() => {
    setPoints([]); setIsClosed(false);
    setHoles([]); setCurrentHole([]); setIsDrawingHole(false);
  }, []);
  const handleVertexMove = useCallback((index: number, p: Point) => {
    setPoints(prev => prev.map((pt, i) => i === index ? p : pt));
  }, []);

  // ── hole handlers ─────────────────────────────────────────────────────
  const handleAddHole = useCallback(() => {
    setCurrentHole([]);
    setIsDrawingHole(true);
  }, []);

  const handleHolePointAdd = useCallback((p: Point) => setCurrentHole(prev => [...prev, p]), []);

  const handleHoleClose = useCallback(() => {
    if (currentHole.length >= 3) {
      setHoles(prev => [...prev, currentHole]);
      setCurrentHole([]);
      setIsDrawingHole(false);
    }
  }, [currentHole]);

  const handleHoleUndo = useCallback(() => {
    if (currentHole.length > 0) {
      setCurrentHole(prev => prev.slice(0, -1));
    } else {
      setIsDrawingHole(false);
    }
  }, [currentHole.length]);

  const handleCancelHole = useCallback(() => {
    setCurrentHole([]);
    setIsDrawingHole(false);
  }, []);

  const handleDeleteHole = useCallback((index: number) => {
    setHoles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleHoleVertexMove = useCallback((holeIndex: number, vertexIndex: number, p: Point) => {
    setHoles(prev => prev.map((hole, hi) =>
      hi === holeIndex ? hole.map((pt, vi) => vi === vertexIndex ? p : pt) : hole,
    ));
  }, []);

  const handleToggleRiveEdge = useCallback((edgeIndex: number) => {
    setConfig(prev => {
      const curr = prev.lameConfig.riveEdges;
      const next = curr.includes(edgeIndex) ? curr.filter(e => e !== edgeIndex) : [...curr, edgeIndex];
      return { ...prev, lameConfig: { ...prev.lameConfig, riveEdges: next } };
    });
  }, []);

  // ── config ────────────────────────────────────────────────────────────
  const handleConfigChange = useCallback((c: AppConfig) => {
    if (c.lameAngle !== config.lameAngle) {
      const wasReco = Math.abs(config.entraxe - getRecommendedEntraxe(config.lameAngle)) < 0.001;
      if (wasReco) c = { ...c, entraxe: getRecommendedEntraxe(c.lameAngle) };
    }
    setConfig(c);
  }, [config]);

  // ── computed ──────────────────────────────────────────────────────────
  const structure = useMemo(() => {
    if (!isClosed || points.length < 3) return null;
    return generateStructure(points, holes, config);
  }, [isClosed, points, holes, config]);

  const lameItems = useMemo(() => {
    if (!isClosed || points.length < 3) return [];
    return generateLames(points, config.lameAngle, config.lameConfig);
  }, [isClosed, points, config.lameAngle, config.lameConfig]);

  const riveBoards = useMemo(() => {
    if (!isClosed || points.length < 3) return [];
    return generateRiveBoards(points, config.lameConfig.riveEdges, config.lameConfig.riveWidth);
  }, [isClosed, points, config.lameConfig.riveEdges, config.lameConfig.riveWidth]);

  const lameMetres = useMemo(() => {
    if (!isClosed || points.length < 3) return null;
    return computeLameMetres(lameItems, points, holes, config.lameAngle, riveBoards, config.entraxe, config.lameConfig.lameLength);
  }, [isClosed, points, holes, lameItems, config.lameAngle, riveBoards, config.entraxe, config.lameConfig.lameLength]);

  // ── background image ──────────────────────────────────────────────────
  const placeImage = useCallback((src: string, naturalWidth: number, naturalHeight: number) => {
    const meterWidth = 10;
    setBgImage({
      src, naturalWidth, naturalHeight,
      meterX: -meterWidth / 2,
      meterY: -(meterWidth * naturalHeight / naturalWidth) / 2,
      meterWidth, opacity: 0.55,
    });
    setCalibration(DEFAULT_CALIBRATION);
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (file.type === 'application/pdf') {
      const { src, w, h } = await renderPdfPage(file);
      placeImage(src, w, h);
    } else if (file.type.startsWith('image/')) {
      const src = await new Promise<string>(res => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>(res => { img.onload = () => res(); img.src = src; });
      placeImage(src, img.naturalWidth, img.naturalHeight);
    }
  }, [placeImage]);

  const handleBgImageOpacity = useCallback((opacity: number) => setBgImage(prev => prev ? { ...prev, opacity } : null), []);
  const handleBgImageRemove  = useCallback(() => { setBgImage(null); setCalibration(DEFAULT_CALIBRATION); }, []);
  const handleBgImageMove    = useCallback((meterX: number, meterY: number) => setBgImage(prev => prev ? { ...prev, meterX, meterY } : null), []);

  // ── export / import ───────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    exportProject({ points, isClosed, config, holes, bgImage });
  }, [points, isClosed, config, holes, bgImage]);

  const handleImport = useCallback(async (file: File) => {
    const data = await importProject(file);
    setPoints(data.points ?? []);
    setIsClosed(data.isClosed ?? false);
    setConfig(prev => ({ ...prev, ...data.config, lameConfig: { ...prev.lameConfig, ...data.config?.lameConfig } }));
    setHoles(data.holes ?? []);
    if (data.bgImage) setBgImage(data.bgImage);
    setCurrentHole([]);
    setIsDrawingHole(false);
    setCalibration(DEFAULT_CALIBRATION);
  }, []);

  // ── calibration ───────────────────────────────────────────────────────
  const handleCalibrationStart          = useCallback(() => setCalibration({ phase: 'p1', p1: null, p2: null, realDistance: 1 }), []);
  const handleCalibrationDistanceChange = useCallback((d: number) => setCalibration(prev => ({ ...prev, realDistance: d })), []);
  const handleCalibrationCancel         = useCallback(() => setCalibration(DEFAULT_CALIBRATION), []);

  const handleCalibrationPoint = useCallback((p: Point) => {
    setCalibration(prev => {
      if (prev.phase === 'p1') return { ...prev, phase: 'p2', p1: p };
      if (prev.phase === 'p2') return { ...prev, phase: 'measure', p2: p };
      return prev;
    });
  }, []);

  const handleCalibrationApply = useCallback(() => {
    if (!calibration.p1 || !calibration.p2 || !bgImage) return;
    const d = Math.hypot(calibration.p2.x - calibration.p1.x, calibration.p2.y - calibration.p1.y);
    if (d < 1e-6) return;
    const factor = calibration.realDistance / d;
    const midX   = (calibration.p1.x + calibration.p2.x) / 2;
    const midY   = (calibration.p1.y + calibration.p2.y) / 2;
    setBgImage(prev => {
      if (!prev) return null;
      const mH = prev.meterWidth * prev.naturalHeight / prev.naturalWidth;
      const rx  = (midX - prev.meterX) / prev.meterWidth;
      const ry  = (midY - prev.meterY) / mH;
      const nW  = prev.meterWidth * factor;
      const nH  = nW * prev.naturalHeight / prev.naturalWidth;
      return { ...prev, meterWidth: nW, meterX: midX - rx * nW, meterY: midY - ry * nH };
    });
    setCalibration(DEFAULT_CALIBRATION);
  }, [calibration, bgImage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{
        background: '#4e342e', color: '#fff', padding: '0 20px', height: 48,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      }}>
        <span style={{ fontSize: 20 }}>🪵</span>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t(lang, 'header.title')}</h1>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#bcaaa4', fontStyle: 'italic' }}>
          {!isClosed
            ? t(lang, 'header.statusDrawing', { count: points.length, s: s(lang, points.length), e: points.length === 1 ? '' : 'e' })
            : isDrawingHole
            ? t(lang, 'header.statusDrawingHole', { count: currentHole.length, s: s(lang, currentHole.length), e: currentHole.length === 1 ? '' : 'e' })
            : t(lang, 'header.statusDone')}
        </span>
        {/* Unit toggle */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 10 }}>
          {(['metric', 'imperial'] as UnitSystem[]).map(u => (
            <button key={u} onClick={() => handleUnitChange(u)}
              style={{
                padding: '2px 7px', borderRadius: 4, border: '1px solid',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: unit === u ? '#fff' : 'transparent',
                color:      unit === u ? '#4e342e' : '#d7ccc8',
                borderColor: unit === u ? '#fff' : 'rgba(255,255,255,0.25)',
              }}>
              {u === 'metric' ? 'm' : 'ft'}
            </button>
          ))}
        </div>
        {/* Language selector */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 6 }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => handleLangChange(l.code)}
              style={{
                padding: '2px 6px', borderRadius: 4, border: '1px solid',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: lang === l.code ? '#fff' : 'transparent',
                color:      lang === l.code ? '#4e342e' : '#d7ccc8',
                borderColor: lang === l.code ? '#fff' : 'rgba(255,255,255,0.25)',
              }}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Canvas
          points={points} isClosed={isClosed} structure={structure}
          lames={lameItems} lameConfig={config.lameConfig} lameAngle={config.lameAngle}
          bgImage={bgImage} calibration={calibration}
          holes={holes} currentHole={currentHole} isDrawingHole={isDrawingHole}
          riveBoards={riveBoards} showStructure={config.showStructure}
          onPointAdd={handlePointAdd} onClose={handleClose} onUndo={handleUndo}
          onVertexMove={handleVertexMove} onBgImageMove={handleBgImageMove}
          onCalibrationPoint={handleCalibrationPoint}
          onHolePointAdd={handleHolePointAdd} onHoleClose={handleHoleClose}
          onHoleUndo={handleHoleUndo} onCancelHole={handleCancelHole}
          onHoleVertexMove={handleHoleVertexMove}
          onToggleRiveEdge={handleToggleRiveEdge}
        />
        <Panel
          lang={lang} unit={unit}
          config={config} onChange={handleConfigChange}
          points={points} isClosed={isClosed} structure={structure} lameMetres={lameMetres}
          bgImage={bgImage} calibration={calibration}
          holes={holes} isDrawingHole={isDrawingHole} riveBoards={riveBoards}
          onReset={handleReset} onUndo={handleUndo}
          onFileUpload={handleFileUpload} onBgImageOpacity={handleBgImageOpacity} onBgImageRemove={handleBgImageRemove}
          onCalibrationStart={handleCalibrationStart}
          onCalibrationDistanceChange={handleCalibrationDistanceChange}
          onCalibrationApply={handleCalibrationApply}
          onCalibrationCancel={handleCalibrationCancel}
          onAddHole={handleAddHole} onDeleteHole={handleDeleteHole} onCancelHole={handleCancelHole}
          onExport={handleExport} onImport={handleImport}
        />
      </div>
    </div>
  );
}
