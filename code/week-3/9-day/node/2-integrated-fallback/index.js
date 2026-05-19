/**
 * 05-integrated-fallback — интегрированный fallback в граф LangGraph.
 * Учебный пример: каскадная резервная обработка (кэш → альтернативная модель → локальные ответы).
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Загрузка .env из каталога node (code/week-3/8-day/node/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// =============================================================================
// Схема состояния графа (Zod)
// =============================================================================
const IntegratedFallbackState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0),
  domain: z.string().default(""),
  processingStage: z.string().default(""),
  confidence: z.number().default(0),
  quality: z.number().default(0),
  error: z.string().nullable().default(null),
  errorType: z.string().default(""),
  retryCount: z.number().default(0),
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""),
  fallbackReason: z.string().default(""),
  fallbackLevel: z.number().default(0),
  fallbackSuccess: z.boolean().default(false),
  cachedResponses: z.record(z.string()).default({}),
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  metadata: z.record(z.any()).default({})
});

// =============================================================================
// Узел: анализ запроса (сложность, домен, тип)
// =============================================================================
async function analyzeQuery(state) {
  console.log("🔍 Анализирую запрос:", state.userQuery);

  const query = state.userQuery.toLowerCase();

  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;

  let domain = "general";
  if (query.includes("программирование") || query.includes("код")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика")) {
    domain = "business";
  }

  let queryType = "general";
  if (query.includes("что такое") || query.includes("кто такой")) {
    queryType = "definition";
  } else if (query.includes("как") || query.includes("почему")) {
    queryType = "explanation";
  } else if (query.includes("сравни") || query.includes("разница")) {
    queryType = "comparison";
  }

  console.log(`📊 Анализ: сложность=${complexity}, домен=${domain}, тип=${queryType}`);

  return {
    ...state,
    processingStage: "analysis",
    queryType,
    queryComplexity: complexity,
    domain,
    metadata: {
      ...state.metadata,
      analyzedAt: new Date().toISOString(),
      analysis: { complexity, domain, queryType }
    }
  };
}

// =============================================================================
// Узел: основная обработка через OpenAI-совместимый API (при ошибке — переход к fallback)
// =============================================================================
async function mainProcessing(state) {
  console.log("⚡ Основная обработка");

  try {
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 500,
      openAIApiKey: process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
      },
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай информативный ответ на русском языке. Будь точным и полезным."],
      ["human", "{query}"]
    ]);

    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });

    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);

    console.log("✅ Основная обработка успешна");

    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.9,
      quality: 8,
      processingStage: "main_completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "main",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };

  } catch (error) {
    console.error("❌ Ошибка в основной обработке:", error.message);

    // Классификация ошибки для выбора стратегии fallback
    let errorType = "unknown";
    if (error.message.includes("timeout")) errorType = "timeout";
    else if (error.message.includes("rate limit")) errorType = "rate_limit";
    else if (error.message.includes("network")) errorType = "network";
    else if (error.message.includes("api")) errorType = "api";

    return {
      ...state,
      error: error.message,
      errorType,
      processingStage: "main_failed",
      metadata: {
        ...state.metadata,
        errorAt: new Date().toISOString(),
        errorType,
        mainProcessingFailed: true
      }
    };
  }
}

// =============================================================================
// Fallback Level 1: поиск ответа в кэше (точное совпадение → по типу → по домену)
// =============================================================================
async function fallbackLevel1(state) {
  console.log("🛟 Fallback Level 1: Кэшированные ответы");

  const { userQuery, cachedResponses, queryType, domain } = state;

  let cachedResponse = cachedResponses[userQuery.toLowerCase().trim()];

  if (!cachedResponse) {
    const typeKey = `type_${queryType}`;
    cachedResponse = cachedResponses[typeKey];
  }

  if (!cachedResponse) {
    const domainKey = `domain_${domain}`;
    cachedResponse = cachedResponses[domainKey];
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
      fallbackLevel: 1,
      fallbackSuccess: true,
      confidence: 0.7,
      quality: 6,
      processingStage: "fallback_level1_success",
      metadata: {
        ...state.metadata,
        fallbackAt: new Date().toISOString(),
        fallbackLevel: 1,
        cacheHit: true
      }
    };
  }

  console.log("❌ Кэш не найден, переходим к Level 2");
  return {
    ...state,
    fallbackLevel: 1,
    fallbackSuccess: false,
    processingStage: "fallback_level1_failed",
    metadata: {
      ...state.metadata,
      fallbackLevel: 1,
      cacheMiss: true
    }
  };
}

// =============================================================================
// Fallback Level 2: альтернативная модель (другие параметры: меньше токенов, ниже температура)
// =============================================================================
async function fallbackLevel2(state) {
  console.log("🛟 Fallback Level 2: Альтернативная модель");

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
      ["system", "Дай краткий и точный ответ на русском языке. Если не уверен, скажи об этом."],
      ["human", "{query}"]
    ]);

    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });

    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);

    console.log("✅ Альтернативная модель успешна");

    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      fallbackUsed: true,
      fallbackType: "alternative_model",
      fallbackLevel: 2,
      fallbackSuccess: true,
      confidence: 0.6,
      quality: 5,
      processingStage: "fallback_level2_success",
      metadata: {
        ...state.metadata,
        fallbackAt: new Date().toISOString(),
        fallbackLevel: 2,
        alternativeModelUsed: true
      }
    };

  } catch (error) {
    console.error("❌ Альтернативная модель тоже не работает:", error.message);
    return {
      ...state,
      fallbackLevel: 2,
      fallbackSuccess: false,
      processingStage: "fallback_level2_failed",
      metadata: {
        ...state.metadata,
        fallbackLevel: 2,
        alternativeModelFailed: true,
        alternativeModelError: error.message
      }
    };
  }
}

// =============================================================================
// Fallback Level 3: локальная обработка без API (шаблонные ответы + советы по домену)
// =============================================================================
async function fallbackLevel3(state) {
  console.log("🛟 Fallback Level 3: Локальная обработка");

  const { userQuery, queryType, domain } = state;

  let localResponse = "";

  // Ответ в зависимости от типа запроса
  if (queryType === "definition") {
    localResponse = `К сожалению, у меня сейчас технические проблемы, и я не могу дать точное определение для "${userQuery}". Попробуйте обратиться позже или переформулировать вопрос.`;
  } else if (queryType === "explanation") {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас ограниченные возможности. Я не могу дать полное объяснение, но запомнил ваш вопрос.`;
  } else if (queryType === "comparison") {
    localResponse = `Для сравнения "${userQuery}" мне нужен доступ к актуальным данным, которого сейчас нет. Попробуйте обратиться позже.`;
  } else {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас технические проблемы. Я не могу дать полный ответ, но запомнил ваш вопрос для будущего обращения.`;
  }

  // Добавляем контекстные советы по домену
  if (domain === "tech") {
    localResponse += "\n\n💡 Совет: Для технических вопросов попробуйте обратиться к официальной документации или сообществу разработчиков.";
  } else if (domain === "science") {
    localResponse += "\n\n🔬 Совет: Для научных вопросов рекомендую обратиться к научным статьям или экспертам в данной области.";
  } else if (domain === "business") {
    localResponse += "\n\n💼 Совет: Для бизнес-вопросов рекомендую обратиться к бизнес-консультантам или специализированным ресурсам.";
  }

  const userMessage = new HumanMessage(userQuery);
  const aiMessage = new AIMessage(localResponse);

  return {
    ...state,
    response: localResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "local_processing",
    fallbackLevel: 3,
    fallbackSuccess: true,
    confidence: 0.4,
    quality: 4,
    processingStage: "fallback_level3_success",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackLevel: 3,
      localProcessing: true
    }
  };
}

// =============================================================================
// Узел выбора стратегии fallback: какой уровень запускать следующим
// =============================================================================
async function selectFallbackStrategy(state) {
  console.log("🎯 Выбираю fallback стратегию");

  const { errorType, queryComplexity, domain, fallbackLevel } = state;

  if (fallbackLevel === 0) {
    console.log("🛟 Начинаем с Level 1 (кэш)");
    return {
      ...state,
      fallbackLevel: 1,
      processingStage: "fallback_level1",
      metadata: {
        ...state.metadata,
        fallbackStrategy: "level1",
        strategySelectedAt: new Date().toISOString()
      }
    };
  }

  if (fallbackLevel === 1 && !state.fallbackSuccess) {
    console.log("🛟 Переходим к Level 2 (альтернативная модель)");
    return {
      ...state,
      fallbackLevel: 2,
      processingStage: "fallback_level2",
      metadata: {
        ...state.metadata,
        fallbackStrategy: "level2",
        strategySelectedAt: new Date().toISOString()
      }
    };
  }

  if (fallbackLevel === 2 && !state.fallbackSuccess) {
    console.log("🛟 Переходим к Level 3 (локальная обработка)");
    return {
      ...state,
      fallbackLevel: 3,
      processingStage: "fallback_level3",
      metadata: {
        ...state.metadata,
        fallbackStrategy: "level3",
        strategySelectedAt: new Date().toISOString()
      }
    };
  }

  console.log("❌ Все fallback стратегии исчерпаны");
  return {
    ...state,
    processingStage: "all_fallback_failed",
    metadata: {
      ...state.metadata,
      allFallbackFailed: true,
      failedAt: new Date().toISOString()
    }
  };
}

// =============================================================================
// Логика переходов (для справки; в графе используются addConditionalEdges)
// =============================================================================
function decideNextStep(state) {
  console.log("🤔 Принимаю решение о следующем шаге");

  const { processingStage, error, fallbackLevel, fallbackSuccess } = state;

  if (processingStage === "analysis") {
    return "main_processing";
  }

  if (processingStage === "main_completed") {
    return "end";
  }

  if (processingStage === "main_failed") {
    return "select_fallback_strategy";
  }

  if (processingStage === "fallback_level1") {
    return "fallback_level1";
  }
  if (processingStage === "fallback_level2") {
    return "fallback_level2";
  }
  if (processingStage === "fallback_level3") {
    return "fallback_level3";
  }

  if (processingStage.includes("fallback_level") && processingStage.includes("success")) {
    return "end";
  }

  if (processingStage.includes("fallback_level") && processingStage.includes("failed")) {
    return "select_fallback_strategy";
  }

  if (processingStage === "all_fallback_failed") {
    return "end";
  }

  return "select_fallback_strategy";
}

// =============================================================================
// Построение графа: узлы и условные переходы
// =============================================================================
const integratedWorkflow = new StateGraph(IntegratedFallbackState)
  .addNode("analyze", analyzeQuery)
  .addNode("main_processing", mainProcessing)
  .addNode("select_fallback_strategy", selectFallbackStrategy)
  .addNode("fallback_level1", fallbackLevel1)
  .addNode("fallback_level2", fallbackLevel2)
  .addNode("fallback_level3", fallbackLevel3)

  .addEdge(START, "analyze")
  .addEdge("analyze", "main_processing")

  // После основной обработки: успех → end, иначе → выбор fallback
  .addConditionalEdges(
    "main_processing",
    (state) => {
      if (state.processingStage === "main_completed") {
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

  // После выбора стратегии: переход на нужный уровень fallback или end
  .addConditionalEdges(
    "select_fallback_strategy",
    (state) => {
      if (state.processingStage === "fallback_level1") {
        return "fallback_level1";
      } else if (state.processingStage === "fallback_level2") {
        return "fallback_level2";
      } else if (state.processingStage === "fallback_level3") {
        return "fallback_level3";
      } else {
        return "end";
      }
    },
    {
      fallback_level1: "fallback_level1",
      fallback_level2: "fallback_level2",
      fallback_level3: "fallback_level3",
      end: END
    }
  )

  // Level 1: успех → end, иначе → снова выбор стратегии (переход на Level 2)
  .addConditionalEdges(
    "fallback_level1",
    (state) => {
      if (state.processingStage.includes("success")) {
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

  // Level 2: успех → end, иначе → выбор стратегии (переход на Level 3)
  .addConditionalEdges(
    "fallback_level2",
    (state) => {
      if (state.processingStage.includes("success")) {
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

  // Level 3 всегда завершает граф
  .addConditionalEdges(
    "fallback_level3",
    (state) => {
      return "end";
    },
    {
      end: END
    }
  );

const integratedApp = integratedWorkflow.compile();

// =============================================================================
// Вспомогательная функция: добавить кэшированные ответы в состояние
// =============================================================================
function addCachedResponses(state, responses) {
  return {
    ...state,
    cachedResponses: {
      ...state.cachedResponses,
      ...responses
    }
  };
}

// =============================================================================
// Запуск графа с заданным запросом и опциями (кэш, maxRetries и т.д.)
// =============================================================================
async function runIntegratedFallback(query, options = {}) {
  console.log("🔗 Запускаю интегрированный fallback граф...");

  const startTime = Date.now();

  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",
    queryComplexity: 0,
    domain: "",
    processingStage: "",
    confidence: 0,
    quality: 0,
    error: null,
    errorType: "",
    retryCount: 0,
    fallbackUsed: false,
    fallbackType: "",
    fallbackReason: "",
    fallbackLevel: 0,
    fallbackSuccess: false,
    cachedResponses: options.cachedResponses || {},
    startTime,
    processingTime: 0,
    metadata: {
      startedAt: new Date().toISOString(),
      options
    }
  };

  try {
    const result = await integratedApp.invoke(initialState);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log("✅ Интегрированный граф выполнен!");

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
    console.error("❌ Ошибка при выполнении интегрированного графа:", error);
    throw error;
  }
}

// =============================================================================
// Вывод результата одного запроса в терминал (для CLI и демо)
// =============================================================================
function printResult(query, result) {
  console.log("✅ Результат:");
  console.log("-".repeat(40));
  console.log(result.response);
  console.log("-".repeat(40));
  console.log("📊 Анализ:");
  console.log(`  - Тип: ${result.queryType}`);
  console.log(`  - Сложность: ${result.queryComplexity}/10`);
  console.log(`  - Домен: ${result.domain}`);
  console.log(`  - Fallback использован: ${result.fallbackUsed ? "Да" : "Нет"}`);
  console.log(`  - Уровень fallback: ${result.fallbackLevel}`);
  console.log(`  - Тип fallback: ${result.fallbackType || "Нет"}`);
  console.log(`  - Успех fallback: ${result.fallbackSuccess ? "Да" : "Нет"}`);
  console.log(`  - Уверенность: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`  - Качество: ${result.quality}/10`);
  console.log(`  - Время: ${result.processingTime}ms`);
  if (result.error) {
    console.log(`  - Ошибка: ${result.error}`);
  }
  console.log(`💬 Сообщений: ${result.messages.length}`);
  console.log("🔍 Метаданные:", result.metadata);
}

// =============================================================================
// Демо: несколько тестовых запросов с общим кэшем
// =============================================================================
async function main() {
  try {
    console.log("🔗 Интегрированный Fallback в LangGraph");
    console.log("=".repeat(50));

    const cachedResponses = {
      "что такое машинное обучение": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
      "type_definition": "Определение - это точное объяснение значения термина или понятия.",
      "domain_tech": "Техническая информация о программировании, разработке и IT-технологиях.",
      "domain_science": "Научная информация о исследованиях, экспериментах и научных открытиях."
    };

    const testQueries = [
      "Что такое машинное обучение?",
      "Объясни квантовую физику",
      "Сравни React и Vue",
      "Расскажи про блокчейн"
    ];

    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю с интегрированным fallback...");

      const result = await runIntegratedFallback(query, {
        cachedResponses,
        maxRetries: 2
      });

      printResult(query, result);
    }

  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
  }
}

// =============================================================================
// Запуск одного запроса из аргументов командной строки
// =============================================================================
async function runSingleQuery(cliQuery) {
  const cachedResponses = {
    "что такое машинное обучение": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
    "что такое машинное обучение?": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
    "type_definition": "Определение - это точное объяснение значения термина или понятия.",
    "domain_tech": "Техническая информация о программировании, разработке и IT-технологиях.",
    "domain_science": "Научная информация о исследованиях, экспериментах и научных открытиях."
  };

  console.log("🔗 Интегрированный Fallback — один запрос из CLI");
  console.log("=".repeat(50));
  console.log(`📝 Запрос: ${cliQuery}`);
  const result = await runIntegratedFallback(cliQuery, {
    cachedResponses,
    maxRetries: 2
  });
  printResult(cliQuery, result);
}

// Проверка, что файл запущен напрямую: node index.js [запрос] (кроссплатформенно)
function isRunDirectly() {
  const scriptPath = path.resolve(process.argv[1] || "");
  const thisPath = path.resolve(__filename);
  return scriptPath === thisPath;
}

if (isRunDirectly()) {
  const cliQuery = process.argv.slice(2).join(" ").trim();
  if (cliQuery) {
    runSingleQuery(cliQuery).catch((err) => {
      console.error("❌ Ошибка:", err.message);
      process.exit(1);
    });
  } else {
    main();
  }
}

export { runIntegratedFallback, integratedApp, IntegratedFallbackState, addCachedResponses, printResult };
