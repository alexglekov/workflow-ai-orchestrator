import type { SearchHit } from './rank';

export const digestSearchHits = (
  query: string,
  results: SearchHit[],
  warning?: string,
): string =>
  [
    warning ? `Внимание: ${warning}` : '',
    `Источники по запросу: ${query}`,
    ...results.map((item, index) =>
      [`${index + 1}. ${item.title}`, item.url, item.snippet]
        .filter(Boolean)
        .join('\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

const sentences = (value: string): string[] =>
  value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 30);

/**
 * Если модель недоступна, ответ всё равно нужен: берём самые содержательные
 * фразы из сниппетов выдачи — там обычно уже лежат числа и даты.
 */
export const extractiveAnswer = (results: SearchHit[]): string => {
  const picked: string[] = [];

  for (const item of results.slice(0, 4)) {
    const source = (item.snippet || item.text || '').trim();

    for (const sentence of sentences(source)) {
      if (picked.some((existing) => existing === sentence)) {
        continue;
      }

      picked.push(sentence);
      break;
    }

    if (picked.length >= 3) {
      break;
    }
  }

  return picked.join(' ');
};

export const composeSearchText = (
  query: string,
  results: SearchHit[],
  options?: { answer?: string; warning?: string },
): string => {
  const sources = digestSearchHits(query, results, options?.warning);
  const answer = options?.answer?.trim() || extractiveAnswer(results);

  if (answer) {
    return `${answer}\n\n${sources}`;
  }

  return sources;
};
