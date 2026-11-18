import type { InvoiceRequest } from './invoice';
import type { Customer, Product, SellerProfile, Settings } from './schema';

/** IPC channels between preload and main. */
export const IpcChannel = {
  appInfo: 'app:info',
  storeWarnings: 'store:warnings',
  sellerGet: 'seller:get',
  sellerSave: 'seller:save',
  customersList: 'customers:list',
  customersSave: 'customers:save',
  customersDelete: 'customers:delete',
  productsList: 'products:list',
  productsSave: 'products:save',
  productsDelete: 'products:delete',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  numberingSuggest: 'numbering:suggest',
  invoicePreview: 'invoice:preview',
  invoiceExport: 'invoice:export',
  invoiceShowInFolder: 'invoice:show-in-folder',
} as const;

/** A problem that blocks an invoice (core checks, seller data, layout) */
export interface Issue {
  code: string;
  message: string;
  /** Path in the model or settings, e.g. `lines[2].vat` */
  path?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  /** Folder of the master data files */
  dataDir: string;
}

export type ExportResult = { status: 'saved'; filePath: string } | { status: 'invalid'; issues: Issue[] } | { status: 'cancelled' };

export type NewCustomer = Omit<Customer, 'id'> & { id?: string };
export type NewProduct = Omit<Product, 'id'> & { id?: string };

/** The API the preload script exposes to the renderer as `window.api`. Main validates every input again. */
export interface EInvoiceApi {
  appInfo(): Promise<AppInfo>;
  /** Files that were unreadable at start and moved aside */
  storeWarnings(): Promise<string[]>;
  seller: {
    get(): Promise<SellerProfile | null>;
    save(profile: SellerProfile): Promise<SellerProfile>;
  };
  customers: {
    list(): Promise<Customer[]>;
    save(customer: NewCustomer): Promise<Customer>;
    delete(id: string): Promise<void>;
  };
  products: {
    list(): Promise<Product[]>;
    save(product: NewProduct): Promise<Product>;
    delete(id: string): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    save(settings: Settings): Promise<Settings>;
  };
  numbering: {
    /** Suggested invoice number for an issue date (`YYYY-MM-DD`) */
    suggest(issueDate: string): Promise<string>;
  };
  invoice: {
    /** The PDF as it would be written, with the issues that would block it */
    preview(request: InvoiceRequest): Promise<{ pdf?: Uint8Array; issues: Issue[] }>;
    /** Asks where to save, checks, renders and writes the ZUGFeRD PDF */
    export(request: InvoiceRequest): Promise<ExportResult>;
    /** Shows the last written invoice in the file manager */
    showInFolder(): Promise<void>;
  };
}
