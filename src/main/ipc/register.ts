import type { IpcMain } from 'electron';
import type { ApiResult } from '../../shared/api';
import { CHANNELS } from '../../shared/channels';
import { type ErrorLogger, execute, type Handlers } from './execute';

const FORBIDDEN: ApiResult<never> = {
  success: false,
  error: { code: 'FORBIDDEN', message: 'Origen no permitido.' },
};

// `appUrl` is the exact page the app loads: the dev server URL or the file URL of the bundled index.html.
export function isTrustedSender(frameUrl: string | undefined, appUrl: string): boolean {
  if (!frameUrl) return false;
  try {
    const frame = new URL(frameUrl);
    const app = new URL(appUrl);
    if (frame.protocol !== app.protocol || frame.origin !== app.origin) return false;
    return frame.protocol !== 'file:' || frame.pathname === app.pathname;
  } catch {
    return false;
  }
}

export function registerIpc(ipcMain: IpcMain, handlers: Handlers, logError: ErrorLogger, appUrl: string): void {
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (event, rawInput: unknown) =>
      isTrustedSender(event.senderFrame?.url, appUrl) ? execute(channel, rawInput, handlers, logError) : FORBIDDEN,
    );
  }
}
