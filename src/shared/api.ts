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
} as const;

export interface AppInfo {
  name: string;
  version: string;
  /** Folder of the master data files */
  dataDir: string;
}

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
}
