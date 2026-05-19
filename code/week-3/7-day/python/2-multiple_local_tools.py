import os
from datetime import datetime

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_gigachat.chat_models import GigaChat
from message_formatter import print_messages, print_one_message

########################################################
###   ИНИЦИАЛИЗАЦИЯ ПЕРЕМЕННЫХ СРЕДИ И МОДЕЛИ        ###
########################################################

load_dotenv()

model = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    scope="GIGACHAT_API_PERS",
    model="GigaChat-2",
)

#################################################
###   СОЗДАНИЕ ИНСТРУМЕНТОВ ДЛЯ АГЕНТА        ###
#################################################


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


tools = [add, multiply, get_today_date]
tool_names = [tool.name for tool in tools]
tool_descriptions = [tool.name + ": " + tool.description for tool in tools]
llm_with_tools = model.bind_tools(tools)

######################################################
###   ПРОВЕРКА РАБОТЫ ИНСТРУМЕНТОВ И ЛЛМ С НИМИ    ###
######################################################

query = "Сколько будет 3 * 12?"
# query = "Сколько будет 3 * 12? Какой сейчас год?"
# query = "Сколько будет 3 * 12? Какой сейчас год? Сколько будет 11 + 49?"
# query = """
# Сколько будет 3 * 12?
# Также ответь сколько будет 11 + 49?
# Какой сейчас год?
# Используй предоставленные инструменты для получения ответа.
# """
# query = "Ответь на вопрос: сколько будет (11 + 49) * 6? Используй предоставленные tools"


def process_with_tools(llm, messages, max_iterations=5, current_iteration=0):
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
        return llm.invoke(messages)

    response = llm.invoke(messages)

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

    return process_with_tools(llm, messages, max_iterations, current_iteration + 1)


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
final_result = process_with_tools(llm_with_tools, initial_messages)
