import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannel, type EInvoiceApi } from '../shared/api';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: EInvoiceApi = {
  appInfo: () => invoke(IpcChannel.appInfo),
  storeWarnings: () => invoke(IpcChannel.storeWarnings),
  seller: {
    get: () => invoke(IpcChannel.sellerGet),
    save: (profile) => invoke(IpcChannel.sellerSave, profile),
  },
  customers: {
    list: () => invoke(IpcChannel.customersList),
    save: (customer) => invoke(IpcChannel.customersSave, customer),
    delete: (id) => invoke(IpcChannel.customersDelete, id),
  },
  products: {
    list: () => invoke(IpcChannel.productsList),
    save: (product) => invoke(IpcChannel.productsSave, product),
    delete: (id) => invoke(IpcChannel.productsDelete, id),
  },
  settings: {
    get: () => invoke(IpcChannel.settingsGet),
    save: (settings) => invoke(IpcChannel.settingsSave, settings),
  },
  numbering: {
    suggest: (issueDate) => invoke(IpcChannel.numberingSuggest, issueDate),
  },
};

contextBridge.exposeInMainWorld('api', api);
