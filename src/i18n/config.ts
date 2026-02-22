import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import it from './locales/it.json';
import es from './locales/es.json';
import ru from './locales/ru.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import nl from './locales/nl.json';
import hr from './locales/hr.json';
import sq from './locales/sq.json';
import ro from './locales/ro.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import hi from './locales/hi.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import pl from './locales/pl.json';
import sv from './locales/sv.json';
import no from './locales/no.json';
import da from './locales/da.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import et from './locales/et.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
      es: { translation: es },
      ru: { translation: ru },
      fr: { translation: fr },
      de: { translation: de },
      nl: { translation: nl },
      hr: { translation: hr },
      sq: { translation: sq },
      ro: { translation: ro },
      zh: { translation: zh },
      ja: { translation: ja },
      hi: { translation: hi },
      ko: { translation: ko },
      pt: { translation: pt },
      pl: { translation: pl },
      sv: { translation: sv },
      no: { translation: no },
      da: { translation: da },
      lt: { translation: lt },
      lv: { translation: lv },
      et: { translation: et },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
