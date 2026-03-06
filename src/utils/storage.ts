import { Point, AppConfig, BackgroundImage, Section } from '../types';

const STORAGE_KEY    = 'terrasse-v2';
const FORMAT_VERSION = 2;

export interface ProjectData {
  version: typeof FORMAT_VERSION;
  sections: Section[];
  activeId: string;
  config: AppConfig;
  bgImage?: BackgroundImage | null;
}

// ── localStorage auto-save ─────────────────────────────────────────────────────

export function saveProject(data: Omit<ProjectData, 'version' | 'bgImage'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: FORMAT_VERSION }));
  } catch { /* quota exceeded — silent */ }
}

export function loadProject(): ProjectData | null {
  try {
    // v2
    const raw2 = localStorage.getItem(STORAGE_KEY);
    if (raw2) {
      const d = JSON.parse(raw2) as ProjectData;
      if (d.version === FORMAT_VERSION && Array.isArray(d.sections)) return d;
    }
    // v1 → migrate
    const raw1 = localStorage.getItem('terrasse-v1');
    if (raw1) {
      const d = JSON.parse(raw1) as {
        version?: number; points?: Point[]; isClosed?: boolean;
        config?: AppConfig; holes?: Point[][];
      };
      if (Array.isArray(d.points)) {
        const section: Section = {
          id: '1', name: 'Section 1',
          points: d.points ?? [],
          isClosed: d.isClosed ?? false,
          lameAngle: d.config?.lameAngle ?? 0,
          riveEdges: d.config?.lameConfig?.riveEdges ?? [],
          holes: d.holes ?? [],
        };
        return { version: 2, sections: [section], activeId: '1', config: d.config! };
      }
    }
    return null;
  } catch { return null; }
}

// ── File export ────────────────────────────────────────────────────────────────

export function exportProject(data: Omit<ProjectData, 'version'>): void {
  const payload: ProjectData = { ...data, version: FORMAT_VERSION };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `terrasse-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── File import ────────────────────────────────────────────────────────────────

export function importProject(file: File): Promise<ProjectData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        // v2
        if (raw.version === 2 && Array.isArray(raw.sections)) { resolve(raw as ProjectData); return; }
        // v1
        if (Array.isArray(raw.points)) {
          const section: Section = {
            id: '1', name: 'Section 1',
            points: raw.points,
            isClosed: raw.isClosed ?? false,
            lameAngle: raw.config?.lameAngle ?? 0,
            riveEdges: raw.config?.lameConfig?.riveEdges ?? [],
            holes: raw.holes ?? [],
          };
          resolve({ version: 2, sections: [section], activeId: '1', config: raw.config });
          return;
        }
        throw new Error('Format invalide');
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
