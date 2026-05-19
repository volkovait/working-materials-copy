package main

// Импортируем необходимые библиотеки
import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

// Константа для порта сервера
const PORT = "3000"

// Структура для запроса от пользователя
type AIRequest struct {
	Message string `json:"message"`
}

// Структура для ответа от сервера
type AIResponse struct {
	Response string `json:"response"`
}

// Структура для запроса к GigaChat
type GigaChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

// Структура для сообщения в GigaChat
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Обработчик запросов от пользователя
func handleAIRequest(w http.ResponseWriter, r *http.Request) {
	// Проверяем, что метод запроса - POST
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Декодируем тело запроса в структуру AIRequest
	var req AIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Получаем токен из переменной окружения
	token := os.Getenv("GIGACHAT_TOKEN")
	if token == "" {
		http.Error(w, "GigaChat token not configured", http.StatusInternalServerError)
		return
	}

	// Формируем запрос к GigaChat
	gigaReq := GigaChatRequest{
		Model: "GigaChat:latest",
		Messages: []Message{
			{
				Role:    "user",
				Content: req.Message,
			},
		},
	}

	// Сериализуем запрос (преобразуем структуру в JSON)
	jsonData, err := json.Marshal(gigaReq)
	if err != nil {
		log.Printf("Error marshaling request: %v", err)
		http.Error(w, "Failed to prepare request", http.StatusInternalServerError)
		return
	}

	// Создаем HTTP запрос к GigaChat
	request, err := http.NewRequest("POST", "https://gigachat.devices.sberbank.ru/api/v1/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error creating request: %v", err)
		http.Error(w, "Failed to create request", http.StatusInternalServerError)
		return
	}

	// Устанавливаем заголовки
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)

	// Создаем HTTP клиент с отключенной проверкой SSL
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{Transport: tr}

	// Отправляем запрос
	resp, err := client.Do(request)
	if err != nil {
		log.Printf("Error sending request to GigaChat: %v", err)
		http.Error(w, "Failed to send request to GigaChat", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// Читаем ответ
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading response: %v", err)
		http.Error(w, "Failed to read response", http.StatusInternalServerError)
		return
	}

	// Логируем статус ответа и тело ответа
	log.Printf("GigaChat response status: %d", resp.StatusCode)
	log.Printf("GigaChat response body: %s", string(body))

	// Формируем ответ
	response := AIResponse{
		Response: string(body),
	}

	// Устанавливаем заголовки
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Основная функция программы
func main() {
	// Загружаем переменные окружения из .env файла
	if err := godotenv.Load(); err != nil {
		log.Printf("Error loading .env file: %v", err)
	}

	// Обрабатываем запросы на маршрут "/ai"
	http.HandleFunc("/ai", handleAIRequest)

	// Запускаем сервер на порту PORT
	serverAddr := fmt.Sprintf(":%s", PORT)
	log.Printf("Server is running on port %s", PORT)

	// Условие для проверки на ошибку
	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
