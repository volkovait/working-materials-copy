# LangChain AI Agent (Node.js, CLI)

Небольшой демонстрационный проект: **консольный AI‑агент** на LangChain, который отвечает в **пиратском стиле** и умеет вызывать набор инструментов (tools).

## Что умеет агент

- **Обычные вопросы**: отвечает сам (в пиратской манере).
- **Дата**: на вопросы вроде «какое сегодня число» агент **обязан** вызывать tool `getCurrentDate` и возвращать его ответ **дословно**.
- **Истории**: на запросы «придумай/создай/сочини байку/сказку/историю» агент **обязан** вызывать tool `createPirateStory` (с сохранением в файл).
- **Поиск**: tool `perplexitySearch` делает запрос в интернет через **Perplexity‑подобную модель** (фактически через BotHub OpenAI‑совместимый API).

## Структура проекта

```
langChainAiAgent/
  main.js                 # точка входа CLI
  package.json            # зависимости и команды
  .env.example            # пример переменных окружения
  src/
    agent.js              # сборка LangChain-агента + systemPrompt + tools
    tools/
      index.js            # реэкспорт всех tools
      getCurrentDate.js   # tool: текущая дата (пиратский формат)
      createPirateStory.js# tool: история + сохранение в src/stories/*.txt
      perplexitySearch.js # tool: web search через BotHub endpoint
    stories/              # сюда сохраняются истории (создаётся автоматически)
```

## Требования

- **Node.js**: рекомендую **Node 20+**.
  - В проекте используется `process.loadEnvFile(...)` (Node 20+) и глобальный `fetch` (Node 18+).
- **npm**: идёт вместе с Node.js.

## Установка

Из папки проекта:

```bash
npm install
```

## Настройка окружения (.env)

1) Создай `.env` рядом с `main.js`:

```bash
cp .env.example .env
```

Если ты в Windows без bash:

- PowerShell:

```powershell
Copy-Item .env.example .env
```

- cmd:

```bat
copy .env.example .env
```

2) Заполни переменные:

- **`OPENAI_API_KEY`**: API‑ключ провайдера, который принимает OpenAI‑совместимые запросы.
  - Сейчас этот ключ используется и для модели агента (ChatOpenAI), и для tool `perplexitySearch` (запросы уходят на `bothub.chat`).
- **`BASE_URL`**: базовый URL OpenAI‑совместимого API для **основной модели** агента.
  - Пример: `https://api.openai.com/v1` (если используешь OpenAI)
  - Пример: `https://bothub.chat/api/v2/openai/v1` (если используешь BotHub)

Пример `.env`:

```env
OPENAI_API_KEY=ваш_ключ
BASE_URL=https://bothub.chat/api/v2/openai/v1
```

Важно: файл `.env` находится в `.gitignore` и в репозиторий не попадает.

## Запуск

### Запуск один раз (npm start)

Команда ждёт **вопрос одной строкой** третьим аргументом процесса:

```bash
npm start -- "Сочини короткую пиратскую байку про компас"
```

### Режим разработки (npm run dev)

Запуск с `--watch` (перезапускает `main.js` при изменениях):

```bash
npm run dev -- "Какая сегодня дата?"
```

Альтернатива без npm (напрямую через Node):

```bash
node main.js "Какая сегодня дата?"
```

Если ничего не выводится — проверь:

- передан ли вопрос аргументом
- заполнен ли `OPENAI_API_KEY` в `.env`

## Команды npm

Смотри `package.json`:

- **`npm start`**: `node main.js`
- **`npm run dev`**: `node --watch main.js`

## Какие пакеты используются и зачем

Зависимости из `package.json`:

- **`langchain`**
  - Даёт `createAgent(...)` и обвязку вокруг модели + tools.
- **`@langchain/openai`**
  - Провайдер для OpenAI‑совместимых чат‑моделей: используется `ChatOpenAI`.
  - В `src/agent.js` задаётся `baseURL` (для OpenAI‑compatible эндпоинтов) и `apiKey`.
- **`@langchain/core`**
  - Ядро LangChain, в том числе helper `tool(...)` для объявления инструментов.
- **`zod`**
  - Описывает входные параметры tool’ов (schema) и помогает агенту понимать, что передавать в tool.

## Как работает запуск (коротко, по шагам)

1) `main.js` загружает `.env` через `process.loadEnvFile(...)`.
2) Берёт `OPENAI_API_KEY` и `BASE_URL` из окружения.
3) Создаёт агента через `createNewAgent(OPENAI_API_KEY, BASE_URL)` из `src/agent.js`.
4) Передаёт агенту сообщение пользователя (из аргумента командной строки).
5) Печатает последний ответ в консоль.

## Tools (инструменты)

Все tools лежат в `src/tools/` и подключаются в `src/agent.js`.

### `getCurrentDate`

- **Вход**: без параметров
- **Выход**: строка в пиратском стиле + текущая дата \(YYYY-MM-DD\)

### `createPirateStory`

- **Вход**:
  - `kind`: `байка | сказка | история` (опционально)
  - `prompt`: тема (опционально)
  - `length`: `short | medium | long` (опционально)
- **Выход**: строка + полный текст истории
- **Побочный эффект**: сохраняет `.txt` файл в `src/stories/` (папка создаётся автоматически)

### `perplexitySearch`

- **Вход**:
  - `query`: поисковый запрос (строка)
- **Выход**: строка `Результат поиска: ...`
- **Реализация**: HTTP POST на `https://bothub.chat/api/v2/openai/v1/chat/completions` с моделью `sonar-pro`.

## Как добавить новый tool

1) Создай файл `src/tools/myTool.js` по образцу `getCurrentDate.js`:
   - объявление через `tool(async (input) => ..., { name, description, schema })`
   - экспорт через `module.exports = myTool`
2) Добавь экспорт в `src/tools/index.js`:
   - `const myTool = require('./myTool')`
   - `module.exports = { ..., myTool }`
3) Подключи tool в `src/agent.js`:
   - импортни из `./tools`
   - добавь в массив `tools`
4) (Опционально) Добавь правило в `systemPrompt`, когда агент обязан вызывать этот tool.

## Частые проблемы

- **Не выводит ответ**: `main.js` просто делает `return`, если нет вопроса или `OPENAI_API_KEY`.
- **401/403 от API**: неверный `OPENAI_API_KEY` или провайдер/`BASE_URL` не совпадают.
- **Node ниже 20**: `process.loadEnvFile` может отсутствовать. Обнови Node до 20+.