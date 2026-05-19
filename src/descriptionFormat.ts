/**
 * descriptionFormat — base feature for opting in to a single description
 * representation, halving output size for users who only need one.
 *
 * Modes:
 *   'all'      — emit description, descriptionText, descriptionHtml, descriptionMarkdown (default; back-compat)
 *   'text'     — keep plain-text fields (description + descriptionText), drop HTML + Markdown
 *   'html'     — keep descriptionHtml, drop text + Markdown variants
 *   'markdown' — keep descriptionMarkdown, drop text + HTML variants
 *
 * Default is 'all' so existing dataset_schema views + user pipelines continue
 * to work; users opt in to one mode to slim output.
 *
 * Field convention: the primary `description` is treated as text-equivalent
 * for filtering purposes (most actors populate it with plain text).
 */

export type DescriptionFormat = 'all' | 'text' | 'html' | 'markdown';

export const DESCRIPTION_FORMAT_DEFAULT: DescriptionFormat = 'all';

const TEXT_FIELDS = ['description', 'descriptionText'] as const;
const HTML_FIELDS = ['descriptionHtml'] as const;
const MARKDOWN_FIELDS = ['descriptionMarkdown'] as const;

const KEEP: Record<DescriptionFormat, ReadonlySet<string>> = {
  all: new Set([...TEXT_FIELDS, ...HTML_FIELDS, ...MARKDOWN_FIELDS]),
  text: new Set(TEXT_FIELDS),
  html: new Set(HTML_FIELDS),
  markdown: new Set(MARKDOWN_FIELDS),
};

const ALL_DESCRIPTION_FIELDS: readonly string[] = [
  ...TEXT_FIELDS,
  ...HTML_FIELDS,
  ...MARKDOWN_FIELDS,
];

export function normalizeDescriptionFormat(raw: unknown): DescriptionFormat {
  if (raw === 'text' || raw === 'html' || raw === 'markdown' || raw === 'all') return raw;
  return DESCRIPTION_FORMAT_DEFAULT;
}

/**
 * Returns a new record with non-selected description fields removed.
 * Non-mutating. For 'all' mode (default), returns the input unchanged.
 */
export function applyDescriptionFormat<T extends Record<string, unknown>>(
  item: T,
  format: DescriptionFormat,
): T {
  if (format === 'all') return item;
  const keep = KEEP[format];
  let cloned: Record<string, unknown> | null = null;
  for (const field of ALL_DESCRIPTION_FIELDS) {
    if (keep.has(field)) continue;
    if (!(field in item)) continue;
    if (!cloned) cloned = { ...item };
    delete cloned[field];
  }
  return (cloned ?? item) as T;
}
