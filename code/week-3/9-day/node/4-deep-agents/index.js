/**
 * Демонстрация Deep Agents (LangChain): планирование, инструменты и HITL.
 * Связь с темой «9 — Лучшие практики AI-агентов, HITL, fallback».
 *
 * Запуск: node index.js "Ваш запрос"
 * Без интерактива (автоподтверждение): DEEP_AGENTS_AUTO_APPROVE=1 node index.js "Запрос"
 */

import { createDeepAgent } from "deepagents";
import { tool } from "@langchain/core/tools";
import { MemorySaver, Command } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
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
// Инструменты агента
// =============================================================================

/** Простой инструмент: «погода» в городе (заглушка для демо). */
const getWeather = tool(
  ({ city }) => {
    return `В городе ${city} условно солнечно, +22 °C. (Демо-ответ.)`;
  },
  {
    name: "get_weather",
    description: "Узнать погоду в указанном городе",
    schema: z.object({
      city: z.string().describe("Название города"),
    }),
  }
);

/**
 * Инструмент, требующий подтверждения человека (HITL).
 * В конфиге агента для него включён interruptOn — перед вызовом агент приостановится.
 */
const sendNotification = tool(
  ({ recipient, message }) => {
    return `Уведомление отправлено: ${recipient} — "${message}"`;
  },
  {
    name: "send_notification",
    description: "Отправить уведомление указанному получателю (требуется подтверждение)",
    schema: z.object({
      recipient: z.string().describe("Получатель (имя или идентификатор)"),
      message: z.string().describe("Текст уведомления"),
    }),
  }
);

// =============================================================================
// Создание Deep Agent с HITL и checkpointer
// =============================================================================

/** Checkpointer обязателен для human-in-the-loop (сохранение состояния при паузе). */
const checkpointer = new MemorySaver();

/** Модель: OpenAI-совместимый API (как в остальных примерах 9-day). */
function createModel() {
  return new ChatOpenAI({
    modelName: "gpt-5.2",
    temperature: 0.5,
    maxTokens: 1024,
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : undefined,
  });
}

/** Создание агента: инструменты, системный промпт, HITL для send_notification. */
let agentPromise = null;

async function getAgent() {
  if (!agentPromise) {
    agentPromise = createDeepAgent({
      model: createModel(),
      tools: [getWeather, sendNotification],
      systemPrompt:
        "Ты полезный ассистент. Отвечай кратко на русском. " +
        "Для погоды используй get_weather. " +
        "Если пользователь просит отправить уведомление — используй send_notification (перед отправкой потребуется подтверждение человека).",
      interruptOn: {
        send_notification: true, // Пауза перед вызовом — решение человека (approve/reject/edit)
      },
      checkpointer,
    });
  }
  return agentPromise;
}

// =============================================================================
// Обработка прерывания HITL: показ ожидающих действий и ввод решения пользователя
// readline создаётся только при реальном прерывании (лениво), чтобы при запросах
// без HITL (например «Привет») не трогать stdin и избежать UV_HANDLE_CLOSING на Windows.
// =============================================================================

function askUserDecisions(actionRequests, reviewConfigs, rl) {
  const configMap = Object.fromEntries(reviewConfigs.map((c) => [c.actionName, c]));
  const decisions = [];

  return new Promise((resolve) => {
    let i = 0;

    function next() {
      if (i >= actionRequests.length) {
        resolve(decisions);
        return;
      }

      const action = actionRequests[i];
      const reviewConfig = configMap[action.name];
      console.log(`\n🔹 Инструмент: ${action.name}`);
      console.log(`   Аргументы: ${JSON.stringify(action.args, null, 2)}`);
      console.log(`   Допустимые решения: ${reviewConfig.allowedDecisions.join(", ")}`);

      rl.question("   Ваш выбор (approve / reject) [approve]: ", (answer) => {
        const choice = (answer || "approve").trim().toLowerCase();
        if (choice === "reject" && reviewConfig.allowedDecisions.includes("reject")) {
          decisions.push({ type: "reject" });
        } else {
          decisions.push({ type: "approve" });
        }
        i++;
        next();
      });
    }

    next();
  });
}

// =============================================================================
// Запуск агента: один invoke с возможным возобновлением после HITL
// readline создаётся лениво при первом прерывании (если нужен ввод пользователя).
// Возвращает { result, rl }: rl не null только если создавали (нужно закрыть в main).
// =============================================================================

async function runAgent(userMessage, config) {
  const agent = await getAgent();
  let result = await agent.invoke(
    {
      messages: [{ role: "user", content: userMessage }],
    },
    config
  );

  const autoApproval = process.env.DEEP_AGENTS_AUTO_APPROVE === "1" || process.env.DEEP_AGENTS_AUTO_APPROVE === "true";
  let rl = null;

  while (result.__interrupt__) {
    const interruptValue = result.__interrupt__[0]?.value;
    if (!interruptValue?.actionRequests) {
      console.error("Неожиданный формат прерывания:", result.__interrupt__);
      break;
    }

    const { actionRequests, reviewConfigs } = interruptValue;

    console.log("\n🤝 === ТРЕБУЕТСЯ ПОДТВЕРЖДЕНИЕ (HITL) ===");

    let decisions;
    if (autoApproval) {
      console.log("🤖 Режим автоподтверждения: все вызовы одобрены.");
      decisions = actionRequests.map(() => ({ type: "approve" }));
    } else {
      if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      decisions = await askUserDecisions(actionRequests, reviewConfigs, rl);
    }

    result = await agent.invoke(new Command({ resume: { decisions } }), config);
  }

  return { result, rl };
}

// =============================================================================
// Извлечение финального текстового ответа из результата агента
// =============================================================================

function getLastMessageContent(result) {
  const messages = result.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.content && typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content.find((c) => c.type === "text" && c.text);
      if (text) return text.text;
    }
  }
  return "(Ответ не получен)";
}

// =============================================================================
// Точка входа
// =============================================================================

/** Отложенный выход: на Windows при мгновенном process.exit(0) срабатывает
 *  UV_HANDLE_CLOSING (хендлы HTTP/stdio ещё не успевают корректно закрыться).
 *  Не вызываем rl.close() — при exit процесс сам закроет все хендлы. */
const EXIT_DELAY_MS = 250;

async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY не найден. Добавьте ключ в .env в папке node (code/week-3/9-day/node/.env)."
      );
    }

    console.log("🎓 Deep Agents — демо (инструменты + HITL)");
    console.log("=".repeat(50));

    const query = process.argv[2];
    if (!query) {
      console.error("❌ Укажите запрос в аргументе:");
      console.error('   node index.js "Ваш запрос"');
      console.error('   node index.js "Какая погода в Москве?"');
      console.error('   node index.js "Отправь уведомление Васе: встреча в 15:00"');
      process.exit(1);
    }

    console.log(`\n📝 Запрос: ${query}`);

    const threadId = `deep-agents-demo-${Date.now()}`;
    const config = {
      configurable: { thread_id: threadId },
    };

    const { result } = await runAgent(query, config);
    const responseText = getLastMessageContent(result);

    console.log("\n✅ ФИНАЛЬНЫЙ ОТВЕТ:");
    console.log("-".repeat(40));
    console.log(responseText);
    console.log("-".repeat(40));
    console.log(`💬 Сообщений в диалоге: ${(result.messages || []).length}`);

    // Не закрываем readline вручную — на Windows это может вызвать UV_HANDLE_CLOSING.
    // Выход только по таймеру, чтобы HTTP/stdio-хендлы успели корректно завершиться.
    setTimeout(() => process.exit(0), EXIT_DELAY_MS);
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    process.exit(1);
  }
}

const isMainModule =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  main();
}

export { getAgent, runAgent, getLastMessageContent, getWeather, sendNotification };
