import { useTranslation } from 'react-i18next';

export function Placeholder() {
  const { t } = useTranslation();
  return <p className="text-muted-foreground">{t('common.notYet')}</p>;
}
