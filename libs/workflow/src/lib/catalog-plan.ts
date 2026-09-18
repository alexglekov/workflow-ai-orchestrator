import type { ParsedStep } from './types';
import {
  shapeSearchQuery,
  searchFreshness,
} from '../../../connectors/src/lib/web/query';
import {
  namedSite,
  p2pPageUrl,
  p2pSearchQuery,
  wantsPageVisit,
  bestchangePageUrl,
  exchangePair,
} from '../../../connectors/src/lib/web/site';

export type PlanCatalogAction = {
  id: string;
  name: string;
  description?: string;
};

export type PlanCatalogConnector = {
  id: string;
  name: string;
  description?: string;
  actions: PlanCatalogAction[];
};

const PIPELINE = [
  'mail.fetch_new',
  'mail.search',
  'telegram.get_updates',
  'web.search',
  'web.fetch',
  'browser.open',
  'web.rates',
  'excel.find_file',
  'excel.read_rows',
  'excel.find_rows',
  'excel.apply',
  'onec.query',
  'onec.get',
  'transform.filter',
  'transform.sort',
  'transform.pick',
  'llm.extract',
  'llm.classify',
  'llm.generate',
  'transform.join',
  'transform.template',
  'onec.create_record',
  'onec.update',
  'excel.append_row',
  'excel.update_row',
  'mail.send',
  'telegram.send_voice',
  'telegram.send_message',
];

const ACTION_HINTS: Record<string, string> = {
  'mail.fetch_new':
    'входящие непрочитанные проверить почту inbox imap получить письма заявки новые письма',
  'mail.search': 'переписка корреспонденция найти письма поиск mailbox since',
  'mail.send': 'отправить письмо исходящее smtp получателю email',
  'web.search': 'найди поиск google гугл инн inn справка реквизит зайди открой сайт',
  'web.fetch': 'открой страницу сайт url скачать http https зайди парсинг',
  'browser.open': 'браузер playwright spa клик логин chromium',
  'web.rates': 'курс bestchange обменник монитор p2p',
  'excel.find_file': 'найди файл диск drive яндекс google xlsx таблицу открой',
  'excel.read_rows':
    'прочитай прочитать строки лист таблицу excel счета яндекс',
  'excel.find_rows': 'найди запись строку в таблице ищи кто есть excel ячейк',
  'excel.append_row': 'добавь допиши запиши строку в таблицу excel яндекс',
  'excel.update_row': 'обнови измени поправь запись строку в таблице excel',
  'excel.apply':
    'посчитай итоги дубли сортируй очисти колонку заполни формулу переименуй перезапиши замени сводку среднее процент уникальн удали запиши занеси внеси excel таблицу лист',
  'llm.extract':
    'извлеки достань поля json курс bestchange структурируй инн реквизит btc ltc usdt',
  'llm.classify': 'классифицируй намерение метка категория вмешаться срочно',
  'llm.generate':
    'напиши сгенерируй текст персонализированное сообщение контекст диалог ответ',
  'llm.transcribe': 'распознай голос транскрипт speech stt whisper',
  'llm.speak': 'озвучь голосовое tts речь',
  'transform.filter': 'фильтр отфильтруй больше меньше просрочен сумма 500',
  'transform.sort': 'сортируй отсортируй по убыванию просмотрам',
  'transform.pick': 'выбери поля оставь колонки',
  'transform.join': 'склей список строк отчёт перечень',
  'transform.template': 'формат шаблон отчёт текст btc-rub ltc-rub usdt-rub',
  'memory.get': 'память прочитай ключ повтор вопрос',
  'memory.set': 'память запиши сохрани ключ',
  'onec.query':
    'найди выбери записи фильтр контрагенты инн неоплачен счета взаимодействия переписка выборка',
  'onec.get': 'прочитай запись по ключу guid ref_key',
  'onec.create_record': 'создай запись 1с onec crm лид задачу',
  'onec.update': 'обнови запись статус патч задача ответственный',
  'telegram.get_updates':
    'входящие сообщения бот клиент написал диалог getupdates webhook',
  'telegram.send_voice': 'голосовое войес voice озвучь повтор',
  'telegram.send_message':
    'телеграм telegram тг уведомление сообщение бот отчёт',
};

const CONNECTOR_HINTS: Record<string, string> = {
  mail: 'почта mail email письмо smtp imap переписка',
  web: 'сайт веб web инн inn http https курс bestchange справочн гугл',
  browser: 'браузер playwright spa chromium',
  excel: 'excel эксель таблица xlsx диск счета яндекс yandex sheets',
  llm: 'llm нейросеть извлечь классифицировать сгенерировать gpt qwen голос',
  transform: 'фильтр шаблон отчёт преобразовать transform',
  memory: 'память memory ключ повтор',
  onec: '1с 1c onec crm контрагент инн лид задача счета',
  telegram: 'телеграм telegram тг бот входящие диалог голос voice',
};

const LIST_PRODUCERS = new Set([
  'mail.fetch_new',
  'mail.search',
  'telegram.get_updates',
  'excel.read_rows',
  'excel.find_rows',
  'onec.query',
  'transform.filter',
  'transform.sort',
  'transform.pick',
]);

const NEVER_ITERATE = new Set([
  'web.search',
  'web.fetch',
  'browser.open',
  'web.rates',
  'telegram.get_updates',
  'onec.query',
  'transform.filter',
  'transform.sort',
  'transform.pick',
  'transform.join',
  'transform.template',
  'excel.apply',
]);

const tokenize = (value: string): string[] =>
  value.toLowerCase().match(/[a-zа-яё0-9]{2,}/gi) ?? [];

const includesHint = (prompt: string, hints: string): number => {
  const text = prompt.toLowerCase();
  let hits = 0;

  for (const hint of tokenize(hints)) {
    const latinShort = hint.length <= 4 && /^[a-z0-9]+$/i.test(hint);
    const matched = latinShort
      ? new RegExp(`(^|[^a-z0-9])${hint}([^a-z0-9]|$)`, 'i').test(text)
      : text.includes(hint) ||
        (hint.length >= 4 && text.includes(hint.slice(0, 4)));

    if (matched) {
      hits += 1;
    }
  }

  return hits;
};

const scoreAction = (
  prompt: string,
  connector: PlanCatalogConnector,
  action: PlanCatalogAction,
): number => {
  const key = `${connector.id}.${action.id}`;
  const connectorHit = includesHint(
    prompt,
    [connector.id, connector.name, CONNECTOR_HINTS[connector.id] || ''].join(
      ' ',
    ),
  );
  const actionHit = includesHint(
    prompt,
    [action.id, action.name, ACTION_HINTS[key] || ''].join(' '),
  );

  if (connectorHit === 0 && actionHit === 0) {
    return 0;
  }

  if (connectorHit === 0) {
    return actionHit;
  }

  return connectorHit + actionHit * 3;
};

const firstUrl = (prompt: string): string =>
  (prompt.match(/https?:\/\/[^\s)\]>'"]+/i)?.[0] || '').replace(/[.,;]+$/u, '');

const isOpenWebQuery = (text: string): boolean =>
  /p2p|п2п|оферт|лучш(?:ие|их)\s+предложен/i.test(text);

const searchSiteFromPrompt = (prompt: string): string =>
  namedSite(prompt)?.host || '';

const spotSymbol = (prompt: string): string => {
  const match = prompt.match(
    /\b(btc|eth|ltc|sol|xrp|bnb|usdt|usdc)\s*[/_-]\s*(btc|eth|ltc|sol|xrp|bnb|usdt|usdc)\b/i,
  );

  return match ? `${match[1]}${match[2]}`.toUpperCase() : '';
};

const publicTickerUrl = (prompt: string): string => {
  const symbol = spotSymbol(prompt);

  if (!symbol) {
    return '';
  }

  if (/\bbinance\b/i.test(prompt)) {
    return `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  }

  return '';
};

const wantsBestChangeRates = (prompt: string): boolean =>
  /bestchange/i.test(prompt) &&
  /курс/i.test(prompt) &&
  !wantsPageVisit(prompt) &&
  !/топ|предложен|оферт/i.test(prompt);

const isExcelUrl = (url: string): boolean =>
  /xlsx|ods|docs\.google|drive\.google|disk\.yandex|yadi\.sk|docs\.yandex|spreadsheet\.yandex|yandex\.(?:ru|com)\/(?:disk|docs)/i.test(
    url,
  );

const isSocialUrl = (url: string): boolean =>
  /(?:instagram\.com|instagr\.am|vk\.com|vkontakte\.ru|linkedin\.com)/i.test(
    url,
  );

const firstEmail = (prompt: string): string =>
  prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';

const excelFileName = (prompt: string): string =>
  prompt.match(/["«]([^"»]+\.xlsx?)["»]/i)?.[1] ||
  prompt.match(/([\p{L}\p{N}._-]+\.xlsx?)/iu)?.[1] ||
  prompt.match(
    /(?:таблиц\p{L}*|файл\p{L}*|excel|яндекс)\s+["«]([^"»]+)["»]/iu,
  )?.[1] ||
  '';

// \b не работает с кириллицей, поэтому границы слов — через \p{L} с флагом u.

/** Из формулировки задачи делает короткую поисковую фразу без расписания и доставки. */
export const searchPhrase = (prompt: string): string =>
  p2pSearchQuery(prompt) || shapeSearchQuery(prompt, { stamp: false });

const namesTelegram = (text: string): boolean =>
  /телеграм|telegram|(?<![\p{L}])тг(?![\p{L}])/iu.test(text);

const rejectsTelegram = (text: string): boolean =>
  /не\s+в\s+(?:телеграм|telegram|тг)|не\s+(?:в\s+)?телеграм|без\s+телеграм/iu.test(
    text,
  );

/** «В чат» / «сюда» — этот чат приложения, не Telegram, если тг не назвали. */
export const wantsInAppChat = (text: string): boolean => {
  if (namesTelegram(text) && !rejectsTelegram(text)) {
    return false;
  }

  return (
    /(?:^|[^\p{L}])(?:в|сюда(?:\s+в)?)\s+(?:этот\s+|наш\s+)?чат(?![\p{L}])/iu.test(
      text,
    ) ||
    /в этом чате/i.test(text) ||
    /(?:напиши|отправь|пришли)(?:те)?\s+(?:мне\s+)?сюда(?![\p{L}])/iu.test(text)
  );
};

export const scrubSearchPlan = <
  T extends {
    connectorId: string;
    action: string;
    params?: Record<string, unknown>;
  },
>(
  steps: T[],
  source = '',
): T[] => {
  const seen = new Set<string>();

  return steps.flatMap((step) => {
    if (step.connectorId !== 'web' || step.action !== 'search') {
      return [step];
    }

    const params = { ...(step.params ?? {}) };
    const query = searchPhrase(String(params.query || source));
    const blob = `${query} ${source}`;
    const site = namedSite(blob)?.host || namedSite(source)?.host;
    const p2p = isOpenWebQuery(blob);
    const openWeb = p2p && !site;

    if (query) {
      params.query = query;
    }

    if (site && !params.site) {
      params.site = site;
    }

    if (openWeb) {
      delete params.site;
    }

    const freshness = searchFreshness(blob);

    if (freshness) {
      params.freshness =
        p2p && params.freshness === 'day' ? 'week' : params.freshness || freshness;
    } else if (openWeb) {
      delete params.freshness;
    }

    const key = `${params.query}|${params.site || ''}|${params.freshness || ''}`;

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);

    return [{ ...step, params }];
  });
};

const fillParams = (
  connectorId: string,
  actionId: string,
  prompt: string,
  selected: Array<{ connectorId: string; action: string }>,
): Record<string, unknown> => {
  const url = firstUrl(prompt);
  const fileName = excelFileName(prompt);
  const email = firstEmail(prompt);
  const hasSearch = selected.some(
    (step) => step.connectorId === 'web' && step.action === 'search',
  );

  if (connectorId === 'mail' && actionId === 'search') {
    return {
      sinceDays: 30,
      limit: 20,
      ...(email ? { fromContains: email } : {}),
    };
  }

  if (connectorId === 'web' && actionId === 'rates') {
    const pair = exchangePair(prompt);

    return {
      ...(pair?.from ? { from: pair.from } : {}),
      ...(pair?.to ? { to: pair.to } : {}),
      limit: 10,
    };
  }

  if (connectorId === 'browser' && actionId === 'open') {
    return url && !isExcelUrl(url)
      ? { url, waitUntil: 'domcontentloaded' }
      : { waitUntil: 'domcontentloaded' };
  }

  if (connectorId === 'mail' && actionId === 'fetch_new') {
    const subject = prompt.match(/тем[аеуы]\s*[:«"']?([^"»\n,]+)/i)?.[1];

    return {
      limit: 5,
      ...(subject ? { subjectContains: subject.trim() } : {}),
    };
  }

  if (connectorId === 'mail' && actionId === 'send') {
    return {
      ...(email ? { to: email } : {}),
      subject: prompt.match(/тем[аеуы]\s*[:«"']?([^"»\n,]+)/i)?.[1]?.trim() ||
        prompt.slice(0, 80),
      text: '{{previous}}',
    };
  }

  if (connectorId === 'web' && actionId === 'search') {
    const site = searchSiteFromPrompt(prompt);
    const openWeb = isOpenWebQuery(prompt) && !site;
    const query = searchPhrase(prompt);
    const freshness = searchFreshness(`${query} ${prompt}`);

    return {
      query,
      limit: freshness ? 8 : 5,
      ...(!openWeb && site ? { site } : {}),
      ...(freshness
        ? { freshness: isOpenWebQuery(prompt) && freshness === 'day' ? 'week' : freshness }
        : {}),
    };
  }

  if (connectorId === 'web' && actionId === 'fetch') {
    const ticker = publicTickerUrl(prompt);
    const p2p = p2pPageUrl(prompt);
    const bestchange = bestchangePageUrl(prompt);

    if (ticker) {
      return { url: ticker };
    }

    if (p2p) {
      return { url: p2p };
    }

    if (bestchange) {
      return { url: bestchange };
    }

    if (url && !isExcelUrl(url)) {
      return { url };
    }

    const site = searchSiteFromPrompt(prompt);

    if (hasSearch) {
      return {
        url: '{{previous.results.0.url}}',
        ...(site ? { site } : {}),
      };
    }

    return url ? { url } : {};
  }

  if (connectorId === 'llm' && actionId === 'extract') {
    const rates = /bestchange|btc|ltc|usdt|курс/i.test(prompt);

    return {
      text: '{{previous.text}}',
      schema: rates
        ? {
            btcRub: 'number, курс BTC к RUB',
            ltcRub: 'number, курс LTC к RUB',
            usdtRub: 'number, курс USDT к RUB',
          }
        : {
            inn: 'string, ИНН если есть',
            name: 'string, имя или компания',
            phone: 'string, телефон',
            amount: 'number, сумма если есть',
            summary: 'string, кратко о чём текст',
          },
    };
  }

  if (connectorId === 'llm' && actionId === 'classify') {
    return {
      text: '{{previous.text}}',
      labels: /счет|вмеша/i.test(prompt)
        ? 'intervene,ok'
        : 'positive,neutral,negative',
    };
  }

  if (connectorId === 'llm' && actionId === 'generate') {
    const fromSearch = selected.some(
      (step) => step.connectorId === 'web' && step.action === 'search',
    );
    const fromFetch = selected.some(
      (step) => step.connectorId === 'web' && step.action === 'fetch',
    );
    const task = prompt.trim().replace(/\s+/g, ' ').slice(0, 300);
    const pageContext = fromFetch || fromSearch;

    return {
      instruction: pageContext
        ? [
            `Запрос пользователя: «${task}».`,
            fromFetch
              ? 'Ниже — текст и таблицы открытой страницы. Ответь строго по запросу: только нужные факты, запрошенное количество пунктов и формат.'
              : 'Ниже — результаты поиска и текст страниц. Ответь строго на запрос: только относящиеся к делу факты, запрошенное количество и формат.',
            'Бери свежие числа и даты со страницы. Не выдумывай и не подставляй знания модели. Без преамбулы, кода, JSON и списка источников.',
          ].join(' ')
        : [
            `Запрос пользователя: «${task}».`,
            'Напиши готовый ответ человеку строго по этому запросу. Без кода, JSON и скриптов — только сам текст.',
          ].join(' '),
      text: pageContext ? '{{previous.text}}' : '{{previous}}',
    };
  }

  if (connectorId === 'transform' && actionId === 'filter') {
    const amount = prompt.match(
      /больше\s+(\d[\d\s]*)\s*(?:тыс|т\.?р|₽|руб)?/i,
    );
    const thousands = /тыс/i.test(prompt);
    const raw = amount?.[1]?.replace(/\s/g, '');
    const value = raw
      ? String(thousands ? Number(raw) * 1000 : Number(raw))
      : '500000';

    return {
      field: /срок|просроч/i.test(prompt) ? 'Срок оплаты' : 'Сумма',
      op: /просроч/i.test(prompt) ? 'lt' : 'gt',
      value: /просроч/i.test(prompt) ? '$today' : value,
    };
  }

  if (connectorId === 'transform' && actionId === 'template') {
    if (/bestchange|btc|ltc|usdt|курс/i.test(prompt)) {
      return {
        text: 'BTC-Rub {{previous.btcRub}}\nLTC-Rub {{previous.ltcRub}}\nUSDT-RUB {{previous.usdtRub}}',
      };
    }

    return { text: '{{previous.text}}' };
  }

  if (connectorId === 'transform' && actionId === 'join') {
    return {
      itemTemplate: '{{item}}',
      separator: '\n',
    };
  }

  if (connectorId === 'excel') {
    const params: Record<string, unknown> = {};

    if (url && isExcelUrl(url)) {
      params['fileUrl'] = url;
    }

    if (fileName) {
      params['fileName'] = fileName;
    }

    if (actionId === 'apply') {
      params['instruction'] = prompt.trim().slice(0, 2000);
    }

    if (actionId === 'find_rows' || actionId === 'update_row') {
      const match = prompt.match(
        /(?:по\s+(?:полю|колонке|столбцу)|где)\s+["«]?([^"»,]{2,40}?)["»]?\s*(?:=|равно|:|это)\s*["«]?([^"»\n,]{1,80})["»]?/iu,
      );

      if (match?.[1] && match[2]) {
        params['field'] = match[1].trim();
        params['value'] = match[2].trim();
        params['op'] = actionId === 'find_rows' ? 'contains' : 'eq';
      }
    }

    return params;
  }

  if (connectorId === 'onec') {
    const resource =
      prompt.match(
        /\b((?:Catalog|Document|InformationRegister|AccumulationRegister)_[A-Za-zА-Яа-яЁё0-9]+)/,
      )?.[1] || '';
    const inn =
      prompt.match(/\b(\d{10}|\d{12})\b/)?.[1] ||
      (/инн/i.test(prompt) ? '{{previous.inn}}' : '');
    const hasQuery = selected.some(
      (step) => step.connectorId === 'onec' && step.action === 'query',
    );

    if (actionId === 'query') {
      return {
        top: 50,
        ...(resource ? { resource } : {}),
        ...(inn
          ? { field: 'ИНН', op: 'eq', value: inn }
          : {}),
      };
    }

    if (actionId === 'get') {
      return {
        key: hasQuery ? '{{item.Ref_Key}}' : '{{previous.Ref_Key}}',
        ...(resource ? { resource } : {}),
      };
    }

    if (actionId === 'update') {
      return {
        key: hasQuery ? '{{item.Ref_Key}}' : '{{previous.Ref_Key}}',
        ...(resource ? { resource } : {}),
      };
    }

    if (actionId === 'create_record') {
      return resource ? { resource } : {};
    }
  }

  if (connectorId === 'telegram' && actionId === 'get_updates') {
    return { transcribe: true, limit: 20 };
  }

  if (connectorId === 'telegram' && actionId === 'send_voice') {
    return {
      chatId: '{{item.chatId}}',
      text: '{{previous.text}}',
      memoryKey: 'voice:{{item.chatId}}:{{item.text}}',
      skipIfEmpty: true,
    };
  }

  if (connectorId === 'telegram' && actionId === 'send_message') {
    const hasTemplate = selected.some(
      (step) => step.connectorId === 'transform' && step.action === 'template',
    );
    const rates = /bestchange|btc|ltc|usdt|курс/i.test(prompt);
    const hasRates = selected.some(
      (step) => step.connectorId === 'web' && step.action === 'rates',
    );

    if (hasRates) {
      return {
        text: '{{previous.text}}',
        skipIfEmpty: true,
      };
    }

    if (
      selected.some(
        (step) => step.connectorId === 'llm' && step.action === 'classify',
      ) &&
      /вмеша/i.test(prompt)
    ) {
      return {
        text: '{{previous.reason}}\n{{previous.text}}',
        when: '{{previous.label}} = intervene',
        skipIfEmpty: true,
      };
    }

    if (rates && !hasTemplate) {
      return {
        text: 'BTC-Rub {{previous.btcRub}}\nLTC-Rub {{previous.ltcRub}}\nUSDT-RUB {{previous.usdtRub}}',
        skipIfEmpty: true,
      };
    }

    return {
      text: '{{previous.text}}',
      skipIfEmpty: true,
      ...(selected.some(
        (step) => step.connectorId === 'telegram' && step.action === 'get_updates',
      )
        ? { chatId: '{{item.chatId}}' }
        : {}),
    };
  }

  return {};
};

const pipelineIndex = (connectorId: string, actionId: string): number => {
  const index = PIPELINE.indexOf(`${connectorId}.${actionId}`);

  return index === -1 ? PIPELINE.length : index;
};

export const planFromCatalog = (
  prompt: string,
  catalog: PlanCatalogConnector[],
): ParsedStep[] => {
  const text = prompt.trim();

  if (!text || catalog.length === 0) {
    return [];
  }

  const scored = catalog.flatMap((connector) =>
    connector.actions.map((action) => ({
      connector,
      action,
      score: scoreAction(text, connector, action),
    })),
  );

  const max = Math.max(0, ...scored.map((item) => item.score));
  const threshold = Math.max(4, max - 3);
  const unique: typeof scored = [];

  for (const connector of catalog) {
    const actions = scored
      .filter((item) => item.connector.id === connector.id)
      .sort((left, right) => right.score - left.score);
    const mentioned =
      includesHint(
        text,
        [connector.id, connector.name, CONNECTOR_HINTS[connector.id] || ''].join(
          ' ',
        ),
      ) > 0;
    const passing = actions.filter(
      (item) => item.score >= threshold && item.score >= 3,
    );

    if (passing.length > 0) {
      unique.push(...passing);
      continue;
    }

    if (mentioned && actions[0] && actions[0].score > 0) {
      unique.push(actions[0]);
    }
  }

  const hasIncomingMail = includesHint(
    text,
    'входящие непрочитанные проверить inbox заявки получить новые',
  );
  const hasOutgoingMail =
    includesHint(text, 'отправить исходящее получателю smtp') > 0 ||
    Boolean(firstEmail(text));

  if (hasOutgoingMail && !hasIncomingMail) {
    const filtered = unique.filter(
      (item) => !(item.connector.id === 'mail' && item.action.id === 'fetch_new'),
    );
    unique.length = 0;
    unique.push(...filtered);
  }

  if (hasIncomingMail && !hasOutgoingMail) {
    const filtered = unique.filter(
      (item) => !(item.connector.id === 'mail' && item.action.id === 'send'),
    );
    unique.length = 0;
    unique.push(...filtered);
  }

  const webUrl = firstUrl(text) || publicTickerUrl(text);
  const wantsRates = wantsBestChangeRates(text);
  const wantsExtract = /извлеч|инн|структур/i.test(text);

  if (wantsRates) {
    const filtered = unique.filter(
      (item) =>
        !(
          item.connector.id === 'web' &&
          (item.action.id === 'search' || item.action.id === 'fetch')
        ),
    );
    unique.length = 0;
    unique.push(...filtered);
  } else {
    const filtered = unique.filter(
      (item) =>
        !(item.connector.id === 'web' && item.action.id === 'rates'),
    );
    unique.length = 0;
    unique.push(...filtered);
  }

  const ensureAction = (
    list: typeof unique,
    connectorId: string,
    actionId: string,
  ): typeof unique => {
    if (
      list.some(
        (item) => item.connector.id === connectorId && item.action.id === actionId,
      )
    ) {
      return list;
    }

    const connector = catalog.find((item) => item.id === connectorId);
    const action = connector?.actions.find((item) => item.id === actionId);

    if (!connector || !action) {
      return list;
    }

    return [...list, { connector, action, score: threshold }];
  };

  let withFetch = unique;

  if (webUrl && !isExcelUrl(webUrl) && !isSocialUrl(webUrl) && !wantsRates) {
    withFetch = ensureAction(withFetch, 'web', 'fetch');
  }

  if (wantsRates) {
    withFetch = ensureAction(withFetch, 'web', 'rates');
  } else if (
    (searchSiteFromPrompt(text) && !publicTickerUrl(text)) ||
    /(найд|поищ|гугл|google|зайди)/i.test(text)
  ) {
    withFetch = ensureAction(withFetch, 'web', 'search');
  }

  if (
    publicTickerUrl(text) &&
    withFetch.some(
      (item) =>
        item.connector.id === 'telegram' && item.action.id === 'send_message',
    )
  ) {
    withFetch = ensureAction(withFetch, 'llm', 'generate');
  }

  if (
    /браузер|playwright|spa/i.test(text) ||
    (/javascript/i.test(text) && /браузер|клик|логин|chromium/i.test(text))
  ) {
    withFetch = ensureAction(withFetch, 'browser', 'open');
  }

  const findAndTell =
    /(найд|поищ|зайди)/i.test(text) && /(сообщ|пришл|отправ|сводк)/i.test(text);
  const parsePage =
    !wantsRates &&
    !publicTickerUrl(text) &&
    (findAndTell ||
      wantsPageVisit(text) ||
      (Boolean(namedSite(text)) &&
        /сводк|отч[её]т|топ\s*\d|предложен/i.test(text)));

  if (findAndTell) {
    withFetch = withFetch.filter((item) => item.connector.id !== 'browser');
    withFetch = ensureAction(withFetch, 'web', 'search');
    withFetch = ensureAction(withFetch, 'llm', 'generate');
  }

  if (parsePage) {
    if (!/браузер|playwright|chromium/i.test(text)) {
      withFetch = withFetch.filter((item) => item.connector.id !== 'browser');
    }
    withFetch = ensureAction(withFetch, 'web', 'search');
    withFetch = ensureAction(withFetch, 'web', 'fetch');
    withFetch = ensureAction(withFetch, 'llm', 'generate');
  }

  if (wantsInAppChat(text) || /сводк|отч[её]т/i.test(text)) {
    withFetch = ensureAction(withFetch, 'llm', 'generate');
  }

  if (wantsInAppChat(text)) {
    withFetch = withFetch.filter(
      (item) =>
        !(
          (item.connector.id === 'telegram' &&
            item.action.id === 'send_message') ||
          (item.connector.id === 'mail' && item.action.id === 'send')
        ),
    );
  }

  const wantsMailSearch =
    /переписк|корреспонденц/i.test(text) &&
    includesHint(text, 'почта mail email письмо imap') > 0;

  if (wantsMailSearch) {
    withFetch = ensureAction(withFetch, 'mail', 'search');
  }

  if (
    wantsExtract &&
    withFetch.some((item) => item.connector.id === 'web' && item.action.id === 'fetch')
  ) {
    withFetch = ensureAction(withFetch, 'llm', 'extract');
  }

  const wantsOneCRead =
    includesHint(text, '1с 1c onec crm') > 0 &&
    /(найд|выбер|инн|контрагент|счет|переписк|взаимодейств|выборк)/i.test(text);

  if (wantsOneCRead) {
    withFetch = ensureAction(withFetch, 'onec', 'query');
  }

  if (
    includesHint(text, 'телеграм telegram бот') > 0 &&
    /(входящ|клиент|диалог|голосов|написа)/i.test(text)
  ) {
    withFetch = ensureAction(withFetch, 'telegram', 'get_updates');
  }

  if (
    /обнов/i.test(text) &&
    withFetch.some((item) => item.connector.id === 'onec' && item.action.id === 'query')
  ) {
    withFetch = ensureAction(withFetch, 'onec', 'update');
  }

  const mentionsExcel =
    /excel|эксел|xlsx|таблиц|яндекс\s*таблиц|google\s*sheet|(?<![\p{L}])лист[ауе]?(?![\p{L}])/iu.test(
      text,
    );
  const wantsExcelFind =
    /(найд\p{L}*|ищ\p{L}*).{0,24}(запис|строк)|в\s+таблиц\p{L}*.{0,12}(найд\p{L}*|ищ\p{L}*)/iu.test(
      text,
    );
  const wantsExcelWrite =
    /(запиш\p{L}*|допиш\p{L}*|добав\p{L}*\s+строк)/iu.test(text);
  const wantsExcelRead = /прочит\p{L}*.{0,20}(таблиц|excel|лист|строк)/iu.test(
    text,
  );
  const wantsExcelUpdate =
    /обнов\p{L}*.{0,20}(строк|запис|таблиц|excel)|поправ\p{L}*\s+запис/iu.test(
      text,
    );
  const excelWork =
    /(посчита|итог|удал|дубл|сортир|очист|колонк|столбц|формул|заполн|переимен|перезапис|замен|объедин|уникальн|добав\p{L}*\s+колон|calculate|delete|sort|duplicate|column)/iu.test(
      text,
    );
  const fillFromSearch =
    mentionsExcel &&
    /(запиш|заполн|занес|внеси|положи)/i.test(text) &&
    /(найд|поищ|интернет|сайт|из\s+поиск|web)/i.test(text);
  const hasMailFetch = withFetch.some(
    (item) =>
      item.connector.id === 'mail' &&
      (item.action.id === 'fetch_new' || item.action.id === 'search'),
  );
  const mailToSheet =
    hasMailFetch && wantsExcelWrite && !excelWork && !fillFromSearch;
  const wantsExcelApply =
    mentionsExcel &&
    !mailToSheet &&
    (excelWork ||
      fillFromSearch ||
      wantsExcelWrite ||
      /(сделай|поработай)\s+.{0,40}(таблиц|excel|лист)/i.test(text)) &&
    !(wantsExcelFind && !wantsExcelWrite && !excelWork && !fillFromSearch);

  if (wantsExcelApply) {
    withFetch = ensureAction(withFetch, 'excel', 'apply');

    if (fillFromSearch) {
      withFetch = ensureAction(withFetch, 'web', 'fetch');
    }
  }

  if (
    wantsExcelApply ||
    wantsExcelFind ||
    wantsExcelWrite ||
    wantsExcelRead ||
    wantsExcelUpdate
  ) {
    withFetch = withFetch.filter((item) => {
      if (item.connector.id !== 'excel') {
        return true;
      }

      if (wantsExcelApply) {
        return item.action.id === 'apply';
      }

      if (wantsExcelUpdate) {
        return item.action.id === 'update_row';
      }

      if (wantsExcelFind) {
        return item.action.id === 'find_rows';
      }

      if (mailToSheet || wantsExcelWrite) {
        return item.action.id === 'append_row';
      }

      return item.action.id === 'read_rows';
    });
  }

  // После Tavily всегда парсим найденную страницу и разбираем её через LLM.
  const hasWebSearch = withFetch.some(
    (item) => item.connector.id === 'web' && item.action.id === 'search',
  );
  const hasWebRates = withFetch.some(
    (item) => item.connector.id === 'web' && item.action.id === 'rates',
  );

  if (hasWebSearch && !hasWebRates && !wantsExcelApply) {
    withFetch = ensureAction(withFetch, 'web', 'fetch');
    withFetch = ensureAction(withFetch, 'llm', 'generate');
  }

  const ordered = [...withFetch].sort(
    (left, right) =>
      pipelineIndex(left.connector.id, left.action.id) -
      pipelineIndex(right.connector.id, right.action.id),
  );
  const seen = new Set<string>();
  const uniqueOrdered = ordered.filter((item) => {
    const key = `${item.connector.id}.${item.action.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });

  const selected = uniqueOrdered.map((item) => ({
    connectorId: item.connector.id,
    action: item.action.id,
  }));
  const hasList = selected.some((step) =>
    LIST_PRODUCERS.has(`${step.connectorId}.${step.action}`),
  );

  return uniqueOrdered.slice(0, 8).map((item) => {
    const key = `${item.connector.id}.${item.action.id}`;

    return {
      title: item.action.name || key,
      connectorId: item.connector.id,
      action: item.action.id,
      params: fillParams(item.connector.id, item.action.id, text, selected),
      iterate: hasList && !LIST_PRODUCERS.has(key) && !NEVER_ITERATE.has(key),
    };
  });
};
