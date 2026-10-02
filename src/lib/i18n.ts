import i18n from 'i18next';
export { useTranslation, Trans, Translation } from 'react-i18next';
import { initReactI18next } from 'react-i18next';
import ptMZ from '@/locales/pt-MZ/common';
import en from '@/locales/en/common';
import fr from '@/locales/fr/common';
import pagePtMZ from '@/lib/i18n/pt-MZ.json';
import pageEn from '@/lib/i18n/en.json';
import pageFr from '@/lib/i18n/fr.json';

export const supportedLanguages = ['pt-MZ', 'en', 'fr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();
const storedLanguage = storage?.getItem('prively.locale');
const initialLanguage: SupportedLanguage = supportedLanguages.includes(storedLanguage as SupportedLanguage)
  ? (storedLanguage as SupportedLanguage)
  : 'pt-MZ';

void i18n.use(initReactI18next).init({
  resources: {
    'pt-MZ': { common: { ...ptMZ, ...pagePtMZ } },
    en: { common: { ...en, ...pageEn } },
    fr: { common: { ...fr, ...pageFr } }
  },
  lng: initialLanguage,
  fallbackLng: 'pt-MZ',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false
});

i18n.on('languageChanged', (language) => {
  storage?.setItem('prively.locale', language);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
});

if (typeof document !== 'undefined') document.documentElement.lang = initialLanguage;

export default i18n;
