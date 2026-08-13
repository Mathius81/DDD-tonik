import { Notification } from 'electron';
import type { AppContext } from '../app-context';

/** Notificări Windows/macOS native. Click-ul duce utilizatorul la pagina potrivită. */
export class NotificationService {
  constructor(private ctx: AppContext) {}

  show(title: string, body: string, route?: string): void {
    if (!Notification.isSupported()) {
      this.ctx.logger.warn('Notificările native nu sunt suportate pe acest sistem');
      return;
    }
    const notification = new Notification({ title, body });
    if (route) {
      notification.on('click', () => {
        const win = this.ctx.getMainWindow();
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          win.webContents.send('events:navigate', route);
        }
      });
    }
    notification.show();
  }
}
