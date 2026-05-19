# README: Базовый граф (index.js) — пошаговое выполнение кода

## Обзор
Этот файл демонстрирует базовую работу с LangGraph: создание простого графа с одним узлом и обработка пользовательских запросов через Perplexity API.

## Пошаговое выполнение кода

### Шаг 1: Импорты и инициализация (строки 1–12)
```javascript
import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatPerplexity } from "@langchain/community/chat_models/perplexity";
// ... другие импорты
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
```

**Что происходит:**
- Импортируются компоненты LangGraph, модель Perplexity, промпты, сообщения и Zod для схемы состояния.
- Для ES-модулей задаются `__dirname` и путь к корню проекта.
- Переменные окружения загружаются из файла `.env` в родительской папке.

### Шаг 2: Определение схемы состояния (строки 14–18)
```javascript
const BasicGraphState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Создаётся Zod-схема для валидации состояния графа.
- Определяются четыре поля состояния:
  - `userQuery` — входящий запрос пользователя (строка);
  - `response` — ответ от AI (строка);
  - `messages` — массив сообщений для истории;
  - `metadata` — объект с метаданными.

### Шаг 3: Создание узла обработки (строки 20–71)
```javascript
async function processUserQuery(state) {
  const model = new ChatPerplexity({
    model: "sonar",
    temperature: 0.7,
    maxTokens: 500,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  // ...
}
```

**Что происходит:**
1. **Входные параметры:** функция принимает объект `state` с полями из `BasicGraphState`.
2. **Создание модели:** инициализируется ChatPerplexity с параметрами:
   - `model: "sonar"` — модель для обработки;
   - `temperature: 0.7` — степень вариативности ответов;
   - `maxTokens: 500` — максимальная длина ответа;
   - `apiKey` — ключ API из переменных окружения.

### Шаг 4: Создание промпта (строки 30–33)
```javascript
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Ты полезный AI-ассистент. Отвечай кратко и по делу на русском языке."],
  ["human", "{query}"]
]);
```

**Что происходит:**
- Создаётся шаблон промпта с системным сообщением.
- Место для вставки пользовательского запроса задаётся плейсхолдером `{query}`.

### Шаг 5: Выполнение запроса (строки 35–39)
```javascript
const chain = prompt.pipe(model);
const result = await chain.invoke({
  query: state.userQuery
});
```

**Что происходит:**
1. **Создание цепочки:** промпт подключается к модели через `pipe()`.
2. **Выполнение:** цепочка вызывается с параметром `query: state.userQuery`.
3. **Результат:** модель обрабатывает запрос и возвращает ответ.

### Шаг 6: Обработка результата (строки 41–55)
```javascript
const userMessage = new HumanMessage(state.userQuery);
const aiMessage = new AIMessage(result.content);

return {
  userQuery: state.userQuery,
  response: result.content,
  messages: [userMessage, aiMessage],
  metadata: {
    ...state.metadata,
    processedAt: new Date().toISOString(),
    model: "sonar"
  }
};
```

**Что происходит:**
1. **Сообщения:** формируются объекты HumanMessage и AIMessage.
2. **Возврат состояния:** обновляется состояние графа:
   - `userQuery` остаётся без изменений;
   - `response` заполняется ответом модели;
   - `messages` дополняется новыми сообщениями;
   - `metadata` обновляется временем обработки и именем модели.

### Шаг 7: Создание графа (строки 73–76)
```javascript
const workflow = new StateGraph(BasicGraphState)
  .addNode("process_query", processUserQuery)
  .addEdge(START, "process_query")
  .addEdge("process_query", END);
```

**Что происходит:**
1. **Граф:** инициализируется StateGraph с схемой BasicGraphState.
2. **Узел:** регистрируется узел `"process_query"` с функцией `processUserQuery`.
3. **Переходы:**
   - `START → process_query` — вход в граф;
   - `process_query → END` — завершение.

### Шаг 8: Компиляция графа (строка 78)
```javascript
const app = workflow.compile();
```

**Что происходит:**
- Граф компилируется в исполняемый объект, готовый к вызову через `invoke()`.

### Шаг 9: Функция запуска (строки 80–102)
```javascript
async function runBasicGraph(query) {
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    metadata: { startedAt: new Date().toISOString() }
  };
  const result = await app.invoke(initialState);
  return result;
}
```

**Что происходит:**
1. **Начальное состояние:** формируется объект с полями схемы.
2. **Запуск:** вызывается `app.invoke(initialState)`.
3. **Результат:** возвращается финальное состояние графа.

### Шаг 10: Точка входа и запуск из терминала (строки 104 и далее)
- При запуске файла напрямую вызывается `main()`.
- Можно передать свой запрос аргументом: `node index.js "Ваш вопрос"`.
- Без аргументов выполняются три тестовых запроса из кода.

**Что происходит:**
1. **Проверка API ключа:** проверяется наличие `PERPLEXITY_API_KEY`.
2. **Режим запуска:** если передан аргумент — один запрос из CLI; иначе — массив тестовых вопросов.
3. **Обработка:** каждый запрос выполняется через `runBasicGraph()`.
4. **Вывод:** результат и метаданные выводятся в консоль.

## Поток выполнения данных

```
1. main() → создает тестовые запросы
2. runBasicGraph(query) → создает initialState
3. app.invoke(initialState) → запускает граф
4. START → process_query → выполняется processUserQuery(state)
5. processUserQuery → создает модель, промпт, выполняет запрос
6. process_query → END → возвращает финальное состояние
7. Результат выводится в консоль
```

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Что такое ИИ?",
  response: "",
  messages: [],
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Выходное состояние:**
```javascript
{
  userQuery: "Что такое ИИ?",
  response: "Искусственный интеллект - это...",
  messages: [HumanMessage, AIMessage],
  metadata: {
    startedAt: "2024-01-01T10:00:00.000Z",
    processedAt: "2024-01-01T10:00:05.000Z",
    model: "sonar"
  }
}
```

## Требования для запуска

1. **Переменные окружения:** создать файл `.env` в папке `node` (родительской для `1-basic-graph`) с переменной `PERPLEXITY_API_KEY`.
2. **Зависимости:** выполнить `npm install` в папке `1-basic-graph`.
3. **API ключ:** получить ключ Perplexity API и прописать его в `.env`.

## Как запустить из терминала

- **С тестовыми запросами из кода:**  
  `npm start` или `node index.js`
- **С одним своим запросом:**  
  `node index.js "Ваш вопрос"`  
  или  
  `npm start -- "Ваш вопрос"`  

  Например: `node index.js "Что такое LangGraph?"`

Результат каждого запроса выводится в терминал: ответ модели, метаданные и количество сообщений. Проверку работы можно выполнять полностью из терминала.

## Обработка ошибок

- **Отсутствие API ключа:** выводится сообщение с подсказками (проверить `.env`, ключ, сеть).
- **Ошибки при вызове API:** перехватываются в `processUserQuery`, в состояние записывается сообщение об ошибке и метаданные.
- **Ошибки при выполнении графа:** логируются в консоль и пробрасываются выше.

