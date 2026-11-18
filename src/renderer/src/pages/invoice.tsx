import { Eye, FileDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGrid } from '@/components/form';
import { PdfPreviewDialog } from '@/components/pdf-preview';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { errorMessage, useMasterData } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { mappingLabels } from '../../../core/labels';
import type { VatCategory } from '../../../core/model';
import type { Issue } from '../../../shared/api';
import { formatMoneyInput, parseMoneyInput, parseQuantityInput, UNIT_CODES, VAT_PRESETS, vatPresetKey } from '../../../shared/input';
import { PAYMENT_METHODS, prepareInvoice, productUnitPrice, type InvoiceRequest, type PaymentMethod } from '../../../shared/invoice';
import type { Customer, Product } from '../../../shared/schema';

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
  customerId: string;
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

const emptyForm = (): InvoiceForm => ({
  customerId: '',
  number: '',
  numberEdited: false,
  issueDate: today(),
  deliveryDate: today(),
  orderReference: '',
  language: '',
  lines: [],
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
function toRequest(form: InvoiceForm, customer: Customer | undefined, defaultLanguage: 'de' | 'en') {
  const errors: Record<string, LineErrors> = {};
  const language = form.language || customer?.invoiceLanguage || defaultLanguage;
  const lines: InvoiceRequest['lines'] = [];
  for (const l of form.lines) {
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

  const customer = data.customers.find((c) => c.id === form.customerId);
  const { request, errors, shippingError } = toRequest(form, customer, profile?.invoiceLanguage ?? 'de');
  const prepared = request && profile ? prepareInvoice(request, profile) : undefined;
  const totals = prepared?.model.totals;
  const formInvalid = Object.keys(errors).length > 0 || shippingError || !form.number.trim();
  const issues = exportIssues ?? prepared?.issues ?? [];
  const lang = i18n.language;
  const money = (amount: number) => formatMoney(amount, lang);
  const pricesIncludeTax = smallBusiness ? false : (profile?.pricesIncludeTax ?? true);

  if (!profile) return <Alert kind="warning" title={t('invoice.noProfile')} />;

  const addProduct = (product: Product) =>
    update({
      lines: [
        ...form.lines,
        {
          key: lineKey(),
          name: product.name,
          description: product.description,
          sellerItemId: product.sellerItemId,
          quantity: '1',
          unitCode: product.unitCode,
          price: formatMoneyInput(productUnitPrice(product, pricesIncludeTax, smallBusiness), lang),
          discount: '',
          vatKey: vatPresetKey(product.vat) ?? 'S19',
        },
      ],
    });
  const addFreeLine = () =>
    update({
      lines: [...form.lines, { key: lineKey(), name: '', quantity: '1', unitCode: 'H87', price: '', discount: '', vatKey: 'S19' }],
    });

  const issueText = (i: Issue) => t(`invoice.issues.${i.code}` as 'invoice.issues.EMPTY_INVOICE', { defaultValue: i.message });

  const exportPdf = async () => {
    if (!request) return;
    setExportError(undefined);
    try {
      const result = await window.api.invoice.export(request);
      if (result.status === 'invalid') setExportIssues(result.issues);
      if (result.status === 'saved') {
        setSaved(request.number);
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
    setForm({ ...emptyForm(), paymentMethod: form.paymentMethod });
  };

  // Amount per form line: the model's lines follow the valid form lines in order
  const validKeys = form.lines.filter((l) => !errors[l.key]).map((l) => l.key);
  const lineAmount = (key: string) => {
    const line = prepared?.model.lines[validKeys.indexOf(key)];
    if (!line) return '';
    return money(pricesIncludeTax ? (line.display?.grossAmount ?? line.netAmount) : line.netAmount);
  };

  return (
    <div className="max-w-6xl space-y-5 pb-24">
      {saved && (
        <Alert kind="info" title={t('invoice.saved', { number: saved })}>
          <div className="mt-2 flex gap-2">
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
        <FieldGrid cols={3}>
          <Field label={t('invoice.customer')} hint={data.customers.length ? undefined : t('invoice.noCustomers')}>
            <Select value={form.customerId} onChange={(e) => update({ customerId: e.target.value })}>
              <option value="">{t('invoice.chooseCustomer')}</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.buyer.name} – {c.buyer.address.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('invoice.number')}
            hint={t('invoice.numberHint')}
            error={form.number.trim() ? undefined : t('company.errors.required')}
          >
            <Input value={form.number} onChange={(e) => update({ number: e.target.value, numberEdited: true })} />
          </Field>
          <Field label={`${t('invoice.orderReference')} (${t('common.optional')})`}>
            <Input value={form.orderReference} onChange={(e) => update({ orderReference: e.target.value })} />
          </Field>
          <Field label={t('invoice.issueDate')}>
            <Input type="date" value={form.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />
          </Field>
          <Field label={t('invoice.deliveryDate')}>
            <Input type="date" value={form.deliveryDate} onChange={(e) => update({ deliveryDate: e.target.value })} />
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
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-medium">{t('invoice.columns.name')}</th>
                  <th className="w-20 pb-2 font-medium">{t('invoice.columns.quantity')}</th>
                  <th className="w-32 pb-2 font-medium">{t('invoice.columns.unit')}</th>
                  <th className="w-32 pb-2 font-medium">
                    {smallBusiness
                      ? t('invoice.columns.price')
                      : pricesIncludeTax
                        ? t('invoice.columns.priceGross')
                        : t('invoice.columns.priceNet')}
                  </th>
                  <th className="w-24 pb-2 font-medium">{t('invoice.columns.discount')}</th>
                  {!smallBusiness && <th className="w-28 pb-2 font-medium">{t('invoice.columns.vat')}</th>}
                  <th className="w-28 pb-2 text-right font-medium">{t('invoice.columns.amount')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((l) => {
                  const e = errors[l.key] ?? {};
                  return (
                    <tr key={l.key} className="align-top">
                      <td className="py-1 pr-2">
                        <Input
                          aria-label={t('invoice.columns.name')}
                          aria-invalid={(e.price && !l.name.trim()) || undefined}
                          value={l.name}
                          onChange={(ev) => updateLine(l.key, { name: ev.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          aria-label={t('invoice.columns.quantity')}
                          aria-invalid={e.quantity || undefined}
                          inputMode="decimal"
                          value={l.quantity}
                          onChange={(ev) => updateLine(l.key, { quantity: ev.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
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
                      <td className="py-1 pr-2">
                        <Input
                          aria-label={t('invoice.columns.price')}
                          aria-invalid={(e.price && !!l.name.trim()) || undefined}
                          inputMode="decimal"
                          placeholder="0,00"
                          value={l.price}
                          onChange={(ev) => updateLine(l.key, { price: ev.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          aria-label={t('invoice.columns.discount')}
                          aria-invalid={e.discount || undefined}
                          inputMode="decimal"
                          value={l.discount}
                          onChange={(ev) => updateLine(l.key, { discount: ev.target.value })}
                        />
                      </td>
                      {!smallBusiness && (
                        <td className="py-1 pr-2">
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
                      <td className="py-1 pt-3 text-right tabular-nums">{lineAmount(l.key)}</td>
                      <td className="py-1 text-right">
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
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {data.products.length > 0 && (
            <Select
              aria-label={t('invoice.addProduct')}
              className="w-72"
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
          <Button variant="outline" onClick={addFreeLine}>
            <Plus /> {t('invoice.addFreeLine')}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

        <Card>
          <CardTitle>{t('invoice.summary')}</CardTitle>
          {totals ? (
            <dl className="space-y-1.5 tabular-nums">
              {!smallBusiness && (
                <>
                  <div className="flex justify-between">
                    <dt>{t('invoice.net')}</dt>
                    <dd>{money(totals.taxBasisTotal)}</dd>
                  </div>
                  {totals.vat.map((v) => (
                    <div key={`${v.category.code}${v.category.rate}`} className="flex justify-between text-muted-foreground">
                      <dt>{t('invoice.vatLine', { rate: v.category.rate.replace('.', lang === 'de' ? ',' : '.') })}</dt>
                      <dd>{money(v.taxAmount)}</dd>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>{t('invoice.total')}</dt>
                <dd>{money(totals.grandTotal + totals.roundingAmount)}</dd>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                {form.paid
                  ? t('invoice.paidNote')
                  : prepared?.model.payment.dueDate &&
                    t('invoice.due', { date: new Date(`${prepared.model.payment.dueDate}T00:00:00`).toLocaleDateString(lang) })}
              </p>
            </dl>
          ) : (
            <p className="text-muted-foreground">{customer ? '' : t('invoice.chooseCustomer')}</p>
          )}
        </Card>
      </div>

      {customer && issues.length > 0 && (
        <Alert kind="warning" title={t('invoice.issuesTitle')}>
          <ul className="list-disc space-y-0.5 pl-4">
            {issues.map((i) => (
              <li key={`${i.code}${i.path ?? ''}`}>{issueText(i)}</li>
            ))}
          </ul>
        </Alert>
      )}
      {exportError && <Alert kind="error" title={t('invoice.exportFailed', { message: exportError })} />}

      <div className="fixed right-0 bottom-0 left-56 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-6 py-3">
        <Button
          variant="outline"
          onClick={showPreview}
          disabled={!request || formInvalid || form.lines.length === 0 || preview === 'loading'}
        >
          <Eye /> {t('invoice.preview')}
        </Button>
        <Button onClick={exportPdf} disabled={!request || formInvalid || issues.length > 0 || !!saved}>
          <FileDown /> {t('invoice.create')}
        </Button>
      </div>

      {preview && preview !== 'loading' && (
        <PdfPreviewDialog pdf={preview.pdf} title={`${t('invoice.preview')} ${form.number}`} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}
