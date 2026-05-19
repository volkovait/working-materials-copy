import os
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_gigachat.chat_models import GigaChat
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages
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


#############################
###  ИНИЦИАЛИЗАЦИЯ ГРАФА  ###
#############################


class State(TypedDict):
    messages: Annotated[list, add_messages]


graph_builder = StateGraph(State)


def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}


graph_builder.add_node("chatbot", chatbot)
graph_builder.set_entry_point("chatbot")
graph_builder.set_finish_point("chatbot")
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
        for value in event.values():
            print_one_message(value["messages"][-1])


while True:
    user_input = input("🧑 Human: ")
    if user_input.lower() in ["quit", "exit", "q"]:
        print("Goodbye!")
        break
    stream_graph_updates(user_input)
