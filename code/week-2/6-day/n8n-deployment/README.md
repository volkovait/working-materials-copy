# Развертывание n8n на Ubuntu с Docker и HTTPS

Данная документация описывает процесс развертывания n8n (workflow automation tool) на Ubuntu сервере с использованием Docker и настройкой HTTPS через nginx.

## Содержание

- [Требования](#требования)
- [Установка Docker и Docker Compose](#установка-docker-и-docker-compose)
- [Настройка n8n с Docker Compose](#настройка-n8n-с-docker-compose)
- [Настройка nginx для HTTPS](#настройка-nginx-для-https)
- [Получение SSL сертификатов](#получение-ssl-сертификатов)
- [Управление сервисами](#управление-сервисами)
- [Troubleshooting](#troubleshooting)

## Требования

- Ubuntu 20.04 LTS или новее
- Минимум 2GB RAM
- Минимум 10GB свободного места на диске
- Доменное имя, указывающее на ваш сервер

## Установка Docker и Docker Compose

### 1. Обновление системы

```bash
# Обновляем список пакетов и систему
sudo apt update && sudo apt upgrade -y
```

### 2. Установка необходимых пакетов

```bash
# Устанавливаем пакеты для работы с репозиториями
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
```

### 3. Добавление официального GPG ключа Docker

```bash
# Скачиваем и добавляем GPG ключ Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

### 4. Добавление репозитория Docker

```bash
# Добавляем стабильный репозиторий Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 5. Установка Docker

```bash
# Обновляем список пакетов и устанавливаем Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### 6. Запуск и включение Docker

```bash
# Запускаем Docker и добавляем в автозагрузку
sudo systemctl start docker
sudo systemctl enable docker

# Добавляем текущего пользователя в группу docker (требует перелогина)
sudo usermod -aG docker $USER
```

### 7. Проверка установки

```bash
# Проверяем версию Docker
docker --version

# Проверяем версию Docker Compose
docker compose version
```

## Настройка n8n с Docker Compose

### 1. Создание директории проекта

```bash
# Создаем директорию для проекта
mkdir -p ~/n8n-deployment
cd ~/n8n-deployment
```

### 2. Создание docker-compose.yml

Создайте файл `docker-compose.yml` со следующим содержимым:

```yaml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"  # Порт n8n (внутренний:внешний)
    environment:
      - N8N_HOST=${N8N_HOST:-localhost}  # Хост для n8n
      - N8N_PORT=5678                    # Порт n8n
      - N8N_PROTOCOL=https               # Протокол (https для продакшена)
      - WEBHOOK_URL=${WEBHOOK_URL:-https://yourdomain.com}  # URL для webhooks
      - GENERIC_TIMEZONE=Europe/Moscow   # Часовой пояс
      - N8N_BASIC_AUTH_ACTIVE=true       # Включаем базовую аутентификацию
      - N8N_BASIC_AUTH_USER=${N8N_USER:-admin}  # Пользователь для входа
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD:-your_secure_password}  # Пароль
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY:-your_encryption_key}  # Ключ шифрования
      # Переменные для подключения к PostgreSQL (раскомментируйте, если используете postgres)
      # - DB_TYPE=postgresdb
      # - DB_POSTGRESDB_HOST=postgres
      # - DB_POSTGRESDB_PORT=5432
      # - DB_POSTGRESDB_DATABASE=n8n
      # - DB_POSTGRESDB_USER=n8n
      # - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD:-your_postgres_password}
    volumes:
      - n8n_data:/home/node/.n8n  # Постоянное хранение данных n8n
    networks:
      - n8n_network

  # PostgreSQL база данных (опционально, для продакшена)
  postgres:
    image: postgres:15
    container_name: n8n_postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=n8n
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-your_postgres_password}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - n8n_network

volumes:
  n8n_data:
  postgres_data:

networks:
  n8n_network:
    driver: bridge
```

### 3. Создание .env файла

Создайте файл `.env` с вашими настройками:

```bash
# Создаем .env файл
cat > .env << EOF
# Настройки n8n
N8N_HOST=yourdomain.com
WEBHOOK_URL=https://yourdomain.com
N8N_USER=admin
N8N_PASSWORD=your_secure_password_here
N8N_ENCRYPTION_KEY=your_32_character_encryption_key_here

# Настройки PostgreSQL
POSTGRES_PASSWORD=your_postgres_password_here

# Для использования PostgreSQL раскомментируйте переменные в docker-compose.yml
# и добавьте следующие переменные:
# DB_TYPE=postgresdb
# DB_POSTGRESDB_HOST=postgres
# DB_POSTGRESDB_PORT=5432
# DB_POSTGRESDB_DATABASE=n8n
# DB_POSTGRESDB_USER=n8n
# DB_POSTGRESDB_PASSWORD=your_postgres_password_here
EOF
```

**Важно:** Замените `yourdomain.com` на ваш домен и установите надежные пароли!

### 4. Запуск n8n

```bash
# Запускаем n8n в фоновом режиме
docker compose up -d

# Проверяем статус контейнеров
docker compose ps

# Просматриваем логи
docker compose logs -f n8n
```

## Настройка nginx для HTTPS

### 1. Установка nginx

```bash
# Устанавливаем nginx
sudo apt install -y nginx

# Запускаем и включаем nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2. Создание конфигурации nginx

Создайте файл конфигурации для вашего домена:

```bash
# Создаем конфигурацию nginx
sudo nano /etc/nginx/sites-available/n8n
```

Содержимое файла:

```nginx
# HTTP редирект на HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL сертификаты (будут настроены позже)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL настройки безопасности
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Безопасность заголовков
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Проксирование на n8n
    location / {
        proxy_pass http://localhost:5678;  # Проксируем на n8n
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket поддержка для n8n
    location /ws {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Активация конфигурации

```bash
# Создаем символическую ссылку для активации сайта
sudo ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/

# Удаляем дефолтную конфигурацию
sudo rm /etc/nginx/sites-enabled/default

# Проверяем конфигурацию nginx
sudo nginx -t

# Перезагружаем nginx
sudo systemctl reload nginx
```

## Получение SSL сертификатов

### 1. Установка Certbot

```bash
# Устанавливаем snapd (если не установлен)
sudo apt install -y snapd

# Устанавливаем certbot через snap
sudo snap install --classic certbot

# Создаем символическую ссылку
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 2. Получение SSL сертификата

```bash
# Получаем SSL сертификат для вашего домена
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Настраиваем автоматическое обновление сертификатов
sudo crontab -e
```

Добавьте в crontab:
```
0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. Проверка SSL

```bash
# Проверяем статус сертификата
sudo certbot certificates

# Тестируем обновление сертификатов
sudo certbot renew --dry-run
```

## Управление сервисами

### Основные команды Docker Compose

```bash
# Запуск всех сервисов
docker compose up -d

# Остановка всех сервисов
docker compose down

# Перезапуск сервисов
docker compose restart

# Просмотр логов
docker compose logs -f

# Просмотр логов конкретного сервиса
docker compose logs -f n8n

# Обновление образов
docker compose pull
docker compose up -d

# Просмотр статуса
docker compose ps
```

### Управление nginx

```bash
# Перезагрузка конфигурации
sudo systemctl reload nginx

# Перезапуск nginx
sudo systemctl restart nginx

# Проверка статуса
sudo systemctl status nginx

# Проверка конфигурации
sudo nginx -t
```

### Резервное копирование данных

```bash
# Создание резервной копии данных n8n
docker compose exec n8n tar -czf /tmp/n8n-backup.tar.gz -C /home/node/.n8n .

# Копирование резервной копии на хост
docker cp n8n:/tmp/n8n-backup.tar.gz ./n8n-backup-$(date +%Y%m%d).tar.gz

# Восстановление из резервной копии
docker cp ./n8n-backup-20240101.tar.gz n8n:/tmp/
docker compose exec n8n tar -xzf /tmp/n8n-backup-20240101.tar.gz -C /home/node/.n8n
```

## Troubleshooting

### Проблемы с подключением

```bash
# Проверка статуса контейнеров
docker compose ps

# Проверка логов
docker compose logs n8n

# Проверка портов
sudo netstat -tlnp | grep :5678
sudo netstat -tlnp | grep :443
```

### Проблемы с SSL

```bash
# Проверка SSL сертификата
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Проверка конфигурации nginx
sudo nginx -t

# Проверка статуса certbot
sudo certbot certificates
```

### Проблемы с производительностью

```bash
# Мониторинг использования ресурсов
docker stats

# Очистка неиспользуемых образов
docker system prune -a

# Проверка места на диске
df -h
du -sh /var/lib/docker/
```

### Полезные команды

```bash
# Вход в контейнер n8n
docker compose exec n8n sh

# Просмотр переменных окружения
docker compose exec n8n env

# Проверка подключения к базе данных
docker compose exec postgres psql -U n8n -d n8n -c "SELECT version();"
```

## Безопасность

### Рекомендации по безопасности

1. **Используйте сильные пароли** для всех сервисов
2. **Регулярно обновляйте** Docker образы и систему
3. **Настройте файрвол** для ограничения доступа
4. **Используйте fail2ban** для защиты от брутфорса
5. **Регулярно создавайте резервные копии**

### Настройка файрвола

```bash
# Установка ufw
sudo apt install -y ufw

# Базовые правила
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Разрешаем SSH, HTTP и HTTPS
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включаем файрвол
sudo ufw enable

# Проверяем статус
sudo ufw status
```

## Заключение

После выполнения всех шагов у вас будет:

- ✅ n8n, работающий в Docker контейнере
- ✅ HTTPS соединение через nginx
- ✅ Автоматическое обновление SSL сертификатов
- ✅ PostgreSQL база данных для продакшена
- ✅ Настроенная безопасность

n8n будет доступен по адресу: `https://yourdomain.com`

Для входа используйте учетные данные, указанные в файле `.env`.

