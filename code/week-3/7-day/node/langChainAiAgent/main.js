const path = require('path');
process.loadEnvFile(path.join(__dirname, '.env'));
const createNewAgent = require('./src/agent')

// Получение ключа API и URL из окружения
const { OPENAI_API_KEY, BASE_URL } = process.env;

// Главная функция
async function main() {
    try {
        const question = process.argv[2]
        // Проверка на вопрос и ключ API
        if (!question || !OPENAI_API_KEY) return

        // Создание агента
        const agent = createNewAgent(OPENAI_API_KEY, BASE_URL)

        // Вызов агента
        const result = await agent.invoke({
            messages: [{ role: 'user', content: question }]
        })

        // Вывод результата
        console.log('Result:', result.messages.at(-1).content);
    } catch (error) {
        console.log(error.message);
    }
}

// Запуск программы
main().catch(console.error)