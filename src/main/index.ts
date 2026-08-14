import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { createMainWindow } from './window';
import { createAppMenu } from './menu';
import { applyContentSecurityPolicy } from './security';
import { resolveAppPaths } from './paths';
import { Logger } from './logger';
import type { BootstrapResult } from './bootstrap';

// Gestionarea shortcut-urilor Squirrel la instalare/dezinstalare pe Windows.
if (started) {
  app.quit();
}

// Trebuie setat devreme, înaintea oricărui API de login items — altfel
// notificările Windows nu se afișează corect (AUMID greșit).
app.setAppUserModelId('com.squirrel.ddd_manager.DDDManager');

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let boot: BootstrapResult | null = null;

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const paths = resolveAppPaths();
    const logger = new Logger(paths.logsDir);
    logger.info(`Pornire DDD Manager v${app.getVersion()}`);

    applyContentSecurityPolicy(MAIN_WINDOW_VITE_DEV_SERVER_URL);

    try {
      const { bootstrap } = await import('./bootstrap');
      boot = await bootstrap({ paths, logger, getMainWindow: () => mainWindow, quit: quitApp });
    } catch (err) {
      logger.error('Eroare la inițializarea aplicației', err);
      throw err;
    }

    createAppMenu(() => mainWindow);

    const openWindow = () => {
      mainWindow = createMainWindow();
      mainWindow.on('close', (event) => {
        // Setarea „păstrează în tray la închidere” (spec #21).
        const closeToTray = boot?.ctx.settings.get().app.close_to_tray ?? true;
        if (closeToTray && !isQuitting) {
          event.preventDefault();
          mainWindow?.hide();
        }
      });
      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    };

    openWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        openWindow();
      } else {
        mainWindow?.show();
      }
    });
  });

  app.on('window-all-closed', () => {
    // Cu close-to-tray activ fereastra doar se ascunde, deci acest eveniment
    // apare când tray-ul e dezactivat sau la Ieșire explicită.
    if (process.platform !== 'darwin') {
      quitApp();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
}
