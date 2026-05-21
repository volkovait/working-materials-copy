# Материалы курса по AI-разработке

Репозиторий с презентациями и практическими примерами кода по темам курса. Материалы разбиты по учебным дням (1–12) и неделям.

## Структура репозитория

| Папка | Содержимое |
|-------|------------|
| [`presentation/`](presentation/) | PDF-презентации по каждому дню |
| [`code/`](code/) | Примеры кода (Node.js, Python, Go, n8n, материалы для Cursor) |
| [`additionally/`](additionally/) | Бонусные темы (см. раздел внизу) |

---

## Навигация по темам

### Неделя 1

#### День 1 — Введение в искусственный интеллект

**Презентация:** [1 - Введение в искусственный интеллект.pdf](presentation/1%20-%20Введение%20в%20искусственный%20интеллект.pdf)

**Код:**

| Раздел | Описание |
|--------|----------|
| [code/week-1/1-day/prompting/](code/week-1/1-day/prompting/) | Основы промптинга, элементы промпта, настройки LLM, примеры |
| [code/week-1/1-day/forCursor/](code/week-1/1-day/forCursor/) | Настройка Cursor: hooks, commands, subagents, skills, rules |

Материалы по промптингу:

- [prompting_basics.md](code/week-1/1-day/prompting/prompting_basics.md)
- [prompt_elements.md](code/week-1/1-day/prompting/prompt_elements.md)
- [best_practices_prompting.md](code/week-1/1-day/prompting/best_practices_prompting.md)
- [examples_prompts.md](code/week-1/1-day/prompting/examples_prompts.md)
- [settings_llm.md](code/week-1/1-day/prompting/settings_llm.md)
- [recommendations_for_developing_prompts.md](code/week-1/1-day/prompting/recommendations_for_developing_prompts.md)

---

#### День 2 — Интеграция AI через API

**Презентация:** [2 - Интеграция AI через API.pdf](presentation/2%20-%20Интеграция%20AI%20через%20API.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-1/2-day/python/](code/week-1/2-day/python/) — GigaChat, OpenAI, Yandex GPT ([README](code/week-1/2-day/python/README.md)) |
| **Node.js** | [gigachat-api-easy](code/week-1/2-day/node/gigachat-api-easy/) · [gigachat-api-integration](code/week-1/2-day/node/gigachat-api-integration/) · [gigachat-api-integration-generate-image](code/week-1/2-day/node/gigachat-api-integration-generate-image/) · [yandex-gpt-api-integration](code/week-1/2-day/node/yandex-gpt-api-integration/) · [open-router-free-models-api-integration](code/week-1/2-day/node/open-router-free-models-api-integration/) · [midjourney-api-integration-generate-image](code/week-1/2-day/node/midjourney-api-integration-generate-image/) |
| **Go** | [code/week-1/2-day/go/](code/week-1/2-day/go/) |

---

#### День 3 — Автоматизированный деплой через AI-инструменты

**Презентация:** [3 - Автоматизированный деплой через AI-инструменты.pdf](presentation/3%20-%20Автоматизированный%20деплой%20через%20AI-инструменты.pdf)

**Код:**

| Материал | Описание |
|----------|----------|
| [code/week-1/3-day/prompt.md](code/week-1/3-day/prompt.md) | Промпт для сценария автоматизированного деплоя |

---

### Неделя 2

#### День 4 — Введение в RAG и работа с векторными базами данных

**Презентация:** [4 - Введение в RAG и работа с векторными базами данных.pdf](presentation/4%20-%20Введение%20в%20RAG%20и%20работа%20с%20векторными%20базами%20данных.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-2/4-day/python/](code/week-2/4-day/python/) — скрипты RAG, Chroma, PostgreSQL/PGVector ([README](code/week-2/4-day/python/README.md)) |
| **Node.js** | [gigachat-rag-example](code/week-2/4-day/node/gigachat-rag-example/) · [gigachat-rag-simple-example](code/week-2/4-day/node/gigachat-rag-simple-example/) · [openai-rag-example](code/week-2/4-day/node/openai-rag-example/) |

---

#### День 5 — Применение MCP в работе AI-агента

**Презентация:** [5 - Применение MCP в работе AI-агента.pdf](presentation/5%20-%20Применение%20MCP%20в%20работе%20AI-агента.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Node.js** | [weather-mcp](code/week-2/5-day/node/weather-mcp/) ([README](code/week-2/5-day/node/weather-mcp/README.md)) |
| **Python** | [image-generator-mcp](code/week-2/5-day/python/image-generator-mcp/) ([README](code/week-2/5-day/python/image-generator-mcp/README.md)) |

---

#### День 6 — Автоматизация AI-агента, знакомство с n8n

**Презентация:** [6 - Автоматизация AI-агента, знакомство с n8n.pdf](presentation/6%20-%20Автоматизация%20AI-агента,%20знакомство%20с%20n8n.pdf)

**Код:**

| Раздел | Описание |
|--------|----------|
| [code/week-2/6-day/n8n-deployment/](code/week-2/6-day/n8n-deployment/) | Деплой n8n ([README](code/week-2/6-day/n8n-deployment/README.md)) |
| [code/week-2/6-day/n8n-workflows/](code/week-2/6-day/n8n-workflows/) | Готовые workflow для n8n ([README](code/week-2/6-day/n8n-workflows/README.md)) |

---

### Неделя 3

#### День 7 — Создание первого AI-агента, знакомство с LangChain

**Презентация:** [7 - Создание первого AI-агента, знакомство с LangChain.pdf](presentation/7%20-%20Создание%20первого%20AI-агента,%20знакомство%20с%20LangChain.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-3/7-day/python/](code/week-3/7-day/python/) — агенты с одним и несколькими инструментами, SQL |
| **Node.js** | [langChainAiAgent](code/week-3/7-day/node/langChainAiAgent/) ([README](code/week-3/7-day/node/langChainAiAgent/README.md)) |

---

#### День 8 — Сценарии для AI-агентов, знакомство с LangGraph

**Презентация:** [8 - Сценарии для AI-агентов, знакомство с LangGraph.pdf](presentation/8%20-%20Сценарии%20для%20AI-агентов,%20знакомство%20с%20LangGraph.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-3/8-day/python/](code/week-3/8-day/python/) — простой граф, поиск, память, PostgreSQL |
| **Node.js** | [1-basic-graph](code/week-3/8-day/node/1-basic-graph/) · [2-conditional-graph](code/week-3/8-day/node/2-conditional-graph/) · [3-advanced-graph](code/week-3/8-day/node/3-advanced-graph/) ([обзор](code/week-3/8-day/node/README.md)) |

---

#### День 9 — Лучшие практики AI-агентов, HITL, fallback

**Презентация:** [9 - Лучшие практики AI-агентов, HITL, fallback.pdf](presentation/9%20-%20Лучшие%20практики%20AI-агентов,%20HITL,%20fallback.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-3/9-day/python/](code/week-3/9-day/python/) — HITL, time travel, fallback |
| **Node.js** | [1-fallback-example](code/week-3/9-day/node/1-fallback-example/) · [2-integrated-fallback](code/week-3/9-day/node/2-integrated-fallback/) · [3-hitl](code/week-3/9-day/node/3-hitl/) · [4-deep-agents](code/week-3/9-day/node/4-deep-agents/) · [5-deep-agents-with-subagents](code/week-3/9-day/node/5-deep-agents-with-subagents/) ([обзор](code/week-3/9-day/node/README.md)) |

---

### Неделя 4

#### День 10 — Мультиагентные системы на LangGraph, архитектуры Swarm и Supervisor

**Презентация:** [10 - Мультиагентные системы на LangGraph, архитектуры Swarm и Supervisor.pdf](presentation/10%20-%20Мультиагентные%20системы%20на%20LangGraph,%20архитектуры%20Swarm%20и%20Supervisor.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-4/10-day/python/](code/week-4/10-day/python/) — `supervisor.py`, `swarm.py`, инструменты |
| **Node.js** | [supervisor-architecture-example](code/week-4/10-day/node/supervisor-architecture-example/) · [swarm-architecture-example](code/week-4/10-day/node/swarm-architecture-example/) · [native-supervisor-architecture-example](code/week-4/10-day/node/native-supervisor-architecture-example/) · [native-swarm-architecture-example](code/week-4/10-day/node/native-swarm-architecture-example/) |

---

#### День 11 — Локальное развертывание LLM, формирование закрытого контура

**Презентация:** [11 - Локальное развертывание LLM, формирование закрытого контура.pdf](presentation/11%20-%20Локальное%20развертывание%20LLM,%20формирование%20закрытого%20контура.pdf)

**Код:**

| Стек | Примеры |
|------|---------|
| **Python** | [code/week-4/11-day/python/](code/week-4/11-day/python/) — `server.py` |
| **Node.js** | [nest-server-with-ollama](code/week-4/11-day/node/nest-server-with-ollama/) ([README](code/week-4/11-day/node/nest-server-with-ollama/README.md)) · [native-node-server-with-ollama](code/week-4/11-day/node/native-node-server-with-ollama/) |

---

#### День 12 — Итоговый день, демонстрация AI-решения

**Презентация:** [12 - Итоговый день, демонстрация AI решения.pdf](presentation/12%20-%20Итоговый%20день,%20демонстрация%20AI%20решения.pdf)

Итоговый день посвящён демонстрации собственного AI-решения; отдельной папки с кодом в репозитории нет.

---

## Бонусные темы

В папке [`additionally/`](additionally/) собраны **дополнительные материалы**, не входящие в основную программу по дням 1–12.

### Знакомство с LangSmith, менеджмент состояний в LangGraph, контекст и иерархия

| Тип | Ссылка |
|-----|--------|
| **Презентация** | [additionally/…/presentation/Знакомство с LangSmith….pdf](additionally/Знакомство%20с%20LangSmith,%20менеджмент%20состояний%20в%20LangGraph,%20контекст%20и%20иерархия/presentation/Знакомство%20с%20LangSmith,%20менеджмент%20состояний%20в%20LangGraph,%20контекст%20и%20иерархия.pdf) |
| **Исходники слайдов (Marp)** | [additionally/…/source/README.md](additionally/Знакомство%20с%20LangSmith,%20менеджмент%20состояний%20в%20LangGraph,%20контекст%20и%20иерархия/source/README.md) |
| **Код (Node.js)** | [langsmith-easy-agent-example](additionally/Знакомство%20с%20LangSmith,%20менеджмент%20состояний%20в%20LangGraph,%20контекст%20и%20иерархия/code/node/langsmith-easy-agent-example/) · [langgraph-swarm-summarization-example](additionally/Знакомство%20с%20LangSmith,%20менеджмент%20состояний%20в%20LangGraph,%20контекст%20и%20иерархия/code/node/langgraph-swarm-summarization-example/) |

Темы бонусного блока: трейсинг и отладка в **LangSmith**, управление состоянием в **LangGraph**, контекст и иерархия в мультиагентных системах.
