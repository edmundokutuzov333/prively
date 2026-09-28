import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptMZ from '@/locales/pt-MZ/common';
import en from '@/locales/en/common';
import fr from '@/locales/fr/common';

export const supportedLanguages = ['pt-MZ', 'en', 'fr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const storedLanguage = window.localStorage.getItem('prively.locale');
const initialLanguage: SupportedLanguage = supportedLanguages.includes(storedLanguage as SupportedLanguage)
  ? (storedLanguage as SupportedLanguage)
  : 'pt-MZ';

void i18n.use(initReactI18next).init({
  resources: {
    'pt-MZ': { common: ptMZ },
    en: { common: en },
    fr: { common: fr }
  },
  lng: initialLanguage,
  fallbackLng: 'pt-MZ',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false
});

i18n.on('languageChanged', (language) => {
  window.localStorage.setItem('prively.locale', language);
  document.documentElement.lang = language;
});

document.documentElement.lang = initialLanguage;

export default i18n;