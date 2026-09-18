import { type Browser, type Page } from 'playwright';
import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { firstNonEmpty, interpolate } from '../interpolate';
import { assertPublicHttpUrl } from '../web/ssrf';
import { stripHtml } from '../web/html';
import {
  CHROME_UA,
  gotoPage,
  launchChromium,
  parseWaitUntil,
} from './chromium';

type BrowserAction = {
  type?: string;
  selector?: string;
  value?: string;
  key?: string;
  ms?: number;
};

const asActions = (value: unknown): BrowserAction[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) =>
    item && typeof item === 'object'
      ? (item as BrowserAction)
      : { type: 'wait', ms: 0 },
  );
};

const applyActions = async (page: Page, actions: BrowserAction[]) => {
  for (const action of actions) {
    const type = String(action.type || '').toLowerCase();

    if (type === 'click' && action.selector) {
      await page.click(action.selector, { timeout: 15_000 });
      continue;
    }

    if ((type === 'fill' || type === 'type') && action.selector) {
      await page.fill(action.selector, String(action.value ?? ''), {
        timeout: 15_000,
      });
      continue;
    }

    if (type === 'press' && action.key) {
      if (action.selector) {
        await page.press(action.selector, action.key, { timeout: 15_000 });
      } else {
        await page.keyboard.press(action.key);
      }
      continue;
    }

    if (type === 'wait') {
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout: 20_000 });
      } else if (action.ms) {
        await new Promise((resolve) =>
          setTimeout(resolve, Number(action.ms)),
        );
      }
    }
  }
};

const openPage = async (
  credentials: Record<string, string>,
  params: Record<string, unknown>,
): Promise<ConnectorExecuteResult> => {
  const url = firstNonEmpty(params['url']);

  if (!url) {
    return { ok: false, error: 'Укажите url для browser.open' };
  }

  if (credentials['allowPrivate'] !== 'true') {
    assertPublicHttpUrl(url);
  }

  let browser: Browser | undefined;

  try {
    browser = await launchChromium();
    const context = await browser.newContext({
      userAgent: CHROME_UA,
      locale: 'ru-RU',
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      ...(credentials['storageState']
        ? { storageState: JSON.parse(credentials['storageState']) as never }
        : {}),
    });
    const page = await context.newPage();
    const timeout = Number(params['timeoutMs'] || 45_000);

    await gotoPage(page, url, {
      waitUntil: parseWaitUntil(params['waitUntil']),
      timeout,
    });

    const waitFor = String(params['waitFor'] || params['selector'] || '');

    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout });
    }

    await applyActions(page, asActions(params['actions']));

    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();
    const maxChars = Math.min(Math.max(Number(params['maxChars'] || 12_000), 500), 40_000);
    const text = stripHtml(html).slice(0, maxChars);

    return {
      ok: true,
      data: {
        url: finalUrl,
        title,
        text,
        html: html.slice(0, maxChars),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Playwright error';

    if (/Executable doesn't exist|browserType.launch/i.test(message)) {
      return {
        ok: false,
        error:
          'Chromium для Playwright не установлен. Выполните: npx playwright install chromium',
      };
    }

    return { ok: false, error: message };
  } finally {
    await browser?.close().catch(() => undefined);
  }
};

export const browserConnector: Connector = {
  id: 'browser',
  name: 'Browser',
  description:
    'Страница с JavaScript через Chromium (Playwright). Для SPA и BestChange P2P, не для парка аккаунтов',
  credentialFields: [
    {
      key: 'storageState',
      label: 'Playwright storageState JSON (cookies, необязательно)',
      secret: true,
    },
    {
      key: 'allowPrivate',
      label: 'Разрешить частные URL (true/false)',
      placeholder: 'false',
    },
  ],
  actions: [
    {
      id: 'open',
      name: 'Открыть страницу',
      description:
        'Загрузить URL с JS. waitFor — селектор, actions — click/fill/wait',
      paramsSchema: {
        url: { type: 'string', required: true, description: 'https://…' },
        waitFor: { type: 'string', description: 'CSS-селектор, ждать появления' },
        waitUntil: {
          type: 'string',
          description: 'domcontentloaded | load | commit | networkidle',
        },
        actions: {
          type: 'object',
          description:
            '[{type:click|fill|press|wait, selector, value, key, ms}]',
        },
        maxChars: { type: 'number', description: 'Обрезка текста' },
        timeoutMs: { type: 'number', description: 'Таймаут навигации, мс' },
      },
    },
  ],
  testConnection: async () => {
    try {
      const browser = await launchChromium();
      await browser.close();

      return { ok: true, message: 'Chromium запускается' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось запустить Chromium';

      return {
        ok: false,
        error: /executable doesn't exist/i.test(message)
          ? 'Chromium не установлен. На машине worker выполните npx playwright install chromium'
          : message,
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

    if (input.action === 'open') {
      return openPage(input.credentials, params);
    }

    return { ok: false, error: `Неизвестное действие: ${input.action}` };
  },
};
