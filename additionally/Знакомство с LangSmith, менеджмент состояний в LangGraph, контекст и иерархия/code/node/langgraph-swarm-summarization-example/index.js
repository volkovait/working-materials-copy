// ChatOpenAI — клиент для вызова OpenAI-совместимых моделей (GPT и др.)
import { ChatOpenAI } from "@langchain/openai";
// createSwarm — сборка мультиагентного графа, где агенты передают управление друг другу
// createHandoffTool — инструмент «передать управление другому агенту»
import { createSwarm, createHandoffTool } from "@langchain/langgraph-swarm";
// createReactAgent — создаёт одного агента (модель + инструменты) в виде графа LangGraph
import { createReactAgent } from "@langchain/langgraph/prebuilt";
// tool — функция для объявления инструмента агента (имя, описание, схема аргументов)
import { tool } from "@langchain/core/tools";
// zod — валидация и описание схемы аргументов инструментов
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
// dotenv — загрузка переменных окружения из файла .env
import dotenv from "dotenv";
// Типы сообщений диалога: от пользователя, от модели, системные (инструкции)
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
// MemorySaver — хранилище состояния диалога в памяти (для многошаговых сессий)
import { MemorySaver } from "@langchain/langgraph";

// В ES-модулях нет __dirname; получаем его из import.meta.url для путей к файлам
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env из родительской папки (node/.env), чтобы не светить ключи в коде
dotenv.config({ path: path.resolve(__dirname, "../.env") });

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ ОШИБКА: Установите OPENAI_API_KEY в файле .env");
  process.exit(1);
}

// Основная модель для агентов: отвечает на запросы и решает, какой инструмент вызвать
const model = new ChatOpenAI({
  modelName: "gpt-5.2",
  temperature: 0.3,
  maxTokens: 2000,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// Отдельная модель для суммаризации: дешевле и с temperature=0 для стабильного пересказа
const summarizerModel = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 1000,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ==========================================
// 1. ИНСТРУМЕНТЫ ДЛЯ АГЕНТОВ
// ==========================================
// Инструменты — это функции, которые агент может вызывать по имени.
// У каждого инструмента: имя (name), описание (description) и схема аргументов (schema).
// Модель сама решает, когда вызвать инструмент и с какими аргументами.

// list_directory — показывает список файлов и папок в указанной директории.
// Агент передаёт dirPath (например, '.' или 'src'); мы разрешаем путь относительно папки скрипта.
const listDirTool = tool(
  async ({ dirPath }) => {
    try {
      const fullPath = path.resolve(__dirname, dirPath);
      const files = fs.readdirSync(fullPath);
      return `Содержимое директории '${dirPath}':\n${files.join("\n")}`;
    } catch (e) {
      return `Ошибка при чтении директории: ${e.message}`;
    }
  },
  {
    name: "list_directory",
    description: "Возвращает список файлов в указанной директории.",
    schema: z.object({
      dirPath: z.string().describe("Относительный путь к директории (например, '.')"),
    }),
  }
);

// read_file — читает текст из файла. Агент указывает filePath; результат возвращается как строка.
const readFileTool = tool(
  async ({ filePath }) => {
    try {
      const fullPath = path.resolve(__dirname, filePath);
      const content = fs.readFileSync(fullPath, "utf-8");
      return `Содержимое файла '${filePath}':\n${content}`;
    } catch (e) {
      return `Ошибка при чтении файла: ${e.message}`;
    }
  },
  {
    name: "read_file",
    description: "Читает содержимое указанного файла.",
    schema: z.object({
      filePath: z.string().describe("Относительный путь к файлу"),
    }),
  }
);

// write_file — создаёт или перезаписывает файл. Агент передаёт путь и текст.
const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const fullPath = path.resolve(__dirname, filePath);
      fs.writeFileSync(fullPath, content, "utf-8");
      return `Файл '${filePath}' успешно сохранен.`;
    } catch (e) {
      return `Ошибка при записи файла: ${e.message}`;
    }
  },
  {
    name: "write_file",
    description: "Записывает текст в файл (создает или перезаписывает существующий).",
    schema: z.object({
      filePath: z.string().describe("Относительный путь к файлу"),
      content: z.string().describe("Текст для записи в файл"),
    }),
  }
);

// ==========================================
// 2. СУММАРИЗАЦИЯ КОНТЕКСТА
// ==========================================
// У моделей ограничен размер «окна» (контекста). Если история диалога большая,
// мы не можем отправить все сообщения. Стратегия «сжатие в саммари»:
// старые сообщения отправляем в модель с просьбой «кратко пересказать»,
// затем подставляем один блок с саммари + последние N сообщений без изменений.

// Порог: если в истории больше 6 сообщений — запускаем суммаризацию.
const MAX_MESSAGES_BEFORE_SUMMARY = 6;

/**
 * Суммаризирует старые сообщения в одно краткое системное сообщение,
 * оставляя последние сообщения без изменений. Уменьшает объём контекста.
 * @param {Array} messages — массив сообщений (BaseMessage или { role, content })
 * @returns {Promise<Array>} — массив с саммари в начале и последними сообщениями
 */
async function summarizeContextIfNeeded(messages) {
  // Мало сообщений — ничего не делаем, возвращаем как есть.
  if (messages.length <= MAX_MESSAGES_BEFORE_SUMMARY) {
    return messages;
  }

  // Делим: «старые» идут на суммаризацию, последние 4 — оставляем как есть.
  const toSummarize = messages.slice(0, -4); // оставляем последние 4 сообщения
  const toKeep = messages.slice(-4);

  // Собираем из старых сообщений один текст вида [role]: content для промпта.
  const textToSummarize = toSummarize
    .map((m) => {
      const role = m.role || m._getType?.() || "unknown";
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${role}]: ${content}`;
    })
    .join("\n\n");

  // Просим модель кратко пересказать: задача, выводы, данные, решения.
  const summaryPrompt = `Сократи историю диалога до ключевых фактов и решений. Сохрани: задачу пользователя, важные выводы агентов, прочитанные файлы/данные, принятые решения. Ответь одним коротким абзацем на русском.`;

  const response = await summarizerModel.invoke([
    new SystemMessage(summaryPrompt),
    new HumanMessage(textToSummarize),
  ]);

  // Ответ модели может быть строкой или массивом (multimodal); достаём текст.
  const summaryContent =
    typeof response.content === "string"
      ? response.content
      : response.content?.[0]?.text ?? String(response.content);
  const summaryMessage = new SystemMessage(
    `[Суммаризация контекста]\n${summaryContent}`
  );

  // Итог: одно сообщение-саммари + последние 4 сообщения (контекст стал короче).
  return [summaryMessage, ...toKeep];
}

// Приводим «сырые» объекты { role, content } к типам HumanMessage/AIMessage,
// чтобы граф всегда получал массив BaseMessage.
function normalizeMessages(messages) {
  return messages.map((m) => {
    if (m && typeof m.content !== "undefined" && (m.role || m._getType)) {
      return m;
    }
    if (m && m.role === "user") {
      return new HumanMessage(m.content);
    }
    if (m && m.role === "assistant") {
      return new AIMessage(m.content);
    }
    return m;
  });
}

// ==========================================
// 3. АГЕНТЫ SWARM С HANDOFF (createReactAgent для совместимости с createSwarm)
// ==========================================
// createReactAgent возвращает скомпилированный граф агента (с узлом "tools").
// Swarm внутри себя вызывает agent.getGraph(), поэтому нужен именно такой граф,
// а не createAgent из пакета langchain.

// Исследователь: может листать директории, читать файлы и «передать» задачу писателю.
// Когда он решает, что нужно создать файл — вызывает handoff-инструмент transfer_to_writer.
const researcherAgent = createReactAgent({
  llm: model,
  tools: [
    listDirTool,
    readFileTool,
    createHandoffTool({ agentName: "writer", description: "Передать задачу на запись файла или генерацию кода писателю" }),
  ],
  prompt:
    "Ты — агент-исследователь. Изучай файлы и директории через list_directory и read_file. " +
    "Когда нужно создать или изменить файл — передай управление писателю (writer) через handoff.",
  name: "researcher",
});

// Писатель: может только записывать файлы и «передать» задачу исследователю.
// Если нужны данные из файлов — вызывает transfer_to_researcher.
const writerAgent = createReactAgent({
  llm: model,
  tools: [
    writeFileTool,
    createHandoffTool({ agentName: "researcher", description: "Передать задачу на чтение файлов исследователю" }),
  ],
  prompt:
    "Ты — агент-писатель. Генерируй код и документацию, записывай в файлы через write_file. " +
    "Если нужны данные из файлов — передай управление исследователю (researcher).",
  name: "writer",
});

// ==========================================
// 4. SWARM (МУЛЬТИАГЕНТНАЯ СИСТЕМА БЕЗ СУПЕРВИЗОРА)
// ==========================================
// В Swarm нет центрального «менеджера». Граф знает всех агентов и стартует с defaultActiveAgent.
// Когда агент вызывает handoff-инструмент — граф переключает активного агента и передаёт ему сообщения.
// Роутинг между агентами строится автоматически по метаданным handoff-инструментов.

const workflow = createSwarm({
  agents: [researcherAgent, writerAgent],
  defaultActiveAgent: "researcher", // первый ответ на запрос пользователя даёт исследователь
});

// Checkpointer сохраняет состояние после каждого шага. При одном thread_id можно
// делать несколько вызовов подряд — история не теряется (многошаговый диалог).
const checkpointer = new MemorySaver();
const app = workflow.compile({ checkpointer });

// ==========================================
// 5. ЗАПУСК С УЧЁТОМ СУММАРИЗАЦИИ КОНТЕКСТА
// ==========================================

async function run() {
  console.log("🚀 Мультиагентная система: Swarm + суммаризация контекста\n");

  // Формулируем задачу: исследователь изучит папку и package.json, потом передаст писателю создать SUMMARY.md
  const task =
    "Изучи текущую директорию ('.'). Найди package.json, прочитай описание и зависимости. " +
    "Создай файл SUMMARY.md с кратким отчётом о проекте на русском языке.";

  console.log(`📝 Задача: ${task}\n`);

  // Преобразуем объект { role, content } в HumanMessage для графа.
  let messages = normalizeMessages([{ role: "user", content: task }]);

  // Демо суммаризации: раскомментируй блок ниже и задай DEMO_SUMMARIZATION=1,
  // чтобы искусственно удлинить историю и увидеть сжатие контекста в саммари перед вызовом Swarm.
  // if (process.env.DEMO_SUMMARIZATION) {
  //   messages = [
  //     new HumanMessage("Первый запрос в истории."),
  //     new AIMessage("Ответ агента 1."),
  //     new HumanMessage("Второй запрос."),
  //     new AIMessage("Ответ агента 2."),
  //     new HumanMessage("Третий запрос."),
  //     new AIMessage("Ответ агента 3."),
  //     ...messages,
  //   ];
  // }

  // Перед вызовом графа проверяем длину истории. Если сообщений много —
  // старые заменяются одним саммари, чтобы не превысить лимит контекста модели.
  messages = await summarizeContextIfNeeded(messages);
  if (messages.length < 2 || !messages[0].content?.includes?.("[Суммаризация контекста]")) {
    console.log("📋 Контекст в пределах лимита, суммаризация не применялась.\n");
  } else {
    console.log("📋 Применена суммаризация контекста (сжатие в саммари).\n");
  }

  console.log("⏳ Агенты работают (Swarm)...\n");

  // thread_id — идентификатор «беседы». Один и тот же thread_id = одна сессия,
  // состояние которой сохраняется в checkpointer между вызовами.
  const config = { configurable: { thread_id: "swarm-demo-1" } };

  // stream возвращает асинхронный итератор: на каждом шаге графа приходит обновлённое состояние.
  const stream = await app.stream(
    { messages },
    { ...config, streamMode: "values", recursionLimit: 10 }
  );

  // Проходим по каждому «снимку» состояния и логируем, какой агент сработал (по имени последнего сообщения).
  for await (const chunk of stream) {
    const lastMessage = chunk.messages?.[chunk.messages.length - 1];
    if (lastMessage?.name) {
      console.log(`[Агент ${lastMessage.name}]: шаг выполнен.`);
    }
  }

  console.log("\n✅ Задача выполнена. Проверь файл SUMMARY.md в папке проекта.");
}

// Запускаем главную функцию; ошибки выводятся в консоль.
run().catch(console.error);
