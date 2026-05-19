from typing import Generator, List, Union

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage


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


def print_one_message(
    message: Union[HumanMessage, AIMessage, ToolMessage, str],
) -> None:
    """
    Prints a single message in a formatted way to the console.

    Args:
        message: A message object (HumanMessage, AIMessage, ToolMessage) or a string
    """
    if isinstance(message, str):
        print(f"\n💻 System: {message}")

    elif isinstance(message, HumanMessage):
        print(f"\n🧑 Human: {message.content}")

    elif isinstance(message, SystemMessage):
        print(f"\n💻 System: {message.content}")

    elif isinstance(message, AIMessage):
        print(f"\n🤖 AI: {message.content}")

        # Check if AI wants to use tools
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool_call in message.tool_calls:
                print(
                    f"🔧 ToolCall {tool_call['id']}: {tool_call['name']}, arguments: {tool_call['args']}"
                )

    elif isinstance(message, ToolMessage):
        print(
            f"🛠️  ToolMssg {message.tool_call_id}: {message.name}, result: {message.content}"
        )

    print("-" * 50)  # Separator line


def stream_graph_updates(events: Generator):
    for event in events:
        for event_name, value in event.items():
            print(f"\n🔴{event_name}")
            print_one_message(value["messages"][-1])
