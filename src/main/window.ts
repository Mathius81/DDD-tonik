import { BrowserWindow, app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

function windowStateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const state = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')) as WindowState;
    if (state.width >= 800 && state.height >= 500) return state;
  } catch {
    // prima pornire sau fișier corupt — folosim implicitele
  }
  return { width: 1280, height: 800 };
}

export function createMainWindow(): BrowserWindow {
  const state = loadWindowState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Tonik',
    // Titlebar integrat cu sidebar-ul (fără bandă neagră) — Brief §5.1.
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: process.platform !== 'darwin' ? { color: '#0e1b16', symbolColor: '#e8efeb', height: 30 } : undefined,
    backgroundColor: '#0e1b16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Persistăm dimensiunea/poziția ferestrei (Brief §7.7).
  const saveState = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const [width, height] = win.getSize();
    const [x, y] = win.getPosition();
    try {
      fs.writeFileSync(windowStateFile(), JSON.stringify({ width, height, x, y }));
    } catch {
      // nu blocăm închiderea pentru asta
    }
  };
  win.on('resized', saveState);
  win.on('moved', saveState);
  win.on('close', saveState);

  // Orice încercare de deschidere de fereastră nouă merge în browserul extern,
  // dar numai pentru URL-uri https cunoscute — restul sunt refuzate.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Renderer-ul nu are voie să navigheze în afara aplicației.
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
  });

  // Refuză toate cererile de permisiuni (cameră, microfon, geolocație etc.).
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return win;
}

/** Whitelist pentru URL-uri externe deschise din aplicație. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(u.hostname);
  } catch {
    return false;
  }
}
