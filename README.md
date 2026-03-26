# Command & Control

Command & Control is a local control surface for OpenClaw.

The goal is to give Steve a browser-based side panel app that can manage memory, tasks, agents, system state, and later visual pipelines for AI-driven workflows.

## Current direction

Command & Control is shaping into five main concepts:

- **Memory** — context and recall
- **Tasks** — executable jobs and scheduled work
- **Agents** — live OpenClaw sessions plus agent profiles
- **System** — runtime health, logs, and status
- **Pipelines** — future visual orchestration layer for connecting tasks and agents

## Current stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** FastAPI
- **Database:** SQLite
- **Runtime integration:** OpenClaw bridge via local CLI calls

## What works today

- Memory ingestion from workspace markdown files into SQLite
- Task creation, execution, enable/disable, deletion, and run history
- OpenClaw-backed System page with health, status, sessions, and logs
- Agents page with live session visibility and editable agent profiles

## Near-term roadmap

- Repair and complete task editing UI
- Rename Projects to Pipelines in the UI
- Build Pipelines v1 as a real backend/UI model
- Add Secrets for authenticated integrations
- Add usage monitoring for providers like OpenAI and Anthropic
- Connect external apps and workflow services cleanly over time

## Running locally

From the project directory:

```bash
./scripts/start-all.sh
```

Stop everything with:

```bash
./scripts/stop-all.sh
```

Frontend:
- `http://localhost:4173/`

Backend:
- `http://localhost:8000/`
