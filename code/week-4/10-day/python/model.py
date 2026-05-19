# Импорт библиотек
import os

from dotenv import load_dotenv
from langchain_gigachat import GigaChat
from langchain_openai import ChatOpenAI

# Парсинг переменных окружения
load_dotenv()

# Конфигурация модели GigaChat
# model = GigaChat(
#     credentials=os.getenv("GIGACHAT_CREDENTIALS"),
#     verify_ssl_certs=False,
#     scope="GIGACHAT_API_PERS",
#     model="GigaChat-2-Max",
# )

# Инициализация модели OpenAI через OpenRouter
model = ChatOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    model="openrouter/cypher-alpha:free",
)
