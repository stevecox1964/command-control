# Command & Control

Operational dashboard for managing agents, tasks, memory, and system health. Built on React + FastAPI with a local SQLite backend.

## Stack

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, react-router-dom, zustand       |
| Backend  | Python, FastAPI, SQLite (WAL mode)                          |
| LLMs     | Anthropic (Claude), OpenAI (GPT) -- switchable per agent    |
| Runtime  | Hyper-V Ubuntu VM, Windows host                             |

## Features

### Agent Chat (multi-vendor)
Chat with any agent profile in real time. Responses stream token-by-token via SSE.

- **Anthropic**: Claude Sonnet 4.6, Opus 4.6, Haiku 4.5
- **OpenAI**: GPT-4o, GPT-4.1, GPT-4.1 Mini, o4-mini
- Switch models per-agent from the chat header dropdown
- Conversation history persists in SQLite

### Task Engine
- CRUD for tasks (manual, shell, python, web_fetch types)
- Run-now execution with output capture
- Background scheduler polls every 10s for due recurring tasks
- Execution history per task

### Agent Profiles
- Define specialist agents with role, purpose, capability, preferred model
- Promote/demote between planned and live status
- Seeded with: Dufus (main assistant), Research Scout, Trend Distiller, Social Packager

### Memory
- Ingests markdown files from `../memory/` into SQLite
- Content-hashed to skip unchanged files on re-ingest
- Daily journals and long-term memory documents

### System / OpenClaw Bridge
- Proxies `openclaw` CLI for health, sessions, gateway status, and logs
- Real-time system health dashboard

### Additional Modules (stubs)
Content, Approvals, Workflows, Docs, Settings -- navigation and layout ready, wired for future data.

## Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- Hyper-V Ubuntu VM (or any Linux environment)

### Install

```bash
# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
```

### Environment Variables

Create a `.env` or export these in your shell:

```bash
# Required for Anthropic models (Claude)
export ANTHROPIC_API_KEY="sk-ant-..."

# Required only if using OpenAI models
export OPENAI_API_KEY="sk-..."
```

### Run

```bash
# Terminal 1 -- backend
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 -- frontend
npm run dev
```

Frontend serves on `http://localhost:5173`, backend API on `http://localhost:8000`.

## Project Structure

```
command-control/
  backend/
    app.py              # FastAPI server -- all endpoints, DB, scheduler, LLM streaming
    requirements.txt
    memory.db           # SQLite database (auto-created on startup)
  src/
    App.tsx             # All pages -- Shell, Tasks, Agents/Chat, Memory, System, stubs
    App.css             # Full stylesheet
    lib/
      api.ts            # Memory API client
      tasks.ts          # Task CRUD + run client
      agentProfiles.ts  # Agent profile CRUD + model list client
      chat.ts           # Chat streaming client (SSE via ReadableStream)
      oc.ts             # OpenClaw bridge client
  public/
  index.html
  vite.config.ts
```

## API Endpoints

| Method | Path                                    | Description                    |
| ------ | --------------------------------------- | ------------------------------ |
| GET    | `/health`                               | Health check                   |
| GET    | `/api/models`                           | List available LLM models      |
| GET    | `/api/tasks`                            | List all tasks                 |
| POST   | `/api/tasks`                            | Create task                    |
| PUT    | `/api/tasks/{id}`                       | Update task                    |
| DELETE | `/api/tasks/{id}`                       | Delete task                    |
| POST   | `/api/tasks/{id}/run`                   | Execute task now               |
| GET    | `/api/tasks/{id}/runs`                  | Task execution history         |
| GET    | `/api/agent-profiles`                   | List agent profiles            |
| POST   | `/api/agent-profiles`                   | Create agent profile           |
| PUT    | `/api/agent-profiles/{id}`              | Update agent profile           |
| DELETE | `/api/agent-profiles/{id}`              | Delete agent profile           |
| GET    | `/api/agent-profiles/{id}/chat`         | Get chat history               |
| POST   | `/api/agent-profiles/{id}/chat`         | Send message (SSE stream)      |
| DELETE | `/api/agent-profiles/{id}/chat`         | Clear chat history             |
| GET    | `/api/memory`                           | List memory documents          |
| GET    | `/api/memory/{id}`                      | Get memory document            |
| POST   | `/api/memory/ingest`                    | Re-ingest memory files         |
| GET    | `/api/oc/health`                        | OpenClaw health                |
| GET    | `/api/oc/sessions`                      | OpenClaw sessions              |
| GET    | `/api/oc/status`                        | OpenClaw full status           |
| GET    | `/api/oc/logs`                          | OpenClaw logs                  |
