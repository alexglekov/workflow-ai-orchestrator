const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  minus: '−',
  hellip: '…',
  bull: '•',
  middot: '·',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  copy: '©',
  reg: '®',
  trade: '™',
  sect: '§',
  para: '¶',
  dagger: '†',
  permil: '‰',
  larr: '←',
  rarr: '→',
  harr: '↔',
  shy: '',
  zwnj: '',
  zwj: '',
  lrm: '',
  rlm: '',
};

const EXOTIC_SPACES = new Set([
  0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

const fromCode = (code: number): string => {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
    return '';
  }

  if (EXOTIC_SPACES.has(code)) {
    return ' ';
  }

  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
};

export const decodeEntities = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) =>
      fromCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_match, dec: string) => fromCode(Number(dec)))
    .replace(/&([a-z][a-z0-9]{1,9});/gi, (match, name: string) => {
      const replacement = NAMED_ENTITIES[name.toLowerCase()];

      return replacement === undefined ? match : replacement;
    });

const NON_CONTENT = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
];

const BOILERPLATE = ['nav', 'footer', 'header', 'aside', 'form', 'dialog'];

const dropTags = (html: string, tags: string[]): string =>
  tags.reduce(
    (acc, tag) =>
      acc.replace(
        new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'),
        ' ',
      ),
    html,
  );

const BLOCK_END = /<\/(p|div|section|article|tr|h[1-6]|li|ul|ol|blockquote|td|th|dd|dt|pre|figure|main)>/gi;

const toText = (html: string): string =>
  decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n')
      .replace(BLOCK_END, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const body = (html: string): string => {
  const match = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);

  return match ? match[1] : html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ' ');
};

export const stripHtml = (html: string): string =>
  toText(dropTags(body(html), NON_CONTENT));

const REGION = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/**
 * Текст без навигации и подвала. Если у страницы есть <main> или <article>
 * с существенным объёмом — берём его, иначе весь body без boilerplate.
 */
export const readableText = (html: string): string => {
  const cleaned = dropTags(body(html), [...NON_CONTENT, ...BOILERPLATE]);
  const whole = toText(cleaned);
  let best = '';

  for (const match of cleaned.matchAll(REGION)) {
    const candidate = toText(match[2]);

    if (candidate.length > best.length) {
      best = candidate;
    }
  }

  return best.length >= 200 && best.length >= whole.length * 0.25 ? best : whole;
};

export const pageTitle = (html: string): string => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match ? toText(match[1]).slice(0, 200) : '';
};

export const metaDescription = (html: string): string => {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (match?.[1]?.trim()) {
      return decodeEntities(match[1]).trim().slice(0, 400);
    }
  }

  return '';
};

const cellText = (rowHtml: string): string[] =>
  [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    toText(match[1]).replace(/\n+/g, ' ').trim(),
  );

export const extractTables = (
  html: string,
  maxTables = 4,
): string[][][] => {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]
    .slice(0, maxTables)
    .map((match) =>
      [...match[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)]
        .map((row) => cellText(row[0]).filter(Boolean))
        .filter((row) => row.length > 0),
    )
    .filter((table) => table.length > 0);

  return tables;
};
