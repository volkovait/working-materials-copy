# Импорт библиотек
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph.store.memory import InMemoryStore
from langgraph_swarm import create_handoff_tool, create_swarm
from message_formatter import print_one_message
from model import model
from os_tools import os_tools
from sql_tools import sql_tools

# Инициализация памяти
checkpointer = InMemorySaver()  # Краткосрочная память
store = InMemoryStore()  # Долгосрочная память

# Создание инструментов для передачи управления между агентами
transfer_to_sql_assistant = create_handoff_tool(
    agent_name="sql_assistant",
    description="Transfer user to the SQL assistant. He is an Expert in SQL queries. When he is given a question, he needs to answer it using the SQL tools.",
)
transfer_to_os_assistant = create_handoff_tool(
    agent_name="os_assistant",
    description="Transfer user to the OS assistant. He can use tools to get information about the current user and the current time. He can find out the current date, time, user, and country.",
)

# Создание SQL ассистента с возможностью передачи управления
sql_assistant = create_react_agent(
    model=model,
    tools=sql_tools + [transfer_to_os_assistant],
    prompt="You are a an Expert in SQL queries. You are given a question and you need to answer it using the SQL tools.",
    name="sql_assistant",
)

# Создание OS ассистента с возможностью передачи управления
os_assistant = create_react_agent(
    model=model,
    tools=os_tools + [transfer_to_sql_assistant],
    prompt="You are an assistant that can use tools to get information about the current user and the current time. You can find out the current date, time, user, and country.",
    name="os_assistant",
)

# Создание роя агентов
swarm = create_swarm(
    agents=[sql_assistant, os_assistant],
    default_active_agent="sql_assistant",
).compile(checkpointer=checkpointer, store=store)

# Примеры запросов для тестирования
# query = "How do you do?"
# query = "What is the current date?"

# Основной запрос для выполнения
query = "Find out how much users spend in the same country as the current user. First find out the user's country with the help of os_assistant. Then find out how much users spend in the same country with the help of sql_assistant."

# Выполнение запроса и вывод результатов
for chunk in swarm.stream(
    {"messages": [HumanMessage(query)]}, config={"thread_id": "1"}
):
    for event_name, value in chunk.items():
        print_one_message(value["messages"][-1])
