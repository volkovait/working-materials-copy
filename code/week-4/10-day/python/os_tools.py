# Импорт библиотек
from datetime import datetime

from langchain_core.tools import tool


# Инструмент для получения текущей даты
@tool
def get_today_date() -> str:
    """Get the current date"""
    return datetime.now().strftime("%Y-%m-%d")


# Инструмент для получения текущего пользователя
@tool
def get_current_user() -> str:
    """Get the current user"""
    return "grentank"


# Инструмент для получения текущего времени
@tool
def get_current_time() -> str:
    """Get the current time"""
    return datetime.now().strftime("%H:%M:%S")


# Инструмент для получения страны пользователя
@tool
def get_current_user_country() -> str:
    """Get the current user's country"""
    return "USA"


# Список всех инструментов для работы с ОС
os_tools = [
    get_today_date,
    get_current_user,
    get_current_time,
    get_current_user_country,
]
