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

That direction is now materially more real because **live local chat is working inside CC**, and the memory UI now rides on OpenClaw-native memory rather than a separate parallel system.

Long term, a dedicated mobile app makes more product sense than treating Telegram as the main experience.

## What Exists Now

### Memory

- Uses **OpenClaw's native memory system** instead of a separate CC-owned memory layer
- Proxies native memory status, search, reindex, file listing, and file reads through the FastAPI backend
- Supports **multi-agent memory browsing** so you can switch between `main`, `rufus`, and future agents
- Exposes **hybrid semantic + BM25 search** powered by OpenClaw's embedding/index pipeline
- Reads actual workspace memory files (`MEMORY.md` and `memory/*.md`) rather than a shadow copy
- Provides native reindex controls from inside CC

### Tasks

The task system has been replaced with a clean three-layer domain model:

**Layer 1 — Definitions (design time)**

- **Task Definitions** — reusable templates with full agent routing and model policy
- **Workflow Definitions** — ordered sequences of task definitions with step transitions

**Layer 2 — Runtime**

- **Queue** — live work items created from definitions, with inherited routing constraints
- **Task Runs** — execution records linked to queue items and definitions
- **Workflow Runs** — execution records for workflow instances and their child task runs

**Task definition fields include:**

- `task_type` — web_fetch, script, agent_job, coding, review, reminder, check, transform, notification, approval, custom
- `agent_selection_mode` — fixed (pinned to one agent), pool (any in allowed list), auto
- `assigned_agent_id` / `allowed_agent_ids` — explicit routing targets
- `required_capabilities` — capabilities the executing agent must support
- `model_profile` — token_light, balanced, coding_heavy, high_reasoning, premium
- `reasoning_level` / `budget_policy` — planning signals for cost and quality control
- `trigger_modes` — manual, schedule, event, dependency, workflow_only
- `retry_policy`, `timeout_seconds`, `priority`

Queue items inherit all routing and model policy from their source definition when created. An agent may only claim a queue item if it satisfies the routing policy (agent mode, allowed list, capabilities).

**Seed data included:** Fetch docs page (token_light / fetcher_bot), Implement queue logic (coding_heavy / Rufus), Review queue logic (high_reasoning / Dufus), and a Rufus codes → Dufus reviews workflow.

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

### Workflows

- Workflow definitions are reusable orchestrations composed of task definition references
- Each step specifies which task definition to run, and `on_success` / `on_failure` transitions to the next step or a terminal state
- Running a workflow creates a WorkflowRun and a child QueueItem for each step, with routing inherited from the referenced task definition
- UI includes a step builder with task selector and transition config

### Queue

- Dedicated Queue page shows all live runtime work items
- Filterable by status: queued, running, completed, failed, cancelled, blocked
- Cancel and retry actions available per item
- Detail panel shows full routing, execution timeline, result, and error

### Settings

- Present as a UI shell placeholder
- Intended as a wrapper over OpenClaw-native config and secrets, not a separate credential store

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
- SQLite for CC-local app data: task definitions, workflow definitions, queue items, task runs, workflow runs
- Legacy SQLite memory-ingest code still exists in the backend but is no longer the primary memory path
- OpenClaw CLI bridge endpoints
- OpenClaw gateway chat proxy
- OpenClaw native memory proxy endpoints

## Architecture Notes

CC currently uses two different data and control paths depending on the feature:

1. **CC-local app data**
   - task definitions (reusable templates with routing + model policy)
   - workflow definitions (step sequences referencing task definitions)
   - queue items (live runtime work records)
   - task runs and workflow runs (execution history)
   - some legacy memory-ingest code that still remains in the backend but is now deprecated

2. **OpenClaw-native runtime data**
   - agents
   - sessions
   - runtime status
   - logs
   - gateway chat
   - native memory status/search/reindex/file access
   - future model, settings, and secrets management

This split is intentional, but the product direction is getting cleaner: features that are fundamentally agent/runtime concerns should keep moving onto OpenClaw-native rails.

There are still some older backend paths in the repository from an earlier phase of development. The intended direction going forward is to keep converging the product around OpenClaw-native agents, sessions, memory, and gateway messaging rather than building a parallel runtime abstraction inside CC.

## Repository Layout

```text
command-control/
  backend/
    app.py              # FastAPI server — task/workflow/queue domain, legacy memory code, OpenClaw bridge, gateway chat proxy, native memory proxy
    requirements.txt
  src/
    App.tsx             # Main app shell — TasksPage, WorkflowsPage, QueuePage, AgentsPage, MemoryPage, SystemPage
    App.css             # App styling
    lib/
      api.ts            # Older CC memory client (deprecated)
      tasks.ts          # Task definitions, workflow definitions, queue, task runs, workflow runs — types + API client
      oc.ts             # OpenClaw status/session/log bridge client
      ocChat.ts         # OpenClaw agent list + gateway chat client
      ocMemory.ts       # OpenClaw native memory client
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

**Task Definitions**
- `GET /api/tasks` — list all
- `POST /api/tasks` — create
- `GET /api/tasks/{id}` — get one
- `PUT /api/tasks/{id}` — update
- `DELETE /api/tasks/{id}` — delete
- `POST /api/tasks/{id}/run` — enqueue manual task run

**Workflow Definitions**
- `GET /api/workflows` — list all
- `POST /api/workflows` — create
- `GET /api/workflows/{id}` — get one
- `PUT /api/workflows/{id}` — update
- `DELETE /api/workflows/{id}` — delete
- `POST /api/workflows/{id}/run` — enqueue manual workflow run

**Queue**
- `GET /api/queue` — list items (optional `?status=` filter)
- `GET /api/queue/{id}` — get one
- `POST /api/queue/{id}/cancel`
- `POST /api/queue/{id}/retry`
- `POST /api/queue/{id}/claim` — agent worker: mark running (validates routing policy)
- `POST /api/queue/{id}/complete` — agent worker: mark completed
- `POST /api/queue/{id}/fail` — agent worker: mark failed

**Run History**
- `GET /api/task-runs` — list (optional `?task_definition_id=` filter)
- `GET /api/task-runs/{id}`
- `GET /api/workflow-runs` — list (optional `?workflow_definition_id=` filter)
- `GET /api/workflow-runs/{id}`

**Legacy memory (retained, UI no longer depends on it)**
- `GET /api/memory`
- `GET /api/memory/{id}`
- `POST /api/memory/ingest`

### OpenClaw bridge

- `GET /api/oc/health`
- `GET /api/oc/status`
- `GET /api/oc/sessions`
- `GET /api/oc/logs`
- `GET /api/oc/gateway`
- `GET /api/oc/agents`
- `GET /api/oc/gateway-token`
- `POST /api/oc/chat`
- `GET /api/oc/memory/status`
- `POST /api/oc/memory/search`
- `POST /api/oc/memory/reindex`
- `GET /api/oc/memory/files`
- `GET /api/oc/memory/file`

## Near-Term Roadmap

**Task / Workflow / Queue (Phase 2)**
- Active schedule trigger — background runner that enqueues task definitions on schedule
- Dependency trigger — enqueue task B when task A completes successfully
- Run Logs page under System for step-level audit trail
- Queue polling / auto-refresh on the Queue page
- Workflow step status tracking as individual steps complete

**Agent routing**
- Agent capability registry so the queue can validate routing claims against real agent data
- Model profile → actual model mapping layer (one place to upgrade models without touching task definitions)

**UI polish**
- Runs history page showing task runs and workflow runs in one view
- Task definition clone action
- "Add to workflow" shortcut from the Tasks page

**Platform**
- Remove or quarantine the old parallel CC memory ingest path
- Agent management UI as a wrapper over native OpenClaw agent configuration
- Settings and secrets UI backed by OpenClaw-native config and secrets
- Persistent chat history across page refreshes and reloads
- Stabilize CC as the primary daily chat surface before investing in Telegram-heavy flows or a mobile shell

## Product Constraint Worth Keeping

If CC becomes a packaged product or appliance, the base system should stay **CPU-friendly by default**, with GPU treated as optional acceleration or a worker tier rather than a mandatory always-on requirement.
