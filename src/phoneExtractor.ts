/**
 * Defensive phone-number extraction from plain text.
 *
 * Two strictness modes:
 *   - 'strict' (default): only accept matches with explicit phone-context prefix
 *     OR international `+CC` prefix. High precision, may miss bare local numbers.
 *   - 'lenient': also accept bare local numbers starting with 0 and 9–15 digits,
 *     filtered against VAT IDs / postcodes / dates.
 *
 * Multilingual prefix coverage:
 *   - Latin (English/German/Danish/French/Spanish/Italian/Portuguese/Turkish/Indonesian):
 *     Tel, Telephone, Telefon, Telefono, Téléphone, Teléfono, Tlf, Mob, Mobil, Mobile,
 *     Cell, Cellular, Phone, Fon, Fone, Hotline, Direct, Office, Kontakt, Contact,
 *     Contato, Cel, Celular, Rückfragen, WhatsApp, GSM, Cep, İrtibat, Telp, Tlp,
 *     Hubungi
 *   - English imperative phrases: "call (us/on/at)", "contact (us/at)", "reach (us/at)",
 *     "dial", "for enquiries/inquiries"
 *   - Strict-colon abbreviations (require `:` or `=` after): HP, WA, M, T (used in
 *     email signatures, Indonesian HandPhone, etc.)
 *   - Hebrew (drushim.co.il): טלפון, טל, נייד
 *   - Chinese (zhaopin.com + general): 电话, 联系电话, 手机, 微信, 咨询电话, 联系方式
 *   - Arabic (bayt.com + general): هاتف, جوال, الجوال, التواصل, للتواصل, اتصل
 *   - Persian/Farsi: تماس, تلفن, موبایل, همراه
 *   - Russian Cyrillic: Тел, Телефон, Моб, Мобильный, Контакт
 *   - Korean: 전화, 연락처, 휴대폰, 핸드폰
 *   - Japanese: 電話, 連絡先, 携帯, お問い合わせ
 *   - Hindi/Devanagari: फ़ोन, मोबाइल, संपर्क, कॉल
 *   - Vietnamese: ĐT, SĐT, Điện thoại, Liên hệ, Liên lạc
 *   - URL schemes: tel:, wa.me/, whatsapp://send?phone=
 *
 * Latin prefixes use \b word boundary (case-insensitive); non-Latin scripts use
 * natural script-shift boundary. Cyrillic uses \b which works because letters are
 * word-chars, but uses Unicode mode flag.
 *
 * Returns deduplicated, normalized (whitespace-collapsed) phone strings.
 *
 * Canonical source: _lib/phoneExtractor.ts. Copy to each actor's src/.
 */

// === Phone-body fragment used by all prefix regexes ===
// Captures `((?:+|00)?[digit][digit/space/./-/separators]{6-18}[digit])`
const BODY = '((?:\\+|00)?[(]?[\\d][\\d\\s.\\-/()]{6,20}\\d)';

// === International +CC numbers — stand-alone, no prefix needed ===
const INTL_RE = /\+\d{1,3}[\s.\-/]?\d{1,4}[\s.\-/]?\d{2,4}[\s.\-/]?\d{2,5}(?:[\s.\-/]?\d{1,5})?/g;

// === URL schemes — structural, very high precision ===
const URL_PHONE_RE = /(?:tel:|wa\.me\/|whatsapp:\/\/send\?phone=)([+\d][\d\s.\-/()]{6,20}\d)/gi;

// === Latin-script word prefixes (case-insensitive) ===
// Includes: phone-context nouns from EN/DE/DK/SE/NO/FR/ES/IT/PT/TR/ID/MS
const PREFIXED_RE_LATIN = new RegExp(
  '\\b(?:Tel(?:ephone)?|Tel[ée]fon[oe]?|T[ée]l[ée]phone|Telefon|Telp|Tlp|Tlf|' +
  'Mob(?:il(?:e)?)?|Cell(?:ular)?|Phone|Fon[e]?|Hotline|Direct|Office|' +
  'Kontak[t]?|Contat[o]?|Contact|Cel(?:ular)?|R[üu]ckfragen|WhatsApp|' +
  'GSM|Cep|İrtibat|Irtibat|Hubungi|Fale conosco)\\b\\.?\\s*:?\\s*' + BODY,
  'gi'
);

// === English imperative phrases: "call us at", "contact on", "reach out at" ===
// Captures the typical "<verb> [us/on/at] <number>" pattern
const PREFIXED_RE_EN_PHRASE = new RegExp(
  '\\b(?:call|contact|reach|dial|enquir(?:y|ies)|inquir(?:y|ies))' +
  '(?:\\s+(?:us|on|at|out|me|to))?\\s*(?:at|on)?[\\s:,.\\-]+' + BODY,
  'gi'
);

// === Strict-colon abbreviations (HP, WA, M, T) — high false-positive risk ===
// Require explicit `:` or `=` to gate context, since these letters appear randomly
const PREFIXED_RE_ABBREV = new RegExp(
  '(?:^|[\\s>(\\[])(?:HP|WA|M|T)\\s*[:：=]\\s*' + BODY,
  'g'
);

// === Hebrew ===
const PREFIXED_RE_HEBREW = new RegExp(
  '(?:טלפון|טל\\.?|נייד|לפרטים|ליצירת קשר)\\s*:?\\s*' + BODY,
  'g'
);

// === Chinese (Simplified + Traditional, inc. Cantonese-style) ===
const PREFIXED_RE_CHINESE = new RegExp(
  '(?:联系电话|電話|电话|手机|手機|微信|咨询电话|諮詢電話|联系方式|聯繫方式)' +
  '\\s*[:：]?\\s*' + BODY,
  'g'
);

// === Arabic ===
const PREFIXED_RE_ARABIC = new RegExp(
  '(?:هاتف|جوال|الجوال|التواصل|للتواصل|اتصل|للاستفسار|رقم الاتصال)' +
  '\\s*:?\\s*' + BODY,
  'g'
);

// === Persian/Farsi (different lexicon from Arabic) ===
const PREFIXED_RE_PERSIAN = new RegExp(
  '(?:تماس|تلفن|موبایل|همراه|شماره تماس|اطلاعات تماس)\\s*:?\\s*' + BODY,
  'g'
);

// === Russian Cyrillic ===
const PREFIXED_RE_RUSSIAN = new RegExp(
  '(?:Тел(?:ефон)?|Моб(?:ильный)?|Контакт|Связь|Звонить|Звоните)' +
  '\\.?\\s*:?\\s*' + BODY,
  'giu'
);

// === Korean ===
const PREFIXED_RE_KOREAN = new RegExp(
  '(?:전화|연락처|휴대폰|핸드폰|연락|문의)\\s*[:：]?\\s*' + BODY,
  'g'
);

// === Japanese ===
const PREFIXED_RE_JAPANESE = new RegExp(
  '(?:電話|連絡先|携帯|お問い合わせ|お問合せ|問合せ)\\s*[:：]?\\s*' + BODY,
  'g'
);

// === Hindi/Devanagari ===
const PREFIXED_RE_HINDI = new RegExp(
  '(?:फ़?ोन|मोबाइल|संपर्क|कॉल|कांटैक्ट)\\s*:?\\s*' + BODY,
  'g'
);

// === Vietnamese ===
const PREFIXED_RE_VIETNAMESE = new RegExp(
  '(?:Đ[Tt]|SĐ[Tt]|Điện thoại|Liên hệ|Liên lạc|Số điện thoại)' +
  '\\.?\\s*[:：]?\\s*' + BODY,
  'g'
);

// === Bare-local fallback for lenient mode (must start with 0[1-9]) ===
const BARE_LOCAL_RE = /\b0[1-9]\d[\d\s.\-/]{5,12}\d\b/g;

// === Strings we never want to flag as phones (mask them out before matching) ===
const VAT_PREFIX_RE = /\b(?:ATU|DE|FR|IT|NL|BE|GB|PL|CZ|SK|HU|SE|DK|NO|FI|ES|PT|IE|LU|RO|BG|HR|SI|EE|LT|LV|MT|CY|GR)\d{8,12}\b/gi;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const SHORT_DATE_RE = /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g;

export type PhoneExtractionMode = 'strict' | 'lenient';

export interface PhoneExtractionOptions {
  mode?: PhoneExtractionMode;
}

function normalize(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/^\s|\s$/g, '').replace(/\.+$/, '');
}

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

function isPlausiblePhone(s: string): boolean {
  const dc = digitCount(s);
  if (dc < 7 || dc > 15) return false;
  if (/^\d{4}$/.test(s.trim())) return false;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(s.trim())) return false;
  return true;
}

function maskNoise(text: string): string {
  return text
    .replace(VAT_PREFIX_RE, ' ')
    .replace(ISO_DATE_RE, ' ')
    .replace(SHORT_DATE_RE, ' ');
}

const PREFIXED_PATTERNS: RegExp[] = [
  PREFIXED_RE_LATIN,
  PREFIXED_RE_EN_PHRASE,
  PREFIXED_RE_ABBREV,
  PREFIXED_RE_HEBREW,
  PREFIXED_RE_CHINESE,
  PREFIXED_RE_ARABIC,
  PREFIXED_RE_PERSIAN,
  PREFIXED_RE_RUSSIAN,
  PREFIXED_RE_KOREAN,
  PREFIXED_RE_JAPANESE,
  PREFIXED_RE_HINDI,
  PREFIXED_RE_VIETNAMESE,
];

export function extractPhones(text: string | null | undefined, opts?: PhoneExtractionOptions): string[] {
  if (!text) return [];
  const mode = opts?.mode ?? 'strict';
  const masked = maskNoise(text);

  const found = new Set<string>();

  for (const m of masked.matchAll(INTL_RE)) {
    const v = normalize(m[0]);
    if (isPlausiblePhone(v)) found.add(v);
  }

  for (const m of masked.matchAll(URL_PHONE_RE)) {
    const v = normalize(m[1]!);
    if (isPlausiblePhone(v)) found.add(v);
  }

  for (const re of PREFIXED_PATTERNS) {
    for (const m of masked.matchAll(re)) {
      const v = normalize(m[1]!);
      if (isPlausiblePhone(v)) found.add(v);
    }
  }

  if (mode === 'lenient') {
    for (const m of masked.matchAll(BARE_LOCAL_RE)) {
      const v = normalize(m[0]);
      if (!isPlausiblePhone(v)) continue;
      if (/^\d{4}$/.test(v)) continue;
      found.add(v);
    }
  }

  return [...found].sort();
}
