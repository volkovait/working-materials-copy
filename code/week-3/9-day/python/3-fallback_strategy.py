import os
import sqlite3
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.messages.modifier import RemoveMessage
from langchain_gigachat.chat_models import GigaChat
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
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


graph_builder = StateGraph(State)


def chatbot(state: State):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


def should_continue(state: MessagesState):
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return END


def call_tool(state: MessagesState):
    tool_map = {tool.name: tool for tool in tools}
    # tool_calls = state["messages"][-1].tool_calls
    messages = state["messages"]
    last_message = messages[-1]
    output_messages = []
    for tool_call in last_message.tool_calls:
        try:
            tool_result = tool_map[tool_call["name"]].invoke(tool_call["args"])
            output_messages.append(
                ToolMessage(
                    content=json.dumps(tool_result),
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"],
                )
            )
        except Exception as e:
            # Return the error if the tool call fails
            output_messages.append(
                ToolMessage(
                    content="",
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"],
                    additional_kwargs={"error": e},
                )
            )
    return {"messages": output_messages}


def should_fallback(
    state: MessagesState,
) -> Literal["chatbot", "remove_failed_tool_call_attempt"]:
    messages = state["messages"]
    failed_tool_messages = [
        msg
        for msg in messages
        if isinstance(msg, ToolMessage)
        and (
            msg.additional_kwargs.get("error") is not None
            or "Error" in str(msg.content)
            or "HTTPError" in str(msg.content)
        )
    ]
    if failed_tool_messages:
        return "remove_failed_tool_call_attempt"
    return "chatbot"


def remove_failed_tool_call_attempt(state: MessagesState):
    messages = state["messages"]
    # Remove all messages from the most recent
    # instance of AIMessage onwards.
    last_ai_message_index = next(
        i
        for i, msg in reversed(list(enumerate(messages)))
        if isinstance(msg, AIMessage)
    )
    messages_to_remove = messages[last_ai_message_index:]
    return {"messages": [RemoveMessage(id=m.id) for m in messages_to_remove]}


def call_fallback_model(state: MessagesState):
    messages = state["messages"]
    # Здесь лучшая модель стоит
    better_model_with_tools = llm_with_tools
    response = better_model_with_tools.invoke(messages)
    return {"messages": [response]}


tool_node = ToolNode(tools=[search_tool])
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_node("tools", tool_node)
graph_builder.add_node(
    "remove_failed_tool_call_attempt", remove_failed_tool_call_attempt
)
graph_builder.add_node("fallback_agent", call_fallback_model)

graph_builder.set_entry_point("chatbot")
graph_builder.add_conditional_edges("chatbot", should_continue, ["tools", END])
graph_builder.add_conditional_edges("tools", should_fallback)
graph_builder.add_edge("remove_failed_tool_call_attempt", "fallback_agent")
graph_builder.add_edge("fallback_agent", "tools")
# graph_builder.add_conditional_edges(
#     "chatbot",
#     tools_condition,
# )
# graph_builder.add_edge("tools", "chatbot")


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
    config = {"configurable": {"thread_id": "2004"}}

    while True:
        user_input = input("🧑 Human: ")
        if user_input.lower() in ["quit", "exit", "q"]:
            print("Goodbye!")
            break
        for event in graph.stream(
            {"messages": [HumanMessage(user_input)]},
            config,
        ):
            for event_name, value in event.items():
                print(f"\n🔴{event_name}")
                print_one_message(value["messages"][-1])


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
