import { ChatOpenAI } from "@langchain/openai";
import { createSwarm, createHandoffTool } from "@langchain/langgraph-swarm";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env из родительской директории
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Проверяем наличие ключа от OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ ОШИБКА: Пожалуйста, установите OPENAI_API_KEY в файле .env");
  process.exit(1);
}

// Инициализация модели
const model = new ChatOpenAI({
  modelName: "gpt-5.2",
  temperature: 0.5,
  maxTokens: 500,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ==========================================
// 1. ОПРЕДЕЛЯЕМ ИНСТРУМЕНТЫ ДЛЯ АГЕНТОВ
// ==========================================

// Инструмент для чтения содержимого директории
const listDirTool = tool(
  async ({ dirPath }) => {
    try {
      const fullPath = path.resolve(__dirname, dirPath);
      const files = fs.readdirSync(fullPath);
      return `Содержимое директории '${dirPath}':\n${files.join('\n')}`;
    } catch (e) {
      return `Ошибка при чтении директории: ${e.message}`;
    }
  },
  {
    name: "list_directory",
    description: "Возвращает список файлов в указанной директории.",
    schema: z.object({
      dirPath: z.string().describe("Относительный путь к директории (например, '.')")
    })
  }
);

// Инструмент для чтения файла
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
      filePath: z.string().describe("Относительный путь к файлу")
    })
  }
);

// Инструмент для записи в файл
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
      content: z.string().describe("Текст для записи в файл")
    })
  }
);

// ==========================================
// 2. ИНСТРУМЕНТЫ HANDOFF (ПЕРЕДАЧА УПРАВЛЕНИЯ)
// ==========================================
// В Swarm-архитектуре нет центрального менеджера: агенты сами решают,
// когда передать задачу коллеге, вызывая специальный handoff-инструмент.

// Researcher может передать управление Writer'у
const handoffToWriter = createHandoffTool({
  agentName: "writer",
  description: "Передать управление writer'у, когда вся необходимая информация уже собрана и пора создавать или изменять файлы."
});

// Writer может передать управление обратно Researcher'у
const handoffToResearcher = createHandoffTool({
  agentName: "researcher",
  description: "Передать управление researcher'у, если для написания результата не хватает фактов и их нужно собрать (прочитать файлы или просмотреть директорию)."
});

// ==========================================
// 3. СОЗДАЕМ СПЕЦИАЛИЗИРОВАННЫХ АГЕНТОВ
// ==========================================
// Важно: @langchain/langgraph-swarm вызывает agent.getGraph() и ожидает узел "tools"
// с handoff-инструментами. Это даёт createReactAgent из @langchain/langgraph/prebuilt,
// а не createAgent из пакета "langchain".

// Агент-исследователь: собирает контекст из файловой системы
const researcherAgent = createReactAgent({
  llm: model,
  tools: [listDirTool, readFileTool, handoffToWriter],
  name: "researcher",
  prompt:
    "Ты — агент-исследователь кода. Твоя задача — изучать файлы и директории проекта, чтобы собрать нужный контекст. " +
    "Используй инструменты list_directory и read_file для поиска и чтения информации. " +
    "Как только данных достаточно, чтобы коллега-writer мог выполнить запись результата, ОБЯЗАТЕЛЬНО вызови инструмент передачи управления writer'у. " +
    "Не пытайся писать файлы сам — это зона ответственности writer'а."
});

// Агент-писатель: пишет код и создает файлы
const writerAgent = createReactAgent({
  llm: model,
  tools: [writeFileTool, handoffToResearcher],
  name: "writer",
  prompt:
    "Ты — агент-разработчик. Твоя задача — генерировать код или документацию и записывать их в файлы с помощью write_file. " +
    "Тебе нельзя читать файлы. Если для выполнения задачи тебе не хватает фактов, передай управление обратно researcher'у через соответствующий инструмент. " +
    "Когда файл успешно записан и задача выполнена, дай короткий финальный ответ пользователю."
});

// ==========================================
// 4. СОЗДАЕМ SWARM-ГРАФ
// ==========================================

// createSwarm собирает агентов в единый граф с общим списком сообщений
// и поддерживает state "активного агента" (кто работает сейчас).
const workflow = createSwarm({
  agents: [researcherAgent, writerAgent],
  defaultActiveAgent: "researcher" // Стартуем со сбора информации
});

// Чекпоинтер обязателен: он хранит, какой агент был активен,
// и позволяет корректно продолжать многошаговый диалог.
const checkpointer = new MemorySaver();
const app = workflow.compile({ checkpointer });

// ==========================================
// 5. ЗАПУСК ПРИМЕРА
// ==========================================
async function run() {
  console.log("🐝 Запускаем мультиагентную систему (Swarm)...\n");

  // Утилитарная задача: проанализировать текущую директорию и создать файл SUMMARY.md
  const task = "Изучи текущую директорию ('.'). Найди файл package.json, прочитай его описание (description) и список зависимостей. На основе этого создай файл SUMMARY.md с кратким отчетом о проекте на русском языке.";

  console.log(`📝 Задача: ${task}\n`);
  console.log("⏳ Агенты работают (может занять несколько секунд)...\n");

  const config = { configurable: { thread_id: "swarm-demo-1" } };

  const stream = await app.stream({
    messages: [
      {
        role: "user",
        content: task
      }
    ]
  }, { ...config, streamMode: "values" });

  // Логируем шаги агентов для наглядности
  for await (const chunk of stream) {
    const lastMessage = chunk.messages[chunk.messages.length - 1];
    if (lastMessage && lastMessage.name) {
      console.log(`[Агент ${lastMessage.name}]: Выполнил шаг работы.`);
    }
    if (chunk.activeAgent) {
      console.log(`➡️ Активный агент: ${chunk.activeAgent}`);
    }
  }

  console.log("\n✅ Задача выполнена!");
  console.log("Загляни в папку проекта — там должен был появиться файл SUMMARY.md.");
}

run().catch(console.error);