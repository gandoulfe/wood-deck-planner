import React, { useState, useEffect } from 'react';
import { Lang } from '../i18n';

interface Step { icon: string; title: string; text: string; }
type TutorialData = { modalTitle: string; close: string; prev: string; next: string; finish: string; steps: Step[] };

const DATA: Record<Lang, TutorialData> = {
  fr: {
    modalTitle: "Guide d'utilisation",
    close: 'Fermer', prev: '← Précédent', next: 'Suivant →', finish: '✓ Terminer',
    steps: [
      { icon: '✏️', title: 'Dessiner le polygone',
        text: 'Cliquez sur le canvas pour placer des points. Fermez le contour en cliquant sur le 1er point (cercle vert) ou appuyez sur Escape (≥ 3 points). Clic droit ou Backspace = annuler le dernier point.' },
      { icon: '↔️', title: 'Modifier le tracé',
        text: 'Glissez un sommet pour le déplacer — accrochage au centimètre. Cliquez "Modifier le polygone" pour rouvrir le contour. Molette = zoom · Alt+glisser = déplacer la vue.' },
      { icon: '🪵', title: 'Orientation des lames',
        text: 'Choisissez 0°, 45° ou 90°, ou entrez un angle libre. L\'entraxe des lambourdes est ajusté automatiquement selon le DTU 51.4. Cliquez sur un bord du polygone pour y ajouter une lame de rive.' },
      { icon: '⬜', title: 'Trous et découpes',
        text: 'Fermez d\'abord le polygone. Cliquez "+ Ajouter un trou" puis dessinez le contour de la découpe sur le canvas. Fermez-le en cliquant sur le 1er point ou appuyez sur Escape.' },
      { icon: '📐', title: 'Plusieurs sections',
        text: 'Ajoutez une section avec "+ Nouvelle section" pour un angle de lames différent. Cliquez sur une section pour l\'activer. Placez un point sur un sommet voisin pour les fusionner — indicateur orange et accrochage automatique.' },
      { icon: '🗺️', title: 'Plan de fond',
        text: 'Glissez un PDF ou une image sur le canvas. Cliquez "Calibrer l\'échelle" et cliquez 2 points de distance connue pour ajuster l\'échelle. Ctrl+glisser pour déplacer le plan.' },
      { icon: '💾', title: 'Sauvegarde & Export',
        text: 'Le projet est sauvegardé automatiquement dans le navigateur (sans plan de fond). Exportez en .json pour archiver ou partager. Importez pour reprendre un projet existant.' },
    ],
  },
  en: {
    modalTitle: 'User Guide',
    close: 'Close', prev: '← Back', next: 'Next →', finish: '✓ Done',
    steps: [
      { icon: '✏️', title: 'Draw the polygon',
        text: 'Click on the canvas to place points. Close the outline by clicking the 1st point (green circle) or press Escape (≥ 3 points). Right-click or Backspace = undo last point.' },
      { icon: '↔️', title: 'Edit vertices',
        text: 'Drag a vertex to move it — snaps to 1 cm grid. Click "Edit polygon" to reopen the outline. Scroll wheel = zoom · Alt+drag = pan the view.' },
      { icon: '🪵', title: 'Board orientation',
        text: 'Choose 0°, 45° or 90°, or enter a custom angle. Joist spacing is auto-adjusted per DTU 51.4. Click on a polygon edge to add an edge board; click again to remove it.' },
      { icon: '⬜', title: 'Holes & cutouts',
        text: 'The main polygon must be closed first. Click "+ Add a hole" then draw the cutout outline on the canvas. Close it by clicking the 1st point or pressing Escape.' },
      { icon: '📐', title: 'Multiple sections',
        text: 'Add a section with "+ New section" for a different board angle. Click a section to activate it. Place a point on a nearby vertex to merge them — orange indicator and auto-snap.' },
      { icon: '🗺️', title: 'Background plan',
        text: 'Drag a PDF or image onto the canvas. Click "Calibrate scale" and click 2 points of known distance to set the scale. Ctrl+drag to reposition the plan.' },
      { icon: '💾', title: 'Save & Export',
        text: 'The project auto-saves in the browser (without background plan). Export as .json to archive or share. Import to resume an existing project.' },
    ],
  },
  es: {
    modalTitle: 'Guía de uso',
    close: 'Cerrar', prev: '← Anterior', next: 'Siguiente →', finish: '✓ Terminar',
    steps: [
      { icon: '✏️', title: 'Dibujar el polígono',
        text: 'Haz clic en el canvas para colocar puntos. Cierra el contorno haciendo clic en el 1er punto (círculo verde) o pulsa Escape (≥ 3 puntos). Clic derecho o Retroceso = deshacer.' },
      { icon: '↔️', title: 'Editar vértices',
        text: 'Arrastra un vértice para moverlo — ajuste a 1 cm. Haz clic en "Editar polígono" para reabrirlo. Rueda = zoom · Alt+arrastrar = mover la vista.' },
      { icon: '🪵', title: 'Orientación de tablas',
        text: 'Elige 0°, 45° o 90°, o introduce un ángulo personalizado. La separación de viguetas se ajusta automáticamente según DTU 51.4. Haz clic en un borde para añadir tabla de canto.' },
      { icon: '⬜', title: 'Huecos y recortes',
        text: 'El polígono debe estar cerrado. Haz clic en "+ Añadir hueco" y dibuja el contorno en el canvas. Ciérralo con el 1er punto o Escape.' },
      { icon: '📐', title: 'Varias secciones',
        text: 'Añade una sección con "+ Nueva sección" para un ángulo diferente. Haz clic en una sección para activarla. Coloca un punto en un vértice cercano para fusionarlos — indicador naranja.' },
      { icon: '🗺️', title: 'Plano de fondo',
        text: 'Arrastra un PDF o imagen al canvas. Haz clic en "Calibrar escala" y selecciona 2 puntos de distancia conocida. Ctrl+arrastrar para reposicionar.' },
      { icon: '💾', title: 'Guardar & Exportar',
        text: 'El proyecto se guarda automáticamente en el navegador. Exporta en .json para archivar o compartir. Importa para retomar un proyecto.' },
    ],
  },
  zh: {
    modalTitle: '使用指南',
    close: '关闭', prev: '← 上一步', next: '下一步 →', finish: '✓ 完成',
    steps: [
      { icon: '✏️', title: '绘制多边形',
        text: '在画布上点击添加点。点击第1个点（绿色圆圈）或按Escape键（≥3个点）关闭轮廓。右键点击或退格键撤销最后一个点。' },
      { icon: '↔️', title: '编辑顶点',
        text: '拖拽顶点移动（1厘米网格对齐）。点击「编辑多边形」重新打开。滚轮=缩放 · Alt+拖拽=平移视图。' },
      { icon: '🪵', title: '木板方向',
        text: '选择0°、45°或90°，或输入自定义角度。龙骨间距根据DTU 51.4自动调整。点击多边形边缘添加/删除边缘板。' },
      { icon: '⬜', title: '孔洞与裁切',
        text: '需先关闭主多边形。点击「添加孔洞」并在画布上绘制裁切轮廓。点击第1个点或按Escape键关闭。' },
      { icon: '📐', title: '多个区域',
        text: '使用「新建区域」添加不同角度的区域。点击区域激活它。将点放在相邻顶点上可自动对齐融合（橙色指示器）。' },
      { icon: '🗺️', title: '背景图纸',
        text: '将PDF或图片拖到画布上。点击「校准比例」选择两个已知距离的点。Ctrl+拖拽重新定位图纸。' },
      { icon: '💾', title: '保存与导出',
        text: '项目自动保存在浏览器中（不含背景图纸）。导出为.json分享或存档。导入可恢复现有项目。' },
    ],
  },
  ja: {
    modalTitle: '使用ガイド',
    close: '閉じる', prev: '← 前へ', next: '次へ →', finish: '✓ 完了',
    steps: [
      { icon: '✏️', title: 'ポリゴンを描く',
        text: 'キャンバスをクリックして点を配置します。1点目（緑の円）をクリックするか、3点以上でEscapeを押して閉じます。右クリックまたはBackspaceで最後の点を取り消します。' },
      { icon: '↔️', title: '頂点を編集',
        text: '頂点をドラッグして移動します（1cmスナップ）。「ポリゴンを編集」をクリックして再開します。ホイール=ズーム · Alt+ドラッグ=ビュー移動。' },
      { icon: '🪵', title: 'ボード方向',
        text: '0°、45°、90°、またはカスタム角度を選択します。根太間隔はDTU 51.4に従って自動調整されます。ポリゴンの辺をクリックして端部ボードを追加/削除します。' },
      { icon: '⬜', title: '穴・切り抜き',
        text: '先にポリゴンを閉じてください。「穴を追加」をクリックし、キャンバスに輪郭を描きます。1点目のクリックまたはEscapeで閉じます。' },
      { icon: '📐', title: '複数セクション',
        text: '「新しいセクション」で異なるボード角度のエリアを追加します。クリックしてアクティブにします。他のセクションの頂点に点を置くと自動スナップします（オレンジ表示）。' },
      { icon: '🗺️', title: '背景図面',
        text: 'PDFや画像をキャンバスにドラッグします。「スケールを校正」で2点の既知距離からスケールを設定します。Ctrl+ドラッグで位置調整。' },
      { icon: '💾', title: '保存・エクスポート',
        text: 'プロジェクトはブラウザに自動保存されます（背景図面を除く）。.jsonでエクスポートして共有・保存します。インポートで再開します。' },
    ],
  },
  de: {
    modalTitle: 'Benutzerhandbuch',
    close: 'Schließen', prev: '← Zurück', next: 'Weiter →', finish: '✓ Fertig',
    steps: [
      { icon: '✏️', title: 'Polygon zeichnen',
        text: 'Klicken Sie auf die Leinwand, um Punkte zu setzen. Schließen Sie durch Klick auf den 1. Punkt (grüner Kreis) oder Escape (≥ 3 Punkte). Rechtsklick oder Rücktaste = letzten Punkt rückgängig.' },
      { icon: '↔️', title: 'Punkte bearbeiten',
        text: 'Ziehen Sie einen Punkt zum Verschieben — 1-cm-Raster. Klicken Sie „Polygon bearbeiten" zum Wiedereröffnen. Mausrad = Zoom · Alt+Ziehen = Ansicht verschieben.' },
      { icon: '🪵', title: 'Dielenausrichtung',
        text: 'Wählen Sie 0°, 45° oder 90°, oder geben Sie einen benutzerdefinierten Winkel ein. Balkenteilung wird automatisch nach DTU 51.4 angepasst. Klick auf Kante = Randdiele hinzufügen/entfernen.' },
      { icon: '⬜', title: 'Aussparungen',
        text: 'Polygon muss geschlossen sein. Klicken Sie „+ Aussparung" und zeichnen Sie den Umriss. Mit 1. Punkt oder Escape schließen.' },
      { icon: '📐', title: 'Mehrere Abschnitte',
        text: 'Fügen Sie mit „+ Neuer Abschnitt" einen Bereich mit anderem Dielenwinkel hinzu. Klick = aktivieren. Punkt auf benachbarten Scheitelpunkt = automatisches Einrasten (orange).' },
      { icon: '🗺️', title: 'Hintergrundplan',
        text: 'Ziehen Sie PDF oder Bild auf die Leinwand. „Kalibrieren" und 2 Punkte bekannter Entfernung wählen. Strg+Ziehen zum Neupositionieren.' },
      { icon: '💾', title: 'Speichern & Exportieren',
        text: 'Projekt wird automatisch im Browser gespeichert (ohne Hintergrundplan). Als .json exportieren. Importieren zum Fortsetzen.' },
    ],
  },
  ru: {
    modalTitle: 'Руководство пользователя',
    close: 'Закрыть', prev: '← Назад', next: 'Далее →', finish: '✓ Готово',
    steps: [
      { icon: '✏️', title: 'Рисование многоугольника',
        text: 'Нажимайте на холст для добавления точек. Закройте контур, нажав на 1-ю точку (зелёный круг) или Escape (≥ 3 точек). Правая кнопка или Backspace = отмена последней точки.' },
      { icon: '↔️', title: 'Редактирование вершин',
        text: 'Перетащите вершину для перемещения — привязка 1 см. Нажмите «Редактировать» для повторного открытия. Колесо = масштаб · Alt+перетащить = перемещение вида.' },
      { icon: '🪵', title: 'Ориентация досок',
        text: 'Выберите 0°, 45° или 90°, либо введите произвольный угол. Шаг лаг автоматически корректируется по DTU 51.4. Клик по стороне = добавить/удалить кромочную доску.' },
      { icon: '⬜', title: 'Отверстия и вырезы',
        text: 'Многоугольник должен быть закрыт. Нажмите «+ Добавить вырез» и нарисуйте контур на холсте. Закройте 1-й точкой или Escape.' },
      { icon: '📐', title: 'Несколько секций',
        text: 'Добавьте секцию с «+ Новая секция» для другого угла досок. Нажмите для активации. Точка на соседней вершине = автопривязка и слияние (оранжевый индикатор).' },
      { icon: '🗺️', title: 'Фоновый план',
        text: 'Перетащите PDF или изображение на холст. «Калибровать» и укажите 2 точки известного расстояния. Ctrl+перетащить для перемещения плана.' },
      { icon: '💾', title: 'Сохранение и экспорт',
        text: 'Проект автоматически сохраняется в браузере (без фонового плана). Экспортируйте .json для архивирования. Импортируйте для продолжения работы.' },
    ],
  },
};

interface TutorialModalProps {
  lang: Lang;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ lang, onClose }) => {
  const [step, setStep] = useState(0);
  const data = DATA[lang] ?? DATA.fr;
  const { steps, modalTitle, prev, next, finish } = data;
  const n = steps.length;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, n - 1));
      if (e.key === 'ArrowLeft')  setStep(s => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [onClose, n]);

  const cur = steps[step];

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          background: '#4e342e', color: '#fff', padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🪵</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{modalTitle}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#bcaaa4' }}>{step + 1} / {n}</span>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#d7ccc8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>
              ×
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: '#e0d9d3' }}>
          <div style={{ height: '100%', background: '#795548', width: `${((step + 1) / n) * 100}%`, transition: 'width 0.25s' }} />
        </div>

        {/* Content */}
        <div style={{ padding: '28px 28px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 14, lineHeight: 1 }}>{cur.icon}</div>
          <h3 style={{ margin: '0 0 12px', fontSize: 17, color: '#3e2723', fontWeight: 700 }}>{cur.title}</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#5d4037', lineHeight: 1.65, textAlign: 'left' }}>{cur.text}</p>
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingBottom: 12 }}>
          {steps.map((_, i) => (
            <button key={i} onClick={() => setStep(i)}
              style={{
                width: i === step ? 20 : 8, height: 8, borderRadius: 4, border: 'none',
                background: i === step ? '#795548' : '#d7ccc8',
                cursor: 'pointer', padding: 0, transition: 'all 0.2s',
              }} />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 16px', display: 'flex', gap: 8,
          borderTop: '1px solid #ede7e3',
        }}>
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid #d7ccc8',
              background: '#fff', color: step === 0 ? '#c8bdb8' : '#5d4037',
              cursor: step === 0 ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit',
            }}>
            {prev}
          </button>
          {step < n - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              style={{
                flex: 2, padding: '8px 0', borderRadius: 6, border: '1px solid #795548',
                background: '#795548', color: '#fff', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              }}>
              {next}
            </button>
          ) : (
            <button onClick={onClose}
              style={{
                flex: 2, padding: '8px 0', borderRadius: 6, border: '1px solid #2e7d32',
                background: '#2e7d32', color: '#fff', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              }}>
              {finish}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
