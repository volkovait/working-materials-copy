import os
import random
from datetime import datetime

from dotenv import load_dotenv
from langchain.chains import RetrievalQA
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.vectorstores.pgvector import PGVector
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_gigachat.chat_models import GigaChat
from langchain_gigachat.embeddings.gigachat import GigaChatEmbeddings
from message_formatter import print_messages, print_one_message

########################################################
###   ИНИЦИАЛИЗАЦИЯ ПЕРЕМЕННЫХ СРЕДИ И МОДЕЛИ        ###
########################################################

load_dotenv()

CONNECTION_STRING = f"postgresql+psycopg2://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('POSTGRES_HOST')}:{os.getenv('POSTGRES_PORT')}/{os.getenv('POSTGRES_DB')}"
COLLECTION_NAME = "assessment_embeddings"

model = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    scope="GIGACHAT_API_PERS",
    model="GigaChat-2",
)

#################################################
###   СОЗДАНИЕ ИНСТРУМЕНТОВ ДЛЯ АГЕНТА        ###
#################################################

search = TavilySearchResults(max_results=2)

@tool
def add(a: int, b: int) -> int:
    """Складывает два числа и возвращает сумму"""
    return a + b


@tool
def multiply(a: int, b: int) -> int:
    """Умножает два числа и возвращает произведение"""
    return a * b


@tool
def get_today_date() -> str:
    """Инструмент для получения сегодняшней даты"""
    return datetime.now().strftime("%Y-%m-%d")


@tool
def get_random_number() -> int:
    """Инструмент для получения случайного числа"""
    return random.randint(0, 100)


@tool
def query_rag_vector_db(query: str) -> str:
    """
    Инструмент для получения ответа на вопрос из RAG.
    Обращайся к этому инструменту, если нужно получить корпоративную информацию.
    Передай запрос в виде строки.
    В ответе получишь релевантный контекст для ответа на вопрос из корпоративных документов.
    """
    embeddings = GigaChatEmbeddings(
        credentials=os.getenv("GIGACHAT_CREDENTIALS"),
        verify_ssl_certs=False,
    )

    db = PGVector(
        collection_name=COLLECTION_NAME,
        connection_string=CONNECTION_STRING,
        embedding_function=embeddings,
    )

    qa_chain = RetrievalQA.from_chain_type(model, retriever=db.as_retriever())

    response = qa_chain.invoke(query)
    return response["result"]


tools = [search, add, multiply, get_today_date, get_random_number, query_rag_vector_db]
tool_names = [tool.name for tool in tools]
tool_descriptions = [tool.name + ": " + tool.description for tool in tools]
llm_with_tools = model.bind_tools(tools)

######################################################
###   ПРОВЕРКА РАБОТЫ ИНСТРУМЕНТОВ И ЛЛМ С НИМИ    ###
######################################################

query = "Сколько будет 3 * 12?"
# query = "Сколько будет 3 * 12? Какой сейчас год?"
# query = "В течение какого времени предоставляется доступ к учебным материалам?"
# query = "Сколько будет 3 * 12? Какой сейчас год? Сколько будет 11 + 49?"
# query = """
# Найди, какой сейчас год, умножь его на 3 и найди в интернете интересные факты о получившемся числе.
# """
# query = "Ответь на вопрос: сколько будет (11 + 49) * 6? Используй предоставленные tools"


def process_with_tools(messages, max_iterations=5, current_iteration=0):
    """
    Рекурсивно обрабатывает сообщения с инструментами, пока не будут выполнены все tool_calls
    или не будет достигнуто максимальное количество итераций.

    Args:
        llm: модель с привязанными инструментами
        messages: список сообщений
        max_iterations: максимальное количество итераций
        current_iteration: текущая итерация

    Returns:
        Финальный ответ модели
    """
    if current_iteration >= max_iterations:
        return llm_with_tools.invoke(messages)

    response = llm_with_tools.invoke(messages)

    print_one_message(response)

    if not response.tool_calls:
        return response

    messages.append(response)

    for tool_call in response.tool_calls:
        tool_map = {tool.name: tool for tool in tools}
        selected_tool = tool_map[tool_call["name"].lower()]
        tool_msg = selected_tool.invoke(tool_call)
        print_one_message(tool_msg)
        messages.append(tool_msg)

    return process_with_tools(messages, max_iterations, current_iteration + 1)


system_prompt = """
Ответь на данные вопросы настолько хорошо, насколько это возможно.
У тебя есть доступ к инструментам, которые помогут тебе ответить на вопрос.
{tool_descriptions}

Любое дествие, которое ты выполняешь, должно быть одним из {tool_names}.
""".format(
    tool_descriptions=tool_descriptions, tool_names=tool_names
)

initial_messages = [
    SystemMessage(system_prompt),
    HumanMessage(query),
]

print_messages(initial_messages)
final_result = process_with_tools(initial_messages)
