# Деплой на DigitalOcean

Один Droplet: Caddy (SPA + `/api`) + Nest + worker + Postgres. Браузер ходит на тот же домен — `VITE_API_URL` не нужен.

```
браузер ──► :80/:443 Caddy
               ├── /        apps/web
               └── /api  →  api:3000 ──enqueue──► Postgres
                                            ▲
                                         worker
```

Droplet **2 GB минимум**, лучше **4 GB** (Chromium). Firewall: 22, 80, 443. Postgres наружу не открывать.

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
GEMINI_API_KEY=...          # или OPENAI_API_KEY
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
| api | `infra/docker/Dockerfile.api` — Nest, `prisma migrate deploy` при старте |
| worker | `infra/docker/Dockerfile.worker` — Playwright Chromium |

Caddy: `/api*` → api, остальное → статика, `try_files` для SPA. Таймаут прокси 5 минут (LLM / browser).

## 3. Проверка

1. `http://IP` или `https://домен` → пароль (`API_PASSWORD`)
2. Коннекторы / demo workflow
3. Ручной run — нужен worker, иначе `pending`
4. Telegram webhook — только если `PUBLIC_API_URL` с `https://`

## Локально без Droplet

`npm run db:up` + `npm run dev` — Postgres на **5436**, UI на 4200, API на 3000.

Прод-стек на своей машине (нужен свободный :80):

```bash
CADDY_SITE=http://:80 PUBLIC_API_URL=http://localhost/api npm run prod:up
```
