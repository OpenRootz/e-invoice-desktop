import { COUNTRY_CODES } from '../../../core/seller-format';

/** Country options sorted by their localized name, Germany and its neighbours first. */
export function countryOptions(language: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([language], { type: 'region' });
  const first = ['DE', 'AT', 'CH'];
  const all = [...COUNTRY_CODES].map((code) => ({ code, name: names.of(code) ?? code }));
  all.sort((a, b) => a.name.localeCompare(b.name, language));
  return [...first.map((c) => all.find((x) => x.code === c)!), ...all.filter((x) => !first.includes(x.code))];
}
