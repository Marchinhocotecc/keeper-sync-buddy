// Currency formatting utility — reads from user locale, no hardcoded €

const LOCALE_CURRENCY_MAP: Record<string, string> = {
  it: 'EUR', de: 'EUR', fr: 'EUR', es: 'EUR', pt: 'EUR', nl: 'EUR',
  et: 'EUR', lv: 'EUR', lt: 'EUR', sq: 'EUR', hr: 'EUR',
  en: 'USD', hi: 'INR', ja: 'JPY', ko: 'KRW', zh: 'CNY',
  ru: 'RUB', pl: 'PLN', sv: 'SEK', no: 'NOK', da: 'DKK', ro: 'RON',
};

export function getCurrencyForLocale(lang: string): string {
  return LOCALE_CURRENCY_MAP[lang] || 'EUR';
}

export function formatCurrency(amount: number, lang: string, decimals = 2): string {
  const currency = getCurrencyForLocale(lang);
  const locale = lang === 'en' ? 'en-US' : `${lang}-${lang.toUpperCase()}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  }
}

export function getCurrencySymbol(lang: string): string {
  const currency = getCurrencyForLocale(lang);
  try {
    const locale = lang === 'en' ? 'en-US' : `${lang}-${lang.toUpperCase()}`;
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value || '€';
  } catch {
    return '€';
  }
}
