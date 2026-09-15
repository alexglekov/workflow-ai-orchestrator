import { queryTerms } from './query';
import type { SearchHit } from './rank';

/**
 * Русские падежи ломают точное сравнение, поэтому сравниваем по началу слова:
 * «времени» и «время» дают одну основу.
 */
const stem = (term: string): string =>
  term.length > 5 ? term.slice(0, term.length - 2) : term;

const haystack = (hit: SearchHit): string =>
  `${hit.title} ${hit.snippet} ${hit.url}`.toLowerCase();

/**
 * Годы и прочие числа совпадают со датами в сниппетах любой выдачи, поэтому
 * для проверки «про то ли это» они бесполезны.
 */
const wordStems = (query: string): string[] =>
  queryTerms(query)
    .filter((term) => /\p{L}/u.test(term))
    .map(stem);

export const hitMatchesQuery = (hit: SearchHit, query: string): boolean => {
  const stems = wordStems(query);

  if (!stems.length) {
    return true;
  }

  const text = haystack(hit);

  return stems.some((item) => text.includes(item));
};

/**
 * Bing и другие скрейп-источники умеют отвечать 200 с выдачей по чужому
 * запросу. Такую «успешную» пачку надо отбрасывать, а не показывать человеку.
 */
export const looksRelevant = (hits: SearchHit[], query: string): boolean => {
  if (!hits.length) {
    return false;
  }

  if (wordStems(query).length < 2) {
    return true;
  }

  const head = hits.slice(0, 8);
  const matched = head.filter((hit) => hitMatchesQuery(hit, query)).length;

  return matched > 0 && matched / head.length >= 0.25;
};
