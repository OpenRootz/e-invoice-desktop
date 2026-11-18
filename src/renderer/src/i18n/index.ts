import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { de, type Messages } from './de';
import { en } from './en';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Messages };
  }
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: 'de',
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
});

export default i18n;
