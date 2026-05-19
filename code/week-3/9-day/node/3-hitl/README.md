# hitl — Human in The Loop (HITL) паттерн

## Обзор
Учебный проект демонстрирует интеграцию паттерна **Human in The Loop (HITL)** в граф LangGraph. HITL позволяет человеку вмешиваться в процесс обработки запросов и принимать решения о дальнейших действиях после получения ответа от LLM. Проект расположен в `code/week-3/9-day/node/3-hitl`.

## Что такое Human in The Loop?

Human in The Loop - это паттерн проектирования, при котором человек может вмешиваться в автоматизированный процесс для принятия критических решений. В контексте LangGraph это означает:

- **Автоматическая обработка:** LLM обрабатывает запрос и генерирует ответ
- **Человеческое решение:** После обработки человек может:
  - Продолжить (принять результат)
  - Отменить (отправить извинения)
  - Повторить (использовать более мощную модель)

## Пошаговое выполнение кода

### Шаг 1: Импорты и инициализация (начало файла)
```javascript
import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import * as readline from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

process.env.LANGCHAIN_TRACING_V2 ??= "true";
process.env.LANGCHAIN_PROJECT ??= "default";
```

**Что происходит:**
- Импортируются компоненты LangGraph и LangChain
- Определяются `__dirname` для ES-модулей и загружаются переменные окружения из `../.env` (корень `code/week-3/9-day/node`)
- Включается трейсинг LangSmith (опционально)
- Импортируется `readline` для интерактивного ввода в узле HITL

### Шаг 2: Расширенное состояние с HITL полем
```javascript
const ConditionalGraphState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  queryType: z.string().default(""),
  confidence: z.number().default(0),
  error: z.string().nullable().default(null),
  retryCount: z.number().default(0),
  fallbackUsed: z.boolean().default(false),
  nextStep: z.string().default(""),
  humanDecision: z.enum(["continue", "cancel", "retry", "pending"]).default("pending"),
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Создается Zod схема состояния с расширенными полями
- **Ключевое поле HITL:** `humanDecision` - хранит решение человека:
  - `"continue"` - продолжить с текущим результатом
  - `"cancel"` - отменить и отправить извинения
  - `"retry"` - повторить с более мощной моделью
  - `"pending"` - ожидание решения (начальное состояние)

### Шаг 3: Узел HITL - запрос решения у человека
```javascript
async function humanInTheLoop(state) {
  console.log("\n🤝 === ТРЕБУЕТСЯ РЕШЕНИЕ ЧЕЛОВЕКА ===");
  console.log(`📝 Запрос: ${state.userQuery}`);
  console.log(`🤖 Ответ LLM:\n${state.response}`);
  console.log(`🎯 Уверенность: ${(state.confidence * 100).toFixed(1)}%`);
  console.log("\n🔹 Выберите действие:");
  console.log("1️⃣  Продолжить (результат устраивает)");
  console.log("2️⃣  Отменить (извиниться перед пользователем)");
  console.log("3️⃣  Повторить попытку (более мощная модель)");
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  return new Promise((resolve) => {
    rl.question("\n👉 Ваш выбор (1/2/3): ", (answer) => {
      rl.close();
      const decision = { "1": "continue", "2": "cancel", "3": "retry" }[answer.trim()] || "continue";
      console.log(`✅ Выбрано: ${decision}\n`);
      resolve({ ...state, humanDecision: decision, nextStep: decision });
    });
  });
}
```

**Что происходит:**
1. **Отображение информации:** Выводится запрос, ответ LLM и уровень уверенности
2. **Интерактивный ввод:** Используется `readline` для получения решения от человека
3. **Маппинг решения:** Ввод пользователя (1/2/3) преобразуется в значение enum
4. **Обновление состояния:** Состояние обновляется с решением человека и следующим шагом
5. **Асинхронность:** Функция возвращает Promise, так как ожидает ввода пользователя. В узле поддерживается переменная окружения `HITL_AUTO_ACCEPT` (значения `continue` или `1`): при её установке интерактивный ввод не запрашивается, автоматически выбирается «Продолжить» (удобно для CI/скриптов).

### Шаг 4: Валидация запроса
```javascript
async function validateQuery(state) {
  console.log("🔍 Валидация:", state.userQuery);
  const query = state.userQuery.toLowerCase();
  
  if (query.length < 50 && (query.includes("что такое") || query.includes("кто такой"))) {
    return { ...state, queryType: "simple", confidence: 0.9 };
  }
  if (query.length > 100 || query.includes("анализ") || query.includes("сравни")) {
    return { ...state, queryType: "complex", confidence: 0.7 };
  }
  if (query.includes("ошибка") || query.includes("проблема")) {
    return { ...state, queryType: "error", confidence: 0.5 };
  }
  
  return { ...state, queryType: "normal", confidence: 0.8 };
}
```

**Что происходит:**
- Анализируется запрос пользователя
- Определяется тип запроса (simple, complex, error, normal)
- Устанавливается уровень уверенности для каждого типа
- Результат используется для выбора стратегии обработки

### Шаг 5: Простой процессор
```javascript
async function processSimpleQuery(state) {
  console.log("⚡ Простая обработка");
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 300,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: "https://bothub.chat/api/v2/openai/v1" },
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай краткий ответ на русском. Максимум 2-3 предложения."],
    ["human", "{query}"]
  ]);
  
  try {
    const result = await prompt.pipe(model).withConfig({ tags: ["node:simple"] }).invoke({ query: state.userQuery });

    return {
      ...state,
      response: result.content,
      messages: [...state.messages, new HumanMessage(state.userQuery), new AIMessage(result.content)],
      confidence: 0.9,
      nextStep: "hitl", // После обработки идем к HITL
      metadata: { ...state.metadata, node: "simple_processor" }
    };
  } catch (error) {
    return { ...state, error: error.message, confidence: 0.1, nextStep: "hitl" };
  }
}
```

**Что происходит:**
1. **Создание модели:** Инициализируется ChatOpenAI (OpenAI-совместимый API) с параметрами для простых запросов
2. **Создание промпта:** Формируется промпт для кратких ответов
3. **Выполнение запроса:** Запрос обрабатывается через LLM
4. **Обновление состояния:** 
   - Сохраняется ответ в `response`
   - Добавляются сообщения в историю
   - Устанавливается `nextStep: "hitl"` - **ключевой момент:** после обработки граф переходит к HITL узлу
5. **Обработка ошибок:** В случае ошибки также переходим к HITL для принятия решения

### Шаг 6: Сложный процессор
```javascript
async function processComplexQuery(state) {
  console.log("🧠 Сложная обработка");
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 800,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: "https://bothub.chat/api/v2/openai/v1" },
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Детальный анализ на русском с актуальной информацией."],
    ["human", "{query}"]
  ]);
  
  try {
    const result = await prompt.pipe(model).withConfig({ tags: ["node:complex"] }).invoke({ query: state.userQuery });

    return {
      ...state,
      response: result.content,
      messages: [...state.messages, new HumanMessage(state.userQuery), new AIMessage(result.content)],
      confidence: 0.8,
      nextStep: "hitl", // После обработки идем к HITL
      metadata: { ...state.metadata, node: "complex_processor" }
    };
  } catch (error) {
    return { ...state, error: error.message, confidence: 0.2, nextStep: "hitl" };
  }
}
```

**Что происходит:**
- Аналогично простому процессору, но с параметрами для сложных запросов (больше токенов, другая температура)
- После обработки также переходим к HITL узлу

### Шаг 7: Узел обработки с улучшенной моделью
```javascript
async function processWithUpgradedModel(state) {
  console.log("🔥 UPGRADE: Используем более мощную модель");
  
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.8,
    maxTokens: 1500,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: "https://bothub.chat/api/v2/openai/v1" },
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Ты эксперт высшего класса. Дай максимально качественный и подробный ответ на русском."],
    ["human", "{query}"]
  ]);
  
  try {
    const result = await prompt.pipe(model).withConfig({ tags: ["node:upgraded"] }).invoke({ query: state.userQuery });

    return {
      ...state,
      response: result.content,
      messages: [...state.messages, new HumanMessage(state.userQuery), new AIMessage(result.content)],
      confidence: 0.95,
      retryCount: state.retryCount + 1,
      nextStep: "hitl", // После upgrade также идем к HITL
      metadata: { ...state.metadata, node: "upgraded_processor", upgraded: true }
    };
  } catch (error) {
    return { ...state, error: error.message, confidence: 0.1, nextStep: "cancel" };
  }
}
```

**Что происходит:**
- Используется более мощная модель с увеличенными параметрами
- Вызывается когда человек выбирает "retry" в HITL узле
- После обработки также переходим к HITL для повторной проверки
- Увеличивается счетчик попыток

### Шаг 8: Fallback процессор
```javascript
async function fallbackProcessor(state) {
  console.log("🛟 Fallback - извинения");
  const fallbackResponse = `Приносим извинения за возникшие неполадки! 😔\n\nК сожалению, мы не смогли качественно обработать ваш запрос: "${state.userQuery}".\n\nПожалуйста, попробуйте:\n• Переформулировать вопрос\n• Обратиться к технической поддержке\n• Повторить попытку позже\n\nМы работаем над улучшением сервиса!`;
  
  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, new HumanMessage(state.userQuery), new AIMessage(fallbackResponse)],
    fallbackUsed: true,
    confidence: 0.3,
    nextStep: "end",
    metadata: { ...state.metadata, node: "fallback_processor" }
  };
}
```

**Что происходит:**
- Вызывается когда человек выбирает "cancel" в HITL узле
- Генерируется сообщение с извинениями
- Граф завершается (`nextStep: "end"`)

### Шаг 9: Узел принятия решений
```javascript
function decideNextStep(state) {
  console.log("🤔 Решение");
  
  if (state.error && !state.response) return { ...state, nextStep: "fallback" };
  if (state.response && state.response.length > 10) return { ...state, nextStep: "hitl" }; // К HITL
  if (state.queryType === "simple") return { ...state, nextStep: "simple" };
  if (state.queryType === "complex") return { ...state, nextStep: "complex" };
  
  return { ...state, nextStep: "simple" };
}
```

**Что происходит:**
- Анализируется текущее состояние
- Если есть ответ от LLM, переходим к HITL узлу
- Если есть ошибка без ответа, переходим к fallback
- Иначе выбирается тип обработки на основе типа запроса

### Шаг 10: Создание графа с HITL
```javascript
const workflow = new StateGraph(ConditionalGraphState)
  .addNode("validate", validateQuery)
  .addNode("process_simple", processSimpleQuery)
  .addNode("process_complex", processComplexQuery)
  .addNode("fallback", fallbackProcessor)
  .addNode("decide", decideNextStep)
  .addNode("hitl", humanInTheLoop) // HITL узел
  .addNode("upgraded_model", processWithUpgradedModel) // Upgrade узел
  
  .addEdge(START, "validate")
  .addEdge("validate", "decide")
  
  .addConditionalEdges("decide", (s) => s.nextStep, {
    simple: "process_simple",
    complex: "process_complex",
    fallback: "fallback",
    hitl: "hitl", // Переход к HITL
    end: END
  })
  
  // HITL условные переходы
  .addConditionalEdges("hitl", (s) => s.humanDecision, {
    continue: END,                  // Продолжить → конец
    cancel: "fallback",            // Отменить → извинения
    retry: "upgraded_model"        // Повторить → мощная модель
  })
  
  .addEdge("process_simple", "decide")
  .addEdge("process_complex", "decide")
  .addEdge("upgraded_model", "decide") // После upgrade → решение
  .addEdge("fallback", END);
```

**Что происходит:**
1. **Добавление узлов:** Регистрируются все узлы, включая HITL и upgraded_model
2. **Начальные рёбра:** START → validate → decide
3. **Условные рёбра от decide:** Выбор между простой/сложной обработкой, fallback или HITL
4. **Ключевой момент - HITL условные рёбра:**
   - `continue` → END (принять результат)
   - `cancel` → fallback (отменить)
   - `retry` → upgraded_model (повторить с улучшенной моделью)
5. **Обратные рёбра:** От процессоров обратно к decide для повторной проверки

### Шаг 11: Компиляция графа
```javascript
const app = workflow.compile();
```

**Что происходит:**
- Граф компилируется в исполняемый объект
- Валидируется структура графа и все переходы

### Шаг 12: Функция запуска графа
```javascript
async function runConditionalGraph(query) {
  console.log("🚀 Запуск графа с HITL...");
  
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",
    confidence: 0,
    error: null,
    retryCount: 0,
    fallbackUsed: false,
    humanDecision: "pending", // Начальное состояние HITL
    metadata: { startedAt: new Date().toISOString() }
  };
  
  try {
    const result = await app.invoke(initialState, {
        runName: "HITL-Workflow",
        tags: ["langsmith", "langgraph", "hitl", "openai"],
        metadata: { query, env: process.env.NODE_ENV || "dev" }
      });
    console.log("✅ Граф выполнен!");
    return result;
  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  }
}
```

**Что происходит:**
1. **Создание начального состояния:** Инициализируется состояние с `humanDecision: "pending"`
2. **Выполнение графа:** Вызывается `app.invoke()` с конфигурацией для LangSmith
3. **Возврат результата:** Возвращается финальное состояние с решением человека

### Шаг 13: Основная функция
```javascript
async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("❌ OPENAI_API_KEY не найден. Добавьте ключ в .env в папке node.");
    }
    
    console.log("🎓 Условный граф с HITL");
    console.log("=".repeat(50));
    
    const query = process.argv[2];
    if (!query) {
      console.error("❌ Укажите запрос: node index.js \"Ваш запрос\"");
      process.exit(1);
    }

    console.log(`\n📝 Запрос: ${query}`);
    const result = await runConditionalGraph(query);
    
    console.log("\n✅ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:");
    console.log("-".repeat(40));
    console.log(result.response);
    console.log("-".repeat(40));
    console.log(`📊 Тип: ${result.queryType}`);
    console.log(`🎯 Уверенность: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`👤 Решение человека: ${result.humanDecision}`);
    console.log(`🛟 Fallback: ${result.fallbackUsed ? 'Да' : 'Нет'}`);
    console.log(`🔄 Попыток: ${result.retryCount}`);
    console.log(`💬 Сообщений: ${result.messages.length}`);
    
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
  }
}
```

**Что происходит:**
- Проверяется наличие API ключа
- Получается запрос из аргументов командной строки
- Запускается граф с HITL
- Выводится финальный результат с информацией о решении человека

## Поток выполнения данных

```
1. main() → получает запрос из argv[2]
2. runConditionalGraph(query) → создает initialState с humanDecision: "pending"
3. app.invoke(initialState) → запускает граф
4. START → validate → decide
5. decide → выбирает процессор (simple/complex)
6. process_simple/complex → обрабатывает запрос → возвращается к decide
7. decide → nextStep: "hitl" → переход к HITL узлу
8. humanInTheLoop → запрашивает решение у человека (интерактивный ввод)
9. humanDecision → условный переход:
   - "continue" → END (завершение)
   - "cancel" → fallback → END (извинения)
   - "retry" → upgraded_model → decide → hitl (повторная проверка)
10. Результат возвращается в main() и выводится
```

## Визуализация графа

```
START
  ↓
[validate]
  ↓
[decide] ──┬──→ [process_simple] ──┐
           ├──→ [process_complex] ──┤
           ├──→ [fallback] ──────────┼──→ END
           └──→ [hitl] ──────────────┘
                    │
                    ├──→ "continue" → END
                    ├──→ "cancel" → [fallback] → END
                    └──→ "retry" → [upgraded_model] → [decide] → [hitl]
```

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "",
  messages: [],
  queryType: "",
  confidence: 0,
  error: null,
  retryCount: 0,
  fallbackUsed: false,
  nextStep: "",
  humanDecision: "pending", // Ожидание решения
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Состояние после обработки (перед HITL):**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "Машинное обучение - это область ИИ...",
  messages: [HumanMessage, AIMessage],
  queryType: "simple",
  confidence: 0.9,
  error: null,
  retryCount: 0,
  fallbackUsed: false,
  nextStep: "hitl", // Переход к HITL
  humanDecision: "pending",
  metadata: { ... }
}
```

**Финальное состояние (после HITL):**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "Машинное обучение - это область ИИ...",
  messages: [HumanMessage, AIMessage],
  queryType: "simple",
  confidence: 0.9,
  error: null,
  retryCount: 0,
  fallbackUsed: false,
  nextStep: "continue",
  humanDecision: "continue", // Решение человека
  metadata: { ... }
}
```

## Преимущества HITL паттерна

1. **Контроль качества:** Человек может проверить ответ перед отправкой пользователю
2. **Гибкость:** Возможность выбрать дальнейшие действия на основе контекста
3. **Безопасность:** Предотвращение отправки некорректных или нежелательных ответов
4. **Улучшение:** Возможность повторить запрос с улучшенными параметрами

## Требования для запуска

1. **Переменные окружения:** в корне `node` (`code/week-3/9-day/node/.env`) или в папке `3-hitl` создать `.env` с `OPENAI_API_KEY` (используется OpenAI-совместимый API, например bothub.chat).
2. **Зависимости:** выполнить `npm install` в папке `3-hitl`. При конфликте peer-зависимостей используйте `npm install --legacy-peer-deps`.
3. **Интерактивный режим:** для выбора действия в HITL запускать в терминале с возможностью ввода (не через pipe, отключающий stdin).
4. **API ключ:** в `.env` указать `OPENAI_API_KEY` (ключ для OpenAI-совместимого API).

## Пример использования

Запуск из папки `3-hitl`:

```bash
# С указанием запроса аргументом
node index.js "Что такое искусственный интеллект?"

# Через npm-скрипт (запрос передаётся после --)
npm run query -- "Что такое LangGraph?"

# Демо с автоматическим принятием ответа (без интерактива, для проверки вывода в терминале):
#   Unix/macOS: HITL_AUTO_ACCEPT=continue node index.js "Что такое LangGraph?"
#   Windows (cmd): set HITL_AUTO_ACCEPT=continue && node index.js "Что такое LangGraph?"
#   Windows (PowerShell): $env:HITL_AUTO_ACCEPT="continue"; node index.js "Что такое LangGraph?"
# Или интерактивно с тем же запросом: npm run demo
```

**Интерактивный процесс:**
1. Граф обрабатывает запрос через LLM
2. Выводится запрос, ответ и уровень уверенности
3. Пользователь выбирает действие (1/2/3)
4. Граф продолжает выполнение на основе выбора

### Проверка результата в терминале

- **Интерактивно:** `node index.js "Ваш запрос"` — в конце выводится блок «ФИНАЛЬНЫЙ РЕЗУЛЬТАТ» и метрики; код выхода 0 при успехе, 1 при ошибке.
- **Без ввода (для скриптов/CI):** задайте переменную `HITL_AUTO_ACCEPT=continue` — в узле HITL автоматически выбирается «Продолжить», результат выводится в консоль.
  - Windows (cmd): `set HITL_AUTO_ACCEPT=continue && node index.js "Запрос"`
  - Windows (PowerShell): `$env:HITL_AUTO_ACCEPT="continue"; node index.js "Запрос"`
  - Unix/macOS: `HITL_AUTO_ACCEPT=continue node index.js "Запрос"`
- **Демо одним вызовом:** `npm run demo` — запускает с тестовым запросом «Что такое LangGraph?» (интерактивно: потребуется ввести 1/2/3 в HITL). Для полностью автоматической проверки вывода без ввода используйте переменную `HITL_AUTO_ACCEPT=continue` как в примерах выше.

## Обработка ошибок

- **Отсутствие API ключа:** Выбрасывается ошибка с инструкциями
- **Ошибки API:** Ловится в try-catch, переходим к HITL для принятия решения
- **Ошибки графа:** Логируются в консоль, пробрасываются выше
- **Некорректный ввод в HITL:** По умолчанию выбирается "continue"

