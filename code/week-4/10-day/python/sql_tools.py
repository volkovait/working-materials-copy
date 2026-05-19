# Импорт библиотек
import sqlite3

import requests
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.utilities.sql_database import SQLDatabase
from model import model
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool


# Функция для создания движка базы данных Chinook
def get_engine_for_chinook_db():
    """Pull sql file, populate in-memory database, and create engine."""
    # Получение SQL-скрипта из GitHub
    url = "https://raw.githubusercontent.com/lerocha/chinook-database/master/ChinookDatabase/DataSources/Chinook_Sqlite.sql"
    response = requests.get(url)
    sql_script = response.text

    # Создание подключения к базе данных в памяти
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.executescript(sql_script)
    return create_engine(
        "sqlite://",
        creator=lambda: connection,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )


# Инициализация движка базы данных
engine = get_engine_for_chinook_db()

# Создание объекта базы данных
db = SQLDatabase(engine)

# Создание набора инструментов для работы с SQL
toolkit = SQLDatabaseToolkit(db=db, llm=model)

# Получение списка SQL инструментов
sql_tools = toolkit.get_tools()
