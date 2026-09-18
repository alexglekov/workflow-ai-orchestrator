import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planFromCatalog,
  scrubSearchPlan,
  searchPhrase,
  type PlanCatalogConnector,
} from './catalog-plan';

const catalog: PlanCatalogConnector[] = [
  {
    id: 'web',
    name: 'Web',
    actions: [
      { id: 'search', name: 'Найти' },
      { id: 'fetch', name: 'Открыть' },
      { id: 'rates', name: 'Курсы' },
    ],
  },
  {
    id: 'browser',
    name: 'Browser',
    actions: [{ id: 'open', name: 'Открыть страницу' }],
  },
  {
    id: 'llm',
    name: 'LLM',
    actions: [
      { id: 'classify', name: 'Классифицировать' },
      { id: 'extract', name: 'Извлечь' },
      { id: 'generate', name: 'Написать' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    actions: [{ id: 'send_message', name: 'Сообщение' }],
  },
];

const keys = (prompt: string) =>
  planFromCatalog(prompt, catalog).map(
    (step) => `${step.connectorId}.${step.action}`,
  );

describe('planFromCatalog', () => {
  it('adds browser.open for SPA/Playwright', () => {
    const steps = keys('открой SPA в браузере playwright javascript');

    assert.ok(steps.includes('browser.open'));
  });

  it('finds on the web and reports to telegram without browser', () => {
    const planned = planFromCatalog(
      'найди p2p usdt rub на bybit и сообщи в телеграм',
      catalog,
    );
    const steps = planned.map((step) => `${step.connectorId}.${step.action}`);

    assert.deepEqual(steps, [
      'web.search',
      'web.fetch',
      'llm.generate',
      'telegram.send_message',
    ]);
    assert.equal(planned[0]?.params['site'], 'bybit.com');
    assert.equal(planned[0]?.params['freshness'], 'week');
    assert.equal(planned[2]?.params['text'], '{{previous.text}}');
  });

  it('keeps a named host on p2p search and week freshness', () => {
    const [search] = scrubSearchPlan(
      [
        {
          connectorId: 'web',
          action: 'search',
          params: {
            query: 'найди p2p usdt rub на bybit и сообщи в телеграм',
            site: 'bybit.com',
            freshness: 'day',
          },
        },
      ],
      'найди p2p',
    );

    assert.equal(search?.params['site'], 'bybit.com');
    assert.equal(search?.params['freshness'], 'week');
    assert.equal(/телеграм|найди/i.test(String(search?.params['query'])), false);
  });

  it('scrubs a guessed site from a generic p2p query', () => {
    const [search] = scrubSearchPlan(
      [
        {
          connectorId: 'web',
          action: 'search',
          params: {
            query: 'найди p2p usdt rub и сообщи в телеграм',
            site: 'example.com',
            freshness: 'day',
          },
        },
      ],
      'найди p2p',
    );

    assert.equal(search?.params['site'], undefined);
    assert.equal(search?.params['freshness'], 'week');
  });

  it('does not open chromium for a javascript search', () => {
    const steps = keys(
      'найди вакансии javascript и пришли в телеграм',
    );

    assert.ok(steps.includes('web.search'));
    assert.ok(steps.includes('web.fetch'));
    assert.ok(!steps.includes('browser.open'));
  });


  it('sets when on telegram after classify', () => {
    const steps = planFromCatalog(
      'классифицируй намерение вмешаться и напиши в телеграм',
      catalog,
    );
    const telegram = steps.find(
      (step) => step.connectorId === 'telegram' && step.action === 'send_message',
    );

    assert.ok(telegram);
    assert.equal(telegram?.params['when'], '{{previous.label}} = intervene');
  });

  it('uses web.rates for BestChange, not fetch', () => {
    const steps = keys('пришли курс bestchange btc usdt в телеграм');

    assert.ok(steps.includes('web.rates'));
    assert.ok(!steps.includes('web.fetch'));
  });

  it('fetches Binance ticker instead of BestChange rates', () => {
    const steps = planFromCatalog(
      'Собери все данные о курсе валютной паре BTC/USDT с binance и отправь мне в тг каждый час',
      catalog,
    );
    const fetch = steps.find(
      (step) => step.connectorId === 'web' && step.action === 'fetch',
    );

    assert.ok(fetch);
    assert.equal(
      fetch?.params['url'],
      'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
    );
    assert.ok(!steps.some((step) => step.action === 'rates'));
    assert.ok(
      steps.some(
        (step) =>
          step.connectorId === 'telegram' && step.action === 'send_message',
      ),
    );
  });

  it('writes the summary in this chat, not telegram', () => {
    const steps = keys('найди курс btc и отправь сводку в чат');

    assert.ok(steps.includes('web.search'));
    assert.ok(steps.includes('web.fetch'));
    assert.ok(steps.includes('llm.generate'));
    assert.ok(!steps.includes('telegram.send_message'));
    assert.ok(!steps.includes('mail.send'));
  });

  it('still sends to telegram when it is named', () => {
    const steps = keys('найди курс btc и отправь сводку в телеграм');

    assert.ok(steps.includes('telegram.send_message'));
  });

  it('keeps this chat when telegram is explicitly refused', () => {
    const steps = keys(
      'найди курс btc и отправь сводку в этот чат, не в телеграм',
    );

    assert.ok(steps.includes('llm.generate'));
    assert.ok(!steps.includes('telegram.send_message'));
  });

  it('searches then fetches a named site even with a typo, not BestChange zip', () => {
    const planned = planFromCatalog(
      'зайди на bestchnage и отправь мне сводку о топ 10 предожение по валютной паре usdt/btc',
      catalog,
    );
    const steps = planned.map((step) => `${step.connectorId}.${step.action}`);
    const search = planned.find(
      (step) => step.connectorId === 'web' && step.action === 'search',
    );
    const fetch = planned.find(
      (step) => step.connectorId === 'web' && step.action === 'fetch',
    );

    assert.deepEqual(steps, ['web.search', 'web.fetch', 'llm.generate']);
    assert.equal(search?.params['site'], 'bestchange.ru');
    assert.equal(search?.params['fetchContent'], undefined);
    assert.ok(fetch);
    assert.equal(
      fetch?.params['url'],
      'https://www.bestchange.ru/tether-trc20-to-bitcoin.html',
    );
    assert.ok(!steps.includes('web.rates'));
  });
});

const excelCatalog: PlanCatalogConnector[] = [
  {
    id: 'excel',
    name: 'Excel',
    actions: [
      { id: 'find_file', name: 'Найти таблицу' },
      { id: 'read_rows', name: 'Прочитать строки' },
      { id: 'find_rows', name: 'Найти записи' },
      { id: 'append_row', name: 'Добавить строку' },
      { id: 'update_row', name: 'Обновить запись' },
      { id: 'apply', name: 'Сделать в таблице' },
    ],
  },
];

describe('planFromCatalog excel', () => {
  it('writes a Yandex table instead of reading it', () => {
    const steps = planFromCatalog(
      'запиши строку в яндекс таблицу заявки.xlsx https://disk.yandex.ru/i/abc',
      excelCatalog,
    );

    assert.deepEqual(
      steps.map((step) => `${step.connectorId}.${step.action}`),
      ['excel.apply'],
    );
    assert.equal(steps[0]?.params['fileName'], 'заявки.xlsx');
    assert.equal(
      steps[0]?.params['fileUrl'],
      'https://disk.yandex.ru/i/abc',
    );
    assert.match(String(steps[0]?.params['instruction']), /запиши строку/i);
  });

  it('finds a row by sheet header', () => {
    const steps = planFromCatalog(
      'найди запись в таблице где Телефон = 7900',
      excelCatalog,
    );

    assert.equal(steps[0]?.action, 'find_rows');
    assert.equal(steps[0]?.params['field'], 'Телефон');
    assert.equal(steps[0]?.params['value'], '7900');
  });

  it('uses excel.apply for open-ended sheet work', () => {
    const steps = planFromCatalog(
      'удали дубли и посчитай итоги в таблице заявки.xlsx',
      excelCatalog,
    );

    assert.deepEqual(
      steps.map((step) => `${step.connectorId}.${step.action}`),
      ['excel.apply'],
    );
    assert.equal(steps[0]?.params['fileName'], 'заявки.xlsx');
    assert.match(String(steps[0]?.params['instruction']), /удали дубли/i);
  });

  it('fills a table from search through excel.apply', () => {
    const steps = planFromCatalog(
      'найди актуальные курсы usdt и заполни таблицу заявки.xlsx',
      [
        ...excelCatalog,
        {
          id: 'web',
          name: 'Web',
          actions: [
            { id: 'search', name: 'Найти в вебе' },
            { id: 'fetch', name: 'Открыть страницу' },
          ],
        },
        {
          id: 'llm',
          name: 'LLM',
          actions: [{ id: 'generate', name: 'Сгенерировать текст' }],
        },
      ],
    );

    assert.ok(steps.some((step) => step.connectorId === 'web' && step.action === 'search'));
    assert.ok(steps.some((step) => step.connectorId === 'web' && step.action === 'fetch'));
    assert.equal(
      steps.filter((step) => step.connectorId === 'excel').map((step) => step.action).join(),
      'apply',
    );
  });
});

describe('searchPhrase', () => {
  it('strips schedule and delivery noise', () => {
    const query = searchPhrase(
      'каждое утро в 9 найди в интернете новости про ЦБ и пришли в телеграм',
    );

    assert.ok(query.includes('новости про ЦБ'));
    assert.equal(/телеграм|каждое утро|найди/i.test(query), false);
  });

  it('keeps the prompt when nothing meaningful is left', () => {
    assert.equal(searchPhrase('найди'), 'найди');
  });

  it('turns a chat task into a short live query', () => {
    const query = searchPhrase(
      'найди мне топ 3 российских песни за 2026 год и отправь их сюда в чат',
    );

    assert.match(query, /топ 3 российских песни/i);
    assert.equal(/найди|отправь|чат/i.test(query), false);
  });
});
