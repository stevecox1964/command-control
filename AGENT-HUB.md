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

## Interface Stance

- **CC should be the primary place Steve talks to agents**
- **Telegram should be fallback / remote / notification infrastructure**, not the center of the product
- Long term, a dedicated mobile app is more product-aligned than forcing Telegram to carry the main UX
- This is now more than theory: live local chat in CC is working, and native memory visibility is now part of the same surface

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

## What Is Built (Phase 1)

The task bus foundation is now live inside CC.

### Task Definitions

Each task definition specifies:

- which agent is allowed to execute it (`assigned_agent_id`, `allowed_agent_ids`, `agent_selection_mode`)
- what capabilities the executing agent must support (`required_capabilities`)
- which model profile to use (`model_profile`, `reasoning_level`, `budget_policy`)

This means "Rufus does coding at coding_heavy" and "Dufus does review at high_reasoning" are now explicit first-class policies in the system, not implicit assumptions.

### Queue (Task Bus)

The Queue is the live runtime counterpart to task definitions:

- a `Run Now` action on any task definition creates a `QueueItem` + `TaskRun`, inheriting all routing constraints
- an agent can claim a queue item only if it satisfies the routing policy
- queue items can be cancelled, retried, completed, or failed via API
- claim/complete/fail endpoints are ready for agent workers to hook into

### Workflow Definitions

Workflows chain task definitions into sequences:

- each step references a task definition by ID
- steps declare `on_success` and `on_failure` transitions
- running a workflow creates a `WorkflowRun` and child `QueueItem`s per step, each with routing inherited from the step's task definition

### Seed Agents and Tasks

The system seeds with concrete examples:
- Fetch docs page → fetcher_bot, token_light, cheap
- Implement queue logic → Rufus (fixed), coding_heavy, premium
- Review queue logic → Dufus (fixed), high_reasoning, balanced
- Workflow: Rufus codes → Dufus reviews → Dufus pushes

## Remaining for Full Hub

1. **Agent capability registry** — real-time validation of agent capabilities against routing claims (currently policy fields exist but are not cross-checked against a live registry)
2. **Event log** — append notable events from agents/tasks and render in CC
3. **Handoff records** — structured summaries passed from one agent to another (currently handled via task output payloads only)
4. **Shared memory pointers** — link tasks/events to notes, decisions, and memory docs
5. **Dependency triggers** — automatically enqueue task B when task A completes
6. **Schedule triggers** — background runner to fire tasks on a cron-style interval

## Big Picture

This fits the current product direction well:

- **CC shows the graph and control surface**
- **OpenClaw runs the agents**
- **The task/queue/workflow layer coordinates the work**

That turns CC into a real multi-agent operating layer, not just a chat UI.
