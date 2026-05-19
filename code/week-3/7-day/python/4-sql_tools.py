import os
import sqlite3
from pathlib import Path

import requests
from dotenv import load_dotenv
from langchain import hub
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.utilities.sql_database import SQLDatabase
from langchain_core.messages import HumanMessage
from langchain_gigachat.chat_models import GigaChat
from message_formatter import print_messages, print_one_message
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

load_dotenv()

model = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    scope="GIGACHAT_API_PERS",
    model="GigaChat-2",
)

search = TavilySearchResults(max_results=2)


def get_engine_for_chinook_db():
    """Pull sql file, populate in-memory database, and create engine."""
    url = "https://raw.githubusercontent.com/lerocha/chinook-database/master/ChinookDatabase/DataSources/Chinook_Sqlite.sql"
    response = requests.get(url)
    sql_script = response.text

    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.executescript(sql_script)
    return create_engine(
        "sqlite://",
        creator=lambda: connection,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )


engine = get_engine_for_chinook_db()

db = SQLDatabase(engine)

toolkit = SQLDatabaseToolkit(db=db, llm=model)

tools = toolkit.get_tools()

llm_with_tools = model.bind_tools(tools)

query = "В какой стране покупатели тратят больше всего и сколько?"
# query = "Ответь на вопрос: сколько будет (11 + 49) * 6?"


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


prompt_template = hub.pull("langchain-ai/sql-agent-system-prompt")

assert len(prompt_template.messages) == 1
system_message = prompt_template.format(dialect="SQLite", top_k=5)
initial_messages = [system_message, HumanMessage(query)]
print_messages(initial_messages)
final_result = process_with_tools(initial_messages, max_iterations=10)
