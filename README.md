# AI Worker

MVP: пользователь описывает задачу текстом, система собирает последовательность шагов и выполняет их через отдельные коннекторы (Mail, Telegram, 1С, Excel).

Новый сервис добавляется как модуль в `libs/connectors` и регистрируется в registry. Ядро workflow (`libs/workflow`) и API не нужно переписывать.

## Стек

- NX-монорепа
- Frontend: React, React Router, Jotai (`apps/web`)
- Backend: NestJS (`apps/api`)
- PostgreSQL 16 в Docker
- Prisma в `libs/data-access`

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npx nx serve api
npx nx serve web
# или: npx nx dev web
```

PostgreSQL в Docker слушает **localhost:5436** (внутри контейнера 5432), чтобы не пересечься с другими локальными Postgres.

UI: [http://localhost:4200](http://localhost:4200)  
API: [http://localhost:3000/api](http://localhost:3000/api)

## Как пользоваться

1. Откройте **Коннекторы** и подключите аккаунты.
2. В **Workflows** откройте пример «Заявки из почты → 1С / Excel / Telegram» или создайте свой.
3. Напишите задачу текстом и нажмите **Составить шаги**.
4. Поправьте шаги при необходимости и нажмите **Запустить**.
5. На экране запуска видны статусы, результат или ошибка каждого шага.

Запуск только ручной: workflow не стартует по расписанию и не слушает входящие письма сам.

## Подключение сервисов

### Mail (IMAP)

Для Gmail включите IMAP и создайте [пароль приложения](https://support.google.com/accounts/answer/185833):

- хост: `imap.gmail.com`
- порт: `993`
- TLS: `true`
- логин: ваш email
- пароль: пароль приложения, не обычный пароль Google

### Telegram

1. Создайте бота через [@BotFather](https://t.me/BotFather) и скопируйте токен.
2. Напишите боту любое сообщение.
3. Chat ID можно взять у [@userinfobot](https://t.me/userinfobot) или из `getUpdates`.

### 1С

Нужна опубликованная база с HTTP-сервисом или OData.

- `baseUrl`: URL публикации, например `https://host/base/odata/standard.odata`
- логин и пароль пользователя 1С
- `resource`: имя ресурса, например `Catalog_Контрагенты`

Без опубликованного endpoint шаг 1С завершится ошибкой — это ожидаемо.

### Excel (ссылка / Google Drive / Яндекс Диск)

Локальные файлы не используются. На странице **Коннекторы** можно:

- вставить **прямую ссылку** на документ (Google Таблица, публичный файл Яндекс Диска или `.xlsx`);
- или подключить **Яндекс Диск / Google Drive** по OAuth и искать файл по имени.

Шаги workflow:

- `excel.find_file` — открыть по `fileUrl` или найти `.xlsx` по названию
- `excel.read_rows` / `excel.append_row` — прочитать или дописать строки

Запись по публичной ссылке возможна, только если Диск подключён токеном. Чтение по открытой ссылке работает без токена.

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
  connections/    фича: controller + service + dto + persistence
  workflows/      фича: controller + service + dto + persistence
  runs/           фича: controller + service + persistence
  connectors/     каталог коннекторов
  health/
libs/connectors   Mail, Telegram, OneC, Excel
libs/workflow     разбор текста в шаги и sequential engine
libs/data-access  Prisma + шифрование credentials
infra/docker      PostgreSQL
```

## Пример workflow

1. Проверить новые письма с заявками (`mail.fetch_new`)
2. Создать запись в 1С (`onec.create_record`)
3. Добавить строку в Excel (`excel.append_row`)
4. Отправить уведомление в Telegram (`telegram.send_message`)

Результат предыдущего шага передаётся в следующий. В параметрах можно использовать `{{previous}}` и `{{previous.name}}`.
