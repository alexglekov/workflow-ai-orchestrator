import { asRecord, fetchJson, firstNumber, firstString } from './http';
import type { ReelRow, SocialNetwork } from './parse';

const joinUrl = (base: string, path: string): string => {
  const trimmed = base.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;

  return `${trimmed}${suffix}`;
};

const authHeaders = (
  apiKey: string,
  extra?: { header?: string; host?: string },
): Record<string, string> => {
  const name = extra?.header?.trim() || 'X-RapidAPI-Key';

  return {
    Accept: 'application/json',
    [name]: apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...(extra?.host ? { 'X-RapidAPI-Host': extra.host } : {}),
  };
};

export type ProviderAuth = {
  baseUrl: string;
  apiKey: string;
  header?: string;
  host?: string;
};

const listFrom = (body: unknown): unknown[] => {
  const record = asRecord(body);

  for (const key of ['items', 'data', 'reels', 'results', 'media']) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }

    const nested = asRecord(record[key]);

    if (Array.isArray(nested['items'])) {
      return nested['items'] as unknown[];
    }
  }

  return Array.isArray(body) ? body : [];
};

export const providerFollowers = async (
  auth: ProviderAuth,
  network: SocialNetwork,
  username: string,
): Promise<number> => {
  const url = new URL(joinUrl(auth.baseUrl, 'followers'));
  url.searchParams.set('network', network);
  url.searchParams.set('username', username);

  const body = await fetchJson(url.toString(), {
    headers: authHeaders(auth.apiKey, auth),
  });
  const record = asRecord(body);
  const nested = asRecord(record['data'] ?? record['result']);
  const count =
    firstNumber(record, [
      'followers',
      'followers_count',
      'follower_count',
      'followerCount',
      'count',
    ]) ??
    firstNumber(nested, [
      'followers',
      'followers_count',
      'follower_count',
      'followerCount',
      'count',
    ]);

  if (count == null) {
    throw new Error('Провайдер не вернул число подписчиков');
  }

  return count;
};

export const providerReels = async (
  auth: ProviderAuth,
  username: string,
): Promise<ReelRow[]> => {
  const url = new URL(joinUrl(auth.baseUrl, 'reels'));
  url.searchParams.set('username', username);
  url.searchParams.set('network', 'instagram');

  const body = await fetchJson(url.toString(), {
    headers: authHeaders(auth.apiKey, auth),
  });

  return listFrom(body)
    .map((item) => asRecord(item))
    .map((item) => {
      const views = firstNumber(item, [
        'views',
        'play_count',
        'video_play_count',
        'playCount',
        'view_count',
      ]);
      const likes = firstNumber(item, ['likes', 'like_count', 'likeCount']);

      return {
        network: 'instagram' as const,
        username,
        url: firstString(item, ['url', 'permalink', 'link', 'code']),
        caption: firstString(item, ['caption', 'title', 'text']).slice(0, 400),
        views,
        likes,
        takenAt: firstString(item, [
          'takenAt',
          'taken_at',
          'timestamp',
          'created_at',
          'date',
        ]),
        viewsSource: views != null ? 'provider' : likes != null ? 'likes' : undefined,
      };
    })
    .filter((item) => item.url);
};
