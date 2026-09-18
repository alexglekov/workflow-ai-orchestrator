# AI Worker

MVP: пользователь описывает задачу текстом, система собирает последовательность шагов и выполняет их через отдельные коннекторы (Mail, Telegram, 1С, Excel, Web, Browser, LLM, Transform, Memory).

Новый сервис добавляется как модуль в `libs/connectors` и регистрируется в registry. Ядро workflow (`libs/workflow`) и API не нужно переписывать.

## Стек

- NX-монорепа
- Frontend: React, React Router, Jotai (`apps/web`)
- Backend: NestJS (`apps/api`)
- PostgreSQL 16 в Docker
- Prisma в `libs/data-access`

Устройство API (модули, потоки, почему нет портов на CRUD): [ARCHITECTURE.md](./ARCHITECTURE.md).

Деплой: один Droplet DigitalOcean (SPA + API + worker + Postgres). Пошагово: [docs/DEPLOY.md](./docs/DEPLOY.md).

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npx playwright install chromium
brew install ffmpeg   # только для голосовых Telegram
npx nx serve api
npx nx serve worker
npx nx serve web
# или: npm run dev
```

PostgreSQL в Docker слушает **localhost:5436** (внутри контейнера 5432), чтобы не пересечься с другими локальными Postgres.

UI: [http://localhost:4200](http://localhost:4200)  
API: [http://localhost:3000/api](http://localhost:3000/api)

## Как пользоваться

1. Откройте **Коннекторы** и подключите аккаунты.
2. В **Workflows** откройте пример «Заявки из почты → 1С / Excel / Telegram» или создайте свой.
3. Напишите задачу текстом и нажмите **Составить шаги**, или возьмите шаблон «Письма → Excel → Telegram».
4. Поправьте шаги: для писем включите **for each** на Excel/Telegram.
5. Добавьте триггер (расписание, опрос почты или webhook) или запустите вручную с JSON input. Ежедневное время — в выбранном поясе (по умолчанию Москва, `SCHEDULE_TZ`). Если API был выключен в ту минуту, запуск догонит в тот же день. Запуски выполняет отдельный **worker** (`npx nx serve worker`, очередь в Postgres). Без worker run остаётся `pending`. Зависший run останавливается кнопкой на странице запуска — иначе утренний триггер не стартует.
6. На экране запуска видны статусы, **раскрытые параметры** (`{{…}}` уже подставлены), результат или ошибка. Упавший или отменённый run можно повторить. Если шаг по расписанию/почте/Telegram упал — бот пришлёт название workflow и ошибку (нужен Telegram-аккаунт).

Запуск: вручную, по расписанию, по опросу почты или через `POST /api/hooks/:token`.

В шагах доступны плейсхолдеры `{{previous}}`, `{{item.field}}`, `{{input.field}}`, `{{steps.1.field}}`. Условие шага: `when` (например `"{{previous.label}} = intervene"`). `skipIfEmpty: true` — не выполнять, если предыдущий список пуст. `timeoutMs` — лимит шага.

Если API доступен не только с localhost, задайте `API_PASSWORD`. UI спросит пароль (хранится в sessionStorage вкладки). Webhook `POST /api/hooks/:token` и `/api/health` остаются без пароля.

## Подключение сервисов

### Mail (IMAP)

Для Gmail включите IMAP и создайте [пароль приложения](https://support.google.com/accounts/answer/185833):

- хост: `imap.gmail.com`
- порт: `993`
- TLS: `true`
- логин: ваш email
- пароль: пароль приложения, не обычный пароль Google

Шаги:

- `mail.fetch_new` — непрочитанные из INBOX
- `mail.search` — поиск по отправителю, теме, за N дней (в том числе прочитанные) — переписка по счетам
- `mail.send` — исходящее SMTP

### Telegram

Каждая сессия — свой бот. Токен хранится в подключении, не в `.env`.

1. В чате Fabula нажмите **Подключить Telegram**.
2. Выберите тип: **обычный бот** (отвечает в чате с ботом сразу после токена) или **бот для аккаунта** (диалоги клиентов от вашего имени).
3. Создайте бота в [@BotFather](https://t.me/BotFather) и вставьте токен.
4. Для бота аккаунта включите **Business Mode** (Bot Settings → Business), затем в Telegram: **Telegram для бизнеса → Чат-боты → @ваш_бот**. Включите «Новые чаты», «Не из контактов», «Ответы от вашего имени» и сохраните.

Обычный бот начинает работать после токена. Бот для аккаунта — после `business_connection`: Fabula видит диалоги с клиентами, ответы уходят от вашего имени. Уже созданного бота можно переключить: «Сделать обычным ботом» или «Подключить к аккаунту». Для webhook нужен `PUBLIC_API_URL` с https; иначе API опрашивает обновления каждого бота.

Шаги:

- `telegram.get_updates` — новые сообщения (в том числе business). Если run стартовал с апдейта, шаг его заворачивает. `transcribe: true` распознаёт голосовые.
- `telegram.send_message` — текст в чат клиента, `chatId` из `{{item.chatId}}`
- `telegram.send_voice` — `fileId`, аудио с предыдущего шага или TTS из `text`. `memoryKey` запоминает `file_id`: тот же вопрос снова — то же голосовое.

Триггер **Telegram** подписывает workflow на входящие. Озвучка TTS — `QWEN_API_KEY`.

### Memory

Ключ/значение на workflow (intent, file_id, offset). `memory.get` / `memory.set`. Подключение не нужно.

### 1С:CRM

Нужна опубликованная база с HTTP-сервисом или OData. Имена сущностей зависят от конфигурации и должны быть в составе стандартного интерфейса OData.

- `baseUrl`: URL публикации, например `https://host/base/odata/standard.odata`
- логин и пароль пользователя 1С
- `resource`: имя по умолчанию, например `Catalog_Контрагенты`

Шаги:

- `onec.query` — GET коллекции: `filter` (OData `$filter`) или `field` + `op` + `value` (`eq`, `gt`, `contains`, `$today`). Результат: `records` / `items`
- `onec.get` — одна запись по `key` (`Ref_Key` или guid)
- `onec.create_record` — POST (лид, задача, контрагент)
- `onec.update` — PATCH по `key`, тело в `body`

Без опубликованного endpoint шаг 1С завершится ошибкой — это ожидаемо. Объект, которого нет в публикации OData, даёт 404.

### Excel (Яндекс Таблицы / Яндекс Диск / Google Drive)

Локальные файлы не используются. На странице **Коннекторы** или в чате можно:

- вставить **ссылку** на Яндекс Таблицу или файл (`disk.yandex.ru`, `docs.yandex.ru`, `yadi.sk`, Google Таблица, `.xlsx`);
- или подключить **Яндекс Диск / Google Drive** по OAuth и искать таблицу по имени.

Шаги workflow:

- `excel.find_file` — открыть по `fileUrl` или найти на Диске; без имени вернёт список таблиц
- `excel.read_rows` — строки как объекты `{ "Заголовок": значение }` (до 5000)
- `excel.find_rows` — найти строки по заголовку колонки (`field` / `op` / `value`)
- `excel.append_row` — дописать строку в **реальные колонки листа**, не в фиксированные Name/Phone
- `excel.update_row` — найти запись и обновить ячейки из `row`

Запись по публичной ссылке возможна, только если Диск подключён токеном. Чтение по открытой ссылке работает без токена. В чате токен не спрашивается — только кнопка подключения.

### LLM (извлечение и текст)

Работает во время запуска workflow, не только при сборке шагов. Ключ — из карточки коннектора или из `QWEN_API_KEY`.

- `llm.extract` — текст/страница + JSON-схема → поля (`{"btcRub": number, ...}`)
- `llm.classify` — одна метка из списка и короткое `reason`
- `llm.generate` — написать текст по инструкции
- `llm.transcribe` / `llm.speak` — речь ↔ текст (speak через Qwen TTS, распознавание — Qwen ASR)

Агенты чата: **Auto**, **Qwen** и **OpenAI**. Auto — оркестратор: разбирает сообщение, решает, это вопрос или правка сценария, и направляет к Qwen или OpenAI. Ключи: `QWEN_API_KEY` (Alibaba Model Studio, ключ привязан к региону — `QWEN_BASE_URL` из того же региона) и опционально `OPENAI_API_KEY`. Если ключа нет, запрос падает с явной ошибкой. Кнопки «подключить» и «запустить» в чате по-прежнему приходят как CTA, когда это нужно.

Qwen TTS отдаёт WAV, а Telegram принимает голосовые только в OGG/Opus, поэтому нужен **ffmpeg**: в Docker он в образе, локально — `brew install ffmpeg`. Без него озвучка уйдёт обычным аудиофайлом, а не голосовым.

### Transform

Без подключения. Фильтр счетов, сортировка, сборка отчёта:

- `transform.filter` — `field`, `op` (`gt`/`lt`/`eq`/`contains`/…), `value` (`$today` — сегодня)
- `transform.sort` / `pick` / `join` / `template`
- в params любого шага `skipIfEmpty: true` — не выполнять, если предыдущий список пуст
- `when` — строковое условие после подстановки плейсхолдеров (`=` / `!=` / `>` / `<`)

### Web (поиск, страница, курсы)

Для публичных справок: ИНН, открытые сайты. Числа со страницы достаёт `llm.extract`. CRM — 1С:CRM. Курсы BestChange — не HTML.

- `web.search` — поиск через **Tavily** (индекс: ссылки и сниппеты). Параметры: `query`, `limit`, `site`, `lang`, `region`, `freshness` (`day`/`week`/`month`/`year`). Нужен `TAVILY_API_KEY`.
- `web.fetch` — снять текст выбранной страницы: сначала Tavily Extract, если оболочка пустая — HTML, затем Chromium. `url` или первый результат search (`full: true` — вместе с меню и подвалом)
- `web.rates` — BTC/LTC/USDT → RUB из `api.bestchange.ru/info.zip` (поля `btcRub`, `ltcRub`, `usdtRub` и готовый `text`)

Другие поисковики (Brave, Bing, DuckDuckGo, Chromium) для `web.search` не используются. Индексатор только находит страницы; содержимое снимает `web.fetch`.

`web.search` возвращает `results[]` (`title`, `url`, `host`, `snippet`, `score`, `text`), `answer` и готовый `text` для следующих шагов. Выдача дедуплицируется. Одинаковые запросы кэшируются на 5 минут.

Приватные адреса и localhost закрыты. Instagram и личные кабинеты этим шагом не открыть.

Пример курса: `web.rates` → `telegram.send_message`. Пример справки: `web.search` → `web.fetch` → `llm.generate` → `telegram.send_message`.

### Browser (Playwright)

Страницы, где нужен JavaScript (SPA, часть P2P). Не парк аккаунтов.

- `browser.open` — `url`, опционально `waitFor` (селектор), `waitUntil`, `actions` (`click` / `fill` / `press` / `wait`), `timeoutMs`
- Chromium: локально `npx playwright install chromium`, в Docker уже лежит в образе. `browser.open` выполняет **worker**, но Chromium есть и в API — им пользуется проверка подключения Web.
- Cookies: поле `storageState` в подключении (JSON Playwright). Частные URL — `allowPrivate=true`.

## Структура

```
apps/web/app
  pages/          экраны
  widgets/        сайдбар, page header
  features/       подключение аккаунта, составление шагов
  entities/       connector, connection, workflow, run
  shared/         http-клиент, UI-примитивы
  routes/         тонкие адаптеры React Router
apps/api/src
  worker-main.ts / worker.module.ts  очередь Run, без HTTP и без тиков триггеров
  connections/    фича: controller + service + dto + persistence
  workflows/      фича: controller + service + dto + persistence
  runs/           enqueue в API, claim+execute в worker
  connectors/     каталог коннекторов
  triggers/       расписание и webhooks (только процесс API)
  health/ auth/
apps/worker       Nx-цель `nx serve worker` (webpack → dist/apps/worker)
libs/connectors   Mail, Telegram, OneC, Excel, Web, Browser, LLM, Transform, Memory
libs/workflow     разбор текста в шаги и sequential engine
libs/data-access  Prisma + шифрование credentials
infra/docker      PostgreSQL
```

## Пример workflow

1. Проверить новые письма с заявками (`mail.fetch_new`)
2. Добавить строку в Excel для **каждого** письма (`excel.append_row`, iterate)
3. Отправить уведомление в Telegram (`telegram.send_message`, iterate)

Результат предыдущего шага передаётся в следующий. В параметрах можно использовать `{{previous}}`, `{{item}}`, `{{input}}` и `{{steps.1}}`.
