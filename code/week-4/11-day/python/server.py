from fastapi import FastAPI
from pydantic import BaseModel
import requests
import uvicorn

# Создаем FastAPI приложение
app = FastAPI()

# Получаем URL и модель
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma3:1b"

print('Model name: ', MODEL_NAME)
print('Ollama URL: ', OLLAMA_URL)

# Определяем модель запроса
class PromptRequest(BaseModel):
    prompt: str

# Определяем маршрут для проверки здоровья
@app.get("/health")
async def health():
    return {"status": "ok"}

# Определяем маршрут для генерации текста
@app.post("/v1/completions")
async def generate_text(request: PromptRequest):
    try:
        payload = {"model": MODEL_NAME, "prompt": request.prompt, "stream": False}
        response = requests.post(OLLAMA_URL, json=payload)
        response.raise_for_status()
        return {"response": response.json().get("response", "")}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}") from e

# Запускаем сервер
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)