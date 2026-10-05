import type { IpcMain } from 'electron';
import type { ApiResult } from '../../shared/api';
import { CHANNELS } from '../../shared/channels';
import { type ErrorLogger, execute, type Handlers } from './execute';

const FORBIDDEN: ApiResult<never> = {
  success: false,
  error: { code: 'FORBIDDEN', message: 'Origen no permitido.' },
};

export function isTrustedSender(frameUrl: string | undefined, devServerUrl: string | undefined): boolean {
  if (!frameUrl) return false;
  return devServerUrl ? frameUrl.startsWith(devServerUrl) : frameUrl.startsWith('file://');
}

export function registerIpc(ipcMain: IpcMain, handlers: Handlers, logError: ErrorLogger): void {
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (event, rawInput: unknown) =>
      isTrustedSender(event.senderFrame?.url, process.env.ELECTRON_RENDERER_URL)
        ? execute(channel, rawInput, handlers, logError)
        : FORBIDDEN,
    );
  }
}
