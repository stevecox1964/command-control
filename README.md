# Command & Control

Command & Control (CC) is a dashboard and control plane for OpenClaw.

The important framing:

- **CC is the UI/control surface**
- **OpenClaw is the runtime, agent, session, config, and auth engine**

CC should wrap and expose native OpenClaw capabilities instead of becoming a second parallel agent platform.

## Product Direction

Command & Control is moving toward a clean split:

- **OpenClaw owns** agents, sessions, models, secrets, runtime state, gateway auth, and messaging
- **CC owns** operator UX, dashboards, browsing, task controls, memory views, and future workflow orchestration

That means future Settings, Agents, and model management screens should act as a **friendly UI over native OpenClaw systems** such as:

- `openclaw agents`
- `openclaw models`
- `openclaw secrets`
- session history / session messaging
- gateway-backed chat and runtime status

## What Exists Now

### Memory

- Ingests markdown files from `../memory/` into SQLite
- Skips unchanged files using content hashes
- Lets you browse indexed daily notes and long-term memory docs

### Tasks

- CRUD for local tasks
- Run-now execution with output capture
- Recurring scheduling support
- Execution history per task

### Agents

- Lists real OpenClaw agents
- Lists active OpenClaw sessions
- Supports live chat to OpenClaw agents through the gateway using a backend proxy
- Keeps gateway auth server-side

### System

- Proxies OpenClaw health/status/session/log information into the UI
- Provides a basic operational dashboard for runtime visibility

### Workflows and Settings

- Present as UI shells/stubs today
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

### Backend

- FastAPI
- SQLite for CC-local app data (memory/task indexing and UI-side state)
- OpenClaw CLI and gateway bridge endpoints

## Architecture Notes

CC uses two different data/control paths depending on the feature:

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
   - future model/settings/secrets management

This split is intentional.

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
- `GET /api/oc/agents`
- `GET /api/oc/gateway-token`
- `POST /api/oc/chat`

## Near-Term Roadmap

- Agent management UI as a wrapper over native OpenClaw agent configuration
- Model/provider UI for defaults and assignment
- Settings/secrets UI backed by OpenClaw-native config/secrets
- Better live session browsing and chat history tools
- Workflow/pipeline orchestration UI

## Product Constraint Worth Keeping

If CC becomes a packaged product or appliance, the base system should stay **CPU-friendly by default**, with GPU treated as optional acceleration or a worker tier rather than a mandatory always-on requirement.
