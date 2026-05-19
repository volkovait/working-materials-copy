import os
import sqlite3
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from human_interaction import get_human_input
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import HumanMessage
from langchain_gigachat.chat_models import GigaChat
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt
from message_formatter import print_one_message
from typing_extensions import Literal, TypedDict

####################################
###  ИНИЦИАЛИЗАЦИЯ LLM GIGACHAT  ###
####################################
load_dotenv()

llm = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    scope="GIGACHAT_API_PERS",
    model="GigaChat-2",
)

search_tool = TavilySearchResults(max_results=2)
tools = [search_tool]

llm_with_tools = llm.bind_tools(tools)


#############################
###  ИНИЦИАЛИЗАЦИЯ ГРАФА  ###
#############################


class State(TypedDict):
    messages: Annotated[list, add_messages]


##################################################
###  ОПИСАНИЕ ФУНКЦИЙ-РЕДЬЮСЕРОВ ВЕРШИн ГРАФА  ###
##################################################


def chatbot(state: State):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


def human_review_node(state) -> Command[Literal["chatbot", "run_tool"]]:
    # Вытаскиваем последнее сообщение из стейта
    last_message = state["messages"][-1]
    tool_call = last_message.tool_calls[-1]

    # Что мы показываем пользовтелю: вопрос и tool_call на верификацию
    # review_action, review_payload = get_human_input("Это верно?")

    human_review = interrupt(
        {
            "question": "Это верно?",
            "tool_call": tool_call,
        }
    )

    review_action = human_review["action"]
    review_payload = human_review.get("payload")

    # print(human_review, review_action, review_payload)
    # Если аппрув -- вызываем тул
    if review_action == "continue":
        return Command(goto="run_tool")

    # Если мы хотим сами поправить и вызвать тул, то в args кладём ввод пользователя
    elif review_action == "update":
        updated_message = {
            "role": "ai",
            "content": last_message.content,
            "tool_calls": [
                {
                    "id": tool_call["id"],
                    "name": tool_call["name"],
                    # Здесь то, что предлагает человек
                    "args": review_payload,
                }
            ],
            # Важно -- id должен быть таким же, как то сообщение, которое мы заменяем
            # Иначе это будет отдельное сообщение
            "id": last_message.id,
        }
        return Command(goto="run_tool", update={"messages": [updated_message]})

    # Даём обратную связь для LLM на анализ
    elif review_action == "feedback":
        # заметка: we're adding feedback message as a ToolMessage
        # to preserve the correct order in the message history
        # (AI messages with tool calls need to be followed by tool call messages)
        tool_message = {
            "role": "tool",
            # вот наш фидбэк
            # "content": review_payload,
            "content": "Error: user provided extra feedback",
            "name": tool_call["name"],
            "tool_call_id": tool_call["id"],
        }
        human_feedback_message = HumanMessage(review_payload["query"])
        return Command(
            goto="chatbot", update={"messages": [tool_message, human_feedback_message]}
        )


def run_tool(state):
    new_messages = []
    tool_map = {tool.name: tool for tool in tools}
    tool_calls = state["messages"][-1].tool_calls
    for tool_call in tool_calls:
        tool = tool_map[tool_call["name"].lower()]
        result = tool.invoke(tool_call["args"])
        new_messages.append(
            {
                "role": "tool",
                "name": tool_call["name"],
                "content": result,
                "tool_call_id": tool_call["id"],
            }
        )
    return {"messages": new_messages}


def route_after_llm(state) -> Literal[END, "human_review_node"]:
    if len(state["messages"][-1].tool_calls) == 0:
        return END
    else:
        return "human_review_node"


##############################################
###  КОНСТРУИРОВАНИЕ ВЕРШИН И РЕБЁР ГРАФА  ###
##############################################


graph_builder = StateGraph(State)
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_node("run_tool", run_tool)
graph_builder.add_node("human_review_node", human_review_node)

graph_builder.set_entry_point("chatbot")
graph_builder.add_conditional_edges("chatbot", route_after_llm)
graph_builder.add_edge("run_tool", "chatbot")

graph_builder.add_edge("run_tool", "chatbot")


##############################
###  ИНИЦИАЛИЗАЦИЯ ПАМЯТИ  ###
##############################


DB_URI = "postgresql://admin:123@localhost:5432/graph_agent?sslmode=disable"
connection_kwargs = {
    "autocommit": True,
    "prepare_threshold": 0,
}


with PostgresSaver.from_conn_string(DB_URI) as checkpointer:
    checkpointer.setup()
    graph = graph_builder.compile(checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "27"}}

    def process_graph_stream(input_data):
        """
        Recursively process the graph stream, handling interrupts and continuing execution.

        Args:
            input_data: Initial input data or Command for resuming
            config: Graph configuration
        """
        for event in graph.stream(input_data, config):
            for event_name, value in event.items():
                print(f"\n🔴{event_name}")

                # Handle interruption case
                if isinstance(value, tuple) and hasattr(value[0], "value"):
                    interrupt = value[0].value
                    print(f"❓ {interrupt['question']}")
                    tool_call = interrupt["tool_call"]
                    print(f"🛠️ Вызов инструмента: {tool_call['name']}")
                    print(f"📝 Аргументы: {tool_call['args']}")

                    # Get human input and continue processing
                    action, payload = get_human_input("Это верно?")
                    print(f"👤 Выбрано действие: {action}")
                    if payload:
                        print(f"✏️ Дополнительный ввод: {payload}")

                    # Recursively continue processing with the human input
                    return process_graph_stream(
                        Command(
                            resume={"action": action, "payload": {"query": payload}}
                        )
                    )

                # Handle normal message case
                elif value and "messages" in value:
                    print(value)
                    print_one_message(value["messages"][-1])

    # while True:
    #     user_input = input("🧑 Human: ")
    #     if user_input.lower() in ["quit", "exit", "q"]:
    #         print("Goodbye!")
    #         break

    #     # Start processing with initial user input
    #     process_graph_stream({"messages": [HumanMessage(user_input)]})


#######################################
###  ВЫВОД ГРАФА В ФОРМАТЕ MERMAID  ###
###  ПЕРЕЙДИ https://mermaid.live/  ###
#######################################
def draw_graph():
    try:
        mermaid_graph = graph.get_graph().draw_mermaid()
        print("Mermaid graph representation:")
        print(mermaid_graph)
    except Exception as e:
        print(f"Failed to generate graph: {e}")

draw_graph()