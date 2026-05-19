# Nest server with Ollama

HTTP-сервис на **NestJS** (Node.js), который принимает JSON с полем `prompt` и проксирует запрос в локальный **[Ollama](https://ollama.com/)** (`/api/generate`). Эндпоинт **`POST /v1/completions`** — простой контракт для клиентов и учебных сценариев.

Ниже — **короткая шпаргалка**: как поднять LLM через Ollama и дать к ней **HTTP API** на базе этого репозитория (не Python/FastAPI, а **NestJS**).

---

## Минимальные требования к железу (ориентиры)

- **CPU**: 4 vCPU и больше
- **RAM**: 16 GB+ (лучше 32 GB, если планируете крупные модели)
- **Диск**: 80–200 GB SSD (вес моделей заметный)
- **GPU (опционально, но сильно ускоряет)**:
  - порядка **16 GB VRAM** (например, Tesla T4) — комфортно для 7B–14B во многих квантизациях

> Практический ориентир: если не уверены — начните с **`qwen3:14b`** или **`gemma3:9b`** в зависимости от доступной памяти и GPU.

---

## Подготовка Ubuntu: обновление

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg git
```

---

## Установка Docker (удобно для продакшена и изоляции)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker "$USER"
```

Перелогиньтесь в сессию, чтобы группа `docker` применилась.

---

## Установка Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Доступ к Ollama по сети (опционально)

По умолчанию Ollama слушает **localhost**. Если Nest (или контейнер с Nest) работает **на другом хосте** или в Docker **без** host-сети, а Ollama на машине с GPU — может понадобиться слушать все интерфейсы:

```bash
sudo systemctl edit ollama.service
```

Добавьте:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
```

Перезапуск:

```bash
sudo systemctl restart ollama
```

Проверка:

```bash
curl -s http://127.0.0.1:11434/api/tags | head
```

### Безопасность

- **Не выставляйте Ollama в интернет без защиты**: при `OLLAMA_HOST=0.0.0.0` ограничьте доступ фаерволом или сетевыми политиками.
- **Наружу разумно публиковать только ваш API** (порт Nest, по умолчанию `3000`), а порт Ollama (`11434`) оставить на localhost или внутренней сети.

Пример с UFW:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
sudo ufw status
```

---

## Загрузка модели в Ollama

```bash
ollama pull qwen3:14b
# или при более скромном железе
ollama pull gemma3:9b
```

Каталог моделей: [ollama.com/library](https://ollama.com/library)

Имя модели в **`MODEL_NAME`** в `.env` должно **совпадать** с тем, что вы подтянули (`ollama list`).

---

## Этот проект: локальный запуск

Требования:

- **Node.js** (LTS; в проекте используются типы под современный Node, см. `package.json`).
- **npm**
- Запущенный **Ollama** и скачанная модель.

```bash
npm install
cp .env.example .env
# Заполните OLLAMA_URL, MODEL_NAME (и при необходимости PORT)
```

`OLLAMA_URL` обычно: `http://127.0.0.1:11434/api/generate`

Разработка (подхват `.env` через флаг Nest CLI):

```bash
npm run start:dev
```

| Команда | Назначение |
|--------|------------|
| `npm run build` | Сборка в `dist/` |
| `npm run start` | Запуск без watch |
| `npm run start:debug` | Отладка + watch |
| `npm run start:prod` | `node` с `--env-file .env` (см. `package.json`) |

Порт HTTP по умолчанию: **`3000`**, если в `.env` не задан `PORT`.

---

## Запуск HTTP API в Docker (образ из репозитория)

В корне проекта есть **`Dockerfile`**: multi-step сборка не используется, образ ставит зависимости через **`npm ci`**, собирает Nest и стартует `node dist/main.js`.

Сборка:

```bash
docker build -t nest-server-with-ollama .
```

Запуск с переменными окружения (рекомендуется не класть секреты в образ):

```bash
docker run --rm \
  -p 3000:3000 \
  -e OLLAMA_URL="http://host.docker.internal:11434/api/generate" \
  -e MODEL_NAME="qwen3:14b" \
  nest-server-with-ollama
```

Замечания по сети:

- **Docker Desktop (Windows/macOS)**: к сервисам на хосте из контейнера часто обращаются через `host.docker.internal` (как в примере выше для `OLLAMA_URL`).
- **Linux**: `host.docker.internal` может быть недоступен по умолчанию; варианты — **`--network=host`** для контейнера (тогда `OLLAMA_URL=http://127.0.0.1:11434/api/generate`), либо настройка `extra_hosts`, либо доступность Ollama по IP хоста в bridge-сети.
- Если Ollama слушает только **127.0.0.1** на хосте, а контейнер в **bridge**-сети, запросы на `127.0.0.1` из контейнера попадут **в сам контейнер**, а не на хост. Тогда используйте **host network (Linux)** или **`OLLAMA_HOST=0.0.0.0`** у Ollama + ограничение фаерволом.

Альтернатива — передать файл окружения:

```bash
docker run --rm -p 3000:3000 --env-file .env nest-server-with-ollama
```

(убедитесь, что в `.env` указан URL, достижимый **изнутри контейнера**, а не только с вашей машины вне Docker.)

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|--------------|----------|
| `OLLAMA_URL` | да | Полный URL генерации Ollama, например `http://127.0.0.1:11434/api/generate` |
| `MODEL_NAME` | да | Имя модели (`ollama list`) |
| `PORT` | нет | Порт Nest (по умолчанию `3000`) |

`ConfigModule` глобальный; `OllamaService` использует `ConfigService.getOrThrow()` для `OLLAMA_URL` и `MODEL_NAME`.

---

## HTTP API

### `POST /v1/completions`

Тело валидируется DTO; в Ollama уходит JSON: `model` (из env), `prompt` (из тела), `stream: false`.

**Заголовок:** `Content-Type: application/json`

**Тело:**

```json
{
  "prompt": "Ваш текст запроса к модели"
}
```

**Ответ:** JSON от Ollama (как вернёт `fetch` → `response.json()`).

**Пример:**

```bash
curl -s -X POST http://localhost:3000/v1/completions \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Привет, ответь одним предложением.\"}"
```

Отдельного маршрута **`/health`** в проекте нет; быстрая проверка инфраструктуры Ollama на хосте:

```bash
curl -s http://127.0.0.1:11434/api/tags | head
```

---

## Валидация и DTO

- **`CompletionRequestDto`** — `src/ollama/dto/create-ollama.dto.ts` (`prompt`: строка, не пустая).
- В **`main.ts`** — глобальный **`ValidationPipe`** (`whitelist`, `forbidNonWhitelisted`, `transform`).

---

## Структура проекта

```
src/
├── main.ts
├── app.module.ts
└── ollama/
    ├── ollama.module.ts
    ├── ollama.controller.ts
    ├── ollama.service.ts
    └── dto/
        └── create-ollama.dto.ts
```

---

## Частые проблемы

- **Ollama не отвечает**: `sudo systemctl status ollama`, проверка порта `11434`.
- **`Connection refused` из Docker к Ollama**: контейнер не видит `localhost` хоста — см. раздел про Docker и сеть (`host.docker.internal`, `--network=host`, или `OLLAMA_HOST=0.0.0.0` у Ollama с фаерволом).
- **Модель не найдена**: `MODEL_NAME` в `.env` должен совпадать с `ollama pull ...`.
- **Медленная генерация**: меньшая модель/квант; проверка использования GPU (драйверы, `ollama ps` и т.д.).

---

## Что улучшить дальше

- Авторизация (API key) на уровне Nest или reverse proxy (Nginx, Traefik)
- Логи и метрики (Prometheus, OpenTelemetry)
- Кеширование повторяющихся запросов
- Расширение API под OpenAI-совместимые сценарии (chat, embeddings) при необходимости

---

## Стек

- NestJS 11, `@nestjs/config`
- `class-validator` / `class-transformer`