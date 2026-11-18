import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { IpcChannel, type AppInfo } from '../shared/api';
import { customerSchema, isoDateSchema, productSchema, sellerProfileSchema, settingsSchema } from '../shared/schema';
import { assertTrustedSender } from './security';
import type { MasterDataStore } from './store';

const idSchema = z.uuid();
const newCustomerSchema = customerSchema.extend({ id: idSchema.optional() });
const newProductSchema = productSchema.extend({ id: idSchema.optional() });

/** Registers a handler that only answers the app's own renderer and validates its input first. */
function handle<S extends z.ZodType, R>(channel: string, input: S, fn: (value: z.infer<S>) => R | Promise<R>): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, arg: unknown) => {
    assertTrustedSender(event);
    return fn(input.parse(arg));
  });
}

export function registerIpcHandlers(store: MasterDataStore): void {
  const none = z.undefined();

  handle(IpcChannel.appInfo, none, (): AppInfo => ({ name: app.getName(), version: app.getVersion(), dataDir: store.dir }));
  handle(IpcChannel.storeWarnings, none, () => [...store.warnings]);

  handle(IpcChannel.sellerGet, none, () => store.seller.read());
  handle(IpcChannel.sellerSave, sellerProfileSchema, (profile) => store.seller.write(profile));

  handle(IpcChannel.customersList, none, () => store.customers.read());
  handle(IpcChannel.customersSave, newCustomerSchema, (customer) => store.saveCustomer(customer));
  handle(IpcChannel.customersDelete, idSchema, (id) => store.deleteCustomer(id));

  handle(IpcChannel.productsList, none, () => store.products.read());
  handle(IpcChannel.productsSave, newProductSchema, (product) => store.saveProduct(product));
  handle(IpcChannel.productsDelete, idSchema, (id) => store.deleteProduct(id));

  handle(IpcChannel.settingsGet, none, () => store.settings.read());
  handle(IpcChannel.settingsSave, settingsSchema, (settings) => store.settings.write(settings));

  handle(IpcChannel.numberingSuggest, isoDateSchema, (date) => store.suggestNumber(date));
}
