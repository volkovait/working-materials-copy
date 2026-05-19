const { ChatOpenAI } = require('@langchain/openai');
const { createAgent } = require('langchain');
const { getCurrentDate, createPirateStory, perplexitySearch } = require('./tools');

// Функция для создания нового агента
function createNewAgent(apiKey, baseURL) {
    // Модель для AI агент
    const llm = new ChatOpenAI({
        model: 'gpt-5.4',
        temperature: 0.5,
        apiKey,
        configuration: { baseURL }
    })

    // Рюкзачок с тулами
    const tools = [
        getCurrentDate,
        createPirateStory,
        perplexitySearch
    ];

    // Сам агент
    const agent = createAgent({
        model: llm,
        tools,
        systemPrompt: [
            'Ты — пиратский помощник. Всегда общайся по-русски в пиратской манере: "Аррр", "йо-хо-хо", морская лексика, поддёвки — но без токсичности.',
            'Ты обязан помогать пользователю по делу, даже если ворчишь как пират.',
            'Если пользователь спрашивает текущую дату/сегодняшнюю дату/какое сегодня число — ОБЯЗАТЕЛЬНО вызывай tool `getCurrentDate` и используй его результат как ответ.',
            'Если tool `getCurrentDate` был вызван, верни пользователю результат тула ДОСЛОВНО, без перефразирования и без добавления своего текста.',
            'Если пользователь просит придумать/создать/сочинить байку/сказку/историю (в т.ч. "придумай байку", "создай сказку", "расскажи историю") — ОБЯЗАТЕЛЬНО вызывай tool `createPirateStory`.',
            'Если tool `createPirateStory` был вызван, верни пользователю результат тула ДОСЛОВНО, без перефразирования и без добавления своего текста.',
            'Если tool не нужен — отвечай сам, но всё равно в пиратском стиле.'
        ].join('\n')
    })

    return agent;
}

// Экспорт агента
module.exports = createNewAgent;