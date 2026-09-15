export type SocialNetwork = 'vk' | 'instagram' | 'linkedin';

export type ProfileRef = {
  network: SocialNetwork;
  username: string;
};

export type FollowerRow = {
  network: SocialNetwork;
  label: string;
  username: string;
  followers: number | null;
  url: string;
  error?: string;
};

export type ReelRow = {
  network: SocialNetwork;
  username: string;
  url: string;
  caption: string;
  views: number | null;
  likes: number | null;
  takenAt: string;
  viewsSource?: string;
};

export const NETWORK_LABEL: Record<SocialNetwork, string> = {
  vk: 'ВК',
  instagram: 'Инстаграм',
  linkedin: 'Линкдин',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const stripHandle = (value: string): string =>
  value
    .trim()
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .pop() || value.trim().replace(/^@/, '');

export const detectNetwork = (raw: string): SocialNetwork | null => {
  const text = raw.toLowerCase();

  if (/(instagram|instagr\.am|инста)/i.test(text)) {
    return 'instagram';
  }

  if (/(linkedin|линкдин|линкедин)/i.test(text)) {
    return 'linkedin';
  }

  if (/(vk\.com|vkontakte|вконтакте|\bвк\b|\bvk\b)/i.test(text)) {
    return 'vk';
  }

  return null;
};

export const profileFromUrl = (raw: string): ProfileRef | null => {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);

    if (host === 'instagram.com' || host === 'instagr.am') {
      const skip = new Set(['p', 'reel', 'reels', 'stories', 'tv', 'explore']);
      const head = (parts[0] || '').toLowerCase();

      if (!parts[0] || skip.has(head)) {
        return null;
      }

      const username = parts.find((part) => !skip.has(part.toLowerCase()));

      return username
        ? { network: 'instagram', username: stripHandle(username) }
        : null;
    }

    if (host === 'vk.com' || host === 'vkontakte.ru' || host === 'm.vk.com') {
      const username = parts[0];

      return username ? { network: 'vk', username: stripHandle(username) } : null;
    }

    if (host.endsWith('linkedin.com')) {
      if (parts[0] === 'company' && parts[1]) {
        return {
          network: 'linkedin',
          username: `company:${stripHandle(parts[1])}`,
        };
      }

      if (parts[0] === 'in' && parts[1]) {
        return { network: 'linkedin', username: stripHandle(parts[1]) };
      }
    }
  } catch {
    return null;
  }

  return null;
};

const fromUnknown = (value: unknown, fallback?: SocialNetwork): ProfileRef[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => fromUnknown(item, fallback));
  }

  if (typeof value === 'string') {
    const lines = value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const fromLines = lines.flatMap((line) => {
      const fromUrl = profileFromUrl(line);

      if (fromUrl) {
        return [fromUrl];
      }

      const network = detectNetwork(line) || fallback;
      const username = stripHandle(
        line.replace(/^(vk|вк|instagram|инстаграм|инста|linkedin|линкдин)\s*[:\-]?\s*/i, ''),
      );

      if (!network || !username || username.length < 2) {
        return [];
      }

      return [{ network, username }];
    });

    return fromLines;
  }

  const record = asRecord(value);
  const fromColumns = profilesFromNetworkColumns(record);

  if (fromColumns.length > 0) {
    return fromColumns;
  }

  const username = stripHandle(
    String(
      record['username'] ||
        record['account'] ||
        record['Аккаунт'] ||
        record['login'] ||
        record['screen_name'] ||
        '',
    ),
  );
  const network =
    normalizeNetwork(String(record['network'] || record['Сеть'] || '')) ||
    detectNetwork(String(record['network'] || record['url'] || '')) ||
    fallback;
  const fromUrl = profileFromUrl(String(record['url'] || record['href'] || ''));

  if (fromUrl) {
    return [fromUrl];
  }

  if (username && network) {
    return [{ network, username }];
  }

  return [];
};

const normalizeNetwork = (raw: string): SocialNetwork | null => {
  const text = raw.trim().toLowerCase();

  if (text === 'vk' || text === 'вк' || text === 'vkontakte' || text === 'вконтакте') {
    return 'vk';
  }

  if (
    text === 'instagram' ||
    text === 'insta' ||
    text === 'инста' ||
    text === 'инстаграм'
  ) {
    return 'instagram';
  }

  if (text === 'linkedin' || text === 'линкдин' || text === 'линкедин') {
    return 'linkedin';
  }

  return detectNetwork(raw);
};

const profilesFromNetworkColumns = (record: Record<string, unknown>): ProfileRef[] => {
  const mapping: Array<{ network: SocialNetwork; keys: string[] }> = [
    { network: 'instagram', keys: ['instagram', 'insta', 'инстаграм', 'инста'] },
    { network: 'vk', keys: ['vk', 'вк', 'vkontakte', 'вконтакте'] },
    { network: 'linkedin', keys: ['linkedin', 'линкдин', 'линкедин'] },
  ];
  const skip = new Set(['network', 'сеть', 'url', 'href']);
  const found: ProfileRef[] = [];

  for (const { network, keys } of mapping) {
    for (const [key, value] of Object.entries(record)) {
      if (skip.has(key.toLowerCase()) || value == null || value === '') {
        continue;
      }

      if (!keys.includes(key.toLowerCase())) {
        continue;
      }

      const asString = String(value).trim();
      const fromUrl = profileFromUrl(asString);

      found.push(
        fromUrl ?? { network, username: stripHandle(asString) },
      );
    }
  }

  return found.filter((item) => item.username);
};

export const parseProfiles = (
  params: Record<string, unknown>,
  previous: unknown,
  fallback?: SocialNetwork,
): ProfileRef[] => {
  const direct = [
    ...fromUnknown(params['profiles'], fallback),
    ...fromUnknown(params['accounts'], fallback),
    ...fromUnknown(params['usernames'], fallback),
  ];

  if (params['username'] || params['url']) {
    const network =
      normalizeNetwork(String(params['network'] || '')) ||
      detectNetwork(String(params['url'] || params['network'] || '')) ||
      fallback;
    const fromUrl = profileFromUrl(String(params['url'] || ''));

    if (fromUrl) {
      direct.push(fromUrl);
    } else if (network && params['username']) {
      direct.push({
        network,
        username: stripHandle(String(params['username'])),
      });
    }
  }

  if (direct.length > 0) {
    return uniqueProfiles(direct);
  }

  const record = asRecord(previous);
  const list = Array.isArray(previous)
    ? previous
    : record['rows'] || record['items'] || record['profiles'] || record['accounts'];

  return uniqueProfiles(fromUnknown(list ?? previous, fallback));
};

const uniqueProfiles = (items: ProfileRef[]): ProfileRef[] => {
  const seen = new Set<string>();
  const out: ProfileRef[] = [];

  for (const item of items) {
    const key = `${item.network}:${item.username.toLowerCase()}`;

    if (seen.has(key) || !item.username) {
      continue;
    }

    seen.add(key);
    out.push(item);
  }

  return out;
};

export const profileUrl = (profile: ProfileRef): string => {
  if (profile.network === 'instagram') {
    return `https://instagram.com/${profile.username}`;
  }

  if (profile.network === 'linkedin') {
    const company = profile.username.replace(/^company:/i, '');

    return profile.username.toLowerCase().startsWith('company:')
      ? `https://www.linkedin.com/company/${company}`
      : `https://www.linkedin.com/in/${profile.username}`;
  }

  return `https://vk.com/${profile.username}`;
};

export const formatFollowersReport = (rows: FollowerRow[]): string => {
  const labels = rows.map((row) => row.label);
  const uniqueLabels = new Set(labels);
  const useUsername = uniqueLabels.size < rows.length;

  return rows
    .map((row) => {
      const name = useUsername ? `${row.label} ${row.username}` : row.label;

      return row.followers == null ? `${name} —` : `${name} ${row.followers}`;
    })
    .join('\n');
};

export const asPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
