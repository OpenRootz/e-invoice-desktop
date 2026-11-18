/** IPC channels between preload and main. */
export const IpcChannel = {
  appInfo: 'app:info',
} as const;

export interface AppInfo {
  name: string;
  version: string;
}

/** The API the preload script exposes to the renderer as `window.api`. */
export interface EInvoiceApi {
  appInfo(): Promise<AppInfo>;
}
