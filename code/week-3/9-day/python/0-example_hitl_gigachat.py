import os
from dotenv import load_dotenv
from gigachat import GigaChat
from langgraph.graph import StateGraph, END
from typing import TypedDict

# Загружаем переменные окружения
load_dotenv()

# 🧱 Определим состояние
class AgentState(TypedDict):
    question: str
    ai_answer: str
    confidence: float
    human_check: bool
    final_answer: str

# 🤖 Генератор ответа
def generate_response(state: AgentState) -> AgentState:
    with GigaChat(
        credentials=os.getenv("GIGACHAT_API_KEY"),
        verify_ssl_certs=False,
        model="GigaChat"
    ) as giga:
        result = giga.chat(state['question'])
        response = result.choices[0].message.content
    
    # Вставим искусственную 'уверенность' (в реальности может быть из LLM или модели-классификатора)
    confidence = 0.6 if "?" in state['question'] else 0.9
    
    return {
        **state,
        "ai_answer": response,
        "confidence": confidence
    }

# 🧪 Проверка уверенности
def check_confidence(state: AgentState) -> str:
    return "human_review" if state["confidence"] < 0.7 else "finalize"

# 👤 HITL: человек вмешивается
def human_review(state: AgentState) -> AgentState:
    print(f"AI ответил: {state['ai_answer']}")
    print("Введите исправленный ответ (или нажмите Enter, чтобы использовать ответ AI):")
    human_input = input("> ")
    
    # Если пользователь не ввел ответ, используем ответ AI
    if not human_input.strip():
        return {
            **state,
            "final_answer": state["ai_answer"],
            "human_check": False
        }
    
    return {
        **state,
        "final_answer": human_input,
        "human_check": True
    }

# ✅ Финализируем
def finalize(state: AgentState) -> AgentState:
    return {
        **state,
        "final_answer": state["ai_answer"],
        "human_check": False
    }

# 🔁 Построим граф
builder = StateGraph(AgentState)
builder.add_node("generate", generate_response)
builder.add_node("human_review", human_review)
builder.add_node("finalize", finalize)
builder.set_entry_point("generate")
builder.add_conditional_edges("generate", check_confidence)
builder.add_edge("human_review", END)
builder.add_edge("finalize", END)

graph = builder.compile()

# 🚀 Запускаем
output = graph.invoke({"question": "Когда был основан Google?"})
print("\n📘 Финальный ответ:", output["final_answer"])
print("👀 Проверял человек:", output["human_check"]) 