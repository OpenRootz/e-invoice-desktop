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
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? items.filter((i) => searchText(i).toLocaleLowerCase().includes(q)) : items;
  }, [items, query, searchText]);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={onNew} className="ml-auto">
          <Plus /> {newLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">{empty}</p>
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
              <tr key={item.id} className="hover:bg-muted/40" onDoubleClick={() => onEdit(item)}>
                {columns.map((c) => (
                  <Td key={c.header} className={c.className}>
                    {c.cell(item)}
                  </Td>
                ))}
                <Td className="text-right whitespace-nowrap">
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
    </div>
  );
}
