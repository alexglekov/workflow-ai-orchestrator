import { asRecord, fetchJson } from './http';
import type { ReelRow } from './parse';

const graphVersion = () => process.env['INSTAGRAM_GRAPH_VERSION'] || 'v21.0';

const graphUrl = (path: string, params: Record<string, string>): string => {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, '')}`,
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

const safeUsername = (username: string): string => {
  const clean = username.replace(/^@/, '').trim();

  if (!/^[A-Za-z0-9._]+$/.test(clean)) {
    throw new Error(`Некорректный Instagram username: ${username}`);
  }

  return clean;
};

const graphGet = async (
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> =>
  asRecord(
    await fetchJson(
      graphUrl(path, { ...params, access_token: token }),
    ),
  );

export const instagramFollowers = async (
  token: string,
  igUserId: string,
  username: string,
): Promise<number> => {
  if (!igUserId) {
    throw new Error('Instagram: укажите instagramUserId владельца токена');
  }

  const user = safeUsername(username);
  const data = await graphGet(token, igUserId, {
    fields: `business_discovery.username(${user}){followers_count,username}`,
  });
  const discovery = asRecord(data['business_discovery']);
  const count = Number(discovery['followers_count']);

  if (!Number.isFinite(count)) {
    throw new Error(
      `Instagram Graph не вернул followers_count для @${user}. Нужен Business Discovery и профессиональный аккаунт`,
    );
  }

  return count;
};

export const instagramMedia = async (
  token: string,
  igUserId: string,
  username: string,
  limit: number,
): Promise<ReelRow[]> => {
  if (!igUserId) {
    throw new Error('Instagram: укажите instagramUserId владельца токена');
  }

  const user = safeUsername(username);
  const cap = Math.min(Math.max(limit, 1), 50);
  const data = await graphGet(token, igUserId, {
    fields: `business_discovery.username(${user}){username,media.limit(${cap}){caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`,
  });
  const discovery = asRecord(data['business_discovery']);
  const media = asRecord(discovery['media']);
  const items = Array.isArray(media['data']) ? media['data'] : [];

  return items
    .map((item) => asRecord(item))
    .filter((item) => {
      const product = String(item['media_product_type'] || '').toUpperCase();
      const type = String(item['media_type'] || '').toUpperCase();

      return product === 'REELS' || type === 'VIDEO' || type === 'REELS';
    })
    .map((item) => {
      const likes = Number(item['like_count']);

      return {
        network: 'instagram' as const,
        username: user,
        url: String(item['permalink'] || ''),
        caption: String(item['caption'] || '').slice(0, 400),
        views: null,
        likes: Number.isFinite(likes) ? likes : null,
        takenAt: String(item['timestamp'] || ''),
        viewsSource: 'likes',
      };
    })
    .filter((item) => item.url);
};

export const instagramTest = async (
  token: string,
  igUserId: string,
): Promise<string> => {
  if (!igUserId) {
    throw new Error('Instagram: укажите instagramUserId владельца токена');
  }

  await graphGet(token, igUserId, { fields: 'id,username' });

  return 'Instagram Graph';
};
