# Архитектура бэкенда

Текущее устройство как в коде. Модульный монолит: Nest-фичи + домен в Nx-библиотеках. Не onion и не глобальные слои на весь сервис.

Фронт (`apps/web`) пакеты `@ai-worker/*` не импортирует — только HTTP.

## Что это за система

Пользователь описывает задачу. Система собирает цепочку шагов (коннектор + action + params) и выполняет её.

Три разных куска продукта:

1. CRUD вокруг сценария (workflow, connections, triggers)
2. Рантайм шагов (engine + плагины-коннекторы), в отдельном процессе worker
3. LLM-планировщик (ask / plan), который только **собирает** workflow и сам шаги не исполняет

Точки входа в запуск: ручной run, webhook, расписание, опрос почты, опрос Telegram.

## Процессы

Два процесса Nest, одна PostgreSQL:

| Процесс | Точка входа | Что делает |
|---|---|---|
| API | `apps/api/src/main.ts` → `AppModule` | HTTP `/api`, CRUD, планировщик, тик триггеров, **enqueue** run |
| Worker | `apps/worker/src/main.ts` → `WorkerModule` | Без HTTP. Забирает `pending`/`stale running` из `Run`, вызывает `runWorkflow` |

Worker **не** импортирует `TriggersModule` — иначе был бы второй tick. Сборка: `npx nx serve api` и `npx nx serve worker` (webpack → `dist/apps/api` и `dist/apps/worker`).

В каждом процессе:

- PostgreSQL через Prisma (`libs/data-access`)
- секреты подключений: AES-256-GCM
- рантайм: `@ai-worker/workflow` + `@ai-worker/connectors` (Playwright живёт в worker, `externalDependencies: 'all'`)

Только в API:

- префикс `/api`, CORS, `ValidationPipe`
- опционально `API_PASSWORD` (`X-Api-Key` / `Authorization: Bearer`). Без пароля, если переменная пустая. Открыты `/health`, `/auth/status`, `/hooks/:token`
- триггеры: `setInterval` 20 с; `at` в явном поясе (`timezone` / `SCHEDULE_TZ`, по умолчанию `Europe/Moscow`), догон в тот же день

Auth multi-tenant нет. Двойной tick двух инстансов API гасится CAS на `Trigger.lastFiredAt`.

## Очередь Run

API `RunsService.start` / `retry` / тик триггера только создаёт строку `status=pending`. Execute в API нет.

Worker раз в ~1.5 с:

1. `SELECT … FROM "Run" WHERE cancelRequested = false AND (pending OR stale running) … FOR UPDATE SKIP LOCKED LIMIT 1`
2. `status=running`, `lockedBy`, `lockedAt`
3. `executeClaimed` → `runWorkflow`
4. heartbeat `lockedAt` каждые 15 с
5. финал: `success` / `error` / `cancelled`, замок сбрасывается

Stale lock (~120 с без heartbeat) — другой worker подхватывает. Resume: шаги со `success` (и `running` с уже записанным `output`) пропускаются. Исходящие шаги без output при resume **не** повторяются (telegram/mail/onec/excel/memory) — иначе двойная отправка.

Отмена: `POST /runs/:id/cancel` ставит `cancelRequested`. Если ещё `pending` — сразу `cancelled`. Если уже `running` — engine смотрит `shouldCancel`. `hasActive` не считает run с `cancelRequested`, чтобы утренний триггер не блокировался зависшим запуском.

Падение scheduled/mail/telegram run: worker шлёт в Telegram имя workflow и ошибку (если есть подключение telegram).

## Слои нарезки

**Вертикально (главное):** фичи Nest — `connectors`, `connections`, `workflows`, `agents`, `runs`, `triggers`, плюс тонкие `health` / `auth`.

**Горизонтально (внутри фичи):** controller → service → repository. Чужой `*Repository` не импортируют, только `*Service`.

**Рантайм отдельно от HTTP:** `@ai-worker/workflow` (`runWorkflow`) и `@ai-worker/connectors` не знают Nest. Исключение: `@ai-worker/data-access` содержит глобальный Nest-модуль Prisma.

Зависимости фич:

```
connectors (каталог)
    ├── connections (test + схема секретов)
    ├── workflows.parse (каталог действий)
    ├── agents (контекст для LLM)
    └── runs (execute шага в worker)

connections ──► runs (credentials), workflows (автопривязка единственного аккаунта)
workflows   ──► agents, runs, triggers
runs        ──► triggers (start), не наоборот в repository
```

```
                 /api                         worker (нет HTTP)
                   │                                │
              AppModule                        WorkerModule
   ┌──────┬───────┼───────┬──────┬────────┐         │
connectors connections workflows agents runs triggers   runs (claim+execute)
   │         │         │        │      │                  │
   ▼         ▼         ▼        ▼      ▼                  ▼
@ai-worker/ Prisma   @ai-worker/ @ai-worker/ @ai-worker/  тот же
connectors + crypto  workflow    agents      workflow     runWorkflow
                                │
                                └── local plan: planFromCatalog
```

После Plan/сохранения шагов: если у коннектора ровно одно `Connection` и `connectionId` пустой — подставляется автоматически.

## Данные (Prisma)

`libs/data-access/prisma/schema.prisma`

| Модель | Смысл |
|---|---|
| `Connection` | Аккаунт коннектора, `credentialsEnc`, status |
| `Workflow` | Сценарий: name, prompt |
| `WorkflowStep` | connectorId, action, params, connectionId, iterate, order |
| `Trigger` | webhook / schedule / mail / telegram, config, token, lastFiredAt |
| `Run` | Запуск-очередь: status, source, input, triggerId, lockedAt, lockedBy, cancelRequested |
| `RunStep` | Снимок шага на момент старта + status/input/output/error. `input` — уже интерполированные params |
| `WorkflowState` | KV на workflow (memory, offset Telegram, увиденные URL) |

Workflow каскадно удаляет steps, runs, triggers, state.

Источники run: `manual` \| `webhook` \| `schedule` \| `mail` \| `telegram` \| `retry`.

Статусы run: `pending` \| `running` \| `success` \| `error` \| `cancelled`.

## HTTP

Префикс `/api`. Guard смотрит `API_PASSWORD`, если задан.

| Модуль | Эндпоинты |
|---|---|
| health | `GET /health` |
| auth | `GET /auth/status` — `{ required }` |
| connectors | `GET /connectors` |
| connections | CRUD `/connections`, `POST /connections/:id/test` |
| workflows | CRUD `/workflows`, `POST /workflows/demo`, `POST /workflows/:id/parse`, `DELETE /workflows` |
| agents | `GET /agents`, `POST /agents/ask`, `POST /agents/plan` |
| runs | `POST /workflows/:id/runs`, `GET /runs/:id`, `POST /runs/:id/retry`, `POST /runs/:id/cancel` |
| triggers | CRUD на workflow, `POST /hooks/:token` |

## Библиотеки

### `@ai-worker/connectors`

Плагины: mail, telegram, onec, excel, web, browser (Playwright), llm, transform, memory, social. Реестр in-memory (`createDefaultRegistry`).

Контракт: `id`, каталог `actions` + `paramsSchema`, `credentialFields`, `testConnection`, `execute`. Интерполяция `{{previous}}`, `{{item}}`, `{{input}}`, `{{steps.N}}`. `iterate` разворачивает списки из `items` / `messages` / `rows` / `records` / `results`.

Новый сервис: модуль в `libs/connectors` + регистрация в registry. Ядро engine и контроллеры не обязаны меняться.

Browser: Chromium headless в процессе worker (`npx playwright install chromium`). Не для парка аккаунтов; cookies — необязательный `storageState`.

### `@ai-worker/workflow`

- `parsePromptToSteps` / `planFromCatalog` — эвристика по каталогу; LLM-plan в `@ai-worker/agents`
- starter demo «Письма → Excel → Telegram»
- `matchWhen` — условие шага после интерполяции (`=` / `!=` / `>` / `<` …)
- `runWorkflow` — шаги по `order`, порты:

```ts
getConnector(id)
getCredentials(connectionId, connectorId)
onStepUpdate(update)
shouldCancel?()
runtime?: { workflowId, getState, setState }
```

Поведение движка: интерполяция params до `execute` (и запись в `RunStep.input`); `when` и `skipIfEmpty`; таймаут шага (`timeoutMs`, иначе 180 с browser / 120 с остальные); отмена через `shouldCancel`; skip `success` при resume.

Движок **сейчас** импортирует `@ai-worker/connectors` (тип `TemplateContext`, `unwrapItems`, `interpolate`). Это не полный hex: порт execute есть, пакет плагинов всё ещё торчит в ядре рантайма.

Адаптер портов — `RunsService.execute` (вызывается из worker): Prisma, `ConnectorRegistryService`, `ConnectionsService.resolveCredentials`, `WorkflowStateRepository`.

### `@ai-worker/agents`

Провайдеры: Gemini (активный по умолчанию в list), OpenAI, local, orchestrator.

- `ask` — ответ с контекстом каталога / подключений / текущего workflow
- `plan` — `questions` или `workflow`; `sanitizePlan` оставляет только действия из каталога
- Nest `AgentsService` при `kind: workflow` пишет шаги через `WorkflowsService.update`, при `questions` — prompt. Execute не вызывает.

### `@ai-worker/data-access`

PrismaService + `encryptJson` / `decryptJson`. Не доменное ядро, а инфра.

## Потоки

**Собрать шаги.** `POST /workflows/:id/parse` или `POST /agents/plan` → строки `WorkflowStep` в Postgres (+ автопривязка единственного connection).

**Запустить.** `RunsService.start` создаёт `Run` + `RunStep` (`pending`). Worker claim → `runWorkflow`. Шаг: credentials → `connector.execute` → output в следующий шаг / iterate.

**Триггер.** Webhook по token. Tick в API: due по `everyMinutes` или `at` (HH:MM в поясе); не стартует, если у workflow уже есть активный run без отмены. Claim через compare-and-set `lastFiredAt`. Старт только enqueue.

**Память.** `WorkflowState` (коннектор memory, offset Telegram, дедуп URL). Не путать с `RunStep.output`.

## Сознательные ограничения

- Не onion на весь CRUD и не папки `domain/` / `application/` / `infrastructure/` на всё API.
- Не полноценные микросервисы: API и worker — два процесса одного монолита, одна БД, общий код фичи `runs`. Агенты остаются в процессе API.
- Не CQRS / event sourcing: run и так хранит статусы шагов; очередь — строки `Run`, не брокер.
- Nx-libs не шарятся с вебом; это упаковка рантайма и граница «не тащить Nest в engine».

Имеет смысл позже дожать, не меняя стиль:

1. workflow не импортирует connectors (свой порт + каталог без живого `Connector`)
2. явный список `connectorPlugins`
3. сборка портов `runWorkflow` вынести из `RunsService` в адаптер
4. сбор `AgentContext` и запись плана — отдельные функции, не смешивать с execute

---

## Почему нет портов на каждый CRUD

**Вопрос.** В hexagonal / onion для хранения обычно делают порт в «ядре»:

```ts
interface WorkflowRepository {
  findById(id: string): Promise<Workflow | null>;
  save(workflow: Workflow): Promise<void>;
}
```

Реализация с Prisma живёт снаружи и подключается через DI. Зачем тогда мы **не** вводим такой порт для workflow / connections / triggers, но оставляем порты у `runWorkflow`?

**Порт окупается, когда ядру всё равно, кто с другой стороны.** У движка так и есть: неважно, IMAP это или фейк в тесте. Ему нужен `execute`, credentials и куда писать статус шага. Реализаций может быть несколько (тот же engine + другой адаптер = worker). Prisma здесь — один из адаптеров, не сущность домена.

**CRUD workflow — это почти сама таблица.** `GET/PATCH /workflows/:id` не содержит инварианта вроде «run нельзя стартовать без шагов» как отдельную модель. Поля API ≈ Prisma. Порт `WorkflowRepository` в ядре дал бы:

- интерфейс с **одной** реализацией;
- маппинг Prisma-строка ↔ «доменная сущность», которая копирует те же поля;
- прыжки по файлам на каждый list/update.

Выигрыш (подмена БД, независимость от Postgres) здесь не нужен: одно хранилище, тонкие правила. Тесты и так бьют в service или в чистый `runWorkflow`, не в абстрактный CRUD-репозиторий ядра.

**Где порт уже есть — и этого достаточно.**

| Место | Порт | Почему да |
|---|---|---|
| `runWorkflow` | `getConnector`, `getCredentials`, `onStepUpdate`, `shouldCancel` | несколько адаптеров, I/O, ядро не должно знать Nest/Prisma |
| `Connector` | `execute` / `testConnection` | плагины: mail vs telegram vs browser |
| `AgentProvider` | `ask` / `plan` | Gemini vs OpenAI vs local |

| Место | Почему нет порта в «ядре» |
|---|---|
| `WorkflowsRepository` | один Postgres, поля = API |
| `ConnectionsRepository` | то же; шифрование — деталь service, не доменная сущность |
| `TriggersRepository` | то же |
| `RunsRepository.claimNext` | очередь в той же таблице `Run`; не брокер |

Nest-репозиторий в фиче (`workflows/persistence/workflows.repository.ts`) — это **не** порт ядра. Это удобная обёртка Prisma внутри модуля. Ядро (правила запуска) его не импортирует; импортирует `WorkflowsService` той же фичи.

Коротко: порт — за стабильное поведение с сменной инфрой. CRUD у нас и есть инфра. Тащить `WorkflowRepository` в «ядро» — onion ради галочки на экране, где домена почти нет.
