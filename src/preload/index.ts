import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type EInvoiceApi } from '../shared/api';

const api: EInvoiceApi = {
  appInfo: () => ipcRenderer.invoke(IpcChannel.appInfo),
};

contextBridge.exposeInMainWorld('api', api);
