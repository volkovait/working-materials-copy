import { StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Определяем __dirname для ES-модулей и подгружаем переменные окружения из ../.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// =============================================================================
// Схема состояния графа (Zod). Все узлы читают и возвращают объект этой формы.
// =============================================================================
const AdvancedGraphState = z.object({
  // Основные поля: запрос пользователя, ответ ИИ, история сообщений
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),

  // Результаты анализа запроса (заполняет узел analyzeQuery)
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0), // 1–10
  domain: z.string().default(""),
  processingStage: z.string().default(""),
  nextStep: z.string().default(""), // следующий узел после decide

  // Метрики ответа и ошибки
  confidence: z.number().default(0),
  quality: z.number().default(0),
  error: z.string().nullable().default(null),
  errorType: z.string().default(""),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),

  // Fallback: использовался ли запасной ответ
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""),
  fallbackReason: z.string().default(""),

  // Мониторинг: время и токены
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  tokensUsed: z.number().default(0),
  metadata: z.record(z.any()).default({})
});

// =============================================================================
// Узел: анализ запроса. Определяет сложность, домен и тип запроса.
// =============================================================================
async function analyzeQuery(state) {
  console.log("🔍 Анализирую запрос:", state.userQuery);

  const query = state.userQuery.toLowerCase();

  // Оценка сложности по длине и ключевым словам (1–10)
  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;

  // Домен: tech, science, business или general
  let domain = "general";
  if (query.includes("программирование") || query.includes("код") || query.includes("разработка")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование") || query.includes("эксперимент")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика") || query.includes("финансы")) {
    domain = "business";
  }

  // Тип запроса: definition, explanation, comparison, analysis, general
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
// Узел: выбор стратегии обработки (быстрая / стандартная / детальная).
// =============================================================================
async function selectProcessingStrategy(state) {
  console.log("🎯 Выбираю стратегию обработки");

  const { queryComplexity, domain, queryType } = state;

  // Простые короткие запросы — быстрая обработка (мало токенов, низкая температура)
  if (queryComplexity <= 3 && queryType === "definition") {
    console.log("⚡ Выбрана быстрая стратегия");
    return {
      ...state,
      processingStage: "fast_processing",
      metadata: {
        ...state.metadata,
        strategy: "fast",
        selectedAt: new Date().toISOString()
      }
    };
  }

  // Сложные запросы или тип «анализ» — детальная обработка
  if (queryComplexity >= 7 || queryType === "analysis") {
    console.log("🧠 Выбрана детальная стратегия");
    return {
      ...state,
      processingStage: "detailed_processing",
      metadata: {
        ...state.metadata,
        strategy: "detailed",
        selectedAt: new Date().toISOString()
      }
    };
  }

  // Остальное — стандартная обработка
  console.log("📝 Выбрана стандартная стратегия");
  return {
    ...state,
    processingStage: "standard_processing",
    metadata: {
      ...state.metadata,
      strategy: "standard",
      selectedAt: new Date().toISOString()
    }
  };
}

// =============================================================================
// Узел: быстрая обработка через OpenAI API (краткий ответ).
// =============================================================================
async function fastProcessing(state) {
  console.log("⚡ Быстрая обработка");

  // Модель ChatOpenAI (bothub.chat / OpenAI-совместимый endpoint)
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.3,   // низкая температура — более точный ответ
    maxTokens: 200,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://bothub.chat/api/v2/openai/v1",
    },
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
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "fast",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };

  } catch (error) {
    console.error("❌ Ошибка в быстрой обработке:", error.message);
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}

// =============================================================================
// Узел: детальная обработка (развёрнутый ответ, промпт зависит от домена).
// =============================================================================
async function detailedProcessing(state) {
  console.log("🧠 Детальная обработка");

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,   // выше — более развёрнутый/креативный ответ
    maxTokens: 1000,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://bothub.chat/api/v2/openai/v1",
    },
  });

  const systemPrompt = `Ты эксперт в области ${state.domain}.
  Проведи детальный анализ и дай развернутый ответ на русском языке.
  Используй актуальную информацию и предоставь структурированный ответ.`;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
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
      confidence: 0.85,
      quality: 9,
      processingStage: "completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "detailed",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };

  } catch (error) {
    console.error("❌ Ошибка в детальной обработке:", error.message);
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}

// =============================================================================
// Узел: стандартная обработка (средние параметры между быстрой и детальной).
// =============================================================================
async function standardProcessing(state) {
  console.log("📝 Стандартная обработка");

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 500,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://bothub.chat/api/v2/openai/v1",
    },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай информативный ответ на русском языке. Будь точным и полезным."],
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
      confidence: 0.8,
      quality: 7,
      processingStage: "completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "standard",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };

  } catch (error) {
    console.error("❌ Ошибка в стандартной обработке:", error.message);
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}

// =============================================================================
// Узел: проверка качества ответа по длине и сложности запроса.
// =============================================================================
async function qualityCheck(state) {
  console.log("🔍 Проверяю качество ответа");

  const { response, queryComplexity } = state;

  // Базовая оценка по длине ответа
  let quality = 5;
  if (response.length < 50) {
    quality = 3;
  } else if (response.length > 1000) {
    quality = 8;
  } else {
    quality = 6;
  }

  // Для сложных запросов короткий ответ — снижаем оценку
  if (queryComplexity >= 7 && response.length < 200) {
    quality = Math.max(quality - 2, 1);
  }

  console.log(`📊 Качество ответа: ${quality}/10`);

  return {
    ...state,
    quality,
    processingStage: "quality_checked",
    metadata: {
      ...state.metadata,
      qualityCheckedAt: new Date().toISOString(),
      qualityScore: quality
    }
  };
}

// =============================================================================
// Узел: retry-логика — при ошибке или низком качестве увеличиваем счётчик и идём на повтор.
// =============================================================================
async function retryLogic(state) {
  console.log("🔄 Проверяю необходимость retry");

  const { retryCount, maxRetries, error, quality } = state;

  // Есть ошибка и ещё есть попытки — сбрасываем ошибку и идём на retry
  if (error && retryCount < maxRetries) {
    console.log(`🔄 Retry ${retryCount + 1}/${maxRetries}`);
    return {
      ...state,
      retryCount: retryCount + 1,
      error: null,
      processingStage: "retry",
      metadata: {
        ...state.metadata,
        retryAt: new Date().toISOString(),
        retryCount: retryCount + 1
      }
    };
  }

  // Низкое качество и есть попытки — тоже retry
  if (quality < 5 && retryCount < maxRetries) {
    console.log(`🔄 Retry из-за низкого качества: ${quality}/10`);
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry",
      metadata: {
        ...state.metadata,
        retryAt: new Date().toISOString(),
        retryReason: "low_quality",
        retryCount: retryCount + 1
      }
    };
  }

  console.log("✅ Retry не требуется");
  return {
    ...state,
    processingStage: "no_retry_needed"
  };
}

// =============================================================================
// Узел: fallback — запасной ответ при исчерпании retry или ошибке.
// =============================================================================
async function fallbackProcessing(state) {
  console.log("🛟 Fallback обработка");

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
    processingStage: "fallback_completed",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackType: "manual"
    }
  };
}

// =============================================================================
// Узел принятия решений: по processingStage и метрикам выбираем следующий узел (nextStep).
// =============================================================================
async function decideNode(state) {
  console.log("🤔 Принимаю решение о следующем шаге");

  const { processingStage, error, retryCount, maxRetries, quality } = state;

  let nextStep = "retry_logic";
  if (processingStage === "analysis") {
    nextStep = "select_strategy";
  } else if (processingStage === "fast_processing") {
    nextStep = "fast_processing";
  } else if (processingStage === "detailed_processing") {
    nextStep = "detailed_processing";
  } else if (processingStage === "standard_processing") {
    nextStep = "standard_processing";
  } else if (processingStage === "completed") {
    nextStep = "quality_check";
  } else if (processingStage === "retry") {
    nextStep = "select_strategy";
  } else if (error && retryCount >= maxRetries) {
    nextStep = "fallback";
  } else if (quality < 5 && retryCount >= maxRetries) {
    nextStep = "fallback";
  } else if (processingStage === "quality_checked" && quality >= 5) {
    nextStep = "end";
  }

  return {
    ...state,
    nextStep,
    processingStage: "decision_made",
    metadata: {
      ...state.metadata,
      decisionMade: true,
      decisionAt: new Date().toISOString(),
      previousStage: processingStage,
      nextStep
    }
  };
}

// =============================================================================
// Сборка графа: узлы, начальные рёбра, условные переходы от decide по state.nextStep.
// =============================================================================
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
  // Следующий узел после decide берётся из state.nextStep (заполняет decideNode)
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

const app = workflow.compile();

// =============================================================================
// Запуск графа с заданным запросом. Возвращает финальное состояние с метриками.
// =============================================================================
async function runAdvancedGraph(query) {
  console.log("🚀 Запускаю продвинутый граф LangGraph...");

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
    metadata: {
      startedAt: new Date().toISOString()
    }
  };

  try {
    const result = await app.invoke(initialState);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log("✅ Продвинутый граф выполнен успешно!");

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
    console.error("❌ Ошибка при выполнении продвинутого графа:", error);
    throw error;
  }
}

async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("❌ OPENAI_API_KEY не найден в переменных окружения. Задайте ключ в файле ../.env");
    }

    console.log("🎓 Продвинутый граф LangGraph");
    console.log("=".repeat(50));

    // Запрос из аргумента командной строки или демо-запросы
    const cliQuery = process.argv.slice(2).join(" ").trim();
    const testQueries = cliQuery
      ? [cliQuery]
      : [
        "Что такое машинное обучение?",
        "Проведи детальный анализ влияния искусственного интеллекта на современную экономику, сравни с предыдущими технологическими революциями и оцени перспективы развития",
        "Объясни разницу между машинным обучением и глубоким обучением"
      ];

    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю...");

      const result = await runAdvancedGraph(query);

      console.log("✅ Результат:");
      console.log("-".repeat(40));
      console.log(result.response);
      console.log("-".repeat(40));
      console.log("📊 Анализ:");
      console.log(`  - Тип: ${result.queryType}`);
      console.log(`  - Сложность: ${result.queryComplexity}/10`);
      console.log(`  - Домен: ${result.domain}`);
      console.log(`  - Уверенность: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  - Качество: ${result.quality}/10`);
      console.log(`  - Retry: ${result.retryCount}/${result.maxRetries}`);
      console.log(`  - Fallback: ${result.fallbackUsed ? "Да" : "Нет"}`);
      console.log(`  - Время: ${result.processingTime}ms`);
      console.log(`  - Токены: ${result.tokensUsed}`);
      if (result.error) {
        console.log(`  - Ошибка: ${result.error}`);
      }
      console.log(`💬 Сообщений: ${result.messages.length}`);
    }
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
    process.exitCode = 1;
  }
}

// Запуск при прямом вызове файла (node index.js или node index.js "запрос")
// Проверка через сравнение путей, работает на Windows и Unix
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  main();
}

// Экспортируем для использования в других модулях
export { runAdvancedGraph, app, AdvancedGraphState };
