import os

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
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


tools = [
    add,
]

llm_with_tools = model.bind_tools(tools)

######################################################
###   ПРОВЕРКА РАБОТЫ ИНСТРУМЕНТОВ И ЛЛМ С НИМИ    ###
######################################################

# query = "Привет, как твои дела?"
# query = "Сколько будет 3 + 12?"
query = "Сколько будет 3 + 12 ? Также ответь, сколько будет 32 + 4?"

messages = [HumanMessage(query)]
response = llm_with_tools.invoke(messages)
messages.append(response)

print_messages(messages)

for tool_call in response.tool_calls:
    tool_map = {tool.name: tool for tool in tools}
    selected_tool = tool_map[tool_call["name"].lower()]
    tool_msg = selected_tool.invoke(tool_call)
    print_one_message(tool_msg)
    messages.append(tool_msg)

result = llm_with_tools.invoke(messages)
messages.append(result)
print_one_message(result)
