import { chromium, type Browser, type Page } from 'playwright';

export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type WaitUntil =
  | 'load'
  | 'domcontentloaded'
  | 'networkidle'
  | 'commit';

const RETRYABLE =
  /ERR_HTTP2|HTTP2_PROTOCOL|ERR_HTTP_RESPONSE_CODE_FAILURE|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NETWORK_CHANGED|ERR_ABORTED|ERR_TUNNEL|Timeout/i;

export const parseWaitUntil = (value: unknown): WaitUntil => {
  if (
    value === 'load' ||
    value === 'domcontentloaded' ||
    value === 'networkidle' ||
    value === 'commit'
  ) {
    return value;
  }

  return 'domcontentloaded';
};

export const waitUntilAttempts = (preferred: WaitUntil): WaitUntil[] => {
  const extra: WaitUntil[] = ['domcontentloaded', 'commit'];
  return [preferred, ...extra.filter((item) => item !== preferred)];
};

export const launchChromium = (): Promise<Browser> =>
  chromium.launch({
    headless: true,
    executablePath:
      process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || undefined,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-http2',
      '--disable-blink-features=AutomationControlled',
    ],
  });

export const gotoPage = async (
  page: Page,
  url: string,
  options: { waitUntil?: WaitUntil; timeout: number },
): Promise<void> => {
  const attempts = waitUntilAttempts(
    parseWaitUntil(options.waitUntil),
  );
  let last: Error | undefined;

  for (const waitUntil of attempts) {
    try {
      await page.goto(url, { waitUntil, timeout: options.timeout });
      return;
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));

      if (!RETRYABLE.test(last.message)) {
        throw last;
      }
    }
  }

  throw last ?? new Error(`Не удалось открыть ${url}`);
};

const bodyText = (page: Page): Promise<string> =>
  page.evaluate(() => (document.body?.innerText || '').trim());

/** Прокручиваем страницу вниз, чтобы подгрузить ленивый и виртуальный контент. */
const autoScroll = async (page: Page, steps = 8): Promise<void> => {
  for (let step = 0; step < steps; step += 1) {
    const atBottom = await page
      .evaluate(() => {
        const el = document.scrollingElement || document.body;

        if (!el) {
          return true;
        }

        const before = el.scrollTop;
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' as ScrollBehavior });

        return el.scrollTop === before;
      })
      .catch(() => true);

    await page.waitForTimeout(350);

    if (atBottom) {
      break;
    }
  }

  await page
    .evaluate(() => {
      (document.scrollingElement || document.body)?.scrollTo({ top: 0 });
    })
    .catch(() => undefined);
};

export const renderPageHtml = async (
  url: string,
  options?: { timeoutMs?: number; scroll?: boolean },
): Promise<{
  url: string;
  title: string;
  html: string;
  text: string;
  redirectedToRoot: boolean;
}> => {
  const browser = await launchChromium();

  try {
    const context = await browser.newContext({
      userAgent: CHROME_UA,
      locale: 'ru-RU',
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    await context.route(
      /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|avi|mp3)(?:\?|$)/i,
      (route) => route.abort().catch(() => undefined),
    );

    const page = await context.newPage();
    const timeout = options?.timeoutMs ?? 25_000;

    await gotoPage(page, url, { waitUntil: 'networkidle', timeout });

    if (options?.scroll !== false) {
      await autoScroll(page).catch(() => undefined);
    }

    const deadline = Date.now() + Math.min(timeout, 10_000);
    let text = await bodyText(page);

    while (text.length < 600 && Date.now() < deadline) {
      await page.waitForTimeout(400);
      const next = await bodyText(page);

      if (next.length <= text.length) {
        // Контент перестал прибавляться — дальше ждать бессмысленно.
        if (next.length >= 400) {
          text = next;
          break;
        }
      }

      text = next;
    }

    const finalUrl = page.url();

    return {
      url: finalUrl,
      title: await page.title(),
      html: await page.content(),
      text,
      redirectedToRoot: droppedPath(url, finalUrl),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
};

/** true, если у запрошенного URL был путь, а финальный ведёт на корень домена. */
export const droppedPath = (requested: string, final: string): boolean => {
  try {
    const from = new URL(requested);
    const to = new URL(final);
    const meaningful = (path: string) => path.replace(/\/+$/, '') !== '';

    return meaningful(from.pathname) && !meaningful(to.pathname);
  } catch {
    return false;
  }
};
