import { Tray, Menu, nativeImage } from 'electron';
import type { AppContext } from './app-context';
import type { SchedulerService } from './services/scheduler.service';

// Iconiță monocromă 16x16 (pătrat plin) codificată PNG base64 — placeholder
// până la un set de iconițe dedicat; pe Windows tray-ul cere o imagine validă.
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOElEQVQ4T2NkYGD4z0ABYBxVMKoAI/7/' +
  '/89AiQGMjIyMFBkwGgYMDKNhMJoSGSlNiaOZiYFiAwCJdh/x2yUsKQAAAABJRU5ErkJggg==';

let tray: Tray | null = null;

/** System Tray (spec #21): aplicația rămâne activă lângă ceas. */
export function createTray(ctx: AppContext, scheduler: SchedulerService, quit: () => void): void {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'));
  tray = new Tray(icon);
  tray.setToolTip('DDD Manager');

  const showWindow = () => {
    const win = ctx.getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  };

  const rebuildMenu = () => {
    const remindersToday = scheduler.countToday();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Deschide DDD Manager', click: showWindow },
        { label: `Remindere astăzi: ${remindersToday}`, enabled: false },
        { type: 'separator' },
        { label: 'Ieșire', click: quit },
      ]),
    );
  };

  rebuildMenu();
  tray.on('click', showWindow);
  // Reîmprospătăm numărul la fiecare deschidere de meniu (Windows nu are
  // eveniment before-popup; reconstruim periodic).
  setInterval(rebuildMenu, 5 * 60 * 1000);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
