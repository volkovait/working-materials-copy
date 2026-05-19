# Импорт библиотек
from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent
from langgraph_supervisor import create_supervisor
from message_formatter import print_one_message
from model import model
from os_tools import os_tools
from sql_tools import sql_tools

# Создание SQL ассистента
sql_assistant = create_react_agent(
    model=model,
    tools=sql_tools,
    prompt="You are a an Expert in SQL queries. You are given a question and you need to answer it using the SQL tools.",
    name="sql_assistant",
)

# Создание OS ассистента
os_assistant = create_react_agent(
    model=model,
    tools=os_tools,
    prompt="You are an assistant that can use tools to get information about the current user and the current time. You can find out the current date, time, user, and country.",
    name="os_assistant",
)

# Создание супервизора для управления агентами
supervisor = create_supervisor(
    agents=[sql_assistant, os_assistant],
    model=model,
    prompt=(
        "You manage an OS assistant (that knows the current user, time, and country) and an SQL assistant (that knows specific information about the database). Assign work to them if necessary."
    ),
).compile()

# Примеры запросов для тестирования
# query = "How do you do?"
# query = "What is the current date?"
# query = "What is the current date? What country does the current user live in?"

# Основной запрос для выполнения
query = "Find out how much users spend in the same country as the current user. Data about invoices can be found in the database."

# Выполнение запроса и вывод результатов
for chunk in supervisor.stream({"messages": [HumanMessage(query)]}):
    for event_name, value in chunk.items():
        print_one_message(value["messages"][-1])
