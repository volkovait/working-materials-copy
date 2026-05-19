import { StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import * as readline from "readline";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Определение __dirname для ES-модулей и загрузка .env из родительской папки
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Включение трейсинга LangSmith только при наличии API-ключа (иначе 403 при отправке трейсов)
if (process.env.LANGCHAIN_API_KEY) {
  process.env.LANGCHAIN_TRACING_V2 = "true";
  process.env.LANGCHAIN_PROJECT ??= "default";
}

// =============================================================================
// Схема состояния графа с поддержкой HITL (Human in The Loop)
// =============================================================================
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

// =============================================================================
// Узел HITL: запрашивает у оператора решение — принять ответ, отменить или повторить
// =============================================================================
async function humanInTheLoop(state) {
  const autoAccept = process.env.HITL_AUTO_ACCEPT;
  if (autoAccept === "continue" || autoAccept === "1") {
    console.log("\n🤖 Режим без интерактива (HITL_AUTO_ACCEPT): автоматически выбран «Продолжить»");
    return { ...state, humanDecision: "continue", nextStep: "continue" };
  }

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

// =============================================================================
// Валидация запроса: определение типа (simple / complex / error / normal) и уверенности
// =============================================================================
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

// =============================================================================
// Простой процессор: краткий ответ через LLM для простых вопросов («что такое», «кто такой»)
// =============================================================================
async function processSimpleQuery(state) {
  console.log("⚡ Простая обработка");
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
      nextStep: "hitl",
      metadata: { ...state.metadata, node: "simple_processor" }
    };
  } catch (error) {
    return { ...state, error: error.message, confidence: 0.1, nextStep: "hitl" };
  }
}

// =============================================================================
// Сложный процессор: детальный анализ для длинных или сложных запросов
// =============================================================================
async function processComplexQuery(state) {
  console.log("🧠 Сложная обработка");
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 800,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
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
      nextStep: "hitl",
      metadata: { ...state.metadata, node: "complex_processor" }
    };
  } catch (error) {
    return { ...state, error: error.message, confidence: 0.2, nextStep: "hitl" };
  }
}

// =============================================================================
// Узел «улучшенной» модели: повторная попытка с более мощными параметрами (по выбору оператора в HITL)
// =============================================================================
async function processWithUpgradedModel(state) {
  console.log("🔥 UPGRADE: Используем более мощную модель");

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.8,
    maxTokens: 1500,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
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
      nextStep: "hitl",
      metadata: { ...state.metadata, node: "upgraded_processor", upgraded: true }
    };
  } catch (error) {
    return { ...state, error: error.message, confidence: 0.1, nextStep: "cancel" };
  }
}

// =============================================================================
// Fallback: сообщение с извинениями, если оператор выбрал «Отменить» или при ошибке без ответа
// =============================================================================
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

// =============================================================================
// Узел принятия решений: куда идти дальше — процессор, HITL или fallback
// =============================================================================
function decideNextStep(state) {
  console.log("🤔 Решение");

  if (state.error && !state.response) return { ...state, nextStep: "fallback" };
  if (state.response && state.response.length > 10) return { ...state, nextStep: "hitl" };
  if (state.queryType === "simple") return { ...state, nextStep: "simple" };
  if (state.queryType === "complex") return { ...state, nextStep: "complex" };

  return { ...state, nextStep: "simple" };
}

// =============================================================================
// Построение графа: узлы и рёбра (включая условные переходы из HITL)
// =============================================================================
const workflow = new StateGraph(ConditionalGraphState)
  .addNode("validate", validateQuery)
  .addNode("process_simple", processSimpleQuery)
  .addNode("process_complex", processComplexQuery)
  .addNode("fallback", fallbackProcessor)
  .addNode("decide", decideNextStep)
  .addNode("hitl", humanInTheLoop)
  .addNode("upgraded_model", processWithUpgradedModel)

  .addEdge(START, "validate")
  .addEdge("validate", "decide")

  .addConditionalEdges("decide", (s) => s.nextStep, {
    simple: "process_simple",
    complex: "process_complex",
    fallback: "fallback",
    hitl: "hitl",
    end: END
  })

  .addConditionalEdges("hitl", (s) => s.humanDecision, {
    continue: END,
    cancel: "fallback",
    retry: "upgraded_model"
  })

  .addEdge("process_simple", "decide")
  .addEdge("process_complex", "decide")
  .addEdge("upgraded_model", "decide")
  .addEdge("fallback", END);

const app = workflow.compile();

// =============================================================================
// Запуск графа с заданным запросом и начальным состоянием
// =============================================================================
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
    humanDecision: "pending",
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

// =============================================================================
// Точка входа: проверка API-ключа, чтение запроса из argv, запуск графа и вывод результата
// =============================================================================
async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("❌ OPENAI_API_KEY не найден. Добавьте ключ в .env в папке node (code/week-3/8-day/node/.env) или 6-hitl.");
    }

    console.log("🎓 Условный граф с HITL (Human in The Loop)");
    console.log("=".repeat(50));

    const query = process.argv[2];
    if (!query) {
      console.error("❌ Укажите запрос в аргументе:");
      console.error('   node index.js "Ваш запрос"');
      console.error('   npm run query -- "Ваш запрос"');
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
    console.log(`🛟 Fallback: ${result.fallbackUsed ? "Да" : "Нет"}`);
    console.log(`🔄 Попыток: ${result.retryCount}`);
    console.log(`💬 Сообщений: ${result.messages.length}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
    process.exit(1);
  }
}

// Запуск main только при прямом вызове файла (node index.js), не при import
const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  main();
}

export { runConditionalGraph, app, ConditionalGraphState };
