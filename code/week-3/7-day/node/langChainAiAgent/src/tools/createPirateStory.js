const path = require('path');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');

// Функция для форматирования даты в ISO формате
function formatLocalISODate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Функция для безопасного формирования части имени файла
function safeFilePart(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9а-яё-]+/gi, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'story';
}

// Функция для выбора случайного элемента из массива
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Функция для построения пиратской истории
function buildPirateStory({ kind, prompt, length }) {
    const heroes = ['капитан Грюм-Борода', 'шкипер Слепой Палтус', 'юнга Пискля', 'боцман Ржавый Крюк', 'картограф Мадам Чайка'];
    const places = ['в туманных рифах Чёрной Лагуны', 'на острове Трёх Костей', 'у маяка Молчаливого Краба', 'в бухте Сорванных Парусов', 'под штормовыми облаками над Морем Стекла'];
    const treasures = ['сундук с монетами, что звенят как смех мертвеца', 'компас, что указывает на правду', 'бутыль с ветром, запертым на замок', 'карта, написанная солью и клятвами', 'песочные часы, где вместо песка — золотая пыль'];
    const troubles = ['сирена завела песню и спутала всем мысли', 'кракен обвил мачту, как верёвку', 'проклятие на карте поменяло местами север и юг', 'шторм рассердился, будто его обидели', 'команда перессорилась из-за последней сухой галеты'];
    const twists = ['оказалось, что клад был приманкой', 'правда спряталась в самом простом', 'самое ценное — не то, что блестит', 'кто-то из своих держал второй ключ', 'смелость оказалась дороже золота'];

    const titleLead = kind === 'сказка' ? 'Сказка' : kind === 'байка' ? 'Байка' : 'История';
    const titleTail = prompt?.trim() ? `: ${prompt.trim()}` : `: ${pick(['про упрямую волну', 'про карту без чернил', 'про честный ром', 'про смех в трюме', 'про якорь и клятву'])}`;
    const title = `${titleLead}${titleTail}`;

    const paragraphCount = length === 'long' ? 6 : length === 'short' ? 3 : 4;
    const hero = pick(heroes);
    const place = pick(places);
    const treasure = pick(treasures);

    const paragraphs = [];
    paragraphs.push(`Аррр! Слушай, салага, ${titleLead.toLowerCase()} начнётся так: ${hero} вышел в море ${place}, и море было на вкус как соль да обещания.`);
    paragraphs.push(`В кармане у него шуршала записка: "${prompt?.trim() || 'Ищи там, где не ищут'}". А в сердце — упрямство, крепче любого каната. И вот мелькнул знак: ${treasure}.`);
    paragraphs.push(`Но не успели мы и "йо-хо-хо" крикнуть, как ${pick(troubles)}. Паруса хлопали, якорь скрипел, а чайки смеялись, будто знали концовку.`);

    for (let i = 0; i < Math.max(0, paragraphCount - 4); i++) {
        paragraphs.push(`Тут ${hero} сделал выбор: не силой брать, а умом. Сначала — слово, потом — сабля. Команда притихла и слушала, как море отвечает на уважение.`);
    }

    paragraphs.push(`А дальше — поворот: ${pick(twists)}. И ${hero} понял простую вещь: если делишься добычей и держишь клятву, то и море тебе союзник.`);
    paragraphs.push(`Вот тебе мораль, йо-хо-хо: золото гремит громко, а честь — тише, но держит корабль на плаву. Конец, и пусть ветер будет попутным!`);

    return { title, text: paragraphs.join('\n\n') };
}

// Тул для создания пиратской истории
const createPirateStory = tool(
    async ({ kind, prompt, length }) => {
        const toolID = randomUUID();
        console.log('[Tool Called]: createPirateStory');
        console.log('Tool ID:', toolID);

        const normalizedKind = (kind || 'история').toLowerCase();
        const storyKind = normalizedKind === 'байка' || normalizedKind === 'сказка' || normalizedKind === 'история'
            ? normalizedKind
            : 'история';

        const normalizedLength = (length || 'medium').toLowerCase();
        const storyLength = normalizedLength === 'short' || normalizedLength === 'medium' || normalizedLength === 'long'
            ? normalizedLength
            : 'medium';

        const { title, text } = buildPirateStory({ kind: storyKind, prompt, length: storyLength });

        const storiesDir = path.join(__dirname, '..', 'stories');
        await fs.mkdir(storiesDir, { recursive: true });

        const datePart = formatLocalISODate();
        const namePart = safeFilePart(prompt || title);
        const fileName = `${datePart}-${storyKind}-${namePart}-${toolID}.txt`;
        const filePath = path.join(storiesDir, fileName);

        const fileContent = [
            title,
            '',
            text,
            '',
            `---`,
            `journal: ${toolID}`,
            `created_at: ${new Date().toISOString()}`,
            ''
        ].join('\n');

        await fs.writeFile(filePath, fileContent, { encoding: 'utf8' });

        return [
            `Аррр! Я сочинил ${storyKind} и спрятал её в трюм, в файл: ${filePath}`,
            ``,
            fileContent
        ].join('\n');
    },
    {
        name: 'createPirateStory',
        description: [
            'Создаёт пиратскую байку/сказку/историю на русском языке и сохраняет её в формате .txt в папку src/stories.',
            'Используй этот tool, когда пользователь просит придумать/создать/сочинить байку, сказку или историю.'
        ].join(' '),
        schema: z.object({
            kind: z.enum(['байка', 'сказка', 'история']).optional().describe('Какой жанр нужен: байка, сказка или история.'),
            prompt: z.string().optional().describe('Тема/пожелания пользователя: о чём должна быть история.'),
            length: z.enum(['short', 'medium', 'long']).optional().describe('Длина текста: short/medium/long.')
        })
    }
);

// Экспорт тула
module.exports = createPirateStory;
