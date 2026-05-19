# README: 03-advanced-graph — пошаговое выполнение кода

## Обзор
Этот файл демонстрирует продвинутый граф с несколькими узлами, сложной архитектурой, retry-логикой, мониторингом и разными стратегиями fallback.

## Пошаговое выполнение кода

### Шаг 1: Схема состояния графа (AdvancedGraphState)
```javascript
const AdvancedGraphState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Анализ запроса
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0), // 1–10
  domain: z.string().default(""), // tech, science, business, general
  processingStage: z.string().default(""),
  nextStep: z.string().default(""), // следующий узел после decide
  confidence: z.number().default(0),
  quality: z.number().default(0), // качество ответа 1–10
  error: z.string().nullable().default(null),
  errorType: z.string().default(""), // network, api, validation, timeout
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""), // simple, cached, manual
  fallbackReason: z.string().default(""),
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  tokensUsed: z.number().default(0),
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Описывается схема состояния графа со всеми полями.
- Поля используются для анализа запроса, этапа обработки, retry, fallback и метрик (время, токены).

### Шаг 2: Узел анализа запроса (analyzeQuery)
```javascript
async function analyzeQuery(state) {
  const query = state.userQuery.toLowerCase();
  
  // Определяем сложность (1-10)
  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;
  
  // Определяем домен
  let domain = "general";
  if (query.includes("программирование") || query.includes("код")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика")) {
    domain = "business";
  }
  
  // Определяем тип запроса
  let queryType = "general";
  if (query.includes("что такое") || query.includes("кто такой")) {
    queryType = "definition";
  } else if (query.includes("как") || query.includes("почему")) {
    queryType = "explanation";
  } else if (query.includes("сравни") || query.includes("разница")) {
    queryType = "comparison";
  } else if (query.includes("анализ") || query.includes("исследование")) {
    queryType = "analysis";
  }
  
  return {
    ...state,
    processingStage: "analysis",
    queryType,
    queryComplexity: complexity,
    domain,
    metadata: { ...state.metadata, analyzedAt: new Date().toISOString() }
  };
}
```

**Что происходит:**
1. **Анализ сложности** — оценка по длине и ключевым словам (1–10).
2. **Определение домена** — tech, science, business, general.
3. **Определение типа запроса** — definition, explanation, comparison, analysis.
4. **Обновление состояния** — выставляется `processingStage: "analysis"`.

### Шаг 3: Узел выбора стратегии (selectProcessingStrategy)
```javascript
async function selectProcessingStrategy(state) {
  const { queryComplexity, domain, queryType } = state;
  
  // Простые запросы - быстрая обработка
  if (queryComplexity <= 3 && queryType === "definition") {
    return {
      ...state,
      processingStage: "fast_processing",
      metadata: { ...state.metadata, strategy: "fast" }
    };
  }
  
  // Сложные запросы - детальная обработка
  if (queryComplexity >= 7 || queryType === "analysis") {
    return {
      ...state,
      processingStage: "detailed_processing",
      metadata: { ...state.metadata, strategy: "detailed" }
    };
  }
  
  // Обычные запросы - стандартная обработка
  return {
    ...state,
    processingStage: "standard_processing",
    metadata: { ...state.metadata, strategy: "standard" }
  };
}
```

**Что происходит:**
1. По `queryComplexity`, `domain`, `queryType` выбирается стратегия.
2. Устанавливается `processingStage`: `fast_processing`, `detailed_processing` или `standard_processing`.
3. Следующий узел — `decide`, который по этой стадии выберет нужный процессор.

### Шаг 4: Быстрая обработка (fastProcessing)
```javascript
async function fastProcessing(state) {
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.3, // Низкая температура для точности
    maxTokens: 200,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай краткий и точный ответ на русском языке. Максимум 1-2 предложения."],
    ["human", "{query}"]
  ]);
  
  try {
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.9,
      quality: 8,
      processingStage: "completed",
      metadata: { ...state.metadata, processor: "fast" }
    };
  } catch (error) {
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}
```

**Что происходит:**
1. Создаётся модель с низкой температурой и малым лимитом токенов.
2. Выполняется запрос к API; в состояние добавляются `HumanMessage` и `AIMessage`.
3. При ошибке выставляются `error`, `errorType: "api"`, `processingStage: "error"`.

### Шаг 5: Детальная обработка (detailedProcessing)
```javascript
async function detailedProcessing(state) {
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.7, // Высокая температура для креативности
    maxTokens: 1000,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const systemPrompt = `Ты эксперт в области ${state.domain}. 
  Проведи детальный анализ и дай развернутый ответ на русском языке.
  Используй актуальную информацию и предоставь структурированный ответ.`;
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{query}"]
  ]);
  
  // Аналогично быстрой обработке, но с другими параметрами
}
```

**Что происходит:**
- Та же схема, что и в быстрой обработке: промпт, вызов API, обновление состояния.
- Используются более высокая температура, больший лимит токенов и системный промпт, зависящий от домена.

### Шаг 6: Стандартная обработка (standardProcessing)
```javascript
async function standardProcessing(state) {
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.5, // Средняя температура
    maxTokens: 500,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай информативный ответ на русском языке. Будь точным и полезным."],
    ["human", "{query}"]
  ]);
  
  // Аналогично другим процессорам
}
```

**Что происходит:**
- Параметры между быстрой и детальной обработкой; универсальный системный промпт.

### Шаг 7: Узел проверки качества (qualityCheck)
```javascript
async function qualityCheck(state) {
  const { response, queryComplexity } = state;
  
  // Простая проверка качества
  let quality = 5;
  
  if (response.length < 50) {
    quality = 3; // Слишком короткий
  } else if (response.length > 1000) {
    quality = 8; // Детальный ответ
  } else {
    quality = 6; // Средний ответ
  }
  
  // Учитываем сложность запроса
  if (queryComplexity >= 7 && response.length < 200) {
    quality = Math.max(quality - 2, 1); // Снижаем качество для сложных запросов
  }
  
  return {
    ...state,
    quality,
    processingStage: "quality_checked",
    metadata: { ...state.metadata, qualityScore: quality }
  };
}
```

**Что происходит:**
1. По длине ответа выставляется базовая оценка качества.
2. Для сложных запросов при коротком ответе качество снижается.
3. Устанавливаются `quality` и `processingStage: "quality_checked"`.

### Шаг 8: Узел retry-логики (retryLogic)
```javascript
async function retryLogic(state) {
  const { retryCount, maxRetries, error, quality } = state;
  
  // Если есть ошибка и не превышен лимит retry
  if (error && retryCount < maxRetries) {
    return {
      ...state,
      retryCount: retryCount + 1,
      error: null,
      processingStage: "retry",
      metadata: { ...state.metadata, retryCount: retryCount + 1 }
    };
  }
  
  // Если качество низкое и есть попытки
  if (quality < 5 && retryCount < maxRetries) {
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry",
      metadata: { ...state.metadata, retryReason: "low_quality" }
    };
  }
  
  return { ...state, processingStage: "no_retry_needed" };
}
```

**Что происходит:**
1. При наличии ошибки и не исчерпанном лимите — увеличивается `retryCount`, сброс `error`, переход на `retry`.
2. При низком качестве и наличии попыток — также планируется retry.
3. Иначе — `processingStage: "no_retry_needed"`.

### Шаг 9: Fallback-узел (fallbackProcessing)
```javascript
async function fallbackProcessing(state) {
  const fallbackResponse = `Извините, у меня возникли проблемы с обработкой вашего запроса: "${state.userQuery}".

Возможные причины:
- Проблемы с подключением к API
- Слишком сложный запрос
- Превышен лимит попыток

Попробуйте:
1. Переформулировать вопрос
2. Разбить сложный запрос на части
3. Обратиться к технической поддержке`;

  const userMessage = new HumanMessage(state.userQuery);
  const aiMessage = new AIMessage(fallbackResponse);
  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "manual",
    fallbackReason: state.error || "quality_issue",
    confidence: 0.3,
    quality: 4,
    processingStage: "fallback_completed"
  };
}
```

**Что происходит:**
1. Формируется текст с извинением и рекомендациями.
2. В состояние добавляются сообщения пользователя и ИИ, выставляются флаги fallback и низкие метрики.

### Шаг 10: Узел принятия решений (decideNode)
```javascript
async function decideNode(state) {
  const { processingStage, error, retryCount, maxRetries, quality } = state;
  let nextStep = "retry_logic";
  if (processingStage === "analysis") nextStep = "select_strategy";
  else if (processingStage === "fast_processing") nextStep = "fast_processing";
  else if (processingStage === "detailed_processing") nextStep = "detailed_processing";
  else if (processingStage === "standard_processing") nextStep = "standard_processing";
  else if (processingStage === "completed") nextStep = "quality_check";
  else if (processingStage === "retry") nextStep = "select_strategy";
  else if (error && retryCount >= maxRetries) nextStep = "fallback";
  else if (quality < 5 && retryCount >= maxRetries) nextStep = "fallback";
  else if (processingStage === "quality_checked" && quality >= 5) nextStep = "end";
  return { ...state, nextStep, processingStage: "decision_made", metadata: { ...state.metadata, previousStage: processingStage, nextStep } };
}
```

**Что происходит:**
1. По текущей `processingStage`, `error`, `retryCount`, `quality` определяется следующий узел.
2. Результат записывается в `state.nextStep`; условные рёбра графа читают именно это поле.
3. Узел возвращает обновлённое состояние с `processingStage: "decision_made"`.

### Шаг 11: Сборка графа и условные переходы
```javascript
const workflow = new StateGraph(AdvancedGraphState)
  .addNode("analyze", analyzeQuery)
  .addNode("select_strategy", selectProcessingStrategy)
  .addNode("fast_processing", fastProcessing)
  .addNode("detailed_processing", detailedProcessing)
  .addNode("standard_processing", standardProcessing)
  .addNode("quality_check", qualityCheck)
  .addNode("retry_logic", retryLogic)
  .addNode("fallback", fallbackProcessing)
  .addNode("decide", decideNode)
  
  .addEdge(START, "analyze")
  .addEdge("analyze", "select_strategy")
  .addEdge("select_strategy", "decide")
  
  .addConditionalEdges(
    "decide",
    (state) => state.nextStep || "retry_logic",
    {
      select_strategy: "select_strategy",
      fast_processing: "fast_processing",
      detailed_processing: "detailed_processing",
      standard_processing: "standard_processing",
      quality_check: "quality_check",
      retry_logic: "retry_logic",
      fallback: "fallback",
      end: END
    }
  )
  
  .addEdge("fast_processing", "decide")
  .addEdge("detailed_processing", "decide")
  .addEdge("standard_processing", "decide")
  .addEdge("quality_check", "decide")
  .addEdge("retry_logic", "decide")
  .addEdge("fallback", END);
```

**Что происходит:**
1. Регистрируются все узлы и рёбра: START → analyze → select_strategy → decide.
2. Условные рёбра от `decide`: следующая вершина берётся из `state.nextStep`.
3. От процессоров и quality_check, retry_logic переход обратно в decide; fallback → END.

### Шаг 12: Компиляция и запуск
```javascript
const app = workflow.compile();

async function runAdvancedGraph(query) {
  const startTime = Date.now();
  
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",
    queryComplexity: 0,
    domain: "",
    processingStage: "",
    nextStep: "",
    confidence: 0,
    quality: 0,
    error: null,
    errorType: "",
    retryCount: 0,
    maxRetries: 3,
    fallbackUsed: false,
    fallbackType: "",
    fallbackReason: "",
    startTime,
    processingTime: 0,
    tokensUsed: 0,
    metadata: { startedAt: new Date().toISOString() }
  };
  const result = await app.invoke(initialState);
  const endTime = Date.now();
  const processingTime = endTime - startTime;
  return {
    ...result,
    processingTime,
    metadata: { ...result.metadata, totalProcessingTime: processingTime }
  };
}
```

**Что происходит:**
1. Граф компилируется в приложение (`workflow.compile()`).
2. Формируется начальное состояние и вызывается `app.invoke(initialState)`.
3. Вычисляется время выполнения и возвращается финальное состояние с метриками.

## Запуск из терминала

Результат всегда выводится в терминал: ответ, тип запроса, сложность, домен, качество, время, fallback.

| Команда | Описание |
|--------|----------|
| `npm start` или `npm run demo` | Запуск демо с тремя тестовыми запросами |
| `node index.js "Текст запроса"` | Один запрос, переданный аргументом |
| `npm run query -- "Текст запроса"` | То же через npm (двойной `--` передаёт аргумент в node) |

Пример:
```bash
cd code/week-3/8-day/node/3-advanced-graph
npm install
# Задать PERPLEXITY_API_KEY в файле ../.env
npm start
# или один запрос:
node index.js "Что такое LangGraph?"
```

## Поток выполнения данных

```
1. main() → создает тестовые запросы
2. runAdvancedGraph(query) → создает initialState
3. app.invoke(initialState) → запускает граф
4. START → analyze → analyzeQuery(state)
5. analyze → select_strategy → selectProcessingStrategy(state)
6. select_strategy → decide → decideNode(state)
7. decide → fast_processing/detailed_processing/standard_processing (условно)
8. process_* → decide → decideNextStep(state)
9. decide → quality_check → qualityCheck(state)
10. quality_check → decide → decideNextStep(state)
11. decide → retry_logic/fallback/end (условно)
12. retry_logic → decide → decideNextStep(state)
13. fallback → END
```

## Ключевые особенности

1. **Несколько узлов** — анализ, выбор стратегии, три типа обработки, проверка качества, retry, fallback, узел решений.
2. **Условные переходы** — следующий шаг определяется в `decideNode` по состоянию.
3. **Retry** — при ошибке или низком качестве и наличии попыток выполняется повтор.
4. **Проверка качества** — оценка по длине ответа и сложности запроса.
5. **Метрики** — время выполнения, оценка токенов в metadata.
6. **Fallback** — при исчерпании retry возвращается заготовленный ответ с рекомендациями.
7. **Адаптивность** — стратегия (быстрая / стандартная / детальная) зависит от анализа запроса.

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Проведи анализ ИИ",
  response: "",
  messages: [],
  queryType: "",
  queryComplexity: 0,
  domain: "",
  processingStage: "",
  nextStep: "",
  confidence: 0,
  quality: 0,
  error: null,
  retryCount: 0,
  fallbackUsed: false,
  startTime: 1704067200000,
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Промежуточное состояние (после анализа):**
```javascript
{
  userQuery: "Проведи анализ ИИ",
  queryType: "analysis",
  queryComplexity: 7,
  domain: "tech",
  processingStage: "analysis",
  // ... остальные поля
}
```

**Выходное состояние:**
```javascript
{
  userQuery: "Проведи анализ ИИ",
  response: "Детальный анализ ИИ...",
  messages: [HumanMessage, AIMessage],
  queryType: "analysis",
  queryComplexity: 7,
  domain: "tech",
  processingStage: "quality_checked",
  confidence: 0.85,
  quality: 9,
  processingTime: 2500,
  tokensUsed: 150,
  // ... остальные поля
}
```
