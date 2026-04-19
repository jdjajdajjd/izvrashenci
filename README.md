# Dossier System

Telegram бот собирает анкеты → создаёт публичные страницы досье по `/{telegram_id}`.

## Архитектура

```
Telegram Bot (FSM) ─┐
                    ├─► Cloudflare Worker (bot + API)
Frontend (Next.js) ─┘        │
  Cloudflare Pages            ▼
                         Supabase
                     (PostgreSQL + Storage)
```

## Быстрый старт (от 0 до деплоя)

### 1. Supabase

1. Создать проект на [supabase.com](https://supabase.com)
2. В SQL Editor выполнить `supabase/schema.sql`
3. В Storage → Buckets создать bucket `avatars` (Public = true)
4. Сохранить:
   - Project URL → `SUPABASE_URL`
   - Service role key → `SUPABASE_KEY`

### 2. Telegram Bot

1. Создать бота через [@BotFather](https://t.me/BotFather)
2. Получить токен → `TELEGRAM_BOT_TOKEN`

### 3. Cloudflare

1. Зарегистрироваться на [cloudflare.com](https://cloudflare.com)
2. Получить Account ID (правый сайдбар в Dashboard)
3. Создать API Token:
   - `My Profile` → `API Tokens` → `Create Token`
   - Template: **Edit Cloudflare Workers** + добавить `Cloudflare Pages:Edit`
4. Сохранить токен → `CLOUDFLARE_API_TOKEN`

### 4. GitHub Secrets

В репозитории: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

| Secret | Значение |
|--------|----------|
| `CLOUDFLARE_API_TOKEN` | API токен Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID Cloudflare |
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_KEY` | Service role ключ Supabase |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота |
| `WORKER_URL` | URL задеплоенного Worker (после первого деплоя) |
| `PAGES_DOMAIN` | Домен Pages (например `dossier-frontend.pages.dev`) |

### 5. Первый деплой

```bash
git clone https://github.com/jdjajdajjd/izvrashenci
cd izvrashenci
git push origin main
```

GitHub Actions задеплоит Worker и Pages автоматически.

### 6. Регистрация Webhook

После деплоя Worker замените `<WORKER_URL>` и `<BOT_TOKEN>`:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WORKER_URL>/webhook"
```

Пример:
```bash
curl "https://api.telegram.org/bot123:ABC/setWebhook?url=https://dossier-worker.username.workers.dev/webhook"
```

### 7. Обновить WORKER_URL secret

После первого деплоя Worker:
1. Узнайте URL: `https://<name>.<subdomain>.workers.dev`
2. Добавьте в GitHub Secrets как `WORKER_URL`
3. Сделайте любой коммит в `frontend/` → Pages передеплоится с правильным URL

---

## Локальная разработка

### Worker

```bash
cd worker
npm install
# создать .dev.vars
cat > .dev.vars <<EOF
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
TELEGRAM_BOT_TOKEN=your-bot-token
PAGES_DOMAIN=localhost:3000
EOF
npm run dev
```

### Frontend

```bash
cd frontend
npm install
# создать .env.local
echo "NEXT_PUBLIC_WORKER_URL=http://localhost:8787" > .env.local
npm run dev
```

---

## API

### `POST /webhook`
Telegram webhook endpoint. Принимает Update объекты.

### `GET /api/dossier/:telegram_id`
Возвращает досье по Telegram ID.

```json
{
  "full_name": "Иванов Иван Иванович",
  "birth_date": "01.01.1990",
  "city": "Москва",
  "phone": "+7 900 000 00 00",
  "avatar_url": "https://..."
}
```

---

## FSM (бот)

```
/start
  └─► full_name
        └─► birth_date
              └─► city
                    └─► phone
                          └─► avatar (фото)
                                └─► done → ссылка на досье
```

Страница досье: `https://<pages-domain>/{telegram_id}`
"// deploy" 
