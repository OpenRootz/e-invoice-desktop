import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGrid } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { errorMessage, useMasterData } from '@/lib/data';
import type { AppInfo } from '../../../shared/api';
import { suggestInvoiceNumber } from '../../../shared/numbering';
import { numberingSchema, type Settings } from '../../../shared/schema';

const today = () => new Date().toLocaleDateString('sv-SE');

export function SettingsPage() {
  const { t } = useTranslation();
  const data = useMasterData();
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [info, setInfo] = useState<AppInfo>();
  const [status, setStatus] = useState<{ kind: 'saved' } | { kind: 'error'; message: string }>();

  useEffect(() => {
    void window.api.appInfo().then(setInfo);
  }, []);

  const numberingValid = numberingSchema.safeParse(settings.numbering).success;
  // A counter set by hand applies as it is; otherwise the yearly reset keeps working from the stored year
  const effectiveNumbering = {
    ...settings.numbering,
    year: settings.numbering.next === data.settings.numbering.next ? data.settings.numbering.year : undefined,
  };
  const update = (change: (s: Settings) => void) => {
    setStatus(undefined);
    setSettings((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };

  const save = async () => {
    try {
      const saved = await window.api.settings.save({ ...settings, numbering: effectiveNumbering });
      setSettings(saved);
      await data.reload();
      setStatus({ kind: 'saved' });
    } catch (e) {
      setStatus({ kind: 'error', message: errorMessage(e) });
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardTitle>{t('settings.numbering')}</CardTitle>
        <div className="space-y-4">
          <p className="text-muted-foreground">{t('settings.numberingIntro')}</p>
          <FieldGrid>
            <Field
              label={t('settings.pattern')}
              error={numberingValid ? undefined : t('settings.patternInvalid')}
              hint={t('settings.patternHint')}
            >
              <Input value={settings.numbering.pattern} onChange={(e) => update((s) => (s.numbering.pattern = e.target.value))} />
            </Field>
            <Field label={t('settings.next')}>
              <Input
                type="number"
                min={1}
                value={settings.numbering.next}
                onChange={(e) => update((s) => (s.numbering.next = Math.max(1, Math.round(Number(e.target.value) || 1))))}
              />
            </Field>
          </FieldGrid>
          <div className="flex items-center gap-3">
            <Switch
              id="reset-yearly"
              checked={settings.numbering.resetYearly}
              onCheckedChange={(checked) => update((s) => (s.numbering.resetYearly = checked))}
            />
            <Label htmlFor="reset-yearly">{t('settings.resetYearly')}</Label>
          </div>
          {numberingValid && (
            <p className="rounded-md bg-muted px-3 py-2 font-medium">
              {t('settings.preview', { number: suggestInvoiceNumber(effectiveNumbering, today()) })}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>{t('settings.uiLanguage')}</CardTitle>
        <Select
          className="max-w-xs"
          aria-label={t('settings.uiLanguage')}
          value={settings.uiLanguage}
          onChange={(e) => update((s) => (s.uiLanguage = e.target.value as 'de' | 'en'))}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </Select>
      </Card>

      <Card>
        <CardTitle>{t('settings.data')}</CardTitle>
        <p className="mb-2 text-muted-foreground">{t('settings.dataDir')}</p>
        <code className="block rounded-md bg-muted px-3 py-2 text-xs break-all select-all">{info?.dataDir}</code>
        {info && <p className="mt-3 text-xs text-muted-foreground">{t('settings.version', { version: info.version })}</p>}
      </Card>

      <div className="flex items-center justify-end gap-3">
        {status?.kind === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" /> {t('common.saved')}
          </span>
        )}
        {status?.kind === 'error' && (
          <span className="text-sm text-destructive">{t('common.errorSaving', { message: status.message })}</span>
        )}
        <Button onClick={save} disabled={!numberingValid}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
