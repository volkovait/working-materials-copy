const { randomUUID } = require('crypto')
const { tool } = require('@langchain/core/tools')
const { z } = require('zod')

// Тул для поиска информации в интернете через Perplexity Sonar Pro
const perplexitySearch = tool(
    async ({ query }) => {
        const toolID = randomUUID()
        console.log('[Tool Called]: perplexitySearch')
        console.log('Tool ID:', toolID)

        try {
            const response = await fetch('https://bothub.chat/api/v2/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'sonar-pro',
                    messages: [
                        {
                            role: 'user',
                            content: query
                        }
                    ]
                })
            })

            if (!response.ok) {
                throw new Error(`BotHub API error: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()
            const result = data?.choices?.[0]?.message?.content

            if (!result) {
                throw new Error('Empty response from BotHub API')
            }

            return `Результат поиска: ${result} (журнал: ${toolID})`
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return `Ошибка поиска: ${message} (журнал: ${toolID})`
        }
    },
    {
        name: 'perplexitySearch',
        description: 'Выполняет поиск актуальной информации в интернете через Perplexity (через BotHub). Используй для вопросов о текущих событиях, фактах, новостях.',
        schema: z.object({
            query: z.string().describe('Поисковый запрос для получения информации')
        })
    }
)

// Экспорт тула
module.exports = perplexitySearch;
