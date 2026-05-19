import { ChatOpenAI } from "@langchain/openai";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createAgent } from "langchain";
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
// 2. СОЗДАЕМ СПЕЦИАЛИЗИРОВАННЫХ АГЕНТОВ
// ==========================================

// Агент-исследователь: собирает контекст из файловой системы
const researcherAgent = createAgent({
  model,
  tools: [listDirTool, readFileTool],
  name: "researcher",
  systemPrompt: "Ты — агент-исследователь кода. Твоя задача — изучать файлы и директории проекта. Всегда используй предоставленные инструменты для чтения, чтобы собрать необходимый контекст."
});
researcherAgent.name = "researcher"; // необходимо для langgraph-supervisor

// Агент-писатель: пишет код и создает файлы
const writerAgent = createAgent({
  model,
  tools: [writeFileTool],
  name: "writer",
  systemPrompt: "Ты — агент-разработчик. Твоя задача — генерировать код или документацию и записывать их в файлы. Тебе нельзя читать файлы."
});
writerAgent.name = "writer"; // необходимо для langgraph-supervisor

// ==========================================
// 3. СОЗДАЕМ СУПЕРВИЗОРА
// ==========================================

// Супервизор координирует работу других агентов
const workflow = createSupervisor({
  agents: [researcherAgent, writerAgent],
  llm: model,
  outputMode: "full_history",
  prompt: 
    "Ты — технический лид (супервизор), управляющий командой из исследователя (researcher) и писателя (writer). " +
    "Твоя цель — выполнить запрос пользователя, делегируя задачи нужным агентам. " +
    "Для сбора информации и чтения файлов используй researcher. " +
    "Для создания или изменения файлов используй writer. " +
    "Если задача состоит из нескольких шагов, передавай управление агентам последовательно (сначала собрать данные, затем записать результат). " +
    "Когда задача полностью выполнена, дай финальный ответ пользователю."
});

// Компилируем граф
const app = workflow.compile();

// ==========================================
// 4. ЗАПУСК ПРИМЕРА
// ==========================================
async function run() {
  console.log("🚀 Запускаем мультиагентную систему (Супервизор)...\n");
  
  // Утилитарная задача: проанализировать текущую директорию и создать файл SUMMARY.md
  const task = "Изучи текущую директорию ('.'). Найди файл package.json, прочитай его описание (description) и список зависимостей. На основе этого создай файл SUMMARY.md с кратким отчетом о проекте на русском языке.";
  
  console.log(`📝 Задача: ${task}\n`);
  console.log("⏳ Агенты работают (может занять несколько секунд)...\n");

  const stream = await app.stream({
    messages: [
      {
        role: "user",
        content: task
      }
    ]
  }, { streamMode: "values" });

  // Логируем шаги агентов для наглядности (опционально)
  for await (const chunk of stream) {
    const lastMessage = chunk.messages[chunk.messages.length - 1];
    if (lastMessage && lastMessage.name) {
      console.log(`[Агент ${lastMessage.name}]: Выполнил шаг работы.`);
    }
  }

  console.log("\n✅ Задача выполнена!");
  console.log("Загляни в папку проекта — там должен был появиться файл SUMMARY.md.");
}

run().catch(console.error);
