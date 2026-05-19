import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Подключаем .env из родительской директории
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Инициализация модели, как указано в задании
const model = new ChatOpenAI({
  modelName: "gpt-5.2",
  temperature: 0.5,
  maxTokens: 500,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// Состояние графа — общая "доска" (shared scratchpad)
// В Swarm-архитектуре агенты работают в едином контексте сообщений
const GraphState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

// 1. Узел Идейщика (Brainstormer)
async function brainstormerNode(state) {
  const prompt = new SystemMessage(
    "Вы — генератор идей (Brainstormer). Ваша задача — предложить свежую идею или улучшить существующие на основе диалога и критики.\n" +
    "После вашей реплики ход автоматически переходит к Критику. Отвечайте коротко и по делу."
  );
  const response = await model.invoke([prompt, ...state.messages]);
  return { messages: [new AIMessage({ content: response.content, name: "Brainstormer" })] };
}

// 2. Узел Критика (Critic)
async function criticNode(state) {
  const prompt = new SystemMessage(
    "Вы — конструктивный критик (Critic). Ваша задача — оценить идею от Brainstormer.\n" +
    "Если идея отличная, логичная и доработок не требует, обязательно напишите в ответе ключевое слово 'FINAL_ANSWER'.\n" +
    "Если идею можно улучшить, напишите свои замечания, чтобы Brainstormer мог их учесть (НЕ пишите FINAL_ANSWER)."
  );
  const response = await model.invoke([prompt, ...state.messages]);
  return { messages: [new AIMessage({ content: response.content, name: "Critic" })] };
}

// 3. Функция-роутер для определения конца диалога
// Она проверяет, дал ли Критик добро (FINAL_ANSWER)
function checkCompletion(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.content.includes("FINAL_ANSWER")) {
    return END;
  }
  return "Brainstormer"; // Если добро не получено, возвращаем слово Идейщику
}

// 4. Построение графа с архитектурой Swarm
const workflow = new StateGraph(GraphState)
  .addNode("Brainstormer", brainstormerNode)
  .addNode("Critic", criticNode)

  // Точка входа: задача сначала попадает к Идейщику
  .addEdge(START, "Brainstormer")
  // Идейщик всегда напрямую передает слово Критику (совместная работа, без менеджера)
  .addEdge("Brainstormer", "Critic")
  // Условный переход от Критика: либо конец, либо возврат Идейщику
  .addConditionalEdges("Critic", checkCompletion);

// Компиляция графа
const app = workflow.compile();

// Запуск примера
async function run() {
  console.log("🐝 Запуск примера архитектуры Swarm...\n");
  const inputs = {
    messages: [new HumanMessage("Предложите одну инновационную, но простую идею для мобильного приложения, помогающего экономить воду, и доведите её до совершенства.")]
  };

  const stream = await app.stream(inputs, { streamMode: "values" });
  for await (const s of stream) {
    const lastMessage = s.messages[s.messages.length - 1];
    // Пропускаем системные и пользовательские сообщения, выводим только ответы AI
    if (lastMessage && lastMessage._getType() === "ai") {
      console.log(`[${lastMessage.name || "AI"}]:\n${lastMessage.content}\n`);
      console.log("--------------------------------------------------\n");
    }
  }
  console.log("✅ Работа завершена!");
}

run().catch(console.error);