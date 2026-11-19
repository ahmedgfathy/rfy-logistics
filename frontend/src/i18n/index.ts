import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import ar from './ar';

export type SupportedLanguage = 'en' | 'ar';

const STORAGE_KEY = 'marsa.lang';

function detectLanguage(): SupportedLanguage {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored === 'ar' || stored === 'en') return stored;
  // Arabic is the site default; visitors can switch to English from the header.
  return 'ar';
}

const initialLanguage = detectLanguage();

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

function applyDocumentLanguage(language: SupportedLanguage): void {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem(STORAGE_KEY, language);
}

applyDocumentLanguage(initialLanguage);
i18n.on('languageChanged', (language) => {
  applyDocumentLanguage(language === 'ar' ? 'ar' : 'en');
});

export default i18n;
