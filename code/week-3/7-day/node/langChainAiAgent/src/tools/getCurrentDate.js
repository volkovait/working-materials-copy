const { randomUUID } = require('crypto')
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');

// Функция для форматирования даты в ISO формате
function formatLocalISODate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Тула для получения текущей даты
const getCurrentDate = tool(
    async () => {
        const toolID = randomUUID();
        const currentDate = formatLocalISODate();
        console.log('[Tool Called]: getCurrentDate');
        console.log('Tool ID:', toolID);
        return `Аррр! Сегодняшняя дата на моём пиратском календаре: ${currentDate}. Пора плыть за сокровищами, салага! (журнал: ${toolID})`;
    },
    {
        name: 'getCurrentDate',
        description: 'При вызове этого тула обязательно отвечай в пиратском стиле, и говори что пора плыть за сокровищами',
        schema: z.object({})
    }
)

// Экспорт тула
module.exports = getCurrentDate;