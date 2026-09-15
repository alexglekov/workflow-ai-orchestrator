import { asRecord, fetchJson } from './http';
import type { ReelRow } from './parse';

const vkVersion = () => process.env['VK_API_VERSION'] || '5.199';

type VkEnvelope = {
  error?: { error_code?: number; error_msg?: string };
  response?: unknown;
};

const vkCall = async (
  token: string,
  method: string,
  params: Record<string, string | number> = {},
): Promise<unknown> => {
  const url = new URL(`https://api.vk.com/method/${method}`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('v', vkVersion());

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const body = (await fetchJson(url.toString(), {
    method: 'GET',
  })) as VkEnvelope;

  if (body.error) {
    throw new Error(body.error.error_msg || `VK error ${body.error.error_code}`);
  }

  return body.response;
};

const screenName = (username: string): string =>
  username
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(?:m\.)?(?:vk\.com|vkontakte\.ru)\//i, '')
    .split(/[/?#]/)[0];

const groupsList = (response: unknown): Record<string, unknown>[] => {
  if (Array.isArray(response)) {
    return response.map(asRecord);
  }

  const record = asRecord(response);
  const groups = record['groups'];

  return Array.isArray(groups) ? groups.map(asRecord) : [];
};

const resolveOwner = async (
  token: string,
  username: string,
): Promise<{ type: 'user' | 'group'; id: number }> => {
  const screen = screenName(username);
  const prefixed = screen.match(/^(id|club|public|event)(\d+)$/i);

  if (prefixed) {
    const kind = prefixed[1].toLowerCase();
    const id = Number(prefixed[2]);

    return kind === 'id' ? { type: 'user', id } : { type: 'group', id };
  }

  if (/^\d+$/.test(screen)) {
    const id = Number(screen);

    try {
      const users = (await vkCall(token, 'users.get', {
        user_ids: id,
        fields: 'followers_count',
      })) as unknown[];

      if (Array.isArray(users) && users[0]) {
        return { type: 'user', id };
      }
    } catch {
      /* try as group */
    }

    return { type: 'group', id };
  }

  const resolved = asRecord(
    await vkCall(token, 'utils.resolveScreenName', { screen_name: screen }),
  );
  const type = String(resolved['type'] || '');
  const id = Number(resolved['object_id']);

  if (!id) {
    throw new Error(`VK: не найден ${screen}`);
  }

  if (type === 'user') {
    return { type: 'user', id };
  }

  if (type === 'group' || type === 'page' || type === 'event') {
    return { type: 'group', id };
  }

  throw new Error(`VK: ${screen} не пользователь и не сообщество`);
};

export const vkFollowers = async (
  token: string,
  username: string,
): Promise<number> => {
  const owner = await resolveOwner(token, username);

  if (owner.type === 'user') {
    const users = (await vkCall(token, 'users.get', {
      user_ids: owner.id,
      fields: 'followers_count',
    })) as unknown[];
    const user = asRecord(users?.[0]);
    const count = Number(user['followers_count']);

    if (!Number.isFinite(count)) {
      throw new Error('VK: нет поля followers_count (нужен токен с доступом)');
    }

    return count;
  }

  const groups = groupsList(
    await vkCall(token, 'groups.getById', {
      group_id: owner.id,
      fields: 'members_count',
    }),
  );
  const group = groups[0] ?? {};
  const count = Number(group['members_count']);

  if (!Number.isFinite(count)) {
    throw new Error('VK: нет поля members_count');
  }

  return count;
};

export const vkVideos = async (
  token: string,
  username: string,
  limit: number,
): Promise<ReelRow[]> => {
  const owner = await resolveOwner(token, username);
  const ownerId = owner.type === 'group' ? -owner.id : owner.id;
  const response = asRecord(
    await vkCall(token, 'video.get', {
      owner_id: ownerId,
      count: Math.min(Math.max(limit, 1), 50),
    }),
  );
  const items = Array.isArray(response['items']) ? response['items'] : [];

  return items
    .map((item) => asRecord(item))
    .filter((item) => {
      const duration = Number(item['duration'] ?? 0);

      return !duration || duration <= 90;
    })
    .map((item) => {
      const id = String(item['id'] ?? '');
      const views = Number(item['views']);
      const date = Number(item['date']);

      return {
        network: 'vk' as const,
        username: screenName(username),
        url: `https://vk.com/video${ownerId}_${id}`,
        caption: String(item['title'] || item['description'] || '').slice(0, 400),
        views: Number.isFinite(views) ? views : null,
        likes: null,
        takenAt: Number.isFinite(date)
          ? new Date(date * 1000).toISOString()
          : '',
        viewsSource: 'vk.video.get',
      };
    });
};

export const vkTest = async (token: string): Promise<string> => {
  await vkCall(token, 'users.get', {});

  return 'VK';
};
