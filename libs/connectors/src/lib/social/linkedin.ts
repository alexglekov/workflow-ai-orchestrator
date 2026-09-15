import { asRecord, fetchJson, firstNumber, firstString } from './http';

const restVersion = () => process.env['LINKEDIN_VERSION'] || '202401';

const headers = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'Linkedin-Version': restVersion(),
  'X-Restli-Protocol-Version': '2.0.0',
  Accept: 'application/json',
});

const companyIdFrom = (username: string): string =>
  username.replace(/^company:/i, '').replace(/\/+$/, '');

const lookupByVanity = async (
  token: string,
  vanity: string,
): Promise<string> => {
  const rest = `https://api.linkedin.com/rest/organizations?q=vanityName&vanityName=${encodeURIComponent(vanity)}`;

  try {
    const body = asRecord(await fetchJson(rest, { headers: headers(token) }));
    const elements = Array.isArray(body['elements']) ? body['elements'] : [];
    const first = asRecord(elements[0]);
    const id =
      firstString(first, ['id']) ||
      String(first['$URN'] || '').replace(/^urn:li:organization:/, '');

    if (id) {
      return id;
    }
  } catch {
    /* v2 fallback */
  }

  const v2 = `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${encodeURIComponent(vanity)}`;
  const body = asRecord(await fetchJson(v2, { headers: headers(token) }));
  const elements = Array.isArray(body['elements']) ? body['elements'] : [];
  const first = asRecord(elements[0]);
  const id = firstString(first, ['id']);

  if (!id) {
    throw new Error(
      `LinkedIn: организация «${vanity}» не найдена. Для личных профилей API подписчиков нет — укажите company:ID или linkedin.com/company/...`,
    );
  }

  return id;
};

const resolveOrganizationId = async (
  token: string,
  username: string,
): Promise<string> => {
  const id = companyIdFrom(username);

  if (/^\d+$/.test(id)) {
    return id;
  }

  return lookupByVanity(token, id);
};

const networkSize = async (token: string, organizationId: string): Promise<number> => {
  const rest = `https://api.linkedin.com/rest/networkSizes/urn:li:organization:${organizationId}?edgeType=COMPANY_FOLLOWED_BY`;

  try {
    const body = asRecord(await fetchJson(rest, { headers: headers(token) }));
    const count = firstNumber(body, [
      'firstDegreeSize',
      'count',
      'followerCount',
    ]);

    if (count != null) {
      return count;
    }
  } catch {
    /* v2 fallback */
  }

  const v2 = `https://api.linkedin.com/v2/networkSizes/urn:li:organization:${organizationId}?edgeType=CompanyFollowedByMember`;
  const body = asRecord(await fetchJson(v2, { headers: headers(token) }));
  const count = firstNumber(body, ['firstDegreeSize', 'count']);

  if (count == null) {
    throw new Error(
      'LinkedIn не вернул число подписчиков. Нужен Marketing/Community token на страницу компании',
    );
  }

  return count;
};

export const linkedinFollowers = async (
  token: string,
  username: string,
): Promise<number> => {
  if (!username.trim()) {
    throw new Error('LinkedIn: пустой username');
  }

  const organizationId = await resolveOrganizationId(token, username);

  return networkSize(token, organizationId);
};

export const linkedinTest = async (token: string): Promise<string> => {
  try {
    await fetchJson('https://api.linkedin.com/v2/userinfo', {
      headers: headers(token),
    });
  } catch {
    await fetchJson('https://api.linkedin.com/v2/me', {
      headers: headers(token),
    });
  }

  return 'LinkedIn';
};
