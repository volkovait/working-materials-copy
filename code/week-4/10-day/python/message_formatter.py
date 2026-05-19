# Импорт библиотек
from typing import Generator, List, Union

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage


# Функция для печати списка сообщений
def print_messages(
    messages: List[Union[HumanMessage, AIMessage, ToolMessage, str]],
) -> None:
    """
    Prints messages in a formatted way to the console.

    Args:
        messages: List of messages (HumanMessage, AIMessage, ToolMessage, or str)
    """
    for message in messages:
        print_one_message(message)


# Функция для печати одного сообщения
def print_one_message(
    message: Union[HumanMessage, AIMessage, ToolMessage, str],
) -> None:
    """
    Prints a single message in a formatted way to the console.

    Args:
        message: A message object (HumanMessage, AIMessage, ToolMessage) or a string
    """
    # Обработка строкового сообщения
    if isinstance(message, str):
        print(f"\n💻 System: {message}")

    # Обработка сообщения от пользователя
    elif isinstance(message, HumanMessage):
        print(f"\n🧑 Human: {message.content}")

    # Обработка системного сообщения
    elif isinstance(message, SystemMessage):
        print(f"\n💻 System: {message.content}")

    # Обработка сообщения от AI
    elif isinstance(message, AIMessage):
        print(f"\n🤖 AI: {message.content}")

        # Проверка на использование инструментов AI
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool_call in message.tool_calls:
                print(
                    f"🔧 ToolCall {tool_call['id']}: {tool_call['name']}, arguments: {tool_call['args']}"
                )

    # Обработка сообщения от инструмента
    elif isinstance(message, ToolMessage):
        print(
            f"🛠️  ToolMssg {message.tool_call_id}: {message.name}, result: {message.content}"
        )

    # Разделительная линия
    print("-" * 50)  # Separator line


# Функция для стриминга обновлений графа
def stream_graph_updates(events: Generator):
    for event in events:
        for event_name, value in event.items():
            print(f"\n🔴{event_name}")
            print_one_message(value["messages"][-1])
