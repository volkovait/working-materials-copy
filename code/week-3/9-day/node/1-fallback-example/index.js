/**
 * Учебный проект: Fallback-механизм в LangGraph
 * Демонстрирует: намеренные ошибки, retry, выбор стратегии fallback и восстановление.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// =============================================================================
// Схема состояния графа с полями для fallback, retry и метрик
// =============================================================================
const FallbackGraphState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  error: z.string().nullable().default(null),
  errorType: z.string().default(""),       // api | timeout | network | validation
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""),   // simple | cached | alternative
  fallbackReason: z.string().default(""),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(2),
  cachedResponses: z.record(z.string()).default({}),
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  metadata: z.record(z.any()).default({}),
  // Внутренняя стадия графа (не задаётся вручную при invoke)
  processingStage: z.string().optional()
});

// =============================================================================
// Узел: намеренное создание ошибки (для демонстрации fallback)
// Выбирается случайный тип ошибки, состояние переходит в error_created
// =============================================================================
async function intentionalErrorNode(state) {
  console.log("💥 Намеренно создаю ошибку для демонстрации fallback");

  const errorTypes = ["api", "timeout", "network", "validation"];
  const randomErrorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];

  let errorMessage = "";

  switch (randomErrorType) {
    case "api":
      errorMessage = "API недоступен: превышен лимит запросов";
      break;
    case "timeout":
      errorMessage = "Превышено время ожидания ответа от API";
      break;
    case "network":
      errorMessage = "Ошибка сети: нет подключения к интернету";
      break;
    case "validation":
      errorMessage = "Ошибка валидации: некорректный формат запроса";
      break;
  }

  console.log(`❌ Создана ошибка типа: ${randomErrorType}`);

  return {
    ...state,
    error: errorMessage,
    errorType: randomErrorType,
    processingStage: "error_created",
    metadata: {
      ...state.metadata,
      errorCreatedAt: new Date().toISOString(),
      errorType: randomErrorType,
      intentionalError: true
    }
  };
}

// =============================================================================
// Узел: проверка возможности повтора (retry)
// Если есть ошибка и не исчерпан лимит попыток — переходим к recovery_attempt,
// иначе — к выбору fallback-стратегии
// =============================================================================
async function checkRetryPossibility(state) {
  console.log("🔄 Проверяю возможность retry");

  const { retryCount, maxRetries, error } = state;

  if (error && retryCount < maxRetries) {
    console.log(`🔄 Retry возможен: ${retryCount + 1}/${maxRetries}`);
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry_attempt",
      metadata: {
        ...state.metadata,
        retryAttempt: retryCount + 1,
        retryAt: new Date().toISOString()
      }
    };
  }

  console.log("❌ Retry невозможен, переходим к fallback");
  return {
    ...state,
    processingStage: "fallback_needed",
    metadata: {
      ...state.metadata,
      retryExhausted: true,
      fallbackNeededAt: new Date().toISOString()
    }
  };
}

// =============================================================================
// Узел: простой fallback — стандартное сообщение об ошибке без API
// =============================================================================
async function simpleFallback(state) {
  console.log("🛟 Простой fallback");

  const fallbackResponse = `Извините, у меня возникли технические проблемы с обработкой вашего запроса: "${state.userQuery}".

К сожалению, я не могу дать полный ответ в данный момент из-за ${state.errorType} ошибки.

Пожалуйста, попробуйте:
1. Переформулировать вопрос
2. Обратиться позже
3. Связаться с технической поддержкой

Приносим извинения за неудобства.`;

  const userMessage = new HumanMessage(state.userQuery);
  const aiMessage = new AIMessage(fallbackResponse);

  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "simple",
    fallbackReason: state.error,
    processingStage: "fallback_completed",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackType: "simple"
    }
  };
}

// =============================================================================
// Узел: кэшированный fallback — поиск ответа в кэше по запросу (точное/частичное)
// Если кэш пуст или совпадений нет — вызывается simpleFallback
// =============================================================================
async function cachedFallback(state) {
  console.log("💾 Кэшированный fallback");

  const { userQuery, cachedResponses } = state;

  const cacheKey = userQuery.toLowerCase().trim();
  let cachedResponse = cachedResponses[cacheKey];

  if (!cachedResponse) {
    for (const [key, value] of Object.entries(cachedResponses)) {
      if (cacheKey.includes(key) || key.includes(cacheKey)) {
        cachedResponse = value;
        break;
      }
    }
  }

  if (cachedResponse) {
    console.log("✅ Найден кэшированный ответ");
    const userMessage = new HumanMessage(userQuery);
    const aiMessage = new AIMessage(cachedResponse);

    return {
      ...state,
      response: cachedResponse,
      messages: [...state.messages, userMessage, aiMessage],
      fallbackUsed: true,
      fallbackType: "cached",
      fallbackReason: "cached_response_found",
      processingStage: "fallback_completed",
      metadata: {
        ...state.metadata,
        fallbackAt: new Date().toISOString(),
        fallbackType: "cached",
        cacheHit: true
      }
    };
  }

  console.log("❌ Кэш пуст, используем простой fallback");
  return simpleFallback(state);
}

// =============================================================================
// Узел: альтернативный fallback — локальная обработка без API
// Разные ответы для приветствия, времени, помощи и прочих запросов
// =============================================================================
async function alternativeFallback(state) {
  console.log("🔄 Альтернативный fallback с локальной обработкой");

  const { userQuery } = state;

  let localResponse = "";

  if (userQuery.toLowerCase().includes("привет") || userQuery.toLowerCase().includes("здравствуй")) {
    localResponse = "Привет! К сожалению, у меня сейчас технические проблемы, но я рад вас видеть!";
  } else if (userQuery.toLowerCase().includes("время") || userQuery.toLowerCase().includes("дата")) {
    const now = new Date();
    localResponse = `Текущее время: ${now.toLocaleString('ru-RU')}. К сожалению, я не могу дать более детальную информацию из-за технических проблем.`;
  } else if (userQuery.toLowerCase().includes("помощь") || userQuery.toLowerCase().includes("help")) {
    localResponse = "Я готов помочь! К сожалению, у меня сейчас ограниченные возможности из-за технических проблем. Попробуйте переформулировать вопрос или обратитесь позже.";
  } else {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас технические проблемы. Я не могу дать полный ответ, но запомнил ваш вопрос для будущего обращения.`;
  }

  const userMessage = new HumanMessage(userQuery);
  const aiMessage = new AIMessage(localResponse);

  return {
    ...state,
    response: localResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "alternative",
    fallbackReason: "local_processing",
    processingStage: "fallback_completed",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackType: "alternative",
      localProcessing: true
    }
  };
}

// =============================================================================
// Узел: попытка восстановления — вызов внешнего API (OpenAI-совместимый, bothub.chat)
// При успехе — recovery_successful, при ошибке — recovery_failed (далее fallback)
// =============================================================================
async function recoveryAttempt(state) {
  console.log("🔧 Попытка восстановления с API");

  try {
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 300,
      openAIApiKey: process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
      },
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай краткий ответ на русском языке. Если не можешь ответить, скажи об этом честно."],
      ["human", "{query}"]
    ]);

    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });

    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);

    console.log("✅ Восстановление успешно!");

    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      error: null,
      processingStage: "recovery_successful",
      metadata: {
        ...state.metadata,
        recoveryAt: new Date().toISOString(),
        recoverySuccessful: true
      }
    };

  } catch (error) {
    console.log("❌ Восстановление не удалось:", error.message);
    return {
      ...state,
      error: error.message,
      processingStage: "recovery_failed",
      metadata: {
        ...state.metadata,
        recoveryFailedAt: new Date().toISOString(),
        recoveryError: error.message
      }
    };
  }
}

// =============================================================================
// Выбор стратегии fallback: приоритет — кэш, затем network/timeout → alternative
// =============================================================================
function selectFallbackStrategy(state) {
  console.log("🎯 Выбираю fallback стратегию");

  const { errorType, cachedResponses } = state;

  if (Object.keys(cachedResponses).length > 0) {
    console.log("💾 Выбрана кэшированная стратегия");
    return "cached_fallback";
  }

  if (errorType === "network" || errorType === "timeout") {
    console.log("🔄 Выбрана альтернативная стратегия");
    return "alternative_fallback";
  }

  console.log("🛟 Выбрана простая стратегия");
  return "simple_fallback";
}

// Логика принятия решений по стадии (используется в графе через addConditionalEdges)
function decideNextStep(state) {
  console.log("🤔 Принимаю решение о следующем шаге");

  const { processingStage } = state;

  if (processingStage === "error_created") {
    return "check_retry";
  }

  if (processingStage === "retry_attempt") {
    return "recovery_attempt";
  }

  if (processingStage === "fallback_needed") {
    return "select_fallback_strategy";
  }

  if (processingStage === "recovery_failed") {
    return "select_fallback_strategy";
  }

  if (processingStage === "fallback_completed" || processingStage === "recovery_successful") {
    return "end";
  }

  return "check_retry";
}

// =============================================================================
// Узел-обёртка: выбирает стратегию и записывает её в state.metadata.selectedStrategy
// Следующее условное ребро читает selectedStrategy и направляет в нужный fallback-узел
// =============================================================================
async function selectFallbackStrategyNode(state) {
  console.log("🎯 Узел выбора fallback стратегии");

  const strategy = selectFallbackStrategy(state);

  return {
    ...state,
    processingStage: "fallback_strategy_selected",
    metadata: {
      ...state.metadata,
      selectedStrategy: strategy,
      strategySelectedAt: new Date().toISOString()
    }
  };
}

// =============================================================================
// Построение графа: узлы и рёбра
// START → intentional_error → check_retry → [recovery_attempt | select_fallback_strategy]
// recovery_attempt → [END | select_fallback_strategy]
// select_fallback_strategy → [simple_fallback | cached_fallback | alternative_fallback] → END
// =============================================================================
const fallbackWorkflow = new StateGraph(FallbackGraphState)
  .addNode("intentional_error", intentionalErrorNode)
  .addNode("check_retry", checkRetryPossibility)
  .addNode("recovery_attempt", recoveryAttempt)
  .addNode("select_fallback_strategy", selectFallbackStrategyNode)
  .addNode("simple_fallback", simpleFallback)
  .addNode("cached_fallback", cachedFallback)
  .addNode("alternative_fallback", alternativeFallback)

  .addEdge(START, "intentional_error")
  .addEdge("intentional_error", "check_retry")

  .addConditionalEdges(
    "check_retry",
    (state) => {
      if (state.processingStage === "retry_attempt") {
        return "recovery_attempt";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      recovery_attempt: "recovery_attempt",
      select_fallback_strategy: "select_fallback_strategy"
    }
  )

  .addConditionalEdges(
    "recovery_attempt",
    (state) => {
      if (state.processingStage === "recovery_successful") {
        return "end";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      end: END,
      select_fallback_strategy: "select_fallback_strategy"
    }
  )

  .addConditionalEdges(
    "select_fallback_strategy",
    (state) => {
      const strategy = state.metadata?.selectedStrategy || "simple_fallback";
      return strategy;
    },
    {
      simple_fallback: "simple_fallback",
      cached_fallback: "cached_fallback",
      alternative_fallback: "alternative_fallback"
    }
  )

  .addEdge("simple_fallback", END)
  .addEdge("cached_fallback", END)
  .addEdge("alternative_fallback", END);

const fallbackApp = fallbackWorkflow.compile();

// Вспомогательная функция: добавить ответ в кэш состояния (для тестов или предзаполнения)
function addCachedResponse(state, query, response) {
  return {
    ...state,
    cachedResponses: {
      ...state.cachedResponses,
      [query.toLowerCase().trim()]: response
    }
  };
}

// Запуск графа с заданным запросом и опциями (кэш, maxRetries). Возвращает финальное состояние.
async function runFallbackExample(query, options = {}) {
  console.log("🛟 Запускаю fallback граф...");

  const startTime = Date.now();

  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    error: null,
    errorType: "",
    fallbackUsed: false,
    fallbackType: "",
    fallbackReason: "",
    retryCount: 0,
    maxRetries: options.maxRetries || 2,
    cachedResponses: options.cachedResponses || {},
    startTime,
    processingTime: 0,
    metadata: {
      startedAt: new Date().toISOString(),
      options
    }
  };

  try {
    const result = await fallbackApp.invoke(initialState);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log("✅ Fallback граф выполнен!");

    return {
      ...result,
      processingTime,
      metadata: {
        ...result.metadata,
        completedAt: new Date().toISOString(),
        totalProcessingTime: processingTime
      }
    };

  } catch (error) {
    console.error("❌ Ошибка при выполнении fallback графа:", error);
    throw error;
  }
}

// Демо: несколько тестовых запросов с выводом результата в терминал
async function main() {
  try {
    console.log("🛟 Пример Fallback механизма в LangGraph");
    console.log("=".repeat(50));

    const cachedResponses = {
      "что такое машинное обучение": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
      "привет": "Привет! Как дела?",
      "время": "Текущее время можно узнать, посмотрев на часы или календарь."
    };

    const testQueries = [
      "Что такое машинное обучение?",
      "Привет, как дела?",
      "Какое сейчас время?",
      "Объясни квантовую физику",
      "Расскажи про блокчейн"
    ];

    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю с fallback...");

      const result = await runFallbackExample(query, {
        cachedResponses,
        maxRetries: 1
      });

      printResult(query, result);
    }
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
  }
}

// Вывод результата одного запроса в терминал (удобно для проверки)
function printResult(query, result) {
  console.log("✅ Результат:");
  console.log("-".repeat(40));
  console.log(result.response);
  console.log("-".repeat(40));
  console.log("📊 Анализ:");
  console.log(`  - Fallback использован: ${result.fallbackUsed ? "Да" : "Нет"}`);
  console.log(`  - Тип fallback: ${result.fallbackType || "Нет"}`);
  console.log(`  - Причина fallback: ${result.fallbackReason || "Нет"}`);
  console.log(`  - Retry попыток: ${result.retryCount}/${result.maxRetries}`);
  console.log(`  - Время обработки: ${result.processingTime}ms`);
  if (result.error) {
    console.log(`  - Ошибка: ${result.error}`);
  }
  console.log(`💬 Сообщений: ${result.messages.length}`);
  console.log("🔍 Метаданные:", result.metadata);
}

// Запуск одного запроса из аргументов командной строки и вывод результата в терминал
async function runSingleQuery(queryFromCli) {
  const cachedResponses = {
    "что такое машинное обучение": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
    привет: "Привет! Как дела?",
    время: "Текущее время можно узнать, посмотрев на часы или календарь."
  };
  console.log("🛟 Fallback — один запрос из CLI");
  console.log("=".repeat(50));
  console.log(`📝 Запрос: ${queryFromCli}`);
  const result = await runFallbackExample(queryFromCli, { cachedResponses, maxRetries: 1 });
  printResult(queryFromCli, result);
}

// Проверка «файл запущен напрямую» (кроссплатформенно: Windows/Unix)
function isRunDirectly() {
  const scriptPath = path.resolve(process.argv[1] || "");
  const thisPath = path.resolve(__filename);
  return scriptPath === thisPath;
}

// Точка входа: при прямом запуске — демо или один запрос из argv
if (isRunDirectly()) {
  const cliQuery = process.argv[2];
  if (cliQuery) {
    runSingleQuery(cliQuery).catch((err) => {
      console.error("❌ Ошибка:", err.message);
      process.exit(1);
    });
  } else {
    main();
  }
}

export { runFallbackExample, fallbackApp, FallbackGraphState, addCachedResponse };
