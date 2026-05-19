import os
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import HumanMessage
from langchain_gigachat.chat_models import GigaChat
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from message_formatter import print_one_message
from typing_extensions import TypedDict

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


graph_builder.add_node("chatbot", chatbot)

tool_node = ToolNode(tools=[search_tool])
graph_builder.add_node("tools", tool_node)

graph_builder.add_conditional_edges(
    "chatbot",
    tools_condition,
)
graph_builder.add_edge("tools", "chatbot")
graph_builder.set_entry_point("chatbot")
graph = graph_builder.compile()


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


###########################################
###  ЦИКЛ ОБРАБОТКИ ОТВЕТОВ LLM В ЧАТЕ  ###
###########################################
def stream_graph_updates(user_input: str):
    for event in graph.stream({"messages": [HumanMessage(user_input)]}):
        for event_name, value in event.items():
            print(f"\n🔴{event_name}")
            print_one_message(value["messages"][-1])


while True:
    user_input = input("🧑 Human: ")
    if user_input.lower() in ["quit", "exit", "q"]:
        print("Goodbye!")
        break
    stream_graph_updates(user_input)
