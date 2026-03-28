# Agent Hub / Bus Notes

## Goal

Do **not** merge agents like Dufus and Rufus into one identity.

Instead, build a **hub / bus** so multiple agents can coordinate cleanly while keeping distinct roles.

## Role Split

- **Dufus** = continuity, product brain, memory, direction, high-level understanding
- **Rufus** = coding-focused implementation agent, here to build and ship
- Future agents should be able to plug into the same system without custom one-off wiring

## Architecture Shape

- **OpenClaw** = runtime / agent execution / sessions / auth / messaging
- **CC (Command & Control)** = UI / control surface / operator dashboard
- **Hub / Bus** = coordination layer between agents

## What the Hub Should Handle

### 1. Tasks

Examples:
- "Rufus, implement this feature"
- "Dufus, review this plan"
- "Tester agent, validate this flow"

The hub should support:
- task creation
- task assignment to an agent
- task status updates
- task completion results

### 2. Events

Examples:
- agent started
- task completed
- task failed
- summary available
- handoff requested

The hub should make these visible in CC so the operator can see the system state.

### 3. Shared Context

Examples:
- active project/milestone
- architecture decisions
- repo/branch status
- current priorities
- relevant memory summaries

The hub should expose shared context without blindly dumping all chat history into every session.

### 4. Handoffs

One agent should be able to leave structured output for another agent.

Examples:
- Dufus creates a scoped implementation brief for Rufus
- Rufus completes coding work and leaves a short summary for Dufus
- A researcher agent produces notes for a writer or planner agent

## Key Product Principle

**Save all chats/history, but do not automatically inject all old chats into every new session.**

Better model:
- save conversations
- allow browsing/loading prior chats in CC
- optionally summarize or pull selected context into a new session

This avoids:
- token waste
- muddy context
- accidental carryover of irrelevant history

## Why This Is Better Than "Merging"

Trying to merge all agents into one blob loses the benefit of specialization.

A coordinated multi-agent setup is stronger:
- one agent understands the bigger picture
- another agent codes
- others can research, test, document, monitor, or publish
- the system still feels unified through the hub

## Candidate Future Agents

- coder
- researcher
- tester
- docs writer
- social/video worker
- monitor/watcher

## Suggested Minimal v1

Build a simple hub with:

1. **Agent registry**
   - list available agents
   - show role/capabilities/status

2. **Task bus**
   - create task
   - assign to agent
   - mark running/completed/failed

3. **Event log**
   - append notable events from agents/tasks
   - render in CC

4. **Handoff record**
   - structured summary passed from one agent to another

5. **Shared memory pointers**
   - link tasks/events to notes, decisions, and memory docs

## Big Picture

This fits the current product direction well:

- **CC shows the graph and control surface**
- **OpenClaw runs the agents**
- **The hub coordinates the work**

That turns CC into a real multi-agent operating layer, not just a chat UI.
