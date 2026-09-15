# Деплой на DigitalOcean

Один Droplet: Caddy (SPA + `/api`) + Nest + worker + Postgres. Браузер ходит на тот же домен — `VITE_API_URL` не нужен.

```
браузер ──► :80/:443 Caddy
               ├── /        apps/web
               └── /api  →  api:3000 ──enqueue──► Postgres
                                            ▲
                                         worker
```

Droplet **2 GB минимум**, лучше **4 GB** (Chromium). Диск — от **20 ГБ**: образы API и worker делят базовый слой Playwright. Firewall: 22, 80, 443. Postgres наружу не открывать.

`ENCRYPTION_KEY` не менять после первого запуска — иначе подключения не расшифруются. Один replica API.

## 1. Droplet

Ubuntu 24.04, Docker + Compose plugin. A-запись домена на IP (если есть домен).

```bash
git clone <repo> && cd ai-worker
cp .env.example .env
```

В `.env` минимум:

```
POSTGRES_PASSWORD=...
ENCRYPTION_KEY=...          # длинная случайная строка, сохранить
API_PASSWORD=...
CADDY_SITE=your.domain      # HTTPS; или http://:80 если только IP
PUBLIC_API_URL=https://your.domain/api
GEMINI_API_KEY=...          # или QWEN_API_KEY
```

Все переменные из `.env.example` прокидываются в **api** и **worker** через `infra/docker/docker-compose.prod.yml` (`x-app-env`). `DATABASE_URL` внутри сети Docker переписывается на `postgres:5432`.

```bash
npm run prod:up
```

то же самое:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml up -d --build
```

Логи: `docker compose --env-file .env -f infra/docker/docker-compose.prod.yml logs -f`

## 2. Образы

| Сервис | Dockerfile |
|---|---|
| web | `infra/docker/Dockerfile.web` — сборка SPA + Caddy |
| api | `infra/docker/Dockerfile.api` — Nest, `prisma migrate deploy` при старте, Playwright Chromium, ffmpeg |
| worker | `infra/docker/Dockerfile.worker` — Playwright Chromium, ffmpeg |

API и worker собираются на одном образе `mcr.microsoft.com/playwright:v1.62.1-noble`, поэтому базовый слой (≈2,8 ГБ) на диске один. Версия тега обязана совпадать с `playwright` в `package-lock.json`, иначе Chromium в образе окажется другой ревизии и браузерный поиск отвалится. Обоим сервисам задан `shm_size: 512mb` — на дефолтных 64 МБ Chromium падает. ffmpeg ставится отдельным пакетом: он перекодирует WAV из Qwen TTS в OGG/Opus для голосовых Telegram.

Caddy: `/api*` → api, остальное → статика, `try_files` для SPA. Таймаут прокси 5 минут (LLM / browser).

## 3. Проверка

1. `http://IP` или `https://домен` → пароль (`API_PASSWORD`)
2. Коннекторы / demo workflow
3. Ручной run — нужен worker, иначе `pending`
4. Telegram webhook — только если `PUBLIC_API_URL` с `https://`
5. Подключение Web → «Проверить». В ответе указан сработавший источник

Если проверка Web падает или отвечает `wikipedia`, бесплатные поисковики режет анти-бот с адреса Droplet. Лечится ключом (`SERPER_API_KEY` дешевле всего) — он встаёт первым в очереди источников:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml logs -f worker | grep -i web
```

## Локально без Droplet

`npm run db:up` + `npm run dev` — Postgres на **5436**, UI на 4200, API на 3000.

Прод-стек на своей машине (нужен свободный :80):

```bash
CADDY_SITE=http://:80 PUBLIC_API_URL=http://localhost/api npm run prod:up
```
