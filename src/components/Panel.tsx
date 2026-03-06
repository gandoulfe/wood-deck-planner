import React, { useRef, useState, useEffect } from 'react';
import { AppConfig, LambourdeStructure, BackgroundImage, CalibrationState, EssenceType } from '../types';
import { getRecommendedEntraxe } from '../utils/lambourde';
import { polygonArea, polygonPerimeter } from '../utils/geometry';
import { ESSENCES, LameMetres, RiveBoard } from '../utils/lames';
import { Point } from '../types';

interface PanelProps {
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

const LAME_PRESETS = [
  { label: '9 cm',    value: 0.090 },
  { label: '12 cm',   value: 0.120 },
  { label: '14.5 cm', value: 0.145 },
  { label: '15 cm',   value: 0.150 },
];

const ANGLE_PRESETS = [
  { label: '0°',  value: 0  },
  { label: '45°', value: 45 },
  { label: '90°', value: 90 },
];

const LAME_LENGTH_PRESETS = [
  { label: 'Libre', value: 0   },
  { label: '2.4 m', value: 2.4 },
  { label: '3 m',   value: 3   },
  { label: '4 m',   value: 4   },
  { label: '4.8 m', value: 4.8 },
  { label: '6 m',   value: 6   },
];

// ── Component ────────────────────────────────────────────────────────────────

export const Panel: React.FC<PanelProps> = ({
  config, onChange,
  points, isClosed, structure, lameMetres,
  bgImage, calibration,
  holes, isDrawingHole, riveBoards,
  onReset, onUndo,
  onFileUpload, onBgImageOpacity, onBgImageRemove,
  onCalibrationStart, onCalibrationDistanceChange, onCalibrationApply, onCalibrationCancel,
  onAddHole, onDeleteHole, onCancelHole,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bgLoading, setBgLoading] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [calibDistStr, setCalibDistStr] = useState(String(calibration.realDistance));
  useEffect(() => { setCalibDistStr(String(calibration.realDistance)); }, [calibration.realDistance]);
  const recommended  = getRecommendedEntraxe(config.lameAngle);
  const holeArea     = holes.reduce((sum, h) => sum + polygonArea(h), 0);
  const area         = isClosed && points.length >= 3 ? polygonArea(points) - holeArea : null;
  const perimeter    = isClosed && points.length >= 3 ? polygonPerimeter(points) : null;
  const lc           = config.lameConfig;

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

  return (
    <aside style={{
      width: 275, minWidth: 275, background: '#efebe9', borderLeft: '1px solid #d7ccc8',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      padding: '12px 13px', fontSize: 13,
    }}>
      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#3e2723' }}>Planificateur de terrasse</h2>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#795548' }}>DTU 51.4 — vue de dessus</p>
      </div>

      {/* ── Plan de fond ────────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>Plan de fond</span>
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
                Chargement…
              </span>
            : bgImage ? '↩ Changer le plan' : '📄 Glisser/cliquer — image ou PDF'}
        </div>
        <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.gif,.pdf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

        {bgImage && (
          <>
            <label style={label}>Opacité</label>
            <input type="range" min={0.05} max={1} step={0.05} value={bgImage.opacity}
              onChange={e => onBgImageOpacity(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#795548', marginBottom: 5 }} />
            <p style={{ fontSize: 10, color: '#8d6e63', margin: '0 0 7px' }}>
              <b>Ctrl + glisser</b> sur le canvas pour déplacer
            </p>

            <span style={label}>Calibrage de l'échelle</span>
            {calibration.phase === 'idle' && (
              <button style={btn('warn')} onClick={onCalibrationStart}>📐 Calibrer l'échelle</button>
            )}
            {(calibration.phase === 'p1' || calibration.phase === 'p2') && (
              <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 5, padding: 7, fontSize: 11, color: '#e65100', marginBottom: 5 }}>
                {calibration.phase === 'p1' ? '① Cliquez sur le canvas → P1' : '② Cliquez sur le canvas → P2'}
              </div>
            )}
            {calibration.phase === 'measure' && (
              <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 5, padding: 7 }}>
                <label style={{ ...label, marginBottom: 5 }}>Distance réelle P1→P2 (m)</label>
                <input style={{ ...inp, marginBottom: 6 }} type="text" inputMode="decimal"
                  value={calibDistStr}
                  onChange={e => {
                    setCalibDistStr(e.target.value);
                    const n = parseFloat(e.target.value.replace(',', '.'));
                    if (!isNaN(n) && n > 0) onCalibrationDistanceChange(n);
                  }} autoFocus />
                <button style={{ ...btn('primary'), marginBottom: 5 }} onClick={onCalibrationApply}>✓ Appliquer l'échelle</button>
              </div>
            )}
            {calibration.phase !== 'idle' && (
              <button style={{ ...btn(), marginTop: 4 }} onClick={onCalibrationCancel}>Annuler le calibrage</button>
            )}
            <div style={{ marginTop: 7 }}>
              <button style={btn('danger')} onClick={onBgImageRemove}>Supprimer le plan</button>
            </div>
          </>
        )}
      </div>

      <hr style={div} />

      {/* ── Orientation lames ───────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>Orientation des lames</span>
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          {ANGLE_PRESETS.map(p => (
            <button key={p.value}
              onClick={() => onChange({ ...config, lameAngle: p.value })}
              style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: '1px solid', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                background: config.lameAngle === p.value ? '#795548' : '#fff',
                color:      config.lameAngle === p.value ? '#fff'    : '#5d4037',
                borderColor: config.lameAngle === p.value ? '#795548' : '#bcaaa4',
                fontWeight: config.lameAngle === p.value ? 700 : 400 }}>
              {p.label}
            </button>
          ))}
        </div>
        <label style={label}>Angle personnalisé (°)</label>
        <input style={inp} type="number" min={0} max={180} step={5}
          value={config.lameAngle}
          onChange={e => onChange({ ...config, lameAngle: Number(e.target.value) })} />
      </div>

      {/* ── Lames ───────────────────────────────────────────────────────── */}
      <div style={sec}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ ...label, marginBottom: 0 }}>Lames</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={lc.visible} onChange={e => setLc({ visible: e.target.checked })} />
            Afficher
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox"
            checked={config.showStructure}
            onChange={e => onChange({ ...config, showStructure: e.target.checked })} />
          Afficher lambourdes + plots
        </label>

        {/* Essence */}
        <label style={label}>Essence</label>
        <select style={{ ...inp, marginBottom: 6 }} value={lc.essence}
          onChange={e => setLc({ essence: e.target.value as EssenceType })}>
          {(Object.entries(ESSENCES) as [EssenceType, typeof ESSENCES[EssenceType]][]).map(([k, v]) => (
            <option key={k} value={k}>{v.label} — {v.defaultSection} mm</option>
          ))}
        </select>

        {/* Width presets */}
        <label style={label}>Largeur lame</label>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {LAME_PRESETS.map(p => (
            <button key={p.value}
              onClick={() => setLc({ width: p.value, riveWidth: p.value })}
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
            <label style={label}>Larg. (m)</label>
            <input style={inp} type="number" min={0.05} max={0.30} step={0.005}
              value={lc.width} onChange={e => setLc({ width: Number(e.target.value) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Ép. (m)</label>
            <input style={inp} type="number" min={0.01} max={0.06} step={0.001}
              value={lc.thickness} onChange={e => setLc({ thickness: Number(e.target.value) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Jeu (m)</label>
            <input style={inp} type="number" min={0} max={0.02} step={0.001}
              value={lc.gap} onChange={e => setLc({ gap: Number(e.target.value) })} />
          </div>
        </div>

        {/* Lame de finition */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', marginTop: 6 }}>
          <input type="checkbox" checked={lc.showFinition} onChange={e => setLc({ showFinition: e.target.checked })} />
          Lame de finition (dernière lame coupée)
        </label>

        {/* Longueur commerciale */}
        <div style={{ marginTop: 8 }}>
          <label style={label}>Longueur standard (calpinage)</label>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 2 }}>
            {LAME_LENGTH_PRESETS.map(p => (
              <button key={p.value}
                onClick={() => setLc({ lameLength: p.value })}
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
            <p style={{ fontSize: 10, color: '#8d6e63', margin: '3px 0 0' }}>
              Joints visibles sur le canvas — tirets blancs
            </p>
          )}
        </div>

        {/* Lames de rive */}
        <div style={{ marginTop: 6 }}>
          <label style={label}>Largeur lame de rive (m)</label>
          <input style={inp} type="number" min={0.05} max={0.30} step={0.005}
            value={lc.riveWidth} onChange={e => setLc({ riveWidth: Number(e.target.value) })} />
          {isClosed && (
            <p style={{ fontSize: 10, color: '#8d6e63', margin: '4px 0 0' }}>
              {lc.riveEdges.length === 0
                ? 'Cliquez sur un bord du dessin pour ajouter une lame de rive.'
                : `${lc.riveEdges.length} bord${lc.riveEdges.length > 1 ? 's' : ''} sélectionné${lc.riveEdges.length > 1 ? 's' : ''} — recliquez pour désactiver.`}
            </p>
          )}
        </div>
      </div>

      {/* ── Entraxe lambourdes ──────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>
          Entraxe lambourdes (m)
          <span style={{ marginLeft: 5, fontWeight: 400, textTransform: 'none',
            color: Math.abs(config.entraxe - recommended) < 0.001 ? '#2e7d32' : '#e65100' }}>
            reco: {recommended * 100} cm
          </span>
        </span>
        <input style={inp} type="number" min={0.20} max={0.80} step={0.05}
          value={config.entraxe} onChange={e => onChange({ ...config, entraxe: Number(e.target.value) })} />
        <input type="range" min={0.20} max={0.80} step={0.05} value={config.entraxe}
          onChange={e => onChange({ ...config, entraxe: Number(e.target.value) })}
          style={{ width: '100%', marginTop: 3, accentColor: '#795548' }} />
      </div>

      {/* ── Espacement plots ────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>Espacement plots (m)</span>
        <input style={inp} type="number" min={0.20} max={1.0} step={0.05}
          value={config.plotSpacing} onChange={e => onChange({ ...config, plotSpacing: Number(e.target.value) })} />
        <input type="range" min={0.20} max={1.0} step={0.05} value={config.plotSpacing}
          onChange={e => onChange({ ...config, plotSpacing: Number(e.target.value) })}
          style={{ width: '100%', marginTop: 3, accentColor: '#795548' }} />
      </div>

      <hr style={div} />

      {/* ── Trous ───────────────────────────────────────────────────────── */}
      {isClosed && (
        <div style={sec}>
          <span style={label}>Trous / Découpes</span>

          {isDrawingHole ? (
            <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 5, padding: 7, marginBottom: 6 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#1565c0' }}>
                Dessinez le contour du trou sur le canvas puis fermez-le (cliquez le 1er point ou Escape).
              </p>
              <button style={btn('danger')} onClick={onCancelHole}>Annuler</button>
            </div>
          ) : (
            <button style={{ ...btn('info'), marginBottom: 6 }} onClick={onAddHole}>
              + Ajouter un trou
            </button>
          )}

          {holes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {holes.map((hole, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 5, padding: '4px 8px', fontSize: 11 }}>
                  <span style={{ color: '#1565c0' }}>
                    Trou {i + 1} — {polygonArea(hole).toFixed(2)} m²
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
        <span style={label}>Légende</span>
        {lc.visible && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="32" height="12">
              <rect x="0" y="1" width="32" height="10" fill={ESSENCES[lc.essence].color} stroke={ESSENCES[lc.essence].grainColor} strokeWidth="0.5" />
            </svg>
            <span>Lames ({ESSENCES[lc.essence].label})</span>
          </div>
        )}
        {[
          { color: '#8d6e63', w: 3.5, label: 'Lambourdes' },
          { color: '#5d4037', w: 4.5, label: 'Lambourdes de rive' },
          { color: '#6d4c41', w: 2.5, label: 'Cadres (sous rive)' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke={item.color} strokeWidth={item.w} strokeLinecap="round" /></svg>
            <span>{item.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="32" height="14"><circle cx="16" cy="7" r="5" fill="#ff9800" stroke="#bf360c" strokeWidth="1.5" /></svg>
          <span>Plots de support</span>
        </div>
        {holes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="32" height="14">
              <rect x="4" y="2" width="24" height="10" fill="rgba(21,101,192,0.10)" stroke="#1565c0" strokeWidth="1.5" strokeDasharray="4,2" />
            </svg>
            <span>Trou / découpe</span>
          </div>
        )}
      </div>

      <hr style={div} />

      {/* ── Métrés ──────────────────────────────────────────────────────── */}
      <div style={sec}>
        <span style={label}>Métrés</span>
        {!isClosed ? (
          <p style={{ color: '#a1887f', fontSize: 11, margin: 0 }}>Fermez le polygone pour voir les métrés.</p>
        ) : (
          <>
            {[
              { label: 'Surface terrasse',  val: `${area!.toFixed(2)} m²` },
              { label: 'Périmètre',         val: `${perimeter!.toFixed(2)} m` },
              holes.length > 0 ? { label: `Découpes (${holes.length})`, val: `-${holeArea.toFixed(2)} m²` } : null,
            ].filter(Boolean).map((r, i) => <div key={i} style={statRow}><span>{r!.label}</span><span style={statVal}>{r!.val}</span></div>)}

            {lameMetres && (
              <>
                <div style={{ ...statRow, marginTop: 4, color: '#5d4037', fontWeight: 600, fontSize: 11 }}>
                  <span>— Lames —</span>
                </div>
                {[
                  { label: 'Lames courantes',  val: `${lameMetres.mainCount} rangées` },
                  lameMetres.finitionCount > 0 ? { label: 'Lames de finition', val: `${lameMetres.finitionCount} pcs` } : null,
                  riveBoards.length > 0 ? { label: 'Lames de rive', val: `${riveBoards.length} pcs (${lameMetres.riveTotalLinear.toFixed(1)} ml)` } : null,
                  { label: 'Total linéaire',   val: `${lameMetres.totalLinear.toFixed(1)} ml` },
                  lameMetres.boardCount > 0 ? { label: `Lames ${lc.lameLength} m à acheter`, val: `${lameMetres.boardCount} pcs` } : null,
                  lameMetres.visCount > 0 ? { label: 'Vis estimées (×2/lambourde)', val: `~${lameMetres.visCount} pcs` } : null,
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={statRow}><span>{r!.label}</span><span style={statVal}>{r!.val}</span></div>
                ))}
              </>
            )}

            {structure && (
              <>
                <div style={{ ...statRow, marginTop: 4, color: '#5d4037', fontWeight: 600, fontSize: 11 }}>
                  <span>— Lambourdes —</span>
                </div>
                {[
                  { label: 'Nombre',         val: `${structure.count} pcs` },
                  { label: 'Longueur totale', val: `${structure.totalLength.toFixed(1)} m` },
                  structure.cadreLambourdes.length > 0
                    ? { label: 'Cadres',       val: `${structure.cadreLambourdes.length} pcs (${structure.cadreTotalLength.toFixed(1)} m)` }
                    : null,
                  { label: 'Plots support',   val: `${structure.plotCount} pcs` },
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={statRow}><span>{r!.label}</span><span style={statVal}>{r!.val}</span></div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <hr style={div} />

      {/* ── Info DTU ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 10, color: '#8d6e63', lineHeight: 1.5, marginBottom: 12 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>Recommandations DTU 51.4</strong>
        Pose droite : entraxe ≤ 50 cm, plots ≤ 80 cm<br />
        Pose 45° : entraxe ≤ 40 cm, plots ≤ 60 cm<br />
        Lambourdes de rive en périphérie — Débord lame max 5 cm
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        {!isClosed && points.length > 0 && (
          <button style={btn()} onClick={onUndo}>↩ Annuler dernier point</button>
        )}
        {isClosed && !isDrawingHole && <button style={btn()} onClick={onUndo}>✏️ Modifier le polygone</button>}
        <button style={btn('danger')} onClick={onReset}>Recommencer</button>
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
            {legalOpen ? 'Fermer' : 'Mentions légales'}
          </button>
        </div>
        {legalOpen && (
          <div style={{ background: '#ede7e3', borderRadius: 5, padding: '6px 8px', color: '#795548', lineHeight: 1.6 }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>Mentions légales & Non-responsabilité</strong>
            Cet outil est fourni à titre indicatif et gratuit, sans aucune garantie d'exactitude ou d'exhaustivité.
            Les calculs sont basés sur le DTU 51.4 mais ne constituent pas un conseil professionnel.
            L'auteur décline toute responsabilité quant aux projets réalisés sur la base de ces estimations.
            Consultez un professionnel avant tout travaux.
          </div>
        )}
      </div>
    </aside>
  );
};
