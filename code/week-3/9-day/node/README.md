# День 9 • Fallback и HITL — примеры на LangGraph (Node.js)

Практические примеры по теме **лучшие практики AI-агентов**: fallback-механизмы и Human in The Loop (HITL). Каждый пример — отдельный проект в своей папке.

## 📚 Структура проекта

В папке **9-day/node** — **5 независимых примеров**:

### 1. `1-fallback-example` — Пример Fallback

**Демонстрация fallback-механизмов**: намеренное создание ошибок, retry, кэшированные и альтернативные ответы.

**Что изучаем:**
- Намеренное создание ошибок для тестирования
- Retry-логика
- Кэшированные fallback-ответы
- Альтернативная локальная обработка
- Восстановление через API

**Запуск:**
```bash
cd 1-fallback-example
npm install
node index.js
# или с аргументом: node index.js "Ваш запрос"
```

### 2. `2-integrated-fallback` — Интегрированный Fallback

**Каскадные fallback-механизмы** с тремя уровнями: кэш → альтернативная модель → локальная обработка.

**Что изучаем:**
- Интеграция fallback в основной граф
- Каскадные уровни fallback (Level 1–3)
- Контекстные советы по домену
- Выбор стратегии по типу ошибки

**Запуск:**
```bash
cd 2-integrated-fallback
npm install
node index.js
# или: node index.js "Что такое машинное обучение?"
```

### 3. `3-hitl` — Human in The Loop

**Паттерн HITL**: после ответа LLM человек выбирает — принять результат, отменить (извинения) или повторить с более мощной моделью.

**Что изучаем:**
- Узел HITL с интерактивным вводом (readline)
- Решения человека: продолжить / отменить / повторить
- Переход на улучшенную модель при повторе
- Переменная `HITL_AUTO_ACCEPT` для неинтерактивного режима

**Запуск:**
```bash
cd 3-hitl
npm install
node index.js "Ваш запрос здесь"
# Без интерактива (CI/скрипты): HITL_AUTO_ACCEPT=continue node index.js "Запрос"
```

### 4. `4-deep-agents` — Deep Agents (планирование, инструменты, HITL)

**Демонстрация [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview)** (библиотека `deepagents`): встроенное планирование, пользовательские инструменты и Human-in-the-Loop для подтверждения чувствительных вызовов.

**Что изучаем:**
- Создание агента через `createDeepAgent` (инструменты, системный промпт)
- Инструменты с описанием и схемой (`tool` + `zod`)
- HITL: `interruptOn` для выбранного инструмента, checkpointer, обработка `__interrupt__` и возобновление через `Command({ resume: { decisions } })`
- Режим без интерактива: `DEEP_AGENTS_AUTO_APPROVE=1`

**Запуск:**
```bash
cd 4-deep-agents
npm install
node index.js "Какая погода в Москве?"
node index.js "Отправь уведомление Васе: встреча в 15:00"
# Без интерактива: DEEP_AGENTS_AUTO_APPROVE=1 node index.js "Запрос"
```

### 5. `5-deep-agents-with-subagents` — Deep Agents + subagents + memory/store

Расширенное демо Deep Agents: **subagents** (делегирование через встроенный tool `task`), **MemorySaver** (память на уровне `thread_id`), а также **Store + CompositeBackend** (разделение «виртуальных файлов» и зоны `/memories/`).

**Что изучаем:**
- Делегирование в изолированный субагент (`math-assistant`) и вызов его tool через `task`
- Память диалога (`MemorySaver`, `thread_id`) и мульти-тёрн сценарии
- Маршрутизация файлового бэкенда (`CompositeBackend`): обычные файлы отдельно от `/memories/`

**Запуск:**
```bash
cd 5-deep-agents-with-subagents
npm install
npm start
# или: npm run query -- "Ваш запрос"
```

## 🚀 Быстрый старт

### Требования

- Node.js 18+ (с поддержкой ES modules) для примеров `1–4`
- Node.js 20+ для `5-deep-agents-with-subagents` (зависимость `langchain` требует Node 20)
- API ключ OpenAI-совместимого провайдера (в примерах используется bothub.chat)

### Установка

Зависимости ставятся **в папке каждого примера**:

```bash
cd 1-fallback-example   # или 2-integrated-fallback / 3-hitl / 4-deep-agents
npm install
# при конфликте peer-зависимостей: npm install --legacy-peer-deps
```

Файл **.env** можно положить в корень `node` (`code/week-3/9-day/node/.env`) или в папку конкретного примера (смотрите `.env.example` рядом с проектом).

Важно:
- **Никогда не коммитьте** `.env` в git (там секреты)
- Если у вас уже попадал реальный ключ в репозиторий, его нужно **отозвать/перевыпустить** у провайдера

```
OPENAI_API_KEY=your_api_key_here
```

Для `5-deep-agents-with-subagents` используются **свои** переменные окружения (см. `5-deep-agents-with-subagents/.env.example`), например:

```env
POLZA_AI_API_KEY=...
POLZA_MODEL=openai/gpt-5.5
POLZA_BASE_URL=https://polza.ai/api/v1
```

### Запуск примеров

```bash
# Fallback-пример
cd 1-fallback-example && node index.js

# Интегрированный fallback
cd 2-integrated-fallback && node index.js "Что такое машинное обучение?"

# HITL (обязателен аргумент — текст запроса)
cd 3-hitl && node index.js "Что такое LangGraph?"

# Deep Agents (инструменты + HITL)
cd 4-deep-agents && node index.js "Какая погода в Москве?"
```

## 📦 Зависимости

В примерах используются:

- `@langchain/langgraph` — графы состояний (1–3), checkpointer и Command для HITL (4)
- `@langchain/openai` — ChatOpenAI (OpenAI-совместимый API)
- `@langchain/core` — промпты, сообщения, tool для инструментов (4-deep-agents)
- `deepagents` — только в 4-deep-agents (createDeepAgent)
- `zod` — схемы состояния
- `dotenv` — переменные окружения

Дополнительно для `5-deep-agents-with-subagents`:
- `langchain` — требуется самим deepagents (Node.js 20+)
- `@langchain/anthropic` — установлен как зависимость, потому что `deepagents` импортирует его в сборке (ключ Anthropic не нужен, если вы используете OpenAI-совместимый провайдер)

В 1-fallback-example и 2-integrated-fallback в коде могут быть ссылки на Perplexity; для работы достаточно OpenAI-совместимого API и `OPENAI_API_KEY`. В 3-hitl используется ChatOpenAI и bothub.chat. В `5-deep-agents-with-subagents` подключение сделано через OpenAI-совместимую конфигурацию к Polza.ai (переменные `POLZA_*`).

## 🎯 Паттерны

### Каскадный Fallback (1, 2)

```
Main → Ошибка → Retry → Fallback Level 1 (кэш) → Level 2 (другая модель) → Level 3 (локальный ответ) → END
```

### Human in The Loop (3, 4)

- **3-hitl**: собственный граф LangGraph, узел HITL с readline, переходы по решению человека.
- **4-deep-agents**: встроенный HITL через `interruptOn` и checkpointer, возобновление через `Command`.

## 📝 Структура каждого примера

- `index.js` — основной код графа
- `package.json` / `package-lock.json` — зависимости
- В `1-fallback-example`, `2-integrated-fallback`, `3-hitl`, `4-deep-agents` и `5-deep-agents-with-subagents` есть свой `README.md` с деталями.

## 🔍 Отладка

- `console.log` в узлах
- LangSmith (в 3-hitl при включённом LANGCHAIN_TRACING_V2)
- Проверка состояния между узлами

## 📚 Связанные материалы

- Базовые графы (basic, conditional, advanced) — в `code/week-3/8-day/node`
- Презентация и задачи по теме дня — в `source/week-3/9 - Лучшие практики AI-агентов, HITL, fallback` и `activities/week-3/9-day`
