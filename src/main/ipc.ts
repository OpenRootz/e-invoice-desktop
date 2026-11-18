import { app, ipcMain } from 'electron';
import { IpcChannel, type AppInfo } from '../shared/api';
import { assertTrustedSender } from './security';

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.appInfo, (event): AppInfo => {
    assertTrustedSender(event);
    return { name: app.getName(), version: app.getVersion() };
  });
}
