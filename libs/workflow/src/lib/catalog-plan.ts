import type { ParsedStep } from './types';

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
  'social.followers',
  'social.reels',
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
  'mail.send',
  'telegram.send_voice',
  'telegram.send_message',
];

const ACTION_HINTS: Record<string, string> = {
  'mail.fetch_new':
    'входящие непрочитанные проверить почту inbox imap получить письма заявки новые письма',
  'mail.search':
    'переписка корреспонденция найти письма поиск mailbox since',
  'mail.send':
    'отправить письмо исходящее smtp получателю email',
  'web.search':
    'найди поиск google гугл инн inn справка реквизит',
  'web.fetch': 'открой страницу сайт url скачать http https',
  'browser.open':
    'браузер playwright javascript spa p2p клик логин chromium',
  'web.rates':
    'курс bestchange btc ltc usdt p2p биржа обменник',
  'social.followers':
    'подписчики followers вк vk instagram инстаграм linkedin линкдин утро отчёт соцсети',
  'social.reels':
    'рилс reels вирус залетел просмотры instagram инстаграм ролики аккаунтов',
  'excel.find_file': 'найди файл диск drive яндекс google xlsx',
  'excel.read_rows': 'прочитай прочитать строки лист таблицу excel счета',
  'excel.append_row': 'добавь допиши запиши строку в таблицу excel',
  'llm.extract':
    'извлеки достань поля json курс bestchange структурируй инн реквизит btc ltc usdt',
  'llm.classify':
    'классифицируй намерение метка категория вмешаться срочно',
  'llm.generate':
    'напиши сгенерируй текст персонализированное сообщение контекст диалог ответ',
  'llm.transcribe': 'распознай голос транскрипт speech stt whisper',
  'llm.speak': 'озвучь голосовое tts речь',
  'transform.filter':
    'фильтр отфильтруй больше меньше просрочен сумма 500',
  'transform.sort': 'сортируй отсортируй по убыванию просмотрам',
  'transform.pick': 'выбери поля оставь колонки',
  'transform.join': 'склей список строк отчёт перечень',
  'transform.template':
    'формат шаблон отчёт текст btc-rub ltc-rub usdt-rub',
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
  'telegram.send_message': 'телеграм telegram уведомление сообщение бот отчёт',
};

const CONNECTOR_HINTS: Record<string, string> = {
  mail: 'почта mail email письмо smtp imap переписка',
  web: 'сайт веб web инн inn http https курс bestchange справочн гугл',
  browser: 'браузер playwright javascript spa p2p chromium',
  excel: 'excel эксель таблица xlsx диск счета',
  llm: 'llm нейросеть извлечь классифицировать сгенерировать gpt gemini голос',
  transform: 'фильтр шаблон отчёт преобразовать transform',
  memory: 'память memory ключ повтор',
  onec: '1с 1c onec crm контрагент инн лид задача счета',
  telegram: 'телеграм telegram бот входящие диалог голос voice',
  social: 'подписчики вк vk instagram инстаграм linkedin линкдин рилс reels соцсети',
};

const LIST_PRODUCERS = new Set([
  'mail.fetch_new',
  'mail.search',
  'telegram.get_updates',
  'excel.read_rows',
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
  'social.followers',
  'social.reels',
  'telegram.get_updates',
  'onec.query',
  'transform.filter',
  'transform.sort',
  'transform.pick',
  'transform.join',
  'transform.template',
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

const isExcelUrl = (url: string): boolean =>
  /xlsx|docs\.google|drive\.google|disk\.yandex|yadi\.sk/i.test(url);

const isSocialUrl = (url: string): boolean =>
  /(?:instagram\.com|instagr\.am|vk\.com|vkontakte\.ru|linkedin\.com)/i.test(
    url,
  );

const socialProfilesFromPrompt = (prompt: string): string =>
  (prompt.match(/https?:\/\/[^\s)\]>'"]+/gi) || [])
    .map((item) => item.replace(/[.,;]+$/u, ''))
    .filter(isSocialUrl)
    .join('\n');

const firstEmail = (prompt: string): string =>
  prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';

const excelFileName = (prompt: string): string =>
  prompt.match(/["«]([^"»]+\.xlsx?)["»]/i)?.[1] ||
  prompt.match(/\b([\w.-]+\.xlsx?)\b/i)?.[1] ||
  '';

// \b не работает с кириллицей, поэтому границы слов — через \p{L} с флагом u.
const SEARCH_NOISE = [
  /(?<![\p{L}])кажд(?:ый|ое|ую)\s+(?:день|утро|час|неделю|минуту)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:ежедневно|ежечасно|по расписанию)(?![\p{L}])/giu,
  /(?<![\p{L}])каждые\s+\d+\s*\p{L}*/giu,
  /(?<![\p{L}])в\s+\d{1,2}(?:[:.]\d{2})?(?:\s*(?:утра|вечера|часов|час|ч))?(?![\p{L}\d])/giu,
  /(?<![\p{L}])(?:пришли|присылай|отправь|отправляй|напиши|сообщи|скинь|добавь|сохрани|запиши)[^,.;]*?(?:телеграм\p{L}*|telegram|почт\p{L}*|email|mail|excel|таблиц\p{L}*|чат\p{L}*|бот\p{L}*)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:в|на)\s+(?:телеграм\p{L}*|telegram|почту|excel|таблицу)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:в|во)\s+интернете(?![\p{L}])/giu,
  /(?<![\p{L}])(?:найди|найти|поищи|проверь|узнай|посмотри|подскажи|нужно|надо|пожалуйста)(?![\p{L}])/giu,
];

const DANGLING = /^(?:[\s,;.]|(?<![\p{L}])(?:и|а|но|же)(?![\p{L}]))+|(?:[\s,;.]|(?<![\p{L}])(?:и|а|но|же)(?![\p{L}]))+$/giu;

/** Из формулировки задачи делает короткую поисковую фразу без расписания и доставки. */
export const searchPhrase = (prompt: string): string => {
  const cleaned = SEARCH_NOISE.reduce(
    (text, pattern) => text.replace(pattern, ' '),
    prompt,
  )
    .replace(/\s*[,;]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(DANGLING, '')
    .trim();

  return (cleaned.length >= 3 ? cleaned : prompt.trim()).slice(0, 200);
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
    return {};
  }

  if (connectorId === 'browser' && actionId === 'open') {
    return url && !isExcelUrl(url) ? { url } : {};
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
    return { query: searchPhrase(prompt), limit: 5 };
  }

  if (connectorId === 'web' && actionId === 'fetch') {
    if (url && !isExcelUrl(url)) {
      return { url };
    }

    if (hasSearch) {
      return { url: '{{previous.results.0.url}}' };
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
    return {
      instruction:
        'Напиши готовый текст для пользователя (сообщение, отчёт). Не пиши код, скрипты и JSON — только сам текст.',
      text: '{{previous}}',
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

  if (connectorId === 'social' && actionId === 'followers') {
    const profiles = socialProfilesFromPrompt(prompt);

    return profiles ? { profiles } : {};
  }

  if (connectorId === 'social' && actionId === 'reels') {
    const views = prompt.match(
      /(?:просмотр|views|залетел[ао]?\s*(?:от)?)\s*(\d[\d\s]*)/i,
    );
    const hours = prompt.match(/за\s+(\d+)\s*час/i);
    const profiles = socialProfilesFromPrompt(prompt);

    return {
      newOnly: true,
      ...(profiles ? { accounts: profiles } : {}),
      ...(views?.[1]
        ? { minViews: Number(views[1].replace(/\s/g, '')) }
        : {}),
      ...(hours?.[1] ? { sinceHours: Number(hours[1]) } : {}),
    };
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
    const hasFollowers = selected.some(
      (step) => step.connectorId === 'social' && step.action === 'followers',
    );

    if (hasFollowers || hasRates) {
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

  const webUrl = firstUrl(text);
  const wantsRates =
    /bestchange/i.test(text) ||
    (/курс/i.test(text) && /btc|ltc|usdt/i.test(text));
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

  if (
    unique.some((item) => item.connector.id === 'web' && item.action.id === 'search')
  ) {
    withFetch = ensureAction(withFetch, 'web', 'fetch');
  }

  if (webUrl && !isExcelUrl(webUrl) && !isSocialUrl(webUrl) && !wantsRates) {
    withFetch = ensureAction(withFetch, 'web', 'fetch');
  }

  if (wantsRates) {
    withFetch = ensureAction(withFetch, 'web', 'rates');
  }

  if (
    /браузер|playwright|javascript|spa|(bestchange.*p2p)|(p2p.*bestchange)/i.test(
      text,
    )
  ) {
    withFetch = ensureAction(withFetch, 'browser', 'open');
  }

  const wantsMailSearch =
    /переписк|корреспонденц/i.test(text) &&
    includesHint(text, 'почта mail email письмо imap') > 0;

  if (wantsMailSearch) {
    withFetch = ensureAction(withFetch, 'mail', 'search');
  }

  const wantsReels = /рилс|reels|вирусн|залет/i.test(text);
  const wantsFollowers =
    /подписчик|followers/i.test(text) ||
    (/(instagram|инстаграм|вконтакте|\bвк\b|\bvk\b|linkedin|линкдин)/i.test(
      text,
    ) &&
      /отчёт|отчет|утром|каждое утро|пришли/i.test(text));

  if (wantsReels) {
    withFetch = ensureAction(withFetch, 'social', 'reels');

    if (/контекст|опиши|саммари|комментар/i.test(text)) {
      withFetch = ensureAction(withFetch, 'llm', 'generate');
    }
  } else if (wantsFollowers) {
    withFetch = ensureAction(withFetch, 'social', 'followers');
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

  const ordered = [...withFetch].sort(
    (left, right) =>
      pipelineIndex(left.connector.id, left.action.id) -
      pipelineIndex(right.connector.id, right.action.id),
  );

  const selected = ordered.map((item) => ({
    connectorId: item.connector.id,
    action: item.action.id,
  }));
  const hasList = selected.some((step) =>
    LIST_PRODUCERS.has(`${step.connectorId}.${step.action}`),
  );

  return ordered.slice(0, 8).map((item) => {
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
