import { AlertTriangle, Check, CircleCheck, Eye, FileDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGrid } from '@/components/form';
import { PdfPreviewDialog } from '@/components/pdf-preview';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { countryOptions } from '@/lib/countries';
import { errorMessage, useMasterData } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { useNavigate } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { emptyCustomer, missingFields, normalizeCustomer } from '@/pages/customers';
import { mappingLabels } from '../../../core/labels';
import type { VatCategory } from '../../../core/model';
import type { Issue, NewCustomer } from '../../../shared/api';
import { formatMoneyInput, parseMoneyInput, parseQuantityInput, UNIT_CODES, VAT_PRESETS, vatPresetKey } from '../../../shared/input';
import { PAYMENT_METHODS, prepareInvoice, productUnitPrice, type InvoiceRequest, type PaymentMethod } from '../../../shared/invoice';
import type { Product } from '../../../shared/schema';

type VatKey = (typeof VAT_PRESETS)[number]['key'];

interface LineForm {
  key: string;
  name: string;
  description?: string;
  sellerItemId?: string;
  quantity: string;
  unitCode: string;
  price: string;
  discount: string;
  vatKey: VatKey;
}

interface InvoiceForm {
  /** A stored customer, or '' for a customer entered on the invoice */
  customerId: string;
  newCustomer: NewCustomer;
  /** Store the entered customer when the invoice is created */
  saveCustomer: boolean;
  number: string;
  /** The user typed a number; it is no longer replaced by the suggestion */
  numberEdited: boolean;
  issueDate: string;
  deliveryDate: string;
  orderReference: string;
  language: 'de' | 'en' | '';
  lines: LineForm[];
  shipping: string;
  shippingVatKey: VatKey;
  paymentMethod: PaymentMethod;
  paid: boolean;
  notes: string;
}

const today = () => new Date().toLocaleDateString('sv-SE');
const vatOf = (key: VatKey): VatCategory => VAT_PRESETS.find((p) => p.key === key)!.vat;
let lineSeq = 0;
const lineKey = () => `l${++lineSeq}`;
const freeLine = (): LineForm => ({ key: lineKey(), name: '', quantity: '1', unitCode: 'H87', price: '', discount: '', vatKey: 'S19' });
/** A line nobody has typed into yet; it is left out instead of reported */
const isBlank = (l: LineForm) => !l.name.trim() && !l.price.trim() && !l.discount.trim();

const emptyForm = (): InvoiceForm => ({
  customerId: '',
  newCustomer: emptyCustomer(),
  saveCustomer: true,
  number: '',
  numberEdited: false,
  issueDate: today(),
  deliveryDate: today(),
  orderReference: '',
  language: '',
  // Most invoices have items that are not stored as products: start with a free line
  lines: [freeLine()],
  shipping: '',
  shippingVatKey: 'S19',
  paymentMethod: 'transfer',
  paid: false,
  notes: '',
});

/** The form survives switching to another page (e.g. to add a customer) */
let keptForm: InvoiceForm | undefined;

interface LineErrors {
  quantity?: boolean;
  price?: boolean;
  discount?: boolean;
}

/** The request for main, built from the valid parts of the form, and the fields that are invalid. */
function toRequest(form: InvoiceForm, customer: NewCustomer | undefined, defaultLanguage: 'de' | 'en') {
  const errors: Record<string, LineErrors> = {};
  const language = form.language || customer?.invoiceLanguage || defaultLanguage;
  const lines: InvoiceRequest['lines'] = [];
  for (const l of form.lines) {
    if (isBlank(l)) continue;
    const quantity = parseQuantityInput(l.quantity);
    const price = parseMoneyInput(l.price);
    const discount = l.discount.trim() ? parseMoneyInput(l.discount) : 0;
    const e: LineErrors = { quantity: !quantity, price: price === undefined || !l.name.trim(), discount: discount === undefined };
    if (e.quantity || e.price || e.discount) {
      errors[l.key] = e;
      continue;
    }
    lines.push({
      name: l.name.trim(),
      description: l.description,
      sellerItemId: l.sellerItemId,
      quantity: quantity!,
      unitCode: l.unitCode,
      unitPrice: price!,
      discount: discount ? { amount: discount, reason: mappingLabels(language).discount } : undefined,
      vat: vatOf(l.vatKey),
    });
  }
  const shipping = form.shipping.trim() ? parseMoneyInput(form.shipping) : 0;
  const shippingError = shipping === undefined;
  const request: InvoiceRequest | undefined = customer && {
    number: form.number.trim(),
    issueDate: form.issueDate,
    deliveryDate: form.deliveryDate || undefined,
    language,
    buyer: customer.buyer,
    delivery: customer.delivery,
    buyerReference: customer.buyerReference,
    orderReference: form.orderReference.trim() || undefined,
    notes: form.notes.trim() || undefined,
    lines,
    shipping: shipping ? { amount: shipping, vat: vatOf(form.shippingVatKey) } : undefined,
    payment: { method: form.paymentMethod, paid: form.paid },
  };
  return { request, errors, shippingError };
}

export function InvoicePage() {
  const { t, i18n } = useTranslation();
  const data = useMasterData();
  const profile = data.seller;
  const smallBusiness = !!profile?.seller.smallBusiness;
  const [form, setForm] = useState<InvoiceForm>(() => keptForm ?? emptyForm());
  const [exportIssues, setExportIssues] = useState<Issue[]>();
  const [exportError, setExportError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [preview, setPreview] = useState<{ pdf: Uint8Array } | 'loading'>();

  useEffect(() => {
    keptForm = form;
  }, [form]);

  // Suggest the number for the issue date until the user types one; a written invoice keeps its number until
  // "New invoice"
  useEffect(() => {
    if (saved || form.numberEdited || !/^\d{4}-\d{2}-\d{2}$/.test(form.issueDate)) return;
    let current = true;
    void window.api.numbering.suggest(form.issueDate).then((number) => current && setForm((f) => (f.numberEdited ? f : { ...f, number })));
    return () => {
      current = false;
    };
  }, [form.issueDate, form.numberEdited, data.settings, saved]);

  const update = (change: Partial<InvoiceForm>) => {
    setSaved(undefined);
    setExportIssues(undefined);
    setForm((f) => ({ ...f, ...change }));
  };
  const updateLine = (key: string, change: Partial<LineForm>) =>
    update({ lines: form.lines.map((l) => (l.key === key ? { ...l, ...change } : l)) });

  const stored = data.customers.find((c) => c.id === form.customerId);
  const isNew = !stored;
  const missing = missingFields(form.newCustomer);
  // An entered customer counts once the § 14 details are complete
  const customer: NewCustomer | undefined = stored ?? (missing.size ? undefined : normalizeCustomer(form.newCustomer));
  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language]);
  const { request, errors, shippingError } = toRequest(form, customer, profile?.invoiceLanguage ?? 'de');
  const prepared = request && profile ? prepareInvoice(request, profile) : undefined;
  const totals = prepared?.model.totals;
  const formInvalid = Object.keys(errors).length > 0 || shippingError || !form.number.trim();
  const issues = exportIssues ?? prepared?.issues ?? [];
  const lang = i18n.language;
  const money = (amount: number) => formatMoney(amount, lang);
  const pricesIncludeTax = smallBusiness ? false : (profile?.pricesIncludeTax ?? true);

  if (!profile) return <Onboarding />;

  const productLine = (product: Product, key: string): LineForm => ({
    key,
    name: product.name,
    description: product.description,
    sellerItemId: product.sellerItemId,
    quantity: '1',
    unitCode: product.unitCode,
    price: formatMoneyInput(productUnitPrice(product, pricesIncludeTax, smallBusiness), lang),
    discount: '',
    vatKey: vatPresetKey(product.vat) ?? 'S19',
  });
  // A chosen product takes the place of an untouched free line
  const addProduct = (product: Product) => update({ lines: [...form.lines.filter((l) => !isBlank(l)), productLine(product, lineKey())] });
  /** Typing the name of a stored product (or picking it from the suggestions) fills in its details */
  const changeName = (line: LineForm, name: string) => {
    const product = !line.price.trim() ? data.products.find((p) => p.name === name) : undefined;
    updateLine(line.key, product ? productLine(product, line.key) : { name });
  };
  const addFreeLine = () => update({ lines: [...form.lines, freeLine()] });
  const updateCustomer = (change: (c: NewCustomer) => void) => {
    const next = structuredClone(form.newCustomer);
    change(next);
    update({ newCustomer: next });
  };
  const customerText = (get: (c: NewCustomer) => string | undefined, set: (c: NewCustomer, v: string) => void) => ({
    value: get(form.newCustomer) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement>) => updateCustomer((c) => set(c, e.target.value)),
  });
  // Required fields are marked once the user started typing a customer
  const customerTouched = Object.values({ ...form.newCustomer.buyer.address, name: form.newCustomer.buyer.name }).some(
    (v) => typeof v === 'string' && v.trim() && v !== 'DE',
  );
  const required = (key: string) => (customerTouched && missing.has(key) ? t('company.errors.required') : undefined);

  const issueText = (i: Issue) => t(`invoice.issues.${i.code}` as 'invoice.issues.EMPTY_INVOICE', { defaultValue: i.message });

  const exportPdf = async () => {
    if (!request) return;
    setExportError(undefined);
    try {
      const result = await window.api.invoice.export(request);
      if (result.status === 'invalid') setExportIssues(result.issues);
      if (result.status === 'saved') {
        setSaved(request.number);
        if (isNew && form.saveCustomer && customer) {
          const created = await window.api.customers.save(customer);
          setForm((f) => ({ ...f, customerId: created.id, newCustomer: emptyCustomer() }));
        }
        await data.reload();
      }
    } catch (e) {
      setExportError(errorMessage(e));
    }
  };

  const showPreview = async () => {
    if (!request) return;
    setPreview('loading');
    try {
      const result = await window.api.invoice.preview(request);
      setPreview(result.pdf ? { pdf: result.pdf } : undefined);
    } catch (e) {
      setPreview(undefined);
      setExportError(errorMessage(e));
    }
  };

  const newInvoice = () => {
    setSaved(undefined);
    setForm({ ...emptyForm(), paymentMethod: form.paymentMethod, saveCustomer: form.saveCustomer });
  };

  // Amount per form line: the model's lines follow the valid form lines in order
  const validKeys = form.lines.filter((l) => !errors[l.key] && !isBlank(l)).map((l) => l.key);
  const lineAmount = (key: string) => {
    const line = prepared?.model.lines[validKeys.indexOf(key)];
    if (!line) return '';
    return money(pricesIncludeTax ? (line.display?.grossAmount ?? line.netAmount) : line.netAmount);
  };

  const country = (code: string) => new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  const ready = !!request && !formInvalid && issues.length === 0 && request.lines.length > 0;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[2_1_740px] flex-col gap-5">
        {saved && (
          <Alert kind="info" title={t('invoice.saved', { number: saved })}>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void window.api.invoice.showInFolder()}>
                <FolderOpen /> {t('invoice.showInFolder')}
              </Button>
              <Button size="sm" onClick={newInvoice}>
                <Plus /> {t('invoice.newInvoice')}
              </Button>
            </div>
          </Alert>
        )}

        <Card>
          <CardTitle>{t('invoice.customer')}</CardTitle>
          <Field label={t('invoice.chooseCustomer').replace(/\s*…$/, '')}>
            <Select value={stored ? form.customerId : ''} onChange={(e) => update({ customerId: e.target.value })}>
              <option value="">{t('invoice.newCustomer')}</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.buyer.name} – {c.buyer.address.city}
                </option>
              ))}
            </Select>
          </Field>
          {stored ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 text-[13.5px] leading-normal text-muted-foreground">
              <span>
                {[
                  stored.buyer.address.line1,
                  `${stored.buyer.address.postalCode} ${stored.buyer.address.city}`,
                  country(stored.buyer.address.countryCode),
                ].join(', ')}
              </span>
              <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
                {stored.buyer.isBusiness ? t('invoice.customerBusiness') : t('invoice.customerConsumer')}
                {!smallBusiness && ` · ${stored.buyer.isBusiness ? t('invoice.netPrices') : t('invoice.grossPrices')}`}
              </span>
            </div>
          ) : (
            <div className="mt-[18px] space-y-[18px]">
              <div className="flex items-center gap-3">
                <Switch
                  id="new-customer-business"
                  checked={form.newCustomer.buyer.isBusiness}
                  onCheckedChange={(checked) => updateCustomer((c) => (c.buyer.isBusiness = checked))}
                />
                <Label htmlFor="new-customer-business" className="text-sm">
                  {t('customers.business')}
                </Label>
              </div>
              <FieldGrid>
                <Field label={form.newCustomer.buyer.isBusiness ? t('customers.company') : t('customers.name')} error={required('name')}>
                  <Input
                    {...customerText(
                      (c) => c.buyer.name,
                      (c, v) => (c.buyer.name = v),
                    )}
                  />
                </Field>
                <Field label={t('company.street')} error={required('line1')}>
                  <Input
                    {...customerText(
                      (c) => c.buyer.address.line1,
                      (c, v) => (c.buyer.address.line1 = v),
                    )}
                  />
                </Field>
              </FieldGrid>
              <FieldGrid cols={3}>
                <Field label={t('company.postalCode')} error={required('postalCode')}>
                  <Input
                    {...customerText(
                      (c) => c.buyer.address.postalCode,
                      (c, v) => (c.buyer.address.postalCode = v),
                    )}
                  />
                </Field>
                <Field label={t('company.city')} error={required('city')}>
                  <Input
                    {...customerText(
                      (c) => c.buyer.address.city,
                      (c, v) => (c.buyer.address.city = v),
                    )}
                  />
                </Field>
                <Field label={t('company.country')}>
                  <Select
                    value={form.newCustomer.buyer.address.countryCode}
                    onChange={(e) => updateCustomer((c) => (c.buyer.address.countryCode = e.target.value))}
                  >
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
                    {...customerText(
                      (c) => c.buyer.electronicAddress?.value,
                      (c, v) => (c.buyer.electronicAddress = { scheme: 'EM', value: v }),
                    )}
                  />
                </Field>
                {form.newCustomer.buyer.isBusiness && (
                  <Field label={`${t('customers.vatId')} (${t('common.optional')})`}>
                    <Input
                      className="font-mono"
                      {...customerText(
                        (c) => c.buyer.vatId,
                        (c, v) => (c.buyer.vatId = v),
                      )}
                    />
                  </Field>
                )}
              </FieldGrid>
              <div className="flex items-center gap-3">
                <Switch id="save-customer" checked={form.saveCustomer} onCheckedChange={(saveCustomer) => update({ saveCustomer })} />
                <Label htmlFor="save-customer" className="text-sm">
                  {t('invoice.saveCustomer')}
                </Label>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>{t('invoice.details')}</CardTitle>
          <FieldGrid cols={3}>
            <Field
              label={t('invoice.number')}
              hint={t('invoice.numberHint')}
              error={form.number.trim() ? undefined : t('company.errors.required')}
            >
              <Input className="font-mono" value={form.number} onChange={(e) => update({ number: e.target.value, numberEdited: true })} />
            </Field>
            <Field label={t('invoice.issueDate')}>
              <Input type="date" value={form.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />
            </Field>
            <Field label={t('invoice.deliveryDate')}>
              <Input type="date" value={form.deliveryDate} onChange={(e) => update({ deliveryDate: e.target.value })} />
            </Field>
            <Field label={`${t('invoice.orderReference')} (${t('common.optional')})`}>
              <Input value={form.orderReference} onChange={(e) => update({ orderReference: e.target.value })} />
            </Field>
            <Field label={t('invoice.language')}>
              <Select value={form.language} onChange={(e) => update({ language: e.target.value as InvoiceForm['language'] })}>
                <option value="">
                  {t('customers.defaultLanguage', { language: t(`languages.${customer?.invoiceLanguage ?? profile.invoiceLanguage}`) })}
                </option>
                <option value="de">{t('languages.de')}</option>
                <option value="en">{t('languages.en')}</option>
              </Select>
            </Field>
          </FieldGrid>
        </Card>

        <Card>
          <CardTitle>{t('invoice.lines')}</CardTitle>
          {form.lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="min-w-[140px] pb-2 font-medium">{t('invoice.columns.name')}</th>
                    <th className="w-16 pb-2 font-medium">{t('invoice.columns.quantity')}</th>
                    <th className="w-[104px] pb-2 font-medium">{t('invoice.columns.unit')}</th>
                    <th className="w-[104px] pb-2 font-medium">
                      {smallBusiness
                        ? t('invoice.columns.price')
                        : pricesIncludeTax
                          ? t('invoice.columns.priceGross')
                          : t('invoice.columns.priceNet')}
                    </th>
                    <th className="w-[72px] pb-2 font-medium">{t('invoice.columns.discount')}</th>
                    {!smallBusiness && <th className="w-24 pb-2 font-medium">{t('invoice.columns.vat')}</th>}
                    <th className="w-[88px] pb-2 text-right font-medium">{t('invoice.columns.amount')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l) => {
                    const e = errors[l.key] ?? {};
                    return (
                      <tr key={l.key} className="border-t border-border align-top">
                        <td className="py-1.5 pr-2">
                          <Input
                            aria-label={t('invoice.columns.name')}
                            aria-invalid={(e.price && !l.name.trim()) || undefined}
                            placeholder={t('invoice.lineNamePlaceholder')}
                            list={data.products.length ? 'product-names' : undefined}
                            value={l.name}
                            onChange={(ev) => changeName(l, ev.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            aria-label={t('invoice.columns.quantity')}
                            aria-invalid={e.quantity || undefined}
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={(ev) => updateLine(l.key, { quantity: ev.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Select
                            aria-label={t('invoice.columns.unit')}
                            value={l.unitCode}
                            onChange={(ev) => updateLine(l.key, { unitCode: ev.target.value })}
                          >
                            {UNIT_CODES.map((code) => (
                              <option key={code} value={code}>
                                {t(`units.${code}`)}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            aria-label={t('invoice.columns.price')}
                            aria-invalid={(e.price && !!l.name.trim()) || undefined}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={l.price}
                            onChange={(ev) => updateLine(l.key, { price: ev.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            aria-label={t('invoice.columns.discount')}
                            aria-invalid={e.discount || undefined}
                            inputMode="decimal"
                            value={l.discount}
                            onChange={(ev) => updateLine(l.key, { discount: ev.target.value })}
                          />
                        </td>
                        {!smallBusiness && (
                          <td className="py-1.5 pr-2">
                            <Select
                              aria-label={t('invoice.columns.vat')}
                              value={l.vatKey}
                              onChange={(ev) => updateLine(l.key, { vatKey: ev.target.value as VatKey })}
                            >
                              {VAT_PRESETS.map((v) => (
                                <option key={v.key} value={v.key}>
                                  {t(`vat.${v.key}`).split(' (')[0]}
                                </option>
                              ))}
                            </Select>
                          </td>
                        )}
                        <td className="py-1.5 pt-4 text-right font-semibold whitespace-nowrap tabular-nums">{lineAmount(l.key)}</td>
                        <td className="py-1.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('invoice.removeLine')}
                            onClick={() => update({ lines: form.lines.filter((x) => x.key !== l.key) })}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="product-names">
                {data.products.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>
          )}
          <div className={cn('flex flex-wrap gap-3', form.lines.length > 0 && 'mt-4 border-t border-border pt-4')}>
            <Button variant="outline" onClick={addFreeLine}>
              <Plus /> {t('invoice.addFreeLine')}
            </Button>
            {data.products.length > 0 && (
              <Select
                aria-label={t('invoice.addProduct')}
                className="w-72 font-medium"
                value=""
                onChange={(e) => {
                  const product = data.products.find((p) => p.id === e.target.value);
                  if (product) addProduct(product);
                }}
              >
                <option value="">{t('invoice.addProduct')}</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>{t('invoice.payment')}</CardTitle>
          <div className="space-y-4">
            <FieldGrid>
              <Field label={t('invoice.shipping')} error={shippingError ? t('products.invalidPrice') : undefined}>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.shipping}
                  onChange={(e) => update({ shipping: e.target.value })}
                />
              </Field>
              {!smallBusiness && (
                <Field label={t('invoice.shippingVat')}>
                  <Select value={form.shippingVatKey} onChange={(e) => update({ shippingVatKey: e.target.value as VatKey })}>
                    {VAT_PRESETS.map((v) => (
                      <option key={v.key} value={v.key}>
                        {t(`vat.${v.key}`).split(' (')[0]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={t('invoice.paymentMethod')}>
                <Select value={form.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value as PaymentMethod })}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`invoice.methods.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-center gap-3 pt-6">
                <Switch id="invoice-paid" checked={form.paid} onCheckedChange={(paid) => update({ paid })} />
                <Label htmlFor="invoice-paid">{t('invoice.paid')}</Label>
              </div>
            </FieldGrid>
            <Field label={`${t('invoice.notes')} (${t('common.optional')})`}>
              <Textarea rows={3} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
            </Field>
          </div>
        </Card>
      </div>

      <aside className="sticky top-0 flex max-w-[340px] min-w-0 flex-[1_1_300px] flex-col gap-4">
        <Card>
          <CardTitle>{t('invoice.summary')}</CardTitle>
          {totals ? (
            <dl className="tabular-nums">
              {!smallBusiness && (
                <>
                  <div className="flex justify-between">
                    <dt>{t('invoice.net')}</dt>
                    <dd className="text-foreground">{money(totals.taxBasisTotal)}</dd>
                  </div>
                  {totals.vat.map((v) => (
                    <div key={`${v.category.code}${v.category.rate}`} className="flex justify-between py-2 text-muted-foreground">
                      <dt>{t('invoice.vatLine', { rate: v.category.rate.replace('.', lang === 'de' ? ',' : '.') })}</dt>
                      <dd className="text-foreground">{money(v.taxAmount)}</dd>
                    </div>
                  ))}
                </>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3.5">
                <dt className="text-[15px] font-semibold">{t('invoice.total')}</dt>
                <dd className="font-heading text-[28px] leading-none font-bold">{money(totals.grandTotal + totals.roundingAmount)}</dd>
              </div>
              <p className="pt-3 text-[13px] text-muted-foreground">
                {form.paid
                  ? t('invoice.paidNote')
                  : prepared?.model.payment.dueDate &&
                    t('invoice.due', { date: new Date(`${prepared.model.payment.dueDate}T00:00:00`).toLocaleDateString(lang) })}
              </p>
            </dl>
          ) : (
            <p className="text-muted-foreground">{customer ? '' : t('invoice.customerMissing')}</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3.5">
          {customer && issues.length > 0 ? (
            <div role="status" className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13.5px] leading-snug text-warning">
              <p className="mb-1.5 flex items-center gap-2.5 font-medium">
                <AlertTriangle className="size-5 shrink-0" strokeWidth={1.75} />
                {t('invoice.issuesTitle')}
              </p>
              <ul className="list-disc space-y-0.5 pl-[50px] text-foreground">
                {issues.map((i) => (
                  <li key={`${i.code}${i.path ?? ''}`}>{issueText(i)}</li>
                ))}
              </ul>
            </div>
          ) : (
            ready && (
              <p
                role="status"
                className="flex items-center gap-2.5 rounded-[10px] bg-success-soft px-3 py-2.5 text-[13.5px] font-medium text-success"
              >
                <CircleCheck className="size-5 shrink-0" strokeWidth={2} />
                {t('invoice.complete')}
              </p>
            )
          )}
          {exportError && <Alert kind="error" title={t('invoice.exportFailed', { message: exportError })} />}
          <Button className="w-full" onClick={exportPdf} disabled={!request || formInvalid || issues.length > 0 || !!saved}>
            {saved ? <Check /> : <FileDown />} {t('invoice.create')}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={showPreview}
            disabled={!request || formInvalid || form.lines.length === 0 || preview === 'loading'}
          >
            <Eye /> {t('invoice.preview')}
          </Button>
          <p className="text-[12.5px] leading-normal text-muted-foreground">{t('invoice.retention')}</p>
        </Card>
      </aside>

      {preview && preview !== 'loading' && (
        <PdfPreviewDialog pdf={preview.pdf} title={`${t('invoice.preview')} ${form.number}`} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}

const STEPS = ['company', 'customer', 'invoice'] as const;
const FACTS = ['local', 'open', 'free'] as const;

/** Shown instead of the form until "My company" is filled in. */
function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card className="flex max-w-[760px] flex-col gap-7 p-8">
      <ol className="flex flex-wrap gap-4">
        {STEPS.map((step, i) => (
          <li key={step} className="flex flex-[1_1_180px] items-center gap-3">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-sm font-semibold',
                i === 0 ? 'border-primary bg-primary text-white' : 'border-input bg-background text-muted-foreground',
              )}
              aria-current={i === 0 ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold">{t(`invoice.onboarding.${step}Title`)}</span>
              <span className="block text-[12.5px] text-muted-foreground">{t(`invoice.onboarding.${step}Text`)}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-start gap-3.5 rounded-xl bg-warning-soft px-[18px] py-4 text-warning">
        <AlertTriangle className="mt-px size-[22px] shrink-0" strokeWidth={1.75} />
        <p className="leading-normal">
          <strong className="font-semibold">{t('invoice.noProfile')}</strong>
          <br />
          {t('company.intro')}
        </p>
      </div>
      <div>
        <Button onClick={() => navigate('company')}>{t('invoice.onboarding.action')}</Button>
      </div>
      <div className="flex flex-wrap gap-5 border-t border-border pt-6">
        {FACTS.map((fact) => (
          <div key={fact} className="flex flex-[1_1_180px] items-start gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
              <Check className="size-[18px]" strokeWidth={2} />
            </span>
            <span>
              <span className="block text-sm font-semibold">{t(`invoice.onboarding.${fact}Title`)}</span>
              <span className="block text-[13px] leading-normal text-muted-foreground">{t(`invoice.onboarding.${fact}Text`)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
