# Импорт необходимых библиотек
import os
from dotenv import load_dotenv
from gigachat import GigaChat

# Загрузка переменных окружения из файла .env
load_dotenv()

# Подключение к GigaChat API с использованием контекстного менеджера
# Это обеспечивает правильное закрытие соединения после использования
with GigaChat(
    credentials=os.getenv("GIGACHAT_API_KEY"), verify_ssl_certs=False, model="GigaChat"
) as giga:
    # Отправка вопроса о факторах, влияющих на стоимость страховки
    response = giga.chat("Какие факторы влияют на стоимость страховки на дом?")
    # Вывод ответа от AI-модели
    print(response.choices[0].message.content)
