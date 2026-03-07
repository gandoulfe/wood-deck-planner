import React, { useRef, useState, useEffect } from 'react';
import { AppConfig, LambourdeStructure, BackgroundImage, CalibrationState, EssenceType, Section } from '../types';
import { getRecommendedEntraxe } from '../utils/lambourde';
import { polygonArea, polygonPerimeter } from '../utils/geometry';
import { ESSENCES, LameMetres, RiveBoard } from '../utils/lames';
import { Point } from '../types';
import { Lang, t, s } from '../i18n';
import { UnitSystem, mToIn, inToM, mToFt, ftToM, fmtLg, fmtAr, unitSm, unitLg } from '../utils/units';

interface PanelProps {
  lang: Lang;
  unit: UnitSystem;
  config: AppConfig;
  onChange: (c: AppConfig) => void;
  points: Point[];
  isClosed: boolean;
  structure: LambourdeStructure | null;
  lameMetres: LameMetres | null;
  bgImage: BackgroundImage | null;
  calibration: CalibrationState;
  holes: Point[][];
  isDrawingHole: boolean;
  riveBoards: RiveBoard[];
  sections: Section[];
  activeId: string;
  onAddSection: () => void;
  onDeleteSection: (id: string) => void;
  onSelectSection: (id: string) => void;
  onReset: () => void;
  onUndo: () => void;
  onFileUpload: (file: File) => Promise<void>;
  onBgImageOpacity: (opacity: number) => void;
  onBgImageRemove: () => void;
  onCalibrationStart: () => void;
  onCalibrationDistanceChange: (d: number) => void;
  onCalibrationApply: () => void;
  onCalibrationCancel: () => void;
  onAddHole: () => void;
  onDeleteHole: (index: number) => void;
  onCancelHole: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

// ── micro style helpers ──────────────────────────────────────────────────────
const label: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#795548',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};
const inp: React.CSSProperties = {
  width: '100%', padding: '5px 7px', border: '1px solid #d7ccc8',
  borderRadius: 5, fontSize: 13, background: '#fff', boxSizing: 'border-box', outline: 'none',
};
const sec: React.CSSProperties = { marginBottom: 16 };
const div: React.CSSProperties = { borderTop: '1px solid #e0d9d3', marginBlock: 12 };
const statRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingBlock: 2, color: '#4e342e' };
const statVal: React.CSSProperties = { fontWeight: 700, color: '#3e2723' };

function btn(variant: 'default' | 'danger' | 'primary' | 'warn' | 'info' = 'default'): React.CSSProperties {
  return {
    width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
    ...(variant === 'danger'  ? { background: '#ffebee', color: '#c62828', borderColor: '#ef9a9a' } :
        variant === 'primary' ? { background: '#795548', color: '#fff',    borderColor: '#795548' } :
        variant === 'warn'    ? { background: '#fff3e0', color: '#e65100', borderColor: '#ffcc80' } :
        variant === 'info'    ? { background: '#e3f2fd', color: '#1565c0', borderColor: '#90caf9' } :
                                { background: '#fff',    color: '#5d4037', borderColor: '#bcaaa4' }),
  };
}

const LAME_PRESETS_M = [0.090, 0.120, 0.145, 0.150];
const ANGLE_PRESETS  = [{ label: '0°', value: 0 }, { label: '45°', value: 45 }, { label: '90°', value: 90 }];
const LAME_LENGTH_M  = [0, 2.4, 3, 4, 4.8, 6];

// ── Component ────────────────────────────────────────────────────────────────

export const Panel: React.FC<PanelProps> = ({
  lang, unit,
  config, onChange,
  points, isClosed, structure, lameMetres,
  bgImage, calibration,
  holes, isDrawingHole, riveBoards,
  sections, activeId, onAddSection, onDeleteSection, onSelectSection,
  onReset, onUndo,
  onFileUpload, onBgImageOpacity, onBgImageRemove,
  onCalibrationStart, onCalibrationDistanceChange, onCalibrationApply, onCalibrationCancel,
  onAddHole, onDeleteHole, onCancelHole,
  onExport, onImport,
}) => {
  // ── i18n helpers ────────────────────────────────────────────────────────
  const T  = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const uSm = unitSm(unit);
  const uLg = unitLg(unit);
  // Replace (m) / (м) in translated labels with current unit
  const TU = (key: string, sm: boolean) =>
    T(key).replace(/\(м\)/g, `(${sm ? uSm : uLg})`).replace(/\(m\)/g, `(${sm ? uSm : uLg})`);

  // ── unit conversion helpers ──────────────────────────────────────────────
  // small lengths (lame width, gap…) ↔ meters
  const toSm  = (m: number) => unit === 'imperial' ? +mToIn(m).toFixed(4) : m;
  const frSm  = (v: number) => unit === 'imperial' ? inToM(v) : v;
  // large lengths (entraxe, spacing, lame length…) ↔ meters
  const toLg  = (m: number) => unit === 'imperial' ? +mToFt(m).toFixed(4) : m;
  const frLg  = (v: number) => unit === 'imperial' ? ftToM(v) : v;

  const stepSm = unit === 'imperial' ? 0.1   : 0.005;
  const stepLg = unit === 'imperial' ? 0.1   : 0.05;
  const stepTh = unit === 'imperial' ? 0.05  : 0.001;

  // ── local state ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRef    = useRef<HTMLInputElement>(null);
  const [bgLoading, setBgLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [prixLameMl,  setPrixLameMl]  = useState(23);    // €/ml — Cumaru 57€/2.45m
  const [prixLambMl,  setPrixLambMl]  = useState(5.20);  // €/ml — invoice default
  const [prixVis,     setPrixVis]     = useState(0.15);  // €/pce
  const [prixPlot,    setPrixPlot]    = useState(2.00);  // €/pce
  const [calibDistStr, setCalibDistStr] = useState(
    String(unit === 'imperial' ? +mToFt(calibration.realDistance).toFixed(3) : calibration.realDistance)
  );
  useEffect(() => {
    setCalibDistStr(
      String(unit === 'imperial' ? +mToFt(calibration.realDistance).toFixed(3) : calibration.realDistance)
    );
  }, [calibration.realDistance, unit]);

  const recommended = getRecommendedEntraxe(config.lameAngle);
  const holeArea    = holes.reduce((sum, h) => sum + polygonArea(h), 0);
  const area        = isClosed && points.length >= 3 ? polygonArea(points) - holeArea : null;
  const perimeter   = isClosed && points.length >= 3 ? polygonPerimeter(points) : null;
  const lc          = config.lameConfig;

  const handleFile = async (file: File) => {
    setBgLoading(true);
    try { await onFileUpload(file); } finally { setBgLoading(false); }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };
  const setLc = (patch: Partial<typeof lc>) => onChange({ ...config, lameConfig: { ...lc, ...patch } });

  // ── presets ──────────────────────────────────────────────────────────────
  const lamePresetsDisplay = LAME_PRESETS_M.map(v => ({
    value: v,
    label: unit === 'imperial' ? `${mToIn(v).toFixed(1)}"` : `${Math.round(v * 100)} cm`,
  }));

  const lameLengthPresets = [
    { label: T('preset.libre'), value: 0 },
    ...LAME_LENGTH_M.filter(v => v > 0).map(v => ({
      label: unit === 'imperial' ? `${mToFt(v).toFixed(1)} ft` : `${v} m`,
      value: v,
    })),
  ];

  return (
    <aside style={{
      width: 275, minWidth: 275, background: '#efebe9', borderLeft: '1px solid #d7ccc8',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      padding: '12px 13px', fontSize: 13,
    }}>
      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#3e2723' }}>{T('panel.title')}</h2>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#795548' }}>{T('panel.subtitle')}</p>
      </div>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div style={sec}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={label}>{T('panel.sections')}</span>
          <button onClick={onAddSection}
            style={{ fontSize: 10, padding: '2px 7px', background: '#795548', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            {T('panel.addSection')}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {sections.map(s => {
            const isActive = s.id === activeId;
            return (
              <div key={s.id} onClick={() => onSelectSection(s.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: isActive ? '#795548' : '#fff',
                  border: `1px solid ${isActive ? '#795548' : '#d7ccc8'}`,
                  borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
                <span style={{ color: isActive ? '#fff' : '#5d4037', fontWeight: isActive ? 700 : 400 }}>
                  {s.name} — {s.lameAngle}°{s.isClosed ? ` · ${s.points.length}pts` : ' · …'}
                </span>
                {sections.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); onDeleteSection(s.id); }}
                    style={{ background: 'none', border: 'none', color: isActive ? '#ffcdd2' : '#c62828',
                      cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <hr style={div} />

      {/* ── Plan de fond ────────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>{T('panel.bgPlan')}</span>
        <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          onClick={() => !bgLoading && fileInputRef.current?.click()}
          style={{
            border: '2px dashed #bcaaa4', borderRadius: 7, padding: '9px 8px',
            textAlign: 'center', cursor: bgLoading ? 'default' : 'pointer', fontSize: 11, color: '#795548',
            marginBottom: 7, background: bgImage ? 'rgba(121,85,72,0.06)' : '#fff',
          }}>
          {bgLoading
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #bcaaa4', borderTopColor: '#795548', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                {T('panel.bgLoading')}
              </span>
            : bgImage ? T('panel.bgChange') : T('panel.bgDrop')}
        </div>
        <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.gif,.pdf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

        {bgImage && (
          <>
            <label style={label}>{T('panel.opacity')}</label>
            <input type="range" min={0.05} max={1} step={0.05} value={bgImage.opacity}
              onChange={e => onBgImageOpacity(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#795548', marginBottom: 5 }} />
            <p style={{ fontSize: 10, color: '#8d6e63', margin: '0 0 7px' }}
              dangerouslySetInnerHTML={{ __html: T('panel.ctrlDrag') }} />

            <span style={label}>{T('panel.calibration')}</span>
            {calibration.phase === 'idle' && (
              <button style={btn('warn')} onClick={onCalibrationStart}>{T('panel.calibrateBtn')}</button>
            )}
            {(calibration.phase === 'p1' || calibration.phase === 'p2') && (
              <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 5, padding: 7, fontSize: 11, color: '#e65100', marginBottom: 5 }}>
                {calibration.phase === 'p1' ? T('panel.calibP1') : T('panel.calibP2')}
              </div>
            )}
            {calibration.phase === 'measure' && (
              <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 5, padding: 7 }}>
                <label style={{ ...label, marginBottom: 5 }}>{TU('panel.calibDistance', false)}</label>
                <input style={{ ...inp, marginBottom: 6 }} type="text" inputMode="decimal"
                  value={calibDistStr}
                  onChange={e => {
                    setCalibDistStr(e.target.value);
                    const n = parseFloat(e.target.value.replace(',', '.'));
                    if (!isNaN(n) && n > 0) onCalibrationDistanceChange(unit === 'imperial' ? ftToM(n) : n);
                  }} autoFocus />
                <button style={{ ...btn('primary'), marginBottom: 5 }} onClick={onCalibrationApply}>{T('panel.calibApply')}</button>
              </div>
            )}
            {calibration.phase !== 'idle' && (
              <button style={{ ...btn(), marginTop: 4 }} onClick={onCalibrationCancel}>{T('panel.calibCancel')}</button>
            )}
            <div style={{ marginTop: 7 }}>
              <button style={btn('danger')} onClick={onBgImageRemove}>{T('panel.bgRemove')}</button>
            </div>
          </>
        )}
      </div>

      <hr style={div} />

      {/* ── Orientation lames ───────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>{T('panel.orientation')}</span>
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          {ANGLE_PRESETS.map(p => (
            <button key={p.value} onClick={() => onChange({ ...config, lameAngle: p.value })}
              style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: '1px solid', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                background: config.lameAngle === p.value ? '#795548' : '#fff',
                color:      config.lameAngle === p.value ? '#fff'    : '#5d4037',
                borderColor: config.lameAngle === p.value ? '#795548' : '#bcaaa4',
                fontWeight: config.lameAngle === p.value ? 700 : 400 }}>
              {p.label}
            </button>
          ))}
        </div>
        <label style={label}>{T('panel.angleCustom')}</label>
        <input style={inp} type="number" min={0} max={180} step={5}
          value={config.lameAngle}
          onChange={e => onChange({ ...config, lameAngle: Number(e.target.value) })} />
      </div>

      {/* ── Lames ───────────────────────────────────────────────────────── */}
      <div style={sec}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ ...label, marginBottom: 0 }}>{T('panel.lames')}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={lc.visible} onChange={e => setLc({ visible: e.target.checked })} />
            {T('panel.show')}
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox" checked={config.showStructure}
            onChange={e => onChange({ ...config, showStructure: e.target.checked })} />
          {T('panel.showStructure')}
        </label>

        <label style={label}>{T('panel.essence')}</label>
        <select style={{ ...inp, marginBottom: 6 }} value={lc.essence}
          onChange={e => setLc({ essence: e.target.value as EssenceType })}>
          {(Object.entries(ESSENCES) as [EssenceType, typeof ESSENCES[EssenceType]][]).map(([k, v]) => (
            <option key={k} value={k}>{v.label} — {v.defaultSection} mm</option>
          ))}
        </select>

        <label style={label}>{T('panel.lameWidth')}</label>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {lamePresetsDisplay.map(p => (
            <button key={p.value} onClick={() => setLc({ width: p.value, riveWidth: p.value })}
              style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: '1px solid', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                background: Math.abs(lc.width - p.value) < 0.001 ? '#795548' : '#fff',
                color:      Math.abs(lc.width - p.value) < 0.001 ? '#fff'    : '#5d4037',
                borderColor: Math.abs(lc.width - p.value) < 0.001 ? '#795548' : '#bcaaa4',
                fontWeight: Math.abs(lc.width - p.value) < 0.001 ? 700 : 400 }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>{TU('panel.lameWidthM', true)}</label>
            <input style={inp} type="number" min={toSm(0.05)} max={toSm(0.30)} step={stepSm}
              value={toSm(lc.width)} onChange={e => setLc({ width: frSm(Number(e.target.value)) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>{TU('panel.lameThickness', true)}</label>
            <input style={inp} type="number" min={toSm(0.01)} max={toSm(0.06)} step={stepTh}
              value={toSm(lc.thickness)} onChange={e => setLc({ thickness: frSm(Number(e.target.value)) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>{TU('panel.lameGap', true)}</label>
            <input style={inp} type="number" min={0} max={toSm(0.02)} step={stepTh}
              value={toSm(lc.gap)} onChange={e => setLc({ gap: frSm(Number(e.target.value)) })} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', marginTop: 6 }}>
          <input type="checkbox" checked={lc.showFinition} onChange={e => setLc({ showFinition: e.target.checked })} />
          {T('panel.showFinition')}
        </label>

        <div style={{ marginTop: 8 }}>
          <label style={label}>{T('panel.lameLength')}</label>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 2 }}>
            {lameLengthPresets.map(p => (
              <button key={p.value} onClick={() => setLc({ lameLength: p.value })}
                style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                  background: Math.abs(lc.lameLength - p.value) < 0.01 ? '#795548' : '#fff',
                  color:      Math.abs(lc.lameLength - p.value) < 0.01 ? '#fff'    : '#5d4037',
                  borderColor: Math.abs(lc.lameLength - p.value) < 0.01 ? '#795548' : '#bcaaa4',
                  fontWeight: Math.abs(lc.lameLength - p.value) < 0.01 ? 700 : 400 }}>
                {p.label}
              </button>
            ))}
          </div>
          {lc.lameLength > 0 && (
            <>
              <p style={{ fontSize: 10, color: '#8d6e63', margin: '3px 0 4px' }}>{T('panel.lameLengthNote')}</p>
              <label style={{ ...label, marginBottom: 3 }}>{T('panel.calpinageMode')}</label>
              <div style={{ display: 'flex', gap: 3 }}>
                {(['aligned', 'half', 'third'] as const).map(mode => (
                  <button key={mode} onClick={() => setLc({ calpinageMode: mode })}
                    style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: '1px solid', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                      background: (lc.calpinageMode ?? 'aligned') === mode ? '#795548' : '#fff',
                      color:      (lc.calpinageMode ?? 'aligned') === mode ? '#fff'    : '#5d4037',
                      borderColor: (lc.calpinageMode ?? 'aligned') === mode ? '#795548' : '#bcaaa4',
                      fontWeight: (lc.calpinageMode ?? 'aligned') === mode ? 700 : 400 }}>
                    {mode === 'aligned' ? T('panel.calpinageAligned') : mode === 'half' ? T('panel.calpinageHalf') : T('panel.calpinageThird')}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 6 }}>
          <label style={label}>{TU('panel.riveWidth', true)}</label>
          <input style={inp} type="number" min={toSm(0.05)} max={toSm(0.30)} step={stepSm}
            value={toSm(lc.riveWidth)} onChange={e => setLc({ riveWidth: frSm(Number(e.target.value)) })} />
          {isClosed && (
            <p style={{ fontSize: 10, color: '#8d6e63', margin: '4px 0 0' }}>
              {lc.riveEdges.length === 0
                ? T('panel.riveHint')
                : T('panel.riveSelected', { count: lc.riveEdges.length, s: s(lang, lc.riveEdges.length), n: lc.riveEdges.length === 1 ? '' : 'n' })}
            </p>
          )}
        </div>
      </div>

      {/* ── Entraxe lambourdes ──────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>
          {TU('panel.entraxe', false)}
          <span style={{ marginLeft: 5, fontWeight: 400, textTransform: 'none',
            color: Math.abs(config.entraxe - recommended) < 0.001 ? '#2e7d32' : '#e65100' }}>
            {T('panel.reco', { val: unit === 'imperial' ? mToFt(recommended).toFixed(2) : recommended * 100 })}{unit === 'imperial' ? ' ft' : ''}
          </span>
        </span>
        <input style={inp} type="number" min={toLg(0.20)} max={toLg(0.80)} step={stepLg}
          value={toLg(config.entraxe)} onChange={e => onChange({ ...config, entraxe: frLg(Number(e.target.value)) })} />
        <input type="range" min={toLg(0.20)} max={toLg(0.80)} step={stepLg}
          value={toLg(config.entraxe)} onChange={e => onChange({ ...config, entraxe: frLg(Number(e.target.value)) })}
          style={{ width: '100%', marginTop: 3, accentColor: '#795548' }} />
      </div>

      {/* ── Espacement plots ────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>{TU('panel.plotSpacing', false)}</span>
        <input style={inp} type="number" min={toLg(0.20)} max={toLg(1.0)} step={stepLg}
          value={toLg(config.plotSpacing)} onChange={e => onChange({ ...config, plotSpacing: frLg(Number(e.target.value)) })} />
        <input type="range" min={toLg(0.20)} max={toLg(1.0)} step={stepLg}
          value={toLg(config.plotSpacing)} onChange={e => onChange({ ...config, plotSpacing: frLg(Number(e.target.value)) })}
          style={{ width: '100%', marginTop: 3, accentColor: '#795548' }} />
      </div>

      <hr style={div} />

      {/* ── Trous ───────────────────────────────────────────────────────── */}
      {isClosed && (
        <div style={sec}>
          <span style={label}>{T('panel.holes')}</span>
          {isDrawingHole ? (
            <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 5, padding: 7, marginBottom: 6 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#1565c0' }}>{T('panel.holeInstruction')}</p>
              <button style={btn('danger')} onClick={onCancelHole}>{T('panel.holeCancel')}</button>
            </div>
          ) : (
            <button style={{ ...btn('info'), marginBottom: 6 }} onClick={onAddHole}>{T('panel.holeAdd')}</button>
          )}
          {holes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {holes.map((hole, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 5, padding: '4px 8px', fontSize: 11 }}>
                  <span style={{ color: '#1565c0' }}>
                    {T('panel.holeItem', { n: i + 1, area: unit === 'imperial'
                      ? `${(polygonArea(hole) * 10.7639).toFixed(2)} ft²`
                      : `${polygonArea(hole).toFixed(2)} m²` })}
                  </span>
                  <button onClick={() => onDeleteHole(i)}
                    style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isClosed && <hr style={div} />}

      {/* ── Légende ─────────────────────────────────────────────────────── */}
      <div style={{ ...sec, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={label}>{T('panel.legend')}</span>
        {lc.visible && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="32" height="12">
              <rect x="0" y="1" width="32" height="10" fill={ESSENCES[lc.essence].color} stroke={ESSENCES[lc.essence].grainColor} strokeWidth="0.5" />
            </svg>
            <span>{T('panel.legendLames', { essence: ESSENCES[lc.essence].label })}</span>
          </div>
        )}
        {[
          { color: '#8d6e63', w: 3.5, key: 'panel.legendLambourdes' },
          { color: '#5d4037', w: 4.5, key: 'panel.legendRive' },
          { color: '#6d4c41', w: 2.5, key: 'panel.legendCadres' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke={item.color} strokeWidth={item.w} strokeLinecap="round" /></svg>
            <span>{T(item.key)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="32" height="14"><circle cx="16" cy="7" r="5" fill="#ff9800" stroke="#bf360c" strokeWidth="1.5" /></svg>
          <span>{T('panel.legendPlots')}</span>
        </div>
        {holes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="32" height="14">
              <rect x="4" y="2" width="24" height="10" fill="rgba(21,101,192,0.10)" stroke="#1565c0" strokeWidth="1.5" strokeDasharray="4,2" />
            </svg>
            <span>{T('panel.legendHole')}</span>
          </div>
        )}
      </div>

      <hr style={div} />

      {/* ── Métrés ──────────────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>{T('panel.metres')}</span>
        {!isClosed ? (
          <p style={{ color: '#a1887f', fontSize: 11, margin: 0 }}>{T('panel.metresClosed')}</p>
        ) : (
          <>
            {[
              { label: T('panel.surfaceTerrasse'), val: fmtAr(area!, unit) },
              { label: T('panel.perimeter'),       val: fmtLg(perimeter!, unit) },
              holes.length > 0 ? { label: T('panel.decoupes', { count: holes.length }), val: `-${fmtAr(holeArea, unit)}` } : null,
            ].filter(Boolean).map((r, i) => (
              <div key={i} style={statRow}><span>{r!.label}</span><span style={statVal}>{r!.val}</span></div>
            ))}

            {lameMetres && (
              <>
                <div style={{ ...statRow, marginTop: 4, color: '#5d4037', fontWeight: 600, fontSize: 11 }}>
                  <span>{T('panel.lamesHeader')}</span>
                </div>
                {[
                  { label: T('panel.lamesCourantes'), val: `${lameMetres.mainCount} ${T('panel.rangees')}` },
                  lameMetres.finitionCount > 0 ? { label: T('panel.lamesFinition'), val: `${lameMetres.finitionCount} pcs` } : null,
                  riveBoards.length > 0 ? { label: T('panel.lamesRive'), val: `${riveBoards.length} pcs (${fmtLg(lameMetres.riveTotalLinear, unit, 1)})` } : null,
                  { label: T('panel.totalLineaire'), val: fmtLg(lameMetres.totalLinear, unit, 1) },
                  lameMetres.boardCount > 0 ? { label: T('panel.lamesAcheter', { length: unit === 'imperial' ? mToFt(lc.lameLength).toFixed(1) : lc.lameLength }), val: `${lameMetres.boardCount} pcs` } : null,
                  lameMetres.visCount > 0 ? { label: T('panel.vis'), val: `~${lameMetres.visCount} pcs` } : null,
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={statRow}><span>{r!.label}</span><span style={statVal}>{r!.val}</span></div>
                ))}
              </>
            )}

            {structure && (
              <>
                <div style={{ ...statRow, marginTop: 4, color: '#5d4037', fontWeight: 600, fontSize: 11 }}>
                  <span>{T('panel.lambourdesHeader')}</span>
                </div>
                {[
                  { label: T('panel.lambourdesCount'), val: `${structure.count} pcs` },
                  { label: T('panel.lambourdesTotal'), val: fmtLg(structure.totalLength, unit, 1) },
                  structure.cadreLambourdes.length > 0
                    ? { label: T('panel.cadres'), val: `${structure.cadreLambourdes.length} pcs (${fmtLg(structure.cadreTotalLength, unit, 1)})` }
                    : null,
                  { label: T('panel.plots'), val: `${structure.plotCount} pcs` },
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={statRow}><span>{r!.label}</span><span style={statVal}>{r!.val}</span></div>
                ))}
              </>
            )}

            {/* ── Estimation de prix ────────────────────────────────────── */}
            {(lameMetres || structure) && (() => {
              const totalLameLinear = (lameMetres?.totalLinear ?? 0) + (lameMetres?.riveTotalLinear ?? 0);
              const totalLambLinear = (structure?.totalLength ?? 0) + (structure?.cadreTotalLength ?? 0);
              const costLames  = totalLameLinear * prixLameMl;
              const costLamb   = totalLambLinear * prixLambMl;
              const costVis    = (lameMetres?.visCount ?? 0) * prixVis;
              const costPlots  = (structure?.plotCount ?? 0) * prixPlot;
              const total      = costLames + costLamb + costVis + costPlots;
              const fmt = (n: number) => n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' €';
              const inpSm: React.CSSProperties = { ...inp, padding: '3px 5px', fontSize: 11, textAlign: 'right' };
              return (
                <div style={{ marginTop: 8, borderTop: '1px dashed #d7ccc8', paddingTop: 8 }}>
                  <div style={{ ...statRow, color: '#5d4037', fontWeight: 600, fontSize: 11, marginBottom: 5 }}>
                    <span>{T('panel.prixHeader')}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', marginBottom: 5 }}>
                    {([
                      [T('panel.prixLameMl'),  prixLameMl,  setPrixLameMl],
                      [T('panel.prixLambMl'),  prixLambMl,  setPrixLambMl],
                      [T('panel.prixVisPce'),  prixVis,     setPrixVis],
                      [T('panel.prixPlotPce'), prixPlot,    setPrixPlot],
                    ] as [string, number, (v: number) => void][]).map(([lbl, val, set]) => (
                      <div key={lbl}>
                        <div style={{ fontSize: 9, color: '#795548', fontWeight: 600, marginBottom: 1 }}>{lbl}</div>
                        <input style={inpSm} type="number" min={0} step={0.01}
                          value={val} onChange={e => set(Number(e.target.value))} />
                      </div>
                    ))}
                  </div>
                  {[
                    { label: T('panel.prixLameMl'),  val: fmt(costLames) },
                    { label: T('panel.prixLambMl'),  val: fmt(costLamb) },
                    { label: T('panel.prixVisPce'),  val: fmt(costVis) },
                    { label: T('panel.prixPlotPce'), val: fmt(costPlots) },
                  ].map((r, i) => (
                    <div key={i} style={{ ...statRow, fontSize: 11, color: '#8d6e63' }}>
                      <span>{r.label}</span><span>{r.val}</span>
                    </div>
                  ))}
                  <div style={{ ...statRow, marginTop: 4, fontWeight: 700, fontSize: 13, color: '#3e2723', borderTop: '1px solid #bcaaa4', paddingTop: 4 }}>
                    <span>{T('panel.prixTotal')}</span>
                    <span style={{ color: '#4e342e' }}>{fmt(total)}</span>
                  </div>
                  <p style={{ fontSize: 9, color: '#a1887f', margin: '4px 0 0' }}>{T('panel.prixNote')}</p>
                </div>
              );
            })()}
          </>
        )}
      </div>

      <hr style={div} />

      {/* ── Info DTU ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 10, color: '#8d6e63', lineHeight: 1.5, marginBottom: 12 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>{T('panel.dtuTitle')}</strong>
        {T('panel.dtuLine1')}<br />
        {T('panel.dtuLine2')}<br />
        {T('panel.dtuLine3')}
      </div>

      {/* ── Projet ──────────────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>{T('panel.projet')}</span>
        <p style={{ fontSize: 10, color: '#8d6e63', margin: '0 0 6px' }}>{T('panel.projetAuto')}</p>
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={{ ...btn('primary'), flex: 1 }} onClick={onExport}>{T('panel.export')}</button>
          <button style={{ ...btn(), flex: 1 }} onClick={() => { setImportError(null); importRef.current?.click(); }}>
            {T('panel.import')}
          </button>
        </div>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { await onImport(f); setImportError(null); }
            catch { setImportError(T('panel.importError')); }
            e.target.value = '';
          }} />
        {importError && <p style={{ fontSize: 10, color: '#c62828', margin: '4px 0 0' }}>{importError}</p>}
      </div>

      <hr style={div} />

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        {!isClosed && points.length > 0 && (
          <button style={btn()} onClick={onUndo}>{T('panel.undo')}</button>
        )}
        {isClosed && !isDrawingHole && <button style={btn()} onClick={onUndo}>{T('panel.modify')}</button>}
        <button style={btn('danger')} onClick={onReset}>{T('panel.reset')}</button>
      </div>

      <hr style={div} />

      {/* ── Crédit + Mentions légales ────────────────────────────────── */}
      <div style={{ fontSize: 10, color: '#a1887f', lineHeight: 1.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <a href="https://x.com/Gandoulfe" target="_blank" rel="noopener noreferrer"
            style={{ color: '#795548', fontWeight: 700, textDecoration: 'none' }}>
            Par @Gandoulfe
          </a>
          <button onClick={() => setLegalOpen(v => !v)}
            style={{ background: 'none', border: 'none', color: '#a1887f', cursor: 'pointer', fontSize: 10, padding: 0, textDecoration: 'underline' }}>
            {legalOpen ? T('panel.legalClose') : T('panel.legal')}
          </button>
        </div>
        {legalOpen && (
          <div style={{ background: '#ede7e3', borderRadius: 5, padding: '6px 8px', color: '#795548', lineHeight: 1.6 }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>{T('panel.legalTitle')}</strong>
            {T('panel.legalText')}
          </div>
        )}
      </div>
    </aside>
  );
};
