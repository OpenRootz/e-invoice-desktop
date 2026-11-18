import { Check, ImageUp, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGrid } from '@/components/form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { countryOptions } from '@/lib/countries';
import { errorMessage, useMasterData } from '@/lib/data';
import type { SellerProfile } from '../../../shared/schema';
import { checkSellerProfile, emptySellerProfile } from '../../../shared/seller-profile-checks';

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

/** Removes optional groups the user left empty, so they are not stored as blank values. */
function normalize(profile: SellerProfile): SellerProfile {
  const p = structuredClone(profile);
  const s = p.seller;
  if (!s.identifier?.id.trim()) delete s.identifier;
  if (!s.legalRegistration?.id.trim()) delete s.legalRegistration;
  if (!s.electronicAddress?.value.trim()) delete s.electronicAddress;
  if (p.bank && !p.bank.iban.trim() && !p.bank.bic && !p.bank.accountName) delete p.bank;
  if (s.smallBusiness === false) delete s.smallBusiness;
  return p;
}

export function CompanyPage() {
  const { t, i18n } = useTranslation();
  const data = useMasterData();
  const [profile, setProfile] = useState<SellerProfile>(() => data.seller ?? emptySellerProfile());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'saved' } | { kind: 'error'; message: string }>();
  const [logoError, setLogoError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language]);

  const issues = useMemo(() => checkSellerProfile(normalize(profile)), [profile]);
  const complete = Object.keys(issues.errors).length === 0;
  const error = (path: string) => (issues.errors[path] ? t(`company.errors.${issues.errors[path]}`) : undefined);
  const warning = (path: string) => (issues.warnings[path] ? t(`company.warnings.${issues.warnings[path]}`) : undefined);

  const update = (change: (draft: SellerProfile) => void) => {
    setStatus(undefined);
    setProfile((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };
  const text = (get: (p: SellerProfile) => string | undefined, set: (p: SellerProfile, value: string) => void) => ({
    value: get(profile) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update((p) => set(p, e.target.value)),
  });

  const save = async () => {
    setSaving(true);
    try {
      const saved = await window.api.seller.save(normalize(profile));
      setProfile(saved);
      await data.reload();
      setStatus({ kind: 'saved' });
    } catch (e) {
      setStatus({ kind: 'error', message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const chooseLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setLogoError(t('company.logoType'));
    if (file.size > MAX_LOGO_BYTES) return setLogoError(t('company.logoTooLarge'));
    setLogoError(undefined);
    const reader = new FileReader();
    reader.onload = () => update((p) => (p.logo = String(reader.result)));
    reader.readAsDataURL(file);
  };

  const s = profile.seller;
  return (
    <div className="max-w-4xl space-y-5 pb-20">
      <p className="text-muted-foreground">{t('company.intro')}</p>
      {complete ? <Alert kind="info" title={t('company.complete')} /> : <Alert kind="warning" title={t('company.incomplete')} />}

      <Card>
        <CardTitle>{t('company.sections.business')}</CardTitle>
        <div className="space-y-4">
          <FieldGrid>
            <Field label={t('company.name')} error={error('seller.name')}>
              <Input
                {...text(
                  (p) => p.seller.name,
                  (p, v) => (p.seller.name = v),
                )}
              />
            </Field>
            <Field label={`${t('company.tradingName')} (${t('common.optional')})`}>
              <Input
                {...text(
                  (p) => p.seller.tradingName,
                  (p, v) => (p.seller.tradingName = v),
                )}
              />
            </Field>
            <Field label={t('company.street')} error={error('seller.address.line1')}>
              <Input
                {...text(
                  (p) => p.seller.address.line1,
                  (p, v) => (p.seller.address.line1 = v),
                )}
              />
            </Field>
            <Field label={`${t('company.line2')} (${t('common.optional')})`}>
              <Input
                {...text(
                  (p) => p.seller.address.line2,
                  (p, v) => (p.seller.address.line2 = v),
                )}
              />
            </Field>
          </FieldGrid>
          <FieldGrid cols={3}>
            <Field label={t('company.postalCode')} error={error('seller.address.postalCode')}>
              <Input
                {...text(
                  (p) => p.seller.address.postalCode,
                  (p, v) => (p.seller.address.postalCode = v),
                )}
              />
            </Field>
            <Field label={t('company.city')} error={error('seller.address.city')}>
              <Input
                {...text(
                  (p) => p.seller.address.city,
                  (p, v) => (p.seller.address.city = v),
                )}
              />
            </Field>
            <Field label={t('company.country')} error={error('seller.address.countryCode')} warning={warning('seller.address.countryCode')}>
              <Select value={s.address.countryCode} onChange={(e) => update((p) => (p.seller.address.countryCode = e.target.value))}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('company.sections.contact')}</CardTitle>
        <FieldGrid>
          <Field label={t('company.contactName')} error={error('seller.contact.name')}>
            <Input
              {...text(
                (p) => p.seller.contact.name,
                (p, v) => (p.seller.contact.name = v),
              )}
            />
          </Field>
          <Field label={t('company.phone')} error={error('seller.contact.phone')}>
            <Input
              type="tel"
              {...text(
                (p) => p.seller.contact.phone,
                (p, v) => (p.seller.contact.phone = v),
              )}
            />
          </Field>
          <Field label={t('company.email')} error={error('seller.contact.email')} warning={warning('seller.contact.email')}>
            <Input
              type="email"
              {...text(
                (p) => p.seller.contact.email,
                (p, v) => (p.seller.contact.email = v),
              )}
            />
          </Field>
          <Field label={t('company.invoiceEmail')} error={error('seller.electronicAddress.value')} hint={t('company.invoiceEmailHint')}>
            <Input
              type="email"
              {...text(
                (p) => p.seller.electronicAddress?.value,
                (p, v) => (p.seller.electronicAddress = { scheme: 'EM', value: v }),
              )}
            />
          </Field>
        </FieldGrid>
      </Card>

      <Card>
        <CardTitle>{t('company.sections.tax')}</CardTitle>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
            <Switch
              id="small-business"
              checked={!!s.smallBusiness}
              onCheckedChange={(checked) => update((p) => (p.seller.smallBusiness = checked))}
            />
            <div className="space-y-1">
              <Label htmlFor="small-business">{t('company.smallBusiness')}</Label>
              <p className="text-xs text-muted-foreground">{t('company.smallBusinessHint')}</p>
            </div>
          </div>
          <FieldGrid>
            <Field label={t('company.taxNumber')} error={error('seller.taxNumber')}>
              <Input
                {...text(
                  (p) => p.seller.taxNumber,
                  (p, v) => (p.seller.taxNumber = v),
                )}
              />
            </Field>
            <Field label={t('company.vatId')} warning={warning('seller.vatId')}>
              <Input
                {...text(
                  (p) => p.seller.vatId,
                  (p, v) => (p.seller.vatId = v),
                )}
              />
            </Field>
            <Field
              label={t('company.wIdNr')}
              error={error('seller.identifier.id')}
              warning={warning('seller.identifier.id')}
              hint={t('company.wIdNrHint')}
            >
              <Input
                {...text(
                  (p) => p.seller.identifier?.id,
                  (p, v) => (p.seller.identifier = { id: v }),
                )}
              />
            </Field>
            <Field label={`${t('company.register')} (${t('common.optional')})`} hint={t('company.registerHint')}>
              <Input
                {...text(
                  (p) => p.seller.legalRegistration?.id,
                  (p, v) => (p.seller.legalRegistration = { id: v }),
                )}
              />
            </Field>
          </FieldGrid>
          <Field label={`${t('company.legalInfo')} (${t('common.optional')})`} hint={t('company.legalInfoHint')}>
            <Textarea
              rows={2}
              {...text(
                (p) => p.seller.legalInfo,
                (p, v) => (p.seller.legalInfo = v),
              )}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('company.sections.bank')}</CardTitle>
        <FieldGrid cols={3}>
          <Field label={t('company.iban')} error={error('bank.iban')} warning={warning('bank.iban')}>
            <Input
              {...text(
                (p) => p.bank?.iban,
                (p, v) => (p.bank = { ...p.bank, iban: v }),
              )}
            />
          </Field>
          <Field label={`${t('company.bic')} (${t('common.optional')})`} warning={warning('bank.bic')}>
            <Input
              {...text(
                (p) => p.bank?.bic,
                (p, v) => (p.bank = { iban: '', ...p.bank, bic: v }),
              )}
            />
          </Field>
          <Field label={`${t('company.accountName')} (${t('common.optional')})`}>
            <Input
              {...text(
                (p) => p.bank?.accountName,
                (p, v) => (p.bank = { iban: '', ...p.bank, accountName: v }),
              )}
            />
          </Field>
        </FieldGrid>
      </Card>

      <Card>
        <CardTitle>{t('company.sections.defaults')}</CardTitle>
        <div className="space-y-4">
          {!s.smallBusiness && (
            <div className="flex items-start gap-3">
              <Switch
                id="prices-include-tax"
                checked={profile.pricesIncludeTax}
                onCheckedChange={(checked) => update((p) => (p.pricesIncludeTax = checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="prices-include-tax">{t('company.pricesIncludeTax')}</Label>
                <p className="text-xs text-muted-foreground">{t('company.pricesIncludeTaxHint')}</p>
              </div>
            </div>
          )}
          <FieldGrid cols={3}>
            <Field label={t('company.paymentTermDays')}>
              <Input
                type="number"
                min={0}
                max={365}
                value={profile.paymentTermDays ?? ''}
                onChange={(e) =>
                  update((p) => (p.paymentTermDays = e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value)))))
                }
              />
            </Field>
            <Field label={t('company.invoiceLanguage')}>
              <Select value={profile.invoiceLanguage} onChange={(e) => update((p) => (p.invoiceLanguage = e.target.value as 'de' | 'en'))}>
                <option value="de">{t('languages.de')}</option>
                <option value="en">{t('languages.en')}</option>
              </Select>
            </Field>
          </FieldGrid>
          <Field label={`${t('company.paymentTerms')} (${t('common.optional')})`} hint={t('company.paymentTermsHint')}>
            <Textarea
              rows={2}
              {...text(
                (p) => p.paymentTerms,
                (p, v) => (p.paymentTerms = v),
              )}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('company.sections.logo')}</CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-40 items-center justify-center rounded-md border border-dashed border-input bg-muted/40">
            {profile.logo && <img src={profile.logo} alt="" className="max-h-16 max-w-36 object-contain" />}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                <ImageUp /> {t('company.logoChoose')}
              </Button>
              {profile.logo && (
                <Button variant="ghost" onClick={() => update((p) => delete p.logo)}>
                  <Trash2 /> {t('company.logoRemove')}
                </Button>
              )}
            </div>
            <p className={logoError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{logoError ?? t('company.logoHint')}</p>
            <input ref={fileInput} type="file" accept={LOGO_TYPES.join(',')} className="hidden" onChange={chooseLogo} />
          </div>
        </div>
      </Card>

      <div className="fixed right-0 bottom-0 left-56 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-6 py-3">
        {status?.kind === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" /> {t('common.saved')}
          </span>
        )}
        {status?.kind === 'error' && (
          <span className="text-sm text-destructive">{t('common.errorSaving', { message: status.message })}</span>
        )}
        <Button onClick={save} disabled={saving}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
