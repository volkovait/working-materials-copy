// Модель OpenAI для чата (совместима с OpenAI API и альтернативными провайдерами)
import { ChatOpenAI } from "@langchain/openai";
// Готовый пребилт createReactAgent — агент с циклом "рассуждение → вызов инструментов → ответ"
import { createReactAgent } from "@langchain/langgraph/prebuilt";
// Фабрика для объявления инструментов (tools), которые агент может вызывать
import { tool } from "@langchain/core/tools";
// Валидация и описание схемы параметров инструментов
import { z } from "zod";
// Работа с файловой системой (запись файла в write_file)
import * as fs from "fs";
// Пути к файлам и директориям
import * as path from "path";
// Получение __filename в ESM (в ESM нет глобальных __dirname/__filename)
import { fileURLToPath } from "url";
// Загрузка переменных окружения из .env
import dotenv from "dotenv";

// В ESM-модулях нет встроенных __dirname и __filename — восстанавливаем их из import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env из родительской папки (../.env), чтобы подтянуть OPENAI_API_KEY и опционально LangSmith
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Проверка наличия API-ключа: без него запросы к LLM невозможны
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ ОШИБКА: Установите OPENAI_API_KEY в .env");
  process.exit(1);
}

// LangSmith: при LANGSMITH_TRACING=true и LANGSMITH_API_KEY трейсы уходят в LangSmith автоматически.

// Настройка LLM: модель, температура (0 — детерминированные ответы), лимит токенов и опциональный кастомный baseURL (например, для прокси или локальных API)
const model = new ChatOpenAI({
  modelName: "gpt-5.2",
  temperature: 0,
  maxTokens: 500,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: process.env.OPENAI_BASE_URL
    ? { baseURL: process.env.OPENAI_BASE_URL }
    : undefined,
});

// ==========================================
// Инструменты для демо LangSmith
// ==========================================

// Инструмент без параметров: возвращает фиксированное приветствие. Нужен для демонстрации цепочки вызовов в LangSmith.
const getGreetingTool = tool(
  async () => "LangSmith Demo — приветствие от инструмента get_greeting.",
  {
    name: "get_greeting",
    description: "Возвращает короткое приветствие. Вызови один раз.",
    schema: z.object({}),
  }
);

// Инструмент с параметрами: записывает переданный текст в файл по относительному пути (от __dirname). Путь резолвится через path.resolve для безопасности.
const writeFileTool = tool(
  async ({ filePath, content }) => {
    const fullPath = path.resolve(__dirname, filePath);
    fs.writeFileSync(fullPath, content, "utf-8");
    return `Записано в ${filePath}`;
  },
  {
    name: "write_file",
    description: "Записывает текст в файл. Параметры: filePath, content.",
    schema: z.object({
      filePath: z.string().describe("Имя файла, например greeting.txt"),
      content: z.string().describe("Текст для записи"),
    }),
  }
);

// Один агент с двумя инструментами — без супервизора и handoff (избегаем ошибки "tool_calls без ответов" на кастомных API).
// createReactAgent возвращает уже скомпилированный граф: агент сам решает, когда вызывать инструменты и когда завершить ответ.
// prompt задаёт сценарий для демо: сначала get_greeting, затем write_file с результатом, затем финальное сообщение.
const graph = createReactAgent({
  llm: model,
  tools: [getGreetingTool, writeFileTool],
  prompt:
    "Сначала вызови get_greeting. Потом вызови write_file: filePath=greeting.txt, content=результат get_greeting. В конце ответь: Готово, результат в greeting.txt.",
});

// ==========================================
// Запуск
// ==========================================
// Запуск графа в режиме стриминга: получаем обновления state по мере выполнения шагов агента.
async function run() {
  console.log("🚀 Демо: агент + LangSmith (один агент, два инструмента)\n");
  if (process.env.LANGSMITH_TRACING === "true" && process.env.LANGSMITH_API_KEY) {
    console.log("📊 LangSmith: трейсинг включён.\n");
  }

  const task = "Получи приветствие через get_greeting и запиши его в greeting.txt.";

  console.log(`📝 Задача: ${task}\n`);

  // graph.stream принимает начальное состояние (messages с одним user-сообщением) и опции.
  // streamMode: "values" — стримятся полные снимки state после каждого шага.
  // recursionLimit: 10 — максимум шагов графа (защита от бесконечных циклов).
  const stream = await graph.stream(
    { messages: [{ role: "user", content: task }] },
    { streamMode: "values", recursionLimit: 10 }
  );

  // Итерируем по чанкам стрима; считаем шаги по появлению непустого контента в последнем сообщении (ответы агента).
  let step = 0;
  for await (const chunk of stream) {
    const last = chunk.messages[chunk.messages.length - 1];
    if (last?.content && typeof last.content === "string" && last.content.length > 0) {
      step += 1;
      console.log(`[агент]: шаг ${step}`);
    }
  }

  console.log("\n✅ Готово. Проверь greeting.txt и трейс в LangSmith.");
}

// Запускаем демо; ошибки (например, сетевые или от API) логируем в консоль.
run().catch(console.error);
