# Импорт необходимых библиотек для создания веб-сервера
from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
from gigachat import GigaChat

# Загрузка переменных окружения из файла .env
load_dotenv()

# Инициализация Flask-приложения
app = Flask(__name__)

# Порт для запуска веб-сервера
PORT = 3000

# Маршрут для обработки AI-запросов через HTTP POST
@app.route('/ai', methods=['POST'])
def process_ai_request():
    try:
        # Получение данных из HTTP-запроса
        # Поддержка как JSON, так и form-data форматов
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        # Логирование полученных данных для отладки
        print("Полученные данные:", data)
        
        # Проверка наличия обязательного поля 'message' в запросе
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400

        # Подключение к GigaChat API с использованием контекстного менеджера
        with GigaChat(
            credentials=os.getenv("GIGACHAT_API_KEY"),
            verify_ssl_certs=False,
            model="GigaChat"
        ) as giga:
            # Отправка сообщения пользователя в GigaChat API
            response = giga.chat(data['message'])
            
            # Возвращение ответа от AI в формате JSON
            return jsonify({
                'response': response.choices[0].message.content
            })

    except Exception as e:
        # Обработка ошибок и возврат сообщения об ошибке
        print("Ошибка:", str(e))
        return jsonify({'error': str(e)}), 500

# Запуск веб-сервера на всех интерфейсах
if __name__ == '__main__':
    print(f"Server is running on port {PORT}")
    app.run(host='0.0.0.0', port=PORT)
