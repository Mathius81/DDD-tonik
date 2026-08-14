import { Menu, shell, type BrowserWindow } from 'electron';

/** Meniu nativ în română (Brief §7.3). */
export function createAppMenu(getMainWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';

  const send = (route: string) => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.webContents.send('events:navigate', route);
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Tonik',
            submenu: [
              { role: 'about' as const, label: 'Despre Tonik' },
              { type: 'separator' as const },
              { role: 'hide' as const, label: 'Ascunde Tonik' },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const, label: 'Ieșire din Tonik' },
            ],
          },
        ]
      : []),
    {
      label: 'Fișier',
      submenu: [
        {
          label: 'Adaugă intervenție',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('/interventii'),
        },
        { label: 'Asociații', click: () => send('/asociatii') },
        { type: 'separator' },
        { label: 'Setări', accelerator: 'CmdOrCtrl+,', click: () => send('/setari') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const, label: 'Ieșire' }]),
      ],
    },
    {
      label: 'Editare',
      submenu: [
        { role: 'undo', label: 'Anulează' },
        { role: 'redo', label: 'Refă' },
        { type: 'separator' },
        { role: 'cut', label: 'Decupează' },
        { role: 'copy', label: 'Copiază' },
        { role: 'paste', label: 'Lipește' },
        { role: 'selectAll', label: 'Selectează tot' },
      ],
    },
    {
      label: 'Vizualizare',
      submenu: [
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Mărește' },
        { role: 'zoomOut', label: 'Micșorează' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Ecran complet' },
      ],
    },
    {
      label: 'Fereastră',
      submenu: [
        { role: 'minimize', label: 'Minimizează' },
        ...(isMac ? [{ role: 'close' as const, label: 'Închide' }] : []),
      ],
    },
    {
      label: 'Ajutor',
      submenu: [
        {
          label: 'Pagina proiectului',
          click: () => shell.openExternal('https://github.com/Mathius81/DDD-tonik'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
