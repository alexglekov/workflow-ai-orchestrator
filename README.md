# AI Worker

MVP: пользователь описывает задачу текстом, система собирает последовательность шагов и выполняет их через отдельные коннекторы (Mail, Telegram, 1С, Excel, Web, Browser, LLM, Transform, Memory, Social).

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

1. Создайте бота через [@BotFather](https://t.me/BotFather) и скопируйте токен.
2. Напишите боту любое сообщение.
3. Chat ID в подключении нужен для исходящих отчётов. В диалоге берётся из входящего (`{{item.chatId}}`).

Шаги:

- `telegram.get_updates` — новые сообщения. Если workflow запущен webhook'ом Telegram, шаг заворачивает уже пришедший апдейт. `transcribe: true` распознаёт голосовые.
- `telegram.send_message` — текст, `chatId` можно `{{item.chatId}}`
- `telegram.send_voice` — `fileId`, аудио с предыдущего шага или TTS из `text`. `memoryKey` запоминает `file_id`: тот же вопрос снова — то же голосовое.

Триггер **Telegram**: при `PUBLIC_API_URL` с https бот регистрирует webhook; иначе опрос раз в минуту. Озвучка TTS — `OPENAI_API_KEY`.

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

### Excel (ссылка / Google Drive / Яндекс Диск)

Локальные файлы не используются. На странице **Коннекторы** можно:

- вставить **прямую ссылку** на документ (Google Таблица, публичный файл Яндекс Диска или `.xlsx`);
- или подключить **Яндекс Диск / Google Drive** по OAuth и искать файл по имени.

Шаги workflow:

- `excel.find_file` — открыть по `fileUrl` или найти `.xlsx` по названию
- `excel.read_rows` — строки как объекты `{ "Заголовок": значение }` (до 5000)
- `excel.append_row` — дописать строку

Запись по публичной ссылке возможна, только если Диск подключён токеном. Чтение по открытой ссылке работает без токена.

### LLM (извлечение и текст)

Работает во время запуска workflow, не только при сборке шагов. Ключ — из карточки коннектора или из `GEMINI_API_KEY` / `OPENAI_API_KEY`.

- `llm.extract` — текст/страница + JSON-схема → поля (`{"btcRub": number, ...}`)
- `llm.classify` — одна метка из списка и короткое `reason`
- `llm.generate` — написать текст по инструкции
- `llm.transcribe` / `llm.speak` — речь ↔ текст (speak через OpenAI TTS)

### Transform

Без подключения. Фильтр счетов, сортировка, сборка отчёта:

- `transform.filter` — `field`, `op` (`gt`/`lt`/`eq`/`contains`/…), `value` (`$today` — сегодня)
- `transform.sort` / `pick` / `join` / `template`
- в params любого шага `skipIfEmpty: true` — не выполнять, если предыдущий список пуст
- `when` — строковое условие после подстановки плейсхолдеров (`=` / `!=` / `>` / `<`)

### Web (поиск, страница, курсы)

Для публичных справок: ИНН, открытые сайты. Числа со страницы достаёт `llm.extract`. CRM — 1С:CRM. Курсы BestChange — не HTML.

- `web.search` — поиск с перебором провайдеров. Параметры: `query`, `limit`, `site`, `lang`, `region`, `freshness` (`day`/`week`/`month`/`year`), `fetchContent`, `contentLimit`, `provider`
- `web.fetch` — скачать URL и вернуть текст и таблицы (`full: true` — вместе с меню и подвалом)
- `web.rates` — BTC/LTC/USDT → RUB из `api.bestchange.ru/info.zip` (поля `btcRub`, `ltcRub`, `usdtRub` и готовый `text`)

**Ключ для поиска обязателен на сервере.** С IP дата-центра DuckDuckGo и Mojeek отдают анти-бот заглушку. Порядок провайдеров: Brave → Google CSE → Serper → Tavily → DuckDuckGo → Mojeek → Chromium → Wikipedia. Первый ответивший выигрывает, остальные остаются резервом. Ключи — в карточке коннектора или в `.env`: `BRAVE_API_KEY` (2000 запросов/мес бесплатно), `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX`, `SERPER_API_KEY`, `TAVILY_API_KEY`.

`web.search` возвращает `results[]` (`title`, `url`, `host`, `snippet`, `score`, `text`), `attempts[]` с причиной отказа каждого провайдера и готовый `text` для `llm.extract`. Выдача дедуплицируется, реклама и трекинг-параметры отбрасываются, один домен не занимает больше двух мест. По умолчанию догружается текст первых трёх страниц — `fetchContent: false` отключает. Если сработал только резерв, в ответе будет `degraded: true` и `warning`.

Подключение необязательно, но без ключа поиск деградирует. Приватные адреса и localhost закрыты. Instagram/личные кабинеты этим шагом не открыть — для соцсетей коннектор **Social**.

Пример курса: `web.rates` → `telegram.send_message`. Пример справки: `web.fetch` → `llm.extract` → `telegram.send_message`.

### Browser (Playwright)

Страницы, где нужен JavaScript (SPA, часть P2P). Не замена Social и не парк аккаунтов.

- `browser.open` — `url`, опционально `waitFor` (селектор), `waitUntil`, `actions` (`click` / `fill` / `press` / `wait`), `timeoutMs`
- Chromium: `npx playwright install chromium`. Процесс **worker**, не API.
- Cookies: поле `storageState` в подключении (JSON Playwright). Частные URL — `allowPrivate=true`.

### Social (VK / Instagram / LinkedIn)

Официальные API, не `web.fetch`. Токены — в карточке коннектора или в `.env`.

- `social.followers` — пачка профилей (URL, `@username` + сеть, или Excel с колонками VK/Instagram/LinkedIn). Текст отчёта: `ВК 10000\nИнстаграм 2500\nЛинкдин 800`
- `social.reels` — ролики аккаунтов. `minViews` / `minLikes`, `sinceHours`, `newOnly` (уже виденные URL в memory). До 120 аккаунтов за шаг

Ограничения:

- **VK** — `users.get` / `groups.getById` (подписчики), короткие `video.get` как рилсы
- **Instagram** — Graph Business Discovery: подписчики и медиа бизнес-аккаунтов. Просмотры чужих Reels Graph не отдаёт — лайки как оценка, либо HTTP-провайдер (`{base}/followers`, `{base}/reels`)
- **LinkedIn** — только страницы компаний (`linkedin.com/company/...` или `company:ID`). Личные профили API не считает

Цепочка утреннего отчёта: `social.followers` → `telegram.send_message`. Рилсы: `excel.read_rows` → `social.reels` → `llm.generate` (контекст) → `telegram.send_message`.

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
libs/connectors   Mail, Telegram, OneC, Excel, Web, Browser, LLM, Transform, Memory, Social
libs/workflow     разбор текста в шаги и sequential engine
libs/data-access  Prisma + шифрование credentials
infra/docker      PostgreSQL
```

## Пример workflow

1. Проверить новые письма с заявками (`mail.fetch_new`)
2. Добавить строку в Excel для **каждого** письма (`excel.append_row`, iterate)
3. Отправить уведомление в Telegram (`telegram.send_message`, iterate)

Результат предыдущего шага передаётся в следующий. В параметрах можно использовать `{{previous}}`, `{{item}}`, `{{input}}` и `{{steps.1}}`.
