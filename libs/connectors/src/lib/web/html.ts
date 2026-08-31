const decode = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCharCode(Number(code)),
    );

export const stripHtml = (html: string): string =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );

export const pageTitle = (html: string): string => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match ? stripHtml(match[1]).slice(0, 200) : '';
};

const cellText = (rowHtml: string): string[] =>
  [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    stripHtml(match[1]),
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
