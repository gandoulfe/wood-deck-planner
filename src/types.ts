export interface Section {
  id: string;
  name: string;
  points: Point[];
  isClosed: boolean;
  lameAngle: number;   // per-section board angle
  riveEdges: number[]; // per-section rive edge indices
  holes: Point[][];
}

export interface Point {
  x: number; // meters
  y: number; // meters
}

export interface Segment {
  start: Point;
  end: Point;
  isRive: boolean;
}

export interface LambourdeStructure {
  lambourdes: Segment[];
  cadreLambourdes: Segment[]; // supports sous lames de rive
  plots: Point[];
  cadresPlots: Point[];
  totalLength: number;
  cadreTotalLength: number;
  count: number;
  plotCount: number;
}

// ── Lame types ──────────────────────────────────────────────────────────────

export type EssenceType =
  | 'pin_traite'
  | 'thermopin'
  | 'douglas'
  | 'ipe'
  | 'cumaru'
  | 'teck'
  | 'bangkirai'
  | 'composite';

export interface LameConfig {
  visible: boolean;
  width: number;          // board width in m (e.g. 0.145)
  thickness: number;      // board thickness in m (e.g. 0.027, info only)
  gap: number;            // gap between boards in m (e.g. 0.006)
  essence: EssenceType;
  showFinition: boolean;  // show/generate the last partial lame
  riveWidth: number;      // rive board width in m
  riveEdges: number[];    // outer polygon edge indices with rive boards
  lameLength: number;     // standard commercial length in m (0 = libre)
  calpinageMode: 'aligned' | 'half' | 'third'; // joint stagger pattern
}

export interface AppConfig {
  lameAngle: number;      // degrees from horizontal
  entraxe: number;        // m between lambourdes
  plotSpacing: number;    // max m between support plots
  lameConfig: LameConfig;
  showStructure: boolean; // show lambourdes + plots on canvas
}

// ── Background image ─────────────────────────────────────────────────────────

export interface BackgroundImage {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  meterX: number;
  meterY: number;
  meterWidth: number;
  opacity: number;
}

export type CalibrationPhase = 'idle' | 'p1' | 'p2' | 'measure';

export interface CalibrationState {
  phase: CalibrationPhase;
  p1: Point | null;
  p2: Point | null;
  realDistance: number;
}
