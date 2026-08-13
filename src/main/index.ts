import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { createMainWindow } from './window';
import { applyContentSecurityPolicy } from './security';
import { resolveAppPaths } from './paths';
import { Logger } from './logger';

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
      // Bootstrapping-ul aplicației (DB, IPC, scheduler, tray) crește pe măsură
      // ce fazele următoare adaugă module; totul pornește din bootstrap().
      const { bootstrap } = await import('./bootstrap');
      await bootstrap({ paths, logger, getMainWindow: () => mainWindow });
    } catch (err) {
      logger.error('Eroare la inițializarea aplicației', err);
      throw err;
    }

    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
}

export function appIsQuitting(): boolean {
  return isQuitting;
}
