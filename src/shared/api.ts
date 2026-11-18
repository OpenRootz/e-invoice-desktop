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
  layoutGet: 'layout:get',
  layoutPreset: 'layout:preset',
  layoutPreview: 'layout:preview',
  layoutSave: 'layout:save',
} as const;

/** A layout problem; errors block saving the layout */
export interface LayoutIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  blockKey?: string;
}

/** Where a block ended up in the preview (0.1 mm) */
export interface BlockBox {
  key: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  overflowBy?: number;
}

export type LayoutPresetName = 'default' | 'din5008A' | 'din5008B' | 'minimal';
export type PreviewSample = 'b2b-net' | 'b2c-gross' | 'many-lines' | 'worst-case';

export interface LayoutDraft {
  /** The layout document (core `PdfLayoutV2`) */
  document: unknown;
  /** Images of image blocks by id, as data URLs */
  images: Record<string, string>;
}

export interface LayoutPreviewResult {
  pdf?: Uint8Array;
  pageCount: number;
  blocks: BlockBox[];
  layoutIssues: LayoutIssue[];
  issues: Issue[];
}

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
  layout: {
    /** The stored layout (the default layout if none was saved) */
    get(): Promise<LayoutDraft>;
    preset(name: LayoutPresetName): Promise<unknown>;
    /** The draft rendered with a sample invoice, with the measured blocks and the layout issues */
    preview(request: LayoutDraft & { sample: PreviewSample; language: 'de' | 'en' }): Promise<LayoutPreviewResult>;
    save(draft: LayoutDraft): Promise<{ status: 'saved' } | { status: 'invalid'; issues: LayoutIssue[] }>;
  };
}
