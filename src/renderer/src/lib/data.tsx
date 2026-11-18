import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import i18n from '@/i18n';
import type { Customer, Product, SellerProfile, Settings } from '../../../shared/schema';

interface MasterData {
  seller: SellerProfile | null;
  customers: Customer[];
  products: Product[];
  settings: Settings;
  warnings: string[];
  reload(): Promise<void>;
}

const Context = createContext<MasterData | null>(null);

/** Loads the master data from main once and on `reload()`. */
export function MasterDataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [data, setData] = useState<Omit<MasterData, 'reload'>>();

  const reload = useCallback(async () => {
    const [seller, customers, products, settings, warnings] = await Promise.all([
      window.api.seller.get(),
      window.api.customers.list(),
      window.api.products.list(),
      window.api.settings.get(),
      window.api.storeWarnings(),
    ]);
    if (i18n.language !== settings.uiLanguage) await i18n.changeLanguage(settings.uiLanguage);
    setData({ seller, customers, products, settings, warnings });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!data) return fallback;
  return <Context.Provider value={{ ...data, reload }}>{children}</Context.Provider>;
}

export function useMasterData(): MasterData {
  const value = useContext(Context);
  if (!value) throw new Error('useMasterData outside MasterDataProvider');
  return value;
}

/** Error text of a rejected IPC call (Electron prefixes the channel). */
export function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
