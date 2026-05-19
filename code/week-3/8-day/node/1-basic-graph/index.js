/**
 * Базовый пример LangGraph: граф с одним узлом и вызов LLM (OpenAI-совместимый API).
 * Учебный проект для пошагового разбора работы StateGraph.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// --- Инициализация путей и переменных окружения ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Путь к .env для проверки работы: code/week-3/8-day/node/.env
const ENV_PATH = path.resolve(__dirname, "../.env");
dotenv.config({ path: ENV_PATH });

// --- Схема состояния графа (Zod) ---
// Описывает, какие поля есть у состояния и как они валидируются
const BasicGraphState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  metadata: z.record(z.any()).default({}),
});

/**
 * Узел графа: обрабатывает пользовательский запрос через LLM (OpenAI-совместимый API).
 * Принимает текущее состояние, возвращает обновлённое состояние.
 */
async function processUserQuery(state) {
  console.log("🔍 Обрабатываю запрос:", state.userQuery);

  // Модель ChatOpenAI (bothub.chat / OpenAI-совместимый endpoint)
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://bothub.chat/api/v2/openai/v1",
    },
  });

  // Шаблон диалога: системное сообщение + плейсхолдер для запроса пользователя
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Ты полезный AI-ассистент. Отвечай кратко и по делу на русском языке."],
    ["human", "{query}"],
  ]);

  try {
    // Собираем цепочку: промпт → модель, затем вызываем с запросом из state
    const chain = prompt.pipe(model);
    const result = await chain.invoke({
      query: state.userQuery,
    });

    // Оборачиваем запрос и ответ в типизированные сообщения для истории
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);

    console.log("✅ Получен ответ от AI");

    // Возвращаем новое состояние графа (все поля обязательны для StateGraph)
    return {
      userQuery: state.userQuery,
      response: result.content,
      messages: [userMessage, aiMessage],
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        model: "gpt-4o-mini",
      },
    };
  } catch (error) {
    console.error("❌ Ошибка при обработке:", error.message);

    // При ошибке возвращаем состояние с сообщением об ошибке в response и metadata
    return {
      userQuery: state.userQuery,
      response: "Извините, произошла ошибка при обработке запроса.",
      messages: state.messages,
      metadata: {
        ...state.metadata,
        error: error.message,
        errorAt: new Date().toISOString(),
      },
    };
  }
}

// --- Построение графа ---
// 1. Создаём граф с заданной схемой состояния
// 2. Добавляем один узел "process_query"
// 3. Задаём рёбра: START → process_query → END
const workflow = new StateGraph(BasicGraphState)
  .addNode("process_query", processUserQuery)
  .addEdge(START, "process_query")
  .addEdge("process_query", END);

// Компилируем граф в вызываемое приложение (CompiledStateGraph)
const app = workflow.compile();

/**
 * Запускает граф с одним пользовательским запросом.
 * Формирует начальное состояние и вызывает app.invoke().
 */
async function runBasicGraph(query) {
  console.log("🚀 Запускаю базовый граф LangGraph...");

  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    metadata: {
      startedAt: new Date().toISOString(),
    },
  };

  try {
    const result = await app.invoke(initialState);
    console.log("✅ Граф выполнен успешно!");
    return result;
  } catch (error) {
    console.error("❌ Ошибка при выполнении графа:", error);
    throw error;
  }
}

/**
 * Точка входа: проверка API ключа, выбор запросов (CLI или тестовые), вывод результата в терминал.
 */
async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("❌ OPENAI_API_KEY не найден в переменных окружения");
    }

    console.log("🎓 Базовый пример LangGraph");
    console.log("=".repeat(50));
    console.log("📁 .env для проверки работы:", ENV_PATH);

    // Если передан аргумент командной строки — используем его как единственный запрос
    const customQuery = process.argv[2];
    const queries = customQuery
      ? [customQuery]
      : [
        "Что такое искусственный интеллект?",
        "Расскажи о последних новостях в IT",
        "Объясни простыми словами, что такое блокчейн",
      ];

    for (const query of queries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю...");

      const result = await runBasicGraph(query);

      console.log("✅ Результат:");
      console.log("-".repeat(40));
      console.log(result.response);
      console.log("-".repeat(40));
      console.log("📊 Метаданные:", result.metadata);
      console.log("💬 Сообщений:", result.messages.length);
    }
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
    console.log("\n💡 Проверьте:");
    console.log("1. Создан ли файл .env в папке node с OPENAI_API_KEY");
    console.log("2. Путь к .env для проверки:", ENV_PATH);
    console.log("3. Корректность API ключа");
    console.log("4. Подключение к интернету");
    process.exitCode = 1;
  }
}

// Запуск main() только при прямом вызове файла (node index.js или npm start)
// pathToFileURL нужен для корректного сравнения путей на Windows
const isRunDirectly =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isRunDirectly) {
  main();
}

export { runBasicGraph, app, BasicGraphState };
