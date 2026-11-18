import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';

export interface Column<T> {
  header: string;
  cell: (item: T) => ReactNode;
  className?: string;
}

/** Searchable table with new / edit / delete actions, shared by the customer and product pages. */
export function ListPage<T extends { id: string }>({
  items,
  columns,
  searchText,
  label,
  empty,
  newLabel,
  onNew,
  onEdit,
  onDelete,
  footer,
}: {
  items: T[];
  columns: Column<T>[];
  searchText: (item: T) => string;
  label: (item: T) => string;
  empty: string;
  newLabel: string;
  onNew: () => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  /** A hint below the list */
  footer?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? items.filter((i) => searchText(i).toLocaleLowerCase().includes(q)) : items;
  }, [items, query, searchText]);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-[420px] flex-[1_1_300px]">
          <Search className="absolute top-[13px] left-3.5 size-[18px] text-muted-foreground" strokeWidth={1.75} />
          <Input
            className="pl-[42px]"
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={onNew}>
          <Plus /> {newLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-card border-[1.5px] border-dashed border-dash px-6 py-14 text-center leading-relaxed text-muted-foreground">
          {empty}
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c.header} className={c.className}>
                  {c.header}
                </Th>
              ))}
              <Th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr key={item.id} className="hover:bg-page/60" onDoubleClick={() => onEdit(item)}>
                {columns.map((c) => (
                  <Td key={c.header} className={c.className}>
                    {c.cell(item)}
                  </Td>
                ))}
                <Td className="py-1 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label={`${t('common.edit')}: ${label(item)}`} onClick={() => onEdit(item)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${label(item)}`}
                    onClick={() => window.confirm(t('common.confirmDelete', { name: label(item) })) && onDelete(item)}
                  >
                    <Trash2 />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {footer && <p className="mx-1 text-[13px] leading-normal text-muted-foreground">{footer}</p>}
    </div>
  );
}
