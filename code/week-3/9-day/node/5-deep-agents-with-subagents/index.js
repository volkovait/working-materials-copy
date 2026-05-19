/**
 * Демонстрация deepagents: инструменты, делегирование субагентам (tool `task`) и персистентность через MemorySaver + Store.
 */

import "dotenv/config";
import { tool } from "langchain";
import { z } from "zod";
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver, InMemoryStore } from "@langchain/langgraph";
import {
  createDeepAgent,
  CompositeBackend,
  StateBackend,
  StoreBackend,
} from "deepagents";

/** Идентификатор диалоговой «нити» LangGraph — один thread_id = одна сессия в MemorySaver */
const DEMO_THREAD_ID = "demo-deep-agent-thread";

/** Создание клиента чата через тот же шлюз, что и у «сырого» OpenAI SDK для Polza (baseURL + apiKey) */
const model = new ChatOpenAI({
  model: process.env.POLZA_MODEL ?? "openai/gpt-5.5",
  temperature: 0,
  apiKey: process.env.POLZA_AI_API_KEY,
  configuration: {
    baseURL: process.env.POLZA_BASE_URL ?? "https://polza.ai/api/v1",
  },
});

/**
 * Простая дата/время: показывает, как добавляются пользовательские tools
 * поверх встроенных (write_todos, fs, task, …).
 */
const getServerTimeIso = tool(
  async () => new Date().toISOString(),
  {
    name: "get_server_time_iso",
    description:
      "Возвращает текущее время сервера в формате ISO 8601. Используй для ответов «какое сейчас время».",
    schema: z.object({}),
  }
);

/** Инструмент только у субагента — главный оркестратор не имеет прямого доступа к нему */
const multiplyNumbers = tool(
  async ({ a, b }) => {
    const product = Number(a) * Number(b);
    return `Результат: ${product}`;
  },
  {
    name: "multiply_numbers",
    description: "Точное целочисленное умножение двух чисел.",
    schema: z.object({
      a: z.number().describe("Первый множитель"),
      b: z.number().describe("Второй множитель"),
    }),
  }
);

/**
 * Субагент описан в параметре createDeepAgent({ subagents }).
 * Главный агент может вызывать его через встроенный tool `task` (контекст изолирован).
 */
const mathSubagent = {
  name: "math-assistant",
  description:
    "Узкий специалист для точных арифметических умножений больших чисел. Делегируй сюда, если нужен multiply_numbers.",
  systemPrompt:
    "Ты субагент для умножения. Отвечай кратко. Всегда вызывай multiply_numbers и верни результат.",
  tools: [multiplyNumbers],
};

const systemPrompt = `Ты демонстрационный orchestrator Deep Agent.

Что уже есть автоматически (не перечисляй пользователю списком без нужды):
- планирование (write_todos),
- виртуальная файловая система; префикс /memories/ хранится в LangGraph Store (долговременно между тредами),
- вызов субагентов через инструмент task.

Правила:
1. Для «какое сейчас время» используй get_server_time_iso.
2. Для точного умножения больших чисел вызывай субагента math-assistant через task.
3. Если пользователь назвал своё имя — сохрани его в файл /notes/user_prefs.txt средствами виртуальной ФС агента.

Отвечай по-русски.`;

/**
 * CompositeBackend: обычные файлы — в StateBackend (привязка к чекпоинту треда),
 * путь /memories/ — в StoreBackend (InMemoryStore в демо = «долгая» память в рамках процесса).
 */
const checkpointer = new MemorySaver();
const store = new InMemoryStore();

const agent = createDeepAgent({
  model, // model: "openai/gpt-5.5",
  systemPrompt, // "Ты демонстрационный orchestrator Deep Agent.
  tools: [getServerTimeIso], // набор инструментов, которые можно использовать в диалоге
  subagents: [mathSubagent], // набор субагентов, которые можно использовать в диалоге
  checkpointer, // checkpointer: обычные файлы — в StateBackend (привязка к чекпоинту треда),
  store, // store: путь /memories/ — в StoreBackend (InMemoryStore в демо = «долгая» память в рамках процесса).
  backend: () =>
    new CompositeBackend(new StateBackend(), {
      "/memories/": new StoreBackend(), // "/memories/": new StoreBackend(),
    }),
});

// Функция для получения последнего текста от AI
function lastAiText(state) {
  const messages = state?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m instanceof AIMessage) {
      const c = m.content;
      if (typeof c === "string") return c;
      return JSON.stringify(c);
    }
  }
  return JSON.stringify(state, null, 2);
}

// Основная функция для запуска демо
async function main() {
  // Проверка наличия ключа API в .env
  if (!process.env.POLZA_AI_API_KEY) {
    console.error(
      "Задайте POLZA_AI_API_KEY в .env (ключ Polza.ai). Опционально: POLZA_MODEL, POLZA_BASE_URL."
    );
    process.exit(1);
  }

  const customQuery = process.argv.slice(2).join(" ").trim();

  const runnableConfig = {
    configurable: { thread_id: DEMO_THREAD_ID },
  };

  if (customQuery) {
    const once = await agent.invoke({ messages: [{ role: "user", content: customQuery }] }, runnableConfig);
    console.log(lastAiText(once));
    return;
  }

  // Первый invoke: tools + делегирование субагенту (task) + запись в виртуальную ФС.
  console.log("\n--- Первое сообщение ---\n");
  const round1 = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content:
            "Меня зовут Анна. Сколько будет 83421 * 56009? После вычисления скажи серверное время в ISO. Сохрани моё имя в /notes/user_prefs.txt.",
        },
      ],
    },
    runnableConfig
  );
  console.log(lastAiText(round1));

  // Второй invoke с тем же thread_id: MemorySaver восстанавливает историю шага выше.
  console.log("\n--- Второе сообщение (память сессии) ---\n");
  const round2 = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content: "Напомни моё имя и какие числа мы умножали — одной короткой фразой, без пересчёта.",
        },
      ],
    },
    runnableConfig
  );
  console.log(lastAiText(round2));
}

// Обработка ошибок
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
