import { Point, AppConfig, BackgroundImage } from '../types';

const STORAGE_KEY = 'terrasse-v1';
const FORMAT_VERSION = 1;

export interface ProjectData {
  version: typeof FORMAT_VERSION;
  points: Point[];
  isClosed: boolean;
  config: AppConfig;
  holes: Point[][];
  bgImage?: BackgroundImage | null;
}

// ── localStorage auto-save (no bgImage to stay within quota) ──────────────────

export function saveProject(data: Omit<ProjectData, 'version' | 'bgImage'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: FORMAT_VERSION }));
  } catch { /* quota exceeded — silent */ }
}

export function loadProject(): ProjectData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ProjectData;
    if (data.version !== FORMAT_VERSION) return null;
    return data;
  } catch { return null; }
}

export function clearProject(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── File export (full, includes bgImage) ──────────────────────────────────────

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

// ── File import ───────────────────────────────────────────────────────────────

export function importProject(file: File): Promise<ProjectData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ProjectData;
        if (!Array.isArray(data.points)) throw new Error('Format invalide');
        resolve(data);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
