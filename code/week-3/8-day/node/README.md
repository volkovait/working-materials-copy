# LangGraph Examples - Коллекция примеров работы с LangGraph

Коллекция практических примеров использования LangGraph для построения AI-приложений с графами состояний, условной логикой и продвинутой обработкой запросов.

> Примеры по теме **fallback** и **HITL (Human in The Loop)** находятся в папке `code/week-3/9-day/node` (1-fallback-example, 2-integrated-fallback, 3-hitl).

## 📚 Структура проекта

В этой папке (**8-day/node**) — **3 независимых примера**:

### 1. `1-basic-graph` - Базовый граф
**Простой пример** создания графа с одним узлом обработки запросов через OpenAI-совместимый API (например, bothub.chat).

**Что изучаем:**
- Создание базового StateGraph
- Определение схемы состояния с Zod
- Работа с ChatOpenAI (OpenAI-совместимый endpoint)
- Обработка ошибок

**Запуск:**
```bash
cd 1-basic-graph
node index.js
```

### 2. `2-conditional-graph` - Условный граф
**Условная логика** с разными стратегиями обработки в зависимости от типа запроса.

**Что изучаем:**
- Условные переходы (`addConditionalEdges`)
- Классификация запросов
- Разные стратегии обработки (простая/сложная)
- Fallback механизм

**Запуск:**
```bash
cd 2-conditional-graph
node index.js
```

### 3. `3-advanced-graph` - Продвинутый граф
**Сложная архитектура** с анализом запросов, выбором стратегий, проверкой качества и retry логикой.

**Что изучаем:**
- Множественные узлы и сложная логика
- Анализ сложности и домена запросов
- Quality control
- Retry механизм
- Мониторинг метрик

**Запуск:**
```bash
cd 3-advanced-graph
node index.js
```

## 🚀 Быстрый старт

### Требования

- Node.js 18+ (с поддержкой ES modules)
- API ключ OpenAI-совместимого провайдера (в примерах используется bothub.chat)

### Установка

```bash
# Установка зависимостей в нужной папке примера
cd 1-basic-graph  # или 2-conditional-graph / 3-advanced-graph
npm install

# Файл .env создаётся в корне node (code/week-3/8-day/node/.env)
echo "OPENAI_API_KEY=your_api_key_here" > .env
```

### Запуск примеров

Каждый пример запускается из своей папки:

```bash
# Базовый граф
cd 1-basic-graph && node index.js

# Условный граф
cd 2-conditional-graph && node index.js

# Продвинутый граф
cd 3-advanced-graph && node index.js
```

## 📦 Зависимости

Проект использует следующие основные библиотеки:

- `@langchain/langgraph` — LangGraph для построения графов (оркестрация агентов)
- `@langchain/openai` — ChatOpenAI (OpenAI-совместимый API)
- `@langchain/core` — базовые компоненты LangChain
- `zod` — валидация схем состояния
- `dotenv` — управление переменными окружения

В примерах используется переменная окружения `OPENAI_API_KEY` и опционально OpenAI-совместимый baseURL (например, bothub.chat). При обновлении до новых мажорных версий LangGraph (1.x) сверяйтесь с [официальной документацией](https://docs.langchain.com/oss/javascript/langgraph/install): в новых версиях используется `StateSchema` и могут измениться сигнатуры методов.

## 🎯 Основные концепции

### StateGraph
Граф состояний, где каждый узел обрабатывает состояние и возвращает обновленное состояние.

### Узлы (Nodes)
Функции, которые обрабатывают состояние. Могут быть:
- **Синхронными** - простые преобразования
- **Асинхронными** - вызовы API, обработка данных

### Рёбра (Edges)
Связи между узлами:
- **Простые рёбра** (`addEdge`) - прямой переход
- **Условные рёбра** (`addConditionalEdges`) - переход на основе состояния

### Состояние (State)
Объект, который передаётся между узлами. Определяется через Zod-схему. В состоянии хранятся только «сырые» данные; форматирование под промпты делается внутри узлов.

### Graph API
В примерах используется **Graph API** LangGraph: граф задаётся узлами и рёбрами, состояние явно передаётся между узлами. Альтернатива — [Functional API](https://docs.langchain.com/oss/javascript/langgraph/choosing-apis): один entrypoint-функция с обычным потоком управления (if/else, циклы). Оба подхода используют один и тот же рантайм LangGraph.

## 🔄 Паттерны обработки

### 1. Линейная обработка
```
START → Node1 → Node2 → END
```

### 2. Условная обработка
```
START → Validate → Decide ──┬─→ SimpleProcessor
                              ├─→ ComplexProcessor
                              └─→ FallbackProcessor
```

### 3. Циклическая обработка
```
START → Process → QualityCheck ──┬─→ END (если OK)
                                  └─→ Retry → Process (если плохо)
```

### 4. Каскадный Fallback
```
Main → Fallback Level 1 → Fallback Level 2 → Fallback Level 3 → END
```

### 5. Human in The Loop
```
Process → HITL ──┬─→ Continue → END
                 ├─→ Cancel → Fallback → END
                 └─→ Retry → UpgradeModel → HITL
```

## 📊 Мониторинг и метрики

Примеры включают отслеживание:
- Время обработки
- Количество токенов
- Уверенность в ответе
- Качество ответа (1-10)
- Количество попыток retry
- Использование fallback

## 📝 Структура каждого примера

Каждый пример содержит:
- `index.js` - основной код графа
- `README.md` - подробная документация с пошаговым объяснением

## 🔍 Отладка

Для отладки используйте:
- `console.log` в узлах (уже добавлено)
- LangSmith трейсинг (при настройке LANGCHAIN_* переменных)
- Проверку состояния между узлами

## 📚 Дополнительные ресурсы

- [LangGraph — обзор](https://docs.langchain.com/oss/python/langgraph/overview) (Python/JS концепции)
- [LangGraph JS — установка](https://docs.langchain.com/oss/javascript/langgraph/install)
- [LangGraph JS — Quickstart](https://docs.langchain.com/oss/javascript/langgraph/quickstart)
- [Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph) — как проектировать агентов
- [Time-travel](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel) — отладка и повторное выполнение с чекпоинтов
- [Graph API vs Functional API](https://docs.langchain.com/oss/javascript/langgraph/choosing-apis)
- [LangGraph документация](https://langchain-ai.github.io/langgraph/)
- [LangChain документация](https://js.langchain.com/)

## 🤝 Вклад

Каждый пример является независимым проектом и может быть использован как основа для собственных разработок.
