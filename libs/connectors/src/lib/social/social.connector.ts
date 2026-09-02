import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { firstNonEmpty, interpolate } from '../interpolate';
import { sleep } from './http';
import { instagramFollowers, instagramMedia, instagramTest } from './instagram';
import { linkedinFollowers, linkedinTest } from './linkedin';
import {
  asPositiveInt,
  formatFollowersReport,
  NETWORK_LABEL,
  parseProfiles,
  profileUrl,
  type FollowerRow,
  type ProfileRef,
  type ReelRow,
  type SocialNetwork,
} from './parse';
import { providerFollowers, providerReels, type ProviderAuth } from './provider';
import { vkFollowers, vkTest, vkVideos } from './vk';

const cred = (
  credentials: Record<string, string>,
  key: string,
  env?: string,
): string => firstNonEmpty(credentials[key], env ? process.env[env] : '');

const tokens = (credentials: Record<string, string>) => ({
  vk: cred(credentials, 'vkToken', 'VK_ACCESS_TOKEN'),
  instagram: cred(credentials, 'instagramToken', 'INSTAGRAM_ACCESS_TOKEN'),
  instagramUserId: cred(credentials, 'instagramUserId', 'INSTAGRAM_USER_ID'),
  linkedin: cred(credentials, 'linkedinToken', 'LINKEDIN_ACCESS_TOKEN'),
  provider: cred(credentials, 'providerBaseUrl', 'SOCIAL_PROVIDER_BASE_URL'),
  providerKey: cred(credentials, 'providerApiKey', 'SOCIAL_PROVIDER_API_KEY'),
  providerHeader: cred(credentials, 'providerHeader'),
  providerHost: cred(credentials, 'providerHost'),
});

const providerAuth = (
  credentials: Record<string, string>,
): ProviderAuth | null => {
  const { provider, providerKey, providerHeader, providerHost } =
    tokens(credentials);

  if (!provider || !providerKey) {
    return null;
  }

  return {
    baseUrl: provider,
    apiKey: providerKey,
    header: providerHeader || undefined,
    host: providerHost || undefined,
  };
};

const seenList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;

      return Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      return value.split(/\s+/).filter(Boolean);
    }
  }

  return [];
};

const takenAtMs = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }

  const asNumber = Number(value);

  if (Number.isFinite(asNumber) && asNumber > 1_000_000_000) {
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const metric = (row: ReelRow): number => row.views ?? row.likes ?? 0;

const fetchFollowers = async (
  credentials: Record<string, string>,
  profile: ProfileRef,
): Promise<number> => {
  const auth = tokens(credentials);
  const http = providerAuth(credentials);

  if (profile.network === 'vk') {
    if (auth.vk) {
      return vkFollowers(auth.vk, profile.username);
    }

    if (http) {
      return providerFollowers(http, 'vk', profile.username);
    }

    throw new Error('Для ВК нужен vkToken (или HTTP-провайдер)');
  }

  if (profile.network === 'instagram') {
    if (auth.instagram) {
      try {
        return await instagramFollowers(
          auth.instagram,
          auth.instagramUserId,
          profile.username,
        );
      } catch (error) {
        if (!http) {
          throw error;
        }
      }
    }

    if (http) {
      return providerFollowers(http, 'instagram', profile.username);
    }

    throw new Error(
      'Для Instagram нужен Graph-токен + instagramUserId или HTTP-провайдер. web.fetch страницу не откроет',
    );
  }

  if (auth.linkedin) {
    return linkedinFollowers(auth.linkedin, profile.username);
  }

  if (http) {
    return providerFollowers(http, 'linkedin', profile.username);
  }

  throw new Error(
    'Для LinkedIn нужен токен страницы компании (не личный профиль) или HTTP-провайдер',
  );
};

const fetchReels = async (
  credentials: Record<string, string>,
  profile: ProfileRef,
  limit: number,
): Promise<ReelRow[]> => {
  const auth = tokens(credentials);
  const http = providerAuth(credentials);

  if (profile.network === 'vk') {
    if (!auth.vk) {
      throw new Error('Для роликов ВК нужен vkToken');
    }

    return vkVideos(auth.vk, profile.username, limit);
  }

  if (profile.network === 'linkedin') {
    throw new Error('Рилсы LinkedIn API не отдаёт');
  }

  if (http) {
    try {
      return await providerReels(http, profile.username);
    } catch (error) {
      if (!auth.instagram) {
        throw error;
      }
    }
  }

  if (auth.instagram) {
    return instagramMedia(
      auth.instagram,
      auth.instagramUserId,
      profile.username,
      limit,
    );
  }

  throw new Error(
    'Для Instagram Reels нужен HTTP-провайдер (просмотры) или Graph Business Discovery (лайки как оценка). web.fetch не подставлять',
  );
};

export const socialConnector: Connector = {
  id: 'social',
  name: 'Social',
  description:
    'Подписчики VK / Instagram / LinkedIn (компании) и вирусные рилсы. Официальные API; чужие IG-просмотры — через HTTP-провайдер',
  credentialFields: [
    {
      key: 'vkToken',
      label: 'VK access token',
      secret: true,
      placeholder: 'vk1.a....',
    },
    {
      key: 'instagramToken',
      label: 'Instagram Graph token',
      secret: true,
    },
    {
      key: 'instagramUserId',
      label: 'Instagram user id владельца токена',
      placeholder: '17841…',
    },
    {
      key: 'linkedinToken',
      label: 'LinkedIn access token (страница компании)',
      secret: true,
    },
    {
      key: 'providerBaseUrl',
      label: 'HTTP-провайдер: base URL (необязательно)',
      placeholder: 'https://example.p.rapidapi.com',
    },
    {
      key: 'providerApiKey',
      label: 'HTTP-провайдер: ключ',
      secret: true,
    },
    {
      key: 'providerHost',
      label: 'X-RapidAPI-Host (если нужен)',
    },
  ],
  actions: [
    {
      id: 'followers',
      name: 'Подписчики',
      description:
        'Пачка профилей → текст «ВК N\\nИнстаграм N\\nЛинкдин N». LinkedIn только company',
      paramsSchema: {
        profiles: {
          type: 'string',
          description: 'URL или @username с сетью, по строке. Или Excel предыдущего шага',
        },
        username: { type: 'string', description: 'Один аккаунт' },
        network: {
          type: 'string',
          description: 'vk | instagram | linkedin',
        },
        url: { type: 'string', description: 'Ссылка на профиль' },
      },
    },
    {
      id: 'reels',
      name: 'Рилсы',
      description:
        'Ролики аккаунтов. minViews / minLikes, sinceHours, newOnly (память URL). IG-просмотры — провайдер, иначе лайки',
      paramsSchema: {
        accounts: {
          type: 'string',
          description: 'Список аккаунтов или строки Excel',
        },
        network: {
          type: 'string',
          description: 'По умолчанию instagram',
        },
        minViews: { type: 'number', description: 'Минимум просмотров (или лайков, если views нет)' },
        minLikes: { type: 'number', description: 'Минимум лайков' },
        sinceHours: { type: 'number', description: 'Только за последние N часов' },
        newOnly: {
          type: 'boolean',
          description: 'Только URL, которых ещё не было в памяти',
        },
        memoryKey: {
          type: 'string',
          description: 'Ключ seen URL, по умолчанию social:reels:seen',
        },
        limit: { type: 'number', description: 'Максимум роликов на аккаунт (до 50)' },
      },
    },
  ],
  testConnection: async (credentials) => {
    const auth = tokens(credentials);
    const checks: string[] = [];

    try {
      if (auth.vk) {
        checks.push(await vkTest(auth.vk));
      }

      if (auth.instagram) {
        checks.push(await instagramTest(auth.instagram, auth.instagramUserId));
      }

      if (auth.linkedin) {
        checks.push(await linkedinTest(auth.linkedin));
      }

      if (auth.provider && auth.providerKey) {
        checks.push('HTTP-провайдер задан');
      }

      if (checks.length === 0) {
        return {
          ok: false,
          error:
            'Укажите хотя бы VK, Instagram Graph, LinkedIn или HTTP-провайдер',
        };
      }

      return { ok: true, message: checks.join(', ') };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Social connector error',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;

    try {
      if (input.action === 'followers') {
        const profiles = parseProfiles(params, input.previousResult).slice(
          0,
          30,
        );

        if (profiles.length === 0) {
          return {
            ok: false,
            error:
              'Укажите профили: URL ВК/Instagram/LinkedIn или таблицу с колонками сети',
          };
        }

        const items: FollowerRow[] = [];

        for (const [index, profile] of profiles.entries()) {
          if (index > 0) {
            await sleep(200);
          }

          try {
            const followers = await fetchFollowers(
              input.credentials,
              profile,
            );

            items.push({
              network: profile.network,
              label: NETWORK_LABEL[profile.network],
              username: profile.username,
              followers,
              url: profileUrl(profile),
            });
          } catch (error) {
            items.push({
              network: profile.network,
              label: NETWORK_LABEL[profile.network],
              username: profile.username,
              followers: null,
              url: profileUrl(profile),
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (items.every((row) => row.followers == null)) {
          return {
            ok: false,
            error: items.map((row) => row.error).filter(Boolean).join('; '),
          };
        }

        const text = formatFollowersReport(items);

        return {
          ok: true,
          data: { text, items, rows: items, count: items.length },
        };
      }

      if (input.action === 'reels') {
        const fallback: SocialNetwork = 'instagram';
        const profiles = parseProfiles(
          params,
          input.previousResult,
          fallback,
        ).slice(0, 120);

        if (profiles.length === 0) {
          return {
            ok: false,
            error:
              'Укажите аккаунты для рилсов (список, URL или Excel предыдущего шага)',
          };
        }

        const perAccount = asPositiveInt(params['limit'], 20);
        const minViews = Number(params['minViews'] ?? 0);
        const minLikes = Number(params['minLikes'] ?? 0);
        const sinceHours = Number(params['sinceHours'] ?? 0);
        const newOnly =
          params['newOnly'] === true || params['newOnly'] === 'true';
        const memoryKey = String(params['memoryKey'] || 'social:reels:seen');
        const cutoff =
          sinceHours > 0 ? Date.now() - sinceHours * 3600 * 1000 : 0;
        const collected: ReelRow[] = [];

        for (const [index, profile] of profiles.entries()) {
          if (index > 0) {
            await sleep(200);
          }

          try {
            const rows = await fetchReels(
              input.credentials,
              profile,
              perAccount,
            );
            collected.push(...rows);
          } catch {
            /* один аккаунт не валит весь отчёт */
          }
        }

        let items = collected.filter((row) => {
          if (minViews > 0 && metric(row) < minViews) {
            return false;
          }

          if (minLikes > 0 && (row.likes ?? 0) < minLikes) {
            return false;
          }

          if (cutoff) {
            const at = takenAtMs(row.takenAt);

            if (at != null && at < cutoff) {
              return false;
            }
          }

          return Boolean(row.url);
        });

        items.sort((left, right) => metric(right) - metric(left));

        if (newOnly && input.runtime?.getState) {
          const seen = new Set(seenList(await input.runtime.getState(memoryKey)));
          items = items.filter((row) => !seen.has(row.url));

          if (input.runtime.setState) {
            const next = [...items.map((row) => row.url), ...seen].slice(0, 2000);

            await input.runtime.setState(memoryKey, next);
          }
        }

        const text = items
          .map((row) => {
            const views = row.views != null ? `${row.views} просмотров` : '';
            const likes = row.likes != null ? `${row.likes} лайков` : '';
            const stats = [views, likes].filter(Boolean).join(', ');

            return [row.url, stats, row.caption].filter(Boolean).join('\n');
          })
          .join('\n\n');

        return {
          ok: true,
          data: {
            text,
            items,
            rows: items,
            count: items.length,
          },
        };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Social connector error',
      };
    }
  },
};
