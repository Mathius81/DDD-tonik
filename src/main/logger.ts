import fs from 'node:fs';
import path from 'node:path';

/**
 * Logger local simplu, un fișier pe zi în logs/.
 * Nu loga niciodată parole, token-uri sau credențiale SMTP.
 */
export class Logger {
  constructor(private logsDir: string) {}

  private write(level: string, message: string, error?: unknown) {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const line = `[${now.toISOString()}] ${level} ${message}${
      error instanceof Error ? ` :: ${error.stack ?? error.message}` : error ? ` :: ${String(error)}` : ''
    }\n`;
    try {
      fs.appendFileSync(path.join(this.logsDir, `ddd-${day}.log`), line, 'utf8');
    } catch {
      // logging-ul nu trebuie să doboare aplicația
    }
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(line.trimEnd());
    }
  }

  info(message: string) {
    this.write('INFO', message);
  }
  warn(message: string, error?: unknown) {
    this.write('WARN', message, error);
  }
  error(message: string, error?: unknown) {
    this.write('ERROR', message, error);
  }
}
