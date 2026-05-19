import { Locale } from 'date-fns';
import { da, de, enUS, es, et, fr, hi, hr, it, ja, ko, lt, lv, nl, nb, pl, pt, ro, ru, sq, sv, zhCN } from 'date-fns/locale';

const localeMap: Record<string, Locale> = {
  da, de, en: enUS, es, et, fr, hi, hr, it, ja, ko, lt, lv, nl, no: nb, pl, pt, ro, ru, sq, sv, zh: zhCN,
};

export function getDateLocale(lang: string): Locale {
  return localeMap[lang] || enUS;
}
