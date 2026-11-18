import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGrid } from '@/components/form';
import { ListPage } from '@/components/list-page';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { errorMessage, useMasterData } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import type { NewProduct } from '../../../shared/api';
import { formatMoneyInput, parseMoneyInput, UNIT_CODES, VAT_PRESETS, vatPresetKey } from '../../../shared/input';
import type { Product } from '../../../shared/schema';

export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const data = useMasterData();
  const [editing, setEditing] = useState<NewProduct>();
  const smallBusiness = !!data.seller?.seller.smallBusiness;

  const remove = async (p: Product) => {
    await window.api.products.delete(p.id);
    await data.reload();
  };
  const vatLabel = (p: Product) => {
    const key = vatPresetKey(p.vat);
    return key ? t(`vat.${key}`).split(' (')[0] : `${p.vat.rate} % ${p.vat.code}`;
  };

  return (
    <>
      <ListPage
        items={data.products}
        label={(p) => p.name}
        searchText={(p) => [p.name, p.sellerItemId, p.description].join(' ')}
        empty={t('products.empty')}
        newLabel={t('products.new')}
        onNew={() =>
          setEditing({
            name: '',
            unitCode: 'H87',
            price: 0,
            priceIncludesTax: data.seller?.pricesIncludeTax ?? true,
            vat: VAT_PRESETS[0].vat,
          })
        }
        onEdit={(p) => setEditing(structuredClone(p))}
        onDelete={remove}
        columns={[
          { header: t('products.columns.name'), cell: (p) => <span className="font-medium">{p.name}</span> },
          { header: t('products.columns.sku'), cell: (p) => p.sellerItemId },
          {
            header: t('products.columns.unit'),
            cell: (p) => t(`units.${p.unitCode as (typeof UNIT_CODES)[number]}`, { defaultValue: p.unitCode }),
          },
          {
            header: t('products.columns.price'),
            className: 'text-right',
            cell: (p) => (
              <>
                {formatMoney(p.price, i18n.language)}{' '}
                {!smallBusiness && (
                  <span className="text-xs text-muted-foreground">{p.priceIncludesTax ? t('products.gross') : t('products.net')}</span>
                )}
              </>
            ),
          },
          ...(smallBusiness ? [] : [{ header: t('products.columns.vat'), cell: vatLabel }]),
        ]}
      />
      {editing && (
        <ProductDialog
          product={editing}
          smallBusiness={smallBusiness}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await data.reload();
          }}
        />
      )}
    </>
  );
}

function ProductDialog({
  product,
  smallBusiness,
  onClose,
  onSaved,
}: {
  product: NewProduct;
  smallBusiness: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState(product);
  const [priceText, setPriceText] = useState(product.id ? formatMoneyInput(product.price, i18n.language) : '');
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const price = parseMoneyInput(priceText);

  const update = (change: (p: NewProduct) => void) =>
    setValue((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  const text = (get: (p: NewProduct) => string | undefined, set: (p: NewProduct, v: string) => void) => ({
    value: get(value) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update((p) => set(p, e.target.value)),
  });

  const save = async () => {
    setTouched(true);
    if (!value.name.trim() || price === undefined) return;
    try {
      await window.api.products.save({ ...value, price });
      await onSaved();
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  const priceLabel = smallBusiness ? t('products.price') : value.priceIncludesTax ? t('products.priceGross') : t('products.priceNet');
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={product.id ? t('products.edit') : t('products.new')}
      footer={
        <>
          {saveError && (
            <span className="mr-auto self-center text-sm text-destructive">{t('common.errorSaving', { message: saveError })}</span>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid>
          <Field label={t('products.name')} error={touched && !value.name.trim() ? t('company.errors.required') : undefined}>
            <Input
              autoFocus
              {...text(
                (p) => p.name,
                (p, v) => (p.name = v),
              )}
            />
          </Field>
          <Field label={`${t('products.sku')} (${t('common.optional')})`}>
            <Input
              {...text(
                (p) => p.sellerItemId,
                (p, v) => (p.sellerItemId = v),
              )}
            />
          </Field>
        </FieldGrid>
        <Field label={`${t('products.description')} (${t('common.optional')})`}>
          <Textarea
            rows={2}
            {...text(
              (p) => p.description,
              (p, v) => (p.description = v),
            )}
          />
        </Field>
        <FieldGrid cols={3}>
          <Field label={priceLabel} error={touched && price === undefined ? t('products.invalidPrice') : undefined}>
            <Input inputMode="decimal" placeholder="0,00" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
          </Field>
          <Field label={t('products.unit')}>
            <Select value={value.unitCode} onChange={(e) => update((p) => (p.unitCode = e.target.value))}>
              {UNIT_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`units.${code}`)}
                </option>
              ))}
            </Select>
          </Field>
          {!smallBusiness && (
            <Field label={t('products.vat')}>
              <Select
                value={vatPresetKey(value.vat) ?? ''}
                onChange={(e) => update((p) => (p.vat = VAT_PRESETS.find((v) => v.key === e.target.value)!.vat))}
              >
                {VAT_PRESETS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {t(`vat.${v.key}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FieldGrid>
        {!smallBusiness && (
          <div className="flex items-center gap-3">
            <Switch
              id="price-includes-tax"
              checked={value.priceIncludesTax}
              onCheckedChange={(checked) => update((p) => (p.priceIncludesTax = checked))}
            />
            <Label htmlFor="price-includes-tax">{t('products.priceIncludesTax')}</Label>
          </div>
        )}
      </div>
    </Dialog>
  );
}
