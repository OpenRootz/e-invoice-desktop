import { useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGrid } from '@/components/form';
import { ListPage } from '@/components/list-page';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { countryOptions } from '@/lib/countries';
import { errorMessage, useMasterData } from '@/lib/data';
import type { NewCustomer } from '../../../shared/api';
import type { Customer } from '../../../shared/schema';

const emptyCustomer = (): NewCustomer => ({
  buyer: { name: '', isBusiness: false, address: { line1: '', postalCode: '', city: '', countryCode: 'DE' } },
});

/** Required for § 14 Abs. 4 UStG (full name and address of the buyer) */
const REQUIRED = ['name', 'line1', 'postalCode', 'city'] as const;

function missingFields(c: NewCustomer): Set<string> {
  const b = c.buyer;
  const values = { name: b.name, line1: b.address.line1, postalCode: b.address.postalCode, city: b.address.city };
  return new Set(REQUIRED.filter((k) => !values[k].trim()));
}

/** Drops empty optional groups before saving. */
function normalize(c: NewCustomer): NewCustomer {
  const n = structuredClone(c);
  if (!n.buyer.electronicAddress?.value.trim()) delete n.buyer.electronicAddress;
  if (n.buyer.contact && !n.buyer.contact.name?.trim()) delete n.buyer.contact;
  if (!n.buyer.isBusiness) delete n.buyer.vatId;
  return n;
}

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const data = useMasterData();
  const [editing, setEditing] = useState<NewCustomer>();

  const remove = async (c: Customer) => {
    await window.api.customers.delete(c.id);
    await data.reload();
  };

  return (
    <>
      <ListPage
        items={data.customers}
        label={(c) => c.buyer.name}
        searchText={(c) => [c.buyer.name, c.number, c.buyer.address.city, c.buyer.electronicAddress?.value].join(' ')}
        empty={t('customers.empty')}
        newLabel={t('customers.new')}
        onNew={() => setEditing(emptyCustomer())}
        onEdit={(c) => setEditing(structuredClone(c))}
        onDelete={remove}
        columns={[
          { header: t('customers.columns.name'), cell: (c) => <span className="font-semibold">{c.buyer.name}</span> },
          {
            header: t('customers.columns.type'),
            cell: (c) => (c.buyer.isBusiness ? t('customers.typeBusiness') : t('customers.typeConsumer')),
          },
          { header: t('customers.columns.city'), cell: (c) => `${c.buyer.address.postalCode} ${c.buyer.address.city}` },
          { header: t('customers.columns.email'), cell: (c) => c.buyer.electronicAddress?.value },
        ]}
      />
      {editing && (
        <CustomerDialog
          customer={editing}
          language={i18n.language}
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

function CustomerDialog({
  customer,
  language,
  onClose,
  onSaved,
}: {
  customer: NewCustomer;
  language: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { seller } = useMasterData();
  const [value, setValue] = useState(customer);
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const countries = useMemo(() => countryOptions(language), [language]);
  const missing = missingFields(value);
  const required = (key: (typeof REQUIRED)[number]) => (touched && missing.has(key) ? t('company.errors.required') : undefined);

  const update = (change: (c: NewCustomer) => void) =>
    setValue((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  const text = (get: (c: NewCustomer) => string | undefined, set: (c: NewCustomer, v: string) => void) => ({
    value: get(value) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update((c) => set(c, e.target.value)),
  });

  const save = async () => {
    setTouched(true);
    if (missing.size) return;
    try {
      await window.api.customers.save(normalize(value));
      await onSaved();
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  const b = value.buyer;
  const defaultLanguage = t(`languages.${seller?.invoiceLanguage ?? 'de'}`);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={customer.id ? t('customers.edit') : t('customers.new')}
      footer={
        <>
          {saveError && (
            <span className="mr-auto self-center text-sm font-medium text-warning">{t('common.errorSaving', { message: saveError })}</span>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-[18px]">
        <div className="flex items-start gap-3.5 rounded-xl bg-page px-4 py-3.5">
          <Switch
            className="mt-0.5"
            id="customer-business"
            checked={b.isBusiness}
            onCheckedChange={(checked) => update((c) => (c.buyer.isBusiness = checked))}
          />
          <div className="space-y-1">
            <Label htmlFor="customer-business" className="text-sm font-semibold">
              {t('customers.business')}
            </Label>
            <p className="text-[13px] leading-normal text-muted-foreground">{t('customers.businessHint')}</p>
          </div>
        </div>
        <FieldGrid>
          <Field label={b.isBusiness ? t('customers.company') : t('customers.name')} error={required('name')}>
            <Input
              autoFocus
              {...text(
                (c) => c.buyer.name,
                (c, v) => (c.buyer.name = v),
              )}
            />
          </Field>
          {b.isBusiness ? (
            <Field label={`${t('customers.contactName')} (${t('common.optional')})`}>
              <Input
                {...text(
                  (c) => c.buyer.contact?.name,
                  (c, v) => (c.buyer.contact = { ...c.buyer.contact, name: v }),
                )}
              />
            </Field>
          ) : (
            <div />
          )}
          <Field label={t('company.street')} error={required('line1')}>
            <Input
              {...text(
                (c) => c.buyer.address.line1,
                (c, v) => (c.buyer.address.line1 = v),
              )}
            />
          </Field>
          <Field label={`${t('company.line2')} (${t('common.optional')})`}>
            <Input
              {...text(
                (c) => c.buyer.address.line2,
                (c, v) => (c.buyer.address.line2 = v),
              )}
            />
          </Field>
        </FieldGrid>
        <FieldGrid cols={3}>
          <Field label={t('company.postalCode')} error={required('postalCode')}>
            <Input
              {...text(
                (c) => c.buyer.address.postalCode,
                (c, v) => (c.buyer.address.postalCode = v),
              )}
            />
          </Field>
          <Field label={t('company.city')} error={required('city')}>
            <Input
              {...text(
                (c) => c.buyer.address.city,
                (c, v) => (c.buyer.address.city = v),
              )}
            />
          </Field>
          <Field label={t('company.country')}>
            <Select value={b.address.countryCode} onChange={(e) => update((c) => (c.buyer.address.countryCode = e.target.value))}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label={`${t('customers.email')} (${t('common.optional')})`}>
            <Input
              type="email"
              {...text(
                (c) => c.buyer.electronicAddress?.value,
                (c, v) => (c.buyer.electronicAddress = { scheme: 'EM', value: v }),
              )}
            />
          </Field>
          {b.isBusiness && (
            <Field label={`${t('customers.vatId')} (${t('common.optional')})`}>
              <Input
                className="font-mono"
                {...text(
                  (c) => c.buyer.vatId,
                  (c, v) => (c.buyer.vatId = v),
                )}
              />
            </Field>
          )}
          <Field label={`${t('customers.number')} (${t('common.optional')})`}>
            <Input
              {...text(
                (c) => c.number,
                (c, v) => (c.number = v),
              )}
            />
          </Field>
          <Field label={`${t('customers.buyerReference')} (${t('common.optional')})`} hint={t('customers.buyerReferenceHint')}>
            <Input
              {...text(
                (c) => c.buyerReference,
                (c, v) => (c.buyerReference = v),
              )}
            />
          </Field>
          <Field label={t('customers.invoiceLanguage')}>
            <Select
              value={value.invoiceLanguage ?? ''}
              onChange={(e) => update((c) => (c.invoiceLanguage = (e.target.value || undefined) as 'de' | 'en' | undefined))}
            >
              <option value="">{t('customers.defaultLanguage', { language: defaultLanguage })}</option>
              <option value="de">{t('languages.de')}</option>
              <option value="en">{t('languages.en')}</option>
            </Select>
          </Field>
        </FieldGrid>
        <Field label={`${t('customers.notes')} (${t('common.optional')})`}>
          <Textarea
            rows={2}
            {...text(
              (c) => c.notes,
              (c, v) => (c.notes = v),
            )}
          />
        </Field>
      </div>
    </Dialog>
  );
}
