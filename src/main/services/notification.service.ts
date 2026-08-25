import { Notification } from 'electron';
import type { AppContext } from '../app-context';

/** Notificări Windows/macOS native. Click-ul duce utilizatorul la pagina potrivită. */
export class NotificationService {
  constructor(private ctx: AppContext) {}

  private dispatch(title: string, body: string, onClick?: () => void): void {
    if (!Notification.isSupported()) {
      this.ctx.logger.warn('Notificările native nu sunt suportate pe acest sistem');
      return;
    }
    const notification = new Notification({ title, body });
    if (onClick) {
      notification.on('click', onClick);
    }
    notification.show();
  }

  show(title: string, body: string, route?: string): void {
    this.dispatch(
      title,
      body,
      route
        ? () => {
            const win = this.ctx.getMainWindow();
            if (win) {
              if (win.isMinimized()) win.restore();
              win.show();
              win.focus();
              win.webContents.send('events:navigate', route);
            }
          }
        : undefined,
    );
  }

  /** Notificare cu o acțiune custom la click (ex.: deschide conversația WhatsApp în browser). */
  showWithClick(title: string, body: string, onClick: () => void): void {
    this.dispatch(title, body, onClick);
  }
}
