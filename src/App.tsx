import { useState, useMemo, useCallback } from 'react';
import { Canvas } from './components/Canvas';
import { Panel } from './components/Panel';
import { Point, AppConfig, BackgroundImage, CalibrationState, Section } from './types';
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

function makeSection(id: string, name: string, lameAngle = 0): Section {
  return { id, name, points: [], isClosed: false, lameAngle, riveEdges: [], holes: [] };
}

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

  // ── init from localStorage ─────────────────────────────────────────────
  const [_saved] = useState(() => loadProject());

  const [sections, setSections] = useState<Section[]>(() => {
    if (_saved?.sections?.length) return _saved.sections;
    return [makeSection('1', 'Section 1')];
  });

  const [activeId, setActiveId] = useState<string>(() => _saved?.activeId ?? '1');

  const [config, setConfig] = useState<AppConfig>(() => {
    if (!_saved?.config) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ..._saved.config, lameConfig: { ...DEFAULT_CONFIG.lameConfig, ..._saved.config.lameConfig, riveEdges: [] } };
  });

  const [bgImage,  setBgImage]  = useState<BackgroundImage | null>(() => _saved?.bgImage ?? null);
  const [calibration, setCalibration] = useState<CalibrationState>(DEFAULT_CALIBRATION);

  // ── holes ─────────────────────────────────────────────────────────────
  const [currentHole,   setCurrentHole]   = useState<Point[]>([]);
  const [isDrawingHole, setIsDrawingHole] = useState(false);

  // ── active section helpers ─────────────────────────────────────────────
  const activeSec = sections.find(s => s.id === activeId) ?? sections[0];
  const { points, isClosed, holes } = activeSec;

  const updateActive = useCallback((fn: (s: Section) => Section) => {
    setSections(prev => prev.map(s => s.id === activeId ? fn(s) : s));
  }, [activeId]);

  // ── effective config (merges global config with per-section angle/riveEdges) ──
  const effectiveConfig = useMemo(() => ({
    ...config,
    lameAngle: activeSec.lameAngle,
    lameConfig: { ...config.lameConfig, riveEdges: activeSec.riveEdges },
  }), [config, activeSec.lameAngle, activeSec.riveEdges]);

  // ── auto-save ─────────────────────────────────────────────────────────
  // Note: we use a stable reference for sections/activeId/config
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    const hasData = sections.some(s => s.points.length > 0);
    if (!hasData) return;
    saveProject({ sections, activeId, config });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, activeId, config]);

  // ── polygon ───────────────────────────────────────────────────────────
  const handlePointAdd = useCallback((p: Point) => {
    updateActive(s => ({ ...s, points: [...s.points, p] }));
  }, [updateActive]);

  const handleClose = useCallback(() => {
    if (points.length >= 3) updateActive(s => ({ ...s, isClosed: true }));
  }, [points.length, updateActive]);

  const handleUndo = useCallback(() => {
    if (isClosed) {
      updateActive(s => ({ ...s, isClosed: false, riveEdges: [] }));
    } else {
      updateActive(s => ({ ...s, points: s.points.slice(0, -1) }));
    }
  }, [isClosed, updateActive]);

  const handleReset = useCallback(() => {
    updateActive(s => ({ ...s, points: [], isClosed: false, holes: [], riveEdges: [] }));
    setCurrentHole([]);
    setIsDrawingHole(false);
  }, [updateActive]);

  const handleVertexMove = useCallback((index: number, p: Point) => {
    updateActive(s => ({ ...s, points: s.points.map((pt, i) => i === index ? p : pt) }));
  }, [updateActive]);

  // ── hole handlers ─────────────────────────────────────────────────────
  const handleAddHole = useCallback(() => {
    setCurrentHole([]);
    setIsDrawingHole(true);
  }, []);

  const handleHolePointAdd = useCallback((p: Point) => setCurrentHole(prev => [...prev, p]), []);

  const handleHoleClose = useCallback(() => {
    if (currentHole.length >= 3) {
      updateActive(s => ({ ...s, holes: [...s.holes, currentHole] }));
      setCurrentHole([]);
      setIsDrawingHole(false);
    }
  }, [currentHole, updateActive]);

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
    updateActive(s => ({ ...s, holes: s.holes.filter((_, i) => i !== index) }));
  }, [updateActive]);

  const handleHoleVertexMove = useCallback((holeIndex: number, vertexIndex: number, p: Point) => {
    updateActive(s => ({
      ...s,
      holes: s.holes.map((hole, hi) => hi === holeIndex ? hole.map((pt, vi) => vi === vertexIndex ? p : pt) : hole),
    }));
  }, [updateActive]);

  const handleToggleRiveEdge = useCallback((edgeIndex: number) => {
    updateActive(s => {
      const next = s.riveEdges.includes(edgeIndex)
        ? s.riveEdges.filter(e => e !== edgeIndex)
        : [...s.riveEdges, edgeIndex];
      return { ...s, riveEdges: next };
    });
  }, [updateActive]);

  // ── config ────────────────────────────────────────────────────────────
  const handleConfigChange = useCallback((c: AppConfig) => {
    const prevAngle = activeSec.lameAngle;
    let newC = c;
    if (c.lameAngle !== prevAngle) {
      const wasReco = Math.abs(config.entraxe - getRecommendedEntraxe(prevAngle)) < 0.001;
      if (wasReco) newC = { ...c, entraxe: getRecommendedEntraxe(c.lameAngle) };
      updateActive(s => ({ ...s, lameAngle: newC.lameAngle }));
    }
    // Strip per-section fields from global config
    setConfig({ ...newC, lameConfig: { ...newC.lameConfig, riveEdges: [] } });
  }, [config.entraxe, activeSec.lameAngle, updateActive]);

  // ── section management ─────────────────────────────────────────────────
  const handleAddSection = useCallback(() => {
    const id = String(Date.now());
    const n = sections.length + 1;
    const newSec = makeSection(id, `Section ${n}`, activeSec.lameAngle);
    setSections(prev => [...prev, newSec]);
    setActiveId(id);
    setCurrentHole([]);
    setIsDrawingHole(false);
  }, [sections.length, activeSec.lameAngle]);

  const handleDeleteSection = useCallback((id: string) => {
    setSections(prev => {
      if (prev.length <= 1) {
        setActiveId('1');
        return [makeSection('1', 'Section 1')];
      }
      const filtered = prev.filter(s => s.id !== id);
      if (id === activeId) {
        setActiveId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  }, [activeId]);

  const handleSelectSection = useCallback((id: string) => {
    setActiveId(id);
    setCurrentHole([]);
    setIsDrawingHole(false);
  }, []);

  // ── computed (active section) ─────────────────────────────────────────
  const structure = useMemo(() => {
    if (!isClosed || points.length < 3) return null;
    return generateStructure(points, holes, effectiveConfig);
  }, [isClosed, points, holes, effectiveConfig]);

  const lameItems = useMemo(() => {
    if (!isClosed || points.length < 3) return [];
    return generateLames(points, activeSec.lameAngle, effectiveConfig.lameConfig);
  }, [isClosed, points, activeSec.lameAngle, effectiveConfig.lameConfig]);

  const riveBoards = useMemo(() => {
    if (!isClosed || points.length < 3) return [];
    return generateRiveBoards(points, activeSec.riveEdges, effectiveConfig.lameConfig.riveWidth);
  }, [isClosed, points, activeSec.riveEdges, effectiveConfig.lameConfig.riveWidth]);

  const lameMetres = useMemo(() => {
    if (!isClosed || points.length < 3) return null;
    return computeLameMetres(lameItems, points, holes, activeSec.lameAngle, riveBoards, effectiveConfig.entraxe, effectiveConfig.lameConfig.lameLength);
  }, [isClosed, points, holes, lameItems, activeSec.lameAngle, riveBoards, effectiveConfig.entraxe, effectiveConfig.lameConfig.lameLength]);

  // ── computed (inactive sections for canvas) ───────────────────────────
  const inactiveSections = useMemo(() =>
    sections
      .filter(s => s.id !== activeId && s.isClosed && s.points.length >= 3)
      .map(s => {
        const lc = { ...config.lameConfig, riveEdges: s.riveEdges };
        const secConfig = { ...config, lameAngle: s.lameAngle, lameConfig: lc };
        return {
          id: s.id,
          points: s.points,
          holes: s.holes,
          lames: generateLames(s.points, s.lameAngle, lc),
          riveBoards: generateRiveBoards(s.points, s.riveEdges, lc.riveWidth),
          lameConfig: lc,
          lameAngle: s.lameAngle,
          structure: generateStructure(s.points, s.holes, secConfig),
        };
      }),
  [sections, activeId, config.lameConfig]);

  const snapPoints = useMemo(() =>
    sections
      .filter(s => s.id !== activeId && s.isClosed)
      .flatMap(s => s.points),
  [sections, activeId]);

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
    exportProject({ sections, activeId, config, bgImage });
  }, [sections, activeId, config, bgImage]);

  const handleImport = useCallback(async (file: File) => {
    const data = await importProject(file);
    setSections(data.sections);
    setActiveId(data.activeId);
    setConfig(prev => ({ ...prev, ...data.config, lameConfig: { ...prev.lameConfig, ...data.config?.lameConfig, riveEdges: [] } }));
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
          lames={lameItems} lameConfig={effectiveConfig.lameConfig} lameAngle={effectiveConfig.lameAngle}
          bgImage={bgImage} calibration={calibration}
          holes={holes} currentHole={currentHole} isDrawingHole={isDrawingHole}
          riveBoards={riveBoards} showStructure={effectiveConfig.showStructure}
          inactiveSections={inactiveSections} snapPoints={snapPoints}
          onPointAdd={handlePointAdd} onClose={handleClose} onUndo={handleUndo}
          onVertexMove={handleVertexMove} onBgImageMove={handleBgImageMove}
          onCalibrationPoint={handleCalibrationPoint}
          onHolePointAdd={handleHolePointAdd} onHoleClose={handleHoleClose}
          onHoleUndo={handleHoleUndo} onCancelHole={handleCancelHole}
          onHoleVertexMove={handleHoleVertexMove}
          onToggleRiveEdge={handleToggleRiveEdge}
          onSelectSection={handleSelectSection}
        />
        <Panel
          lang={lang} unit={unit}
          config={effectiveConfig} onChange={handleConfigChange}
          points={points} isClosed={isClosed} structure={structure} lameMetres={lameMetres}
          bgImage={bgImage} calibration={calibration}
          holes={holes} isDrawingHole={isDrawingHole} riveBoards={riveBoards}
          sections={sections} activeId={activeId}
          onAddSection={handleAddSection} onDeleteSection={handleDeleteSection} onSelectSection={handleSelectSection}
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
