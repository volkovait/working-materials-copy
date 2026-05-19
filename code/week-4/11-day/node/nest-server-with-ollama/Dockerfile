# Dockerfile для NestJS приложения
FROM node:26.1-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем манифесты и устанавливаем зависимости (npm ci требует package-lock.json)
COPY package.json package-lock.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем остальные файлы проекта
COPY . .

# Открываем порт 3000
EXPOSE 3000

# Собираем приложение
RUN npm run build

# Запускаем приложение в production режиме
CMD ["node", "dist/main.js"]