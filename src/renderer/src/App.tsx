import { Building, FilePlus, LayoutTemplate, Package, SlidersVertical, Users, type LucideProps } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { Logo } from '@/components/logo';
import { Alert } from '@/components/ui/alert';
import { MasterDataProvider, useMasterData } from '@/lib/data';
import { confirmLeave } from '@/lib/leave-guard';
import { NavigationContext, type PageKey } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { CompanyPage } from '@/pages/company';
import { CustomersPage } from '@/pages/customers';
import { InvoicePage } from '@/pages/invoice';
import { LayoutPage } from '@/pages/layout';
import { ProductsPage } from '@/pages/products';
import { SettingsPage } from '@/pages/settings';

const PAGES: { key: PageKey; icon: ComponentType<LucideProps>; Page: ComponentType }[] = [
  { key: 'invoice', icon: FilePlus, Page: InvoicePage },
  { key: 'customers', icon: Users, Page: CustomersPage },
  { key: 'products', icon: Package, Page: ProductsPage },
  { key: 'company', icon: Building, Page: CompanyPage },
  { key: 'layout', icon: LayoutTemplate, Page: LayoutPage },
  { key: 'settings', icon: SlidersVertical, Page: SettingsPage },
];

/** The line below the page title */
const INTROS: Partial<Record<PageKey, 'invoice.intro' | 'company.intro' | 'layout.intro'>> = {
  invoice: 'invoice.intro',
  company: 'company.intro',
  layout: 'layout.intro',
};

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
  const navigate = (key: PageKey) => key !== page && confirmLeave() && setPage(key);

  return (
    <div className="flex h-full">
      <aside className="flex w-[248px] shrink-0 flex-col gap-7 overflow-y-auto bg-side px-4 py-6 text-side-text">
        <div className="flex items-center gap-3 px-2">
          <Logo />
          <div>
            <p className="font-heading text-[17px] leading-tight font-bold text-white">{t('app.shortName')}</p>
            <p className="mt-0.5 text-xs text-side-muted">{t('app.by')}</p>
          </div>
        </div>
        <nav aria-label={t('app.navigation')} className="flex flex-col gap-1">
          {PAGES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(key)}
              aria-current={page === key ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-medium hover:bg-white/7 hover:text-white focus-visible:outline-2 focus-visible:outline-side-accent',
                page === key && 'bg-side-active text-white [&_svg]:text-side-accent',
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              {t(`nav.${key}`)}
            </button>
          ))}
        </nav>
        <p className="mt-auto rounded-[10px] border border-[#33443a] p-3.5 text-[12.5px] leading-normal text-[#b7c5bb]">
          <strong className="font-semibold text-white">{t('app.freeTitle')}</strong>
          <br />
          {t('app.freeText')}
        </p>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto px-10 py-9">
        {warnings.map((w) => (
          <Alert key={w} kind="warning" title={t('app.storeWarning')} className="mb-4">
            {w}
          </Alert>
        ))}
        <header className="mb-7">
          <h1 className="font-heading text-[30px] leading-[1.15] font-semibold tracking-[-0.01em]">{t(`nav.${page}`)}</h1>
          {INTROS[page] && <p className="mt-1.5 max-w-4xl text-sm leading-normal text-muted-foreground">{t(INTROS[page])}</p>}
        </header>
        <NavigationContext value={navigate}>
          <Page />
        </NavigationContext>
      </main>
    </div>
  );
}
