import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
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

// Состояние графа
// Содержит историю сообщений и инструкцию "куда идти дальше" (next)
const GraphState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => "FINISH",
  }),
});

// 1. Узел Supervisor (Менеджер)
// Этот узел не генерирует конечный контент, а анализирует текущее состояние 
// и решает, какому агенту передать задачу, или завершает её.
async function supervisorNode(state) {
  const supervisorPrompt = new SystemMessage(
    "Вы — менеджер задачи (Supervisor). У вас в подчинении два работника: 'Researcher' (исследователь) и 'Writer' (писатель).\n" +
    "Ваша задача — проанализировать историю диалога и решить, кому передать задачу дальше.\n" +
    "- Если для ответа на запрос пользователя не хватает фактов и их нужно собрать, выбирайте 'Researcher'.\n" +
    "- Если факты уже собраны и нужно написать итоговый текст, выбирайте 'Writer'.\n" +
    "- Если итоговый текст написан и задача полностью выполнена, выбирайте 'FINISH'."
  );

  // Используем structured output для точного контроля возвращаемого значения маршрутизатора
  const routingModel = model.withStructuredOutput(
    z.object({
      next: z.enum(["Researcher", "Writer", "FINISH"]).describe("Следующий агент или FINISH"),
    }),
    { name: "route" }
  );

  const response = await routingModel.invoke([supervisorPrompt, ...state.messages]);
  return { next: response.next };
}

// 2. Узел Researcher (Исследователь)
async function researcherNode(state) {
  const prompt = new SystemMessage(
    "Вы — исследователь (Researcher). Ваша задача — собрать факты и предоставить краткие тезисы по запросу пользователя.\n" +
    "Будьте кратки и лаконичны. Предоставляйте только факты."
  );
  const response = await model.invoke([prompt, ...state.messages]);
  return { messages: [new AIMessage({ content: response.content, name: "Researcher" })] };
}

// 3. Узел Writer (Писатель)
async function writerNode(state) {
  const prompt = new SystemMessage(
    "Вы — писатель (Writer). Ваша задача — взять факты, собранные Researcher, и написать на их основе красивый, связный текст."
  );
  const response = await model.invoke([prompt, ...state.messages]);
  return { messages: [new AIMessage({ content: response.content, name: "Writer" })] };
}

// 4. Построение графа с архитектурой Supervisor
const workflow = new StateGraph(GraphState)
  // Добавляем узлы
  .addNode("Supervisor", supervisorNode)
  .addNode("Researcher", researcherNode)
  .addNode("Writer", writerNode)
  // Начинаем всегда с менеджера
  .addEdge(START, "Supervisor")
  // Менеджер (Supervisor) маршрутизирует поток с помощью условных переходов
  .addConditionalEdges(
    "Supervisor",
    (state) => state.next === "FINISH" ? END : state.next
  )
  // Исполнители всегда возвращают результат обратно Менеджеру
  .addEdge("Researcher", "Supervisor")
  .addEdge("Writer", "Supervisor");

// Компиляция графа в исполняемое приложение
const app = workflow.compile();

// Запуск примера
async function run() {
  console.log("👨‍💼 Запуск примера архитектуры Supervisor...\n");
  const inputs = {
    messages: [new HumanMessage("Напиши короткий рассказ о том, как искусственный интеллект помогает людям в 2026 году. Сначала собери факты, потом напиши текст. Стиль текста как у автора 'Дарья Донцова'.")]
  };

  const stream = await app.stream(inputs, { streamMode: "values" });
  for await (const s of stream) {
    const lastMessage = s.messages[s.messages.length - 1];
    if (lastMessage && lastMessage._getType() === "ai") {
      console.log(`[${lastMessage.name || "AI"}]:\n${lastMessage.content}\n`);
    } else if (s.next) {
      console.log(`➡️ [Менеджер] направляет задачу к -> ${s.next}\n`);
    }
  }
  console.log("✅ Работа завершена!");
}

run().catch(console.error);