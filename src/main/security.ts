import { app, session, type IpcMainInvokeEvent, type WebContents } from 'electron';

/** URL the renderer is loaded from: the Vite dev server in development, the bundled file otherwise. */
export function rendererOrigin(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  return devUrl ? new URL(devUrl).origin : 'file://';
}

function isOwnUrl(url: string): boolean {
  const origin = rendererOrigin();
  return origin === 'file://' ? url.startsWith('file://') : url.startsWith(`${origin}/`) || url === origin;
}

/**
 * The app never talks to the network: only the bundled renderer (and in development the local Vite dev server)
 * may be loaded. Navigation, new windows and permission requests are denied.
 */
export function hardenSessions(): void {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isOwnUrl(details.url) || details.url.startsWith('devtools://') || details.url.startsWith('data:');
    callback({ cancel: !allowed });
  });
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isOwnUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

/** IPC handlers only answer the app's own renderer. */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isOwnUrl(url)) {
    throw new Error(`Rejected IPC call from ${url || 'an unknown frame'}`);
  }
}
