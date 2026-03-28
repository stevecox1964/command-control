# Command & Control

Command & Control (CC) is a dashboard and control plane for OpenClaw.

The important framing:

- **CC is the UI and operator control surface**
- **OpenClaw is the runtime, agent, session, config, and auth engine**

CC should wrap and expose native OpenClaw capabilities instead of becoming a second parallel agent platform.

## Product Direction

Command & Control is moving toward a clean split:

- **OpenClaw owns** agents, sessions, models, secrets, runtime state, gateway auth, and messaging
- **CC owns** operator UX, dashboards, browsing, task controls, memory views, and future workflow orchestration

That means future Settings, Agents, and model management screens should act as a friendly UI over native OpenClaw systems such as:

- `openclaw agents`
- `openclaw models`
- `openclaw secrets`
- session history and session messaging
- gateway-backed chat and runtime status

## Product Principle: CC First

A core product decision is becoming clear:

- **CC should be the primary operator chat surface**
- **Telegram should be secondary**: fallback access, remote control, notifications, and mobile backup

The reason is simple: setting up Telegram is useful infrastructure, but it is not the product. The product value shows up when the operator can:

- open CC
- pick an agent
- chat immediately
- keep history
- stay inside one workspace with status, tasks, memory, and future workflows nearby

Long term, a dedicated mobile app makes more product sense than treating Telegram as the main experience.

## What Exists Now

### Memory

- Ingests markdown files from `../memory/` into SQLite
- Skips unchanged files using content hashes
- Lets you browse indexed daily notes and long-term memory docs
- Exposes ingest, list, and detail APIs through the FastAPI backend

### Tasks

- CRUD for local tasks
- Run-now execution with output capture
- Recurring scheduling support
- Execution history per task
- Supports manual, shell, python, and simple web fetch task types

### Agents

- Lists real OpenClaw agents
- Supports live chat to OpenClaw agents through the gateway using a backend proxy
- Keeps gateway auth on the server side instead of exposing the real token to the browser
- Chat is always visible — no toggle or "Chat" button required; selecting an agent shows the chat pane immediately
- Chat input is always focused so you can start typing without clicking first; focus is restored automatically after each response
- Live session list is capped and scrollable so it never grows to crowd out the chat workspace
- Maintains local per-agent chat history while switching between agents during the session
- Still reads active OpenClaw session data for runtime context

### System

- Proxies OpenClaw health, status, session, gateway, and log information into the UI
- Provides a basic operational dashboard for runtime visibility

### Workflows and Settings

- Present as UI shells and placeholders today
- Intended to become:
  - **Workflows**: orchestration across tasks, agents, and triggers
  - **Settings**: UI wrappers over OpenClaw-native config and secrets, not a separate credential store

## Current Stack

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- Zustand
- react-resizable-panels

### Backend

- FastAPI
- SQLite for CC-local app data such as memory indexing, tasks, and UI-side state
- OpenClaw CLI bridge endpoints
- OpenClaw gateway chat proxy

## Architecture Notes

CC currently uses two different data and control paths depending on the feature:

1. **CC-local app data**
   - memory index
   - tasks
   - task runs
   - other UI-owned metadata

2. **OpenClaw-native runtime data**
   - agents
   - sessions
   - runtime status
   - logs
   - gateway chat
   - future model, settings, and secrets management

This split is intentional.

There are still some older backend paths in the repository from an earlier phase of development. The intended direction going forward is to keep converging the product around OpenClaw-native agents, sessions, and gateway messaging rather than building a parallel runtime abstraction inside CC.

## Repository Layout

```text
command-control/
  backend/
    app.py              # FastAPI server, task/memory DB, OpenClaw bridge, gateway chat proxy
    requirements.txt
  src/
    App.tsx             # Main app shell and page implementations
    App.css             # App styling
    lib/
      api.ts            # Memory API client
      tasks.ts          # Task CRUD + run client
      oc.ts             # OpenClaw status/session/log bridge client
      ocChat.ts         # OpenClaw agent list + gateway chat client
  public/
  index.html
  vite.config.ts
```

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- OpenClaw installed and configured
- OpenClaw gateway available locally

### Install

```bash
# frontend
npm install

# backend
cd backend
pip install -r requirements.txt
```

### Run

```bash
# terminal 1: backend
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# terminal 2: frontend
npm run dev
```

Default local ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

## Key API Areas

### CC-local data

- `GET /api/memory`
- `GET /api/memory/{id}`
- `POST /api/memory/ingest`
- `GET /api/tasks`
- `GET /api/tasks/{id}`
- `POST /api/tasks`
- `PUT /api/tasks/{id}`
- `DELETE /api/tasks/{id}`
- `POST /api/tasks/{id}/run`
- `GET /api/tasks/{id}/runs`

### OpenClaw bridge

- `GET /api/oc/health`
- `GET /api/oc/status`
- `GET /api/oc/sessions`
- `GET /api/oc/logs`
- `GET /api/oc/gateway`
- `GET /api/oc/agents`
- `GET /api/oc/gateway-token`
- `POST /api/oc/chat`

## Near-Term Roadmap

- Agent management UI as a wrapper over native OpenClaw agent configuration
- Model and provider UI for defaults and assignment
- Settings and secrets UI backed by OpenClaw-native config and secrets
- Persistent chat history across page refreshes and reloads
- Better session browsing and history tools when needed, without letting monitoring UI crowd the chat workspace
- Workflow and pipeline orchestration UI
- Stabilize CC as the primary daily chat surface before investing in Telegram-heavy flows or a mobile shell

## Product Constraint Worth Keeping

If CC becomes a packaged product or appliance, the base system should stay **CPU-friendly by default**, with GPU treated as optional acceleration or a worker tier rather than a mandatory always-on requirement.
