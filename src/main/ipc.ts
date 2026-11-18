import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { IpcChannel, type AppInfo, type ExportResult } from '../shared/api';
import { invoiceRequestSchema } from '../shared/invoice';
import { customerSchema, imageDataUrlSchema, isoDateSchema, productSchema, sellerProfileSchema, settingsSchema } from '../shared/schema';
import { invoiceFileName, InvoiceService } from './invoice/service';
import { LayoutService } from './layout/service';
import { assertTrustedSender } from './security';
import type { MasterDataStore } from './store';

const idSchema = z.uuid();
const newCustomerSchema = customerSchema.extend({ id: idSchema.optional() });
const newProductSchema = productSchema.extend({ id: idSchema.optional() });
// The document itself is validated by the core's parseLayout; here only its size is limited
const layoutDraftSchema = z.object({
  document: z.unknown().refine((d) => JSON.stringify(d ?? null).length < 500_000, 'Layout too large'),
  images: z.record(z.string().regex(/^[\w-]{1,40}$/), imageDataUrlSchema).refine((m) => Object.keys(m).length <= 20, 'Too many images'),
});
const layoutPreviewSchema = layoutDraftSchema.extend({
  sample: z.enum(['b2b-net', 'b2c-gross', 'many-lines', 'worst-case']),
  language: z.enum(['de', 'en']),
});

/** Registers a handler that only answers the app's own renderer and validates its input first. */
function handle<S extends z.ZodType, R>(
  channel: string,
  input: S,
  fn: (value: z.infer<S>, event: IpcMainInvokeEvent) => R | Promise<R>,
): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, arg: unknown) => {
    assertTrustedSender(event);
    return fn(input.parse(arg), event);
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

  const invoices = new InvoiceService(store);
  let lastSaved: string | undefined;
  handle(IpcChannel.invoicePreview, invoiceRequestSchema, (request) => invoices.preview(request));
  handle(IpcChannel.invoiceExport, invoiceRequestSchema, async (request, event): Promise<ExportResult> => {
    // Check before asking where to save, so the user is not asked for a file that will not be written
    const { issues } = await invoices.check(request);
    if (issues.length) return { status: 'invalid', issues };
    const settings = await store.settings.read();
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: Electron.SaveDialogOptions = {
      defaultPath: path.join(settings.lastOutputDir ?? app.getPath('documents'), invoiceFileName(request.number)),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const choice = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return { status: 'cancelled' };
    const result = await invoices.write(request, choice.filePath);
    if (result.status === 'saved') lastSaved = result.filePath;
    return result;
  });
  handle(IpcChannel.invoiceShowInFolder, none, () => {
    if (lastSaved) shell.showItemInFolder(lastSaved);
  });

  const layouts = new LayoutService(store);
  handle(IpcChannel.layoutGet, none, () => layouts.current());
  handle(IpcChannel.layoutPreset, z.enum(['default', 'din5008A', 'din5008B', 'minimal']), (name) => layouts.preset(name));
  handle(IpcChannel.layoutPreview, layoutPreviewSchema, (request) => layouts.preview(request));
  handle(IpcChannel.layoutSave, layoutDraftSchema, (draft) => layouts.save(draft));
}
