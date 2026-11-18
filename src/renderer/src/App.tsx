import { Building2, FilePlus2, LayoutTemplate, Package, Settings as SettingsIcon, Users } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert } from '@/components/ui/alert';
import { MasterDataProvider, useMasterData } from '@/lib/data';
import { cn } from '@/lib/utils';
import { CompanyPage } from '@/pages/company';
import { CustomersPage } from '@/pages/customers';
import { Placeholder } from '@/pages/placeholder';
import { ProductsPage } from '@/pages/products';

type PageKey = 'invoice' | 'customers' | 'products' | 'company' | 'layout' | 'settings';

const PAGES: { key: PageKey; icon: ComponentType<{ className?: string }>; Page: ComponentType }[] = [
  { key: 'invoice', icon: FilePlus2, Page: Placeholder },
  { key: 'customers', icon: Users, Page: CustomersPage },
  { key: 'products', icon: Package, Page: ProductsPage },
  { key: 'company', icon: Building2, Page: CompanyPage },
  { key: 'layout', icon: LayoutTemplate, Page: Placeholder },
  { key: 'settings', icon: SettingsIcon, Page: Placeholder },
];

export function App() {
  const { t } = useTranslation();
  return (
    <MasterDataProvider fallback={<p className="p-6 text-muted-foreground">{t('app.loading')}</p>}>
      <Shell />
    </MasterDataProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { warnings } = useMasterData();
  const [page, setPage] = useState<PageKey>('invoice');
  const { Page } = PAGES.find((p) => p.key === page)!;

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-muted/60 p-3">
        <p className="mb-3 px-2 text-sm font-semibold">{t('app.name')}</p>
        {PAGES.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPage(key)}
            aria-current={page === key ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background',
              page === key && 'bg-background font-medium text-primary shadow-xs',
            )}
          >
            <Icon className="size-4" />
            {t(`nav.${key}`)}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        {warnings.map((w) => (
          <Alert key={w} kind="warning" title={t('app.storeWarning')} className="mb-4">
            {w}
          </Alert>
        ))}
        <h1 className="mb-5 text-xl font-semibold">{t(`nav.${page}`)}</h1>
        <Page />
      </main>
    </div>
  );
}
