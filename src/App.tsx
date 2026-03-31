import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
// Old parallel memory API (deprecated — now using OC native memory via ocMemory.ts)
// import { fetchMemoryDocument, fetchMemoryList, ingestMemory } from './lib/api'
import { type OcMemoryFile, type OcMemoryFileContent, type OcMemorySearchResult, type OcMemoryStatus, fetchMemoryFiles, fetchMemoryFileContent, fetchMemoryStatus, searchMemory, reindexMemory } from './lib/ocMemory'
import {
  type TaskDefinition, type TaskDefinitionCreate, type TaskRun, type WorkflowDefinition, type WorkflowStep, type QueueItem,
  fetchTasks, createTask, updateTask, deleteTask, runTask, fetchTaskRuns,
  fetchWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, runWorkflow,
  fetchQueue, cancelQueueItem, retryQueueItem,
} from './lib/tasks'
import { fetchOcHealth, fetchOcLogs, fetchOcSessions, fetchOcStatus } from './lib/oc'
import { type OcAgent, type ChatMessage as OcChatMessage, fetchOcAgents, sendMessage as sendOcMessage, fetchSessionHistory } from './lib/ocChat'
import './App.css'

type StubCard = {
  title: string
  value: string
  note: string
}

type StubListItem = {
  name: string
  meta: string
  status: string
}

type ModuleConfig = {
  key: string
  label: string
  path: string
  eyebrow: string
  title: string
  description: string
  primaryAction: string
  secondaryAction: string
  cards: StubCard[]
  listTitle: string
  listItems: StubListItem[]
  detailTitle: string
  detailText: string[]
}

// Old memory types (deprecated — now using OcMemory* types from ocMemory.ts)

const modules: ModuleConfig[] = [
  {
    key: 'tasks',
    label: 'Tasks',
    path: '/tasks',
    eyebrow: 'Operations',
    title: 'Tasks',
    description: 'Queue work, track running actions, and surface what Dufus should focus on next.',
    primaryAction: 'New Task',
    secondaryAction: 'View Queue',
    cards: [
      { title: 'Open Tasks', value: '12', note: '3 high priority' },
      { title: 'Running', value: '4', note: '2 active workflows' },
      { title: 'Completed Today', value: '18', note: 'Smooth morning so far' },
    ],
    listTitle: 'Task Queue',
    listItems: [
      { name: 'Bootstrap memory indexing', meta: 'Assigned to Dufus · 11:20', status: 'Queued' },
      { name: 'Review app shell interactions', meta: 'UI pass · 11:45', status: 'In Progress' },
      { name: 'Draft SQLite schema', meta: 'Architecture · today', status: 'Planned' },
    ],
    detailTitle: 'Task orchestration stub',
    detailText: [
      'This page will become the operational queue for agent work, background jobs, and manual tasks.',
      'For now it is mocked so we can validate navigation, information density, and panel layout.',
    ],
  },
  {
    key: 'agents',
    label: 'Agents',
    path: '/agents',
    eyebrow: 'Runtime',
    title: 'Agents',
    description: 'Track active sessions, spawned helpers, capabilities, and local runtime status.',
    primaryAction: 'Spawn Agent',
    secondaryAction: 'Inspect Runtime',
    cards: [
      { title: 'Online Agents', value: '1', note: 'Dufus is awake' },
      { title: 'Subagents', value: '0', note: 'None currently running' },
      { title: 'Model', value: 'GPT', note: 'OpenAI-backed main session' },
    ],
    listTitle: 'Agent Roster',
    listItems: [
      { name: 'Dufus / Main Session', meta: 'telegram direct chat', status: 'Online' },
      { name: 'Codex Helper', meta: 'not started', status: 'Idle' },
      { name: 'Memory Indexer', meta: 'planned background worker', status: 'Stub' },
    ],
    detailTitle: 'Agent management stub',
    detailText: [
      'Eventually this should show active sessions, costs, tooling, and handoffs between main and spawned helpers.',
      'Good place later for session status, logs, and kill/steer controls.',
    ],
  },
  {
    key: 'content',
    label: 'Content',
    path: '/content',
    eyebrow: 'Knowledge',
    title: 'Content',
    description: 'A home for files, notes, uploads, docs, and source material that feed the system.',
    primaryAction: 'Add Source',
    secondaryAction: 'Browse Files',
    cards: [
      { title: 'Sources', value: '27', note: 'mixed markdown + media' },
      { title: 'Unprocessed', value: '5', note: 'awaiting parse/index' },
      { title: 'Recent Uploads', value: '2', note: 'today' },
    ],
    listTitle: 'Recent Content',
    listItems: [
      { name: 'Alex Finn reference UI', meta: 'image · 11:03', status: 'Ready' },
      { name: 'Workspace memory files', meta: 'markdown set', status: 'Indexed later' },
      { name: 'System docs mirror', meta: 'local docs folder', status: 'Available' },
    ],
    detailTitle: 'Content hub stub',
    detailText: [
      'This module can evolve into a canonical content browser for documents, imports, and embeddings.',
      'I’d keep it adjacent to memory but not conflate the two.',
    ],
  },
  {
    key: 'approvals',
    label: 'Approvals',
    path: '/approvals',
    eyebrow: 'Safety',
    title: 'Approvals',
    description: 'Review elevated actions, external sends, and sensitive operations before execution.',
    primaryAction: 'Review Pending',
    secondaryAction: 'Policy Rules',
    cards: [
      { title: 'Pending', value: '0', note: 'clean board right now' },
      { title: 'Approved Today', value: '2', note: 'local setup actions' },
      { title: 'Blocked', value: '0', note: 'no safety events' },
    ],
    listTitle: 'Approval Feed',
    listItems: [
      { name: 'Local project scaffold', meta: 'workspace-only', status: 'Approved' },
      { name: 'Git identity change', meta: 'deferred by Steve', status: 'Skipped' },
      { name: 'External messaging', meta: 'none', status: 'Clear' },
    ],
    detailTitle: 'Approval center stub',
    detailText: [
      'Later this can become a very useful ops view: what needs human approval, why, and how often it happens.',
      'Could also display audit trails for sensitive actions.',
    ],
  },
  {
    key: 'workflows',
    label: 'Workflows',
    path: '/workflows',
    eyebrow: 'Orchestration',
    title: 'Workflows',
    description: 'Reusable orchestrations that chain task definitions into sequences.',
    primaryAction: 'New Workflow',
    secondaryAction: 'Refresh',
    cards: [],
    listTitle: '',
    listItems: [],
    detailTitle: '',
    detailText: [],
  },
  {
    key: 'queue',
    label: 'Queue',
    path: '/queue',
    eyebrow: 'Runtime',
    title: 'Queue',
    description: 'Live execution queue — pending, running, and completed work items.',
    primaryAction: 'Refresh',
    secondaryAction: 'View Runs',
    cards: [],
    listTitle: '',
    listItems: [],
    detailTitle: '',
    detailText: [],
  },
  {
    key: 'memory',
    label: 'Memory',
    path: '/memory',
    eyebrow: 'Module',
    title: 'Memory',
    description: 'Inspect daily notes, long-term memory, and eventually semantic retrieval across the system.',
    primaryAction: 'Ingest',
    secondaryAction: 'Refresh',
    cards: [],
    listTitle: '',
    listItems: [],
    detailTitle: '',
    detailText: [],
  },
  {
    key: 'docs',
    label: 'Docs',
    path: '/docs',
    eyebrow: 'Reference',
    title: 'Docs',
    description: 'Quick access to OpenClaw docs, local guidance, notes, and implementation references.',
    primaryAction: 'Open Docs',
    secondaryAction: 'Search Reference',
    cards: [
      { title: 'Local Docs', value: 'Ready', note: 'OpenClaw docs installed' },
      { title: 'Skills', value: '4', note: 'available right now' },
      { title: 'Workspace Notes', value: '5', note: 'AGENTS / SOUL / USER etc.' },
    ],
    listTitle: 'Reference Sets',
    listItems: [
      { name: 'OpenClaw docs', meta: 'local mirror', status: 'Available' },
      { name: 'Workspace guide files', meta: 'root markdown', status: 'Loaded' },
      { name: 'Skill reference', meta: 'healthcheck, weather, more', status: 'Available' },
    ],
    detailTitle: 'Docs browser stub',
    detailText: [
      'This is a natural place for searchable documentation and implementation notes.',
      'Could later include docs previews, recent references, and saved snippets.',
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    eyebrow: 'Config',
    title: 'Settings',
    description: 'Control app configuration, provider options, and the future home for secrets and credentials.',
    primaryAction: 'Add Setting',
    secondaryAction: 'Refresh',
    cards: [
      { title: 'Secrets', value: 'Soon', note: 'future secure storage' },
      { title: 'Providers', value: '2+', note: 'OpenAI / Anthropic later' },
      { title: 'Runtime', value: 'Local', note: 'VM-hosted for now' },
    ],
    listTitle: 'Settings Rows',
    listItems: [
      { name: 'OpenAI Usage Monitor', meta: 'future authenticated integration', status: 'Planned' },
      { name: 'Anthropic Usage Monitor', meta: 'future authenticated integration', status: 'Planned' },
      { name: 'Secrets Vault', meta: 'future secure key storage', status: 'Planned' },
    ],
    detailTitle: 'Settings and secrets stub',
    detailText: [
      'This page will become the configuration surface for providers, credentials, toggles, and runtime behavior.',
      'It is the natural future home for Secrets once we build secure storage and editing.',
    ],
  },

  {
    key: 'system',
    label: 'System',
    path: '/system',
    eyebrow: 'Infra',
    title: 'System',
    description: 'Observe host status, services, app health, storage, and OpenClaw runtime details.',
    primaryAction: 'Run Check',
    secondaryAction: 'View Logs',
    cards: [
      { title: 'VM Status', value: 'Online', note: 'reachable from Windows' },
      { title: 'App Preview', value: '4173', note: 'preview server serving' },
      { title: 'OpenClaw', value: 'Active', note: 'main session connected' },
    ],
    listTitle: 'System Signals',
    listItems: [
      { name: 'Vite preview server', meta: 'port 4173', status: 'Healthy' },
      { name: 'Vite dev server', meta: 'bus error in VM', status: 'Needs Debug' },
      { name: 'Workspace repo', meta: 'git identity not configured', status: 'Informational' },
    ],
    detailTitle: 'System operations stub',
    detailText: [
      'This page should eventually become the technical cockpit for runtime status and machine-level checks.',
      'Good future home for logs, storage, and service visibility.',
    ],
  },
]

function App() {
  return (
    <Routes>
      <Route path="/" element={<Shell />}>
        <Route index element={<TasksPage />} />
        {modules.map((module) =>
          module.key === 'memory' ? (
            <Route key={module.key} path={module.path.slice(1)} element={<MemoryPage />} />
          ) : module.key === 'tasks' ? (
            <Route key={module.key} path={module.path.slice(1)} element={<TasksPage />} />
          ) : module.key === 'workflows' ? (
            <Route key={module.key} path={module.path.slice(1)} element={<WorkflowsPage />} />
          ) : module.key === 'queue' ? (
            <Route key={module.key} path={module.path.slice(1)} element={<QueuePage />} />
          ) : module.key === 'agents' ? (
            <Route key={module.key} path={module.path.slice(1)} element={<AgentsPage />} />
          ) : module.key === 'system' ? (
            <Route key={module.key} path={module.path.slice(1)} element={<SystemPage />} />
          ) : (
            <Route
              key={module.key}
              path={module.path.slice(1)}
              element={<ModuleStubPage module={module} />}
            />
          ),
        )}
      </Route>
    </Routes>
  )
}

function Shell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">🦞</div>
          <div>
            <p className="eyebrow">OpenClaw</p>
            <h1>Command &amp; Control</h1>
          </div>
        </div>

        <nav className="nav">
          {modules.map((module) => (
            <NavLink
              key={module.key}
              to={module.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-dot" />
              <span className="nav-label">{module.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-pill online">OC Online</div>
          <p>Local VM workspace</p>
        </div>
      </aside>

      <main className="main-frame">
        <header className="topbar">
          <div className="search-wrap">
            <input placeholder="Search Command & Control…" aria-label="Global search" />
          </div>
          <div className="topbar-actions">
            <button>Pause</button>
            <button>Ping</button>
            <div className="avatar">S</div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  )
}

function ModuleStubPage({ module }: { module: ModuleConfig }) {
  return (
    <section className="page stub-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{module.eyebrow}</p>
          <h2>{module.title}</h2>
          <p className="page-description">{module.description}</p>
        </div>
        <div className="page-header-actions">
          <button className="secondary">{module.secondaryAction}</button>
          <button className="primary">{module.primaryAction}</button>
        </div>
      </div>

      <div className="metrics-grid">
        {module.cards.map((card) => (
          <article key={card.title} className="metric-card">
            <p className="eyebrow">{card.title}</p>
            <strong>{card.value}</strong>
            <span>{card.note}</span>
          </article>
        ))}
      </div>

      <Group orientation="horizontal" className="memory-panels stub-panels">
        <Panel defaultSize="38%" minSize="28%">
          <div className="memory-index stub-index">
            <input className="section-search" placeholder={`Search ${module.title.toLowerCase()}...`} />

            <article className="pinned-card">
              <p className="eyebrow">Overview</p>
              <h3>{module.listTitle}</h3>
              <p>{module.description}</p>
              <div className="meta-row">
                <span>Mocked</span>
                <span>Navigation ready</span>
              </div>
            </article>

            <section className="group-card">
              <div className="group-header">
                <h4>{module.listTitle}</h4>
                <span>{module.listItems.length}</span>
              </div>
              <div className="entry-list">
                {module.listItems.map((item, index) => (
                  <button key={item.name} className={`entry-item ${index === 0 ? 'selected' : ''}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.meta}</p>
                    </div>
                    <div className="entry-meta">
                      <span>{item.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="62%" minSize="38%">
          <article className="memory-detail stub-detail">
            <div className="detail-header">
              <div>
                <p className="eyebrow">Mock Detail</p>
                <h3>{module.detailTitle}</h3>
              </div>
              <div className="detail-meta">
                <span>Stub page</span>
                <span>Phase 1 shell</span>
                <span>Interactive layout</span>
              </div>
            </div>

            <div className="detail-body">
              {module.detailText.map((paragraph) => (
                <section key={paragraph}>
                  <p>{paragraph}</p>
                </section>
              ))}

              <section>
                <h4>Next likely capabilities</h4>
                <ul>
                  <li>Real data wiring for this module</li>
                  <li>Context-sensitive actions in the top bar</li>
                  <li>Persistence and search across module entities</li>
                </ul>
              </section>
            </div>
          </article>
        </Panel>
      </Group>
    </section>
  )
}

const TASK_TYPES = ['web_fetch','script','agent_job','coding','review','reminder','check','transform','notification','approval','custom'] as const
const MODEL_PROFILES = ['token_light','balanced','coding_heavy','high_reasoning','premium'] as const
const AGENT_MODES = ['auto','fixed','pool'] as const
const REASONING_LEVELS = ['low','medium','high'] as const
const BUDGET_POLICIES = ['cheap','balanced','premium'] as const

const EMPTY_TASK_FORM = {
  name: '',
  description: '',
  task_type: 'web_fetch' as string,
  enabled: true,
  trigger_modes: 'manual',
  execution_backend: 'openclaw' as string,
  assigned_agent_id: '',
  allowed_agent_ids: '',
  agent_selection_mode: 'auto' as string,
  required_capabilities: '',
  model_profile: 'balanced' as string,
  max_tokens: '',
  reasoning_level: 'medium' as string,
  budget_policy: 'balanced' as string,
  priority: '5',
  timeout_seconds: '300',
  tags: '',
}

function TasksPage() {
  const [tasks, setTasks] = useState<TaskDefinition[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<TaskRun[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [showModal, setShowModal] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState(EMPTY_TASK_FORM)

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? tasks[0] ?? null
  const selectedIndex = selectedTask ? tasks.findIndex((t) => t.id === selectedTask.id) : -1
  const previousTask = selectedIndex > 0 ? tasks[selectedIndex - 1] : null
  const nextTask = selectedIndex >= 0 && selectedIndex < tasks.length - 1 ? tasks[selectedIndex + 1] : null

  async function loadTasks() {
    setError(null)
    try {
      const data = await fetchTasks()
      setTasks(data)
      const nextId = selectedId ?? data[0]?.id ?? null
      setSelectedId(nextId)
      if (nextId) {
        const runData = await fetchTaskRuns(nextId)
        setRuns(runData)
      } else {
        setRuns([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    }
  }

  useEffect(() => { void loadTasks() }, [])

  useEffect(() => {
    if (!selectedTask?.id) return
    void fetchTaskRuns(selectedTask.id).then(setRuns).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load runs'))
  }, [selectedTask?.id])

  function formToPayload() {
    return {
      name: form.name,
      description: form.description || null,
      task_type: form.task_type,
      enabled: form.enabled,
      trigger_modes: form.trigger_modes.split(',').map(s => s.trim()).filter(Boolean),
      execution_backend: form.execution_backend,
      assigned_agent_id: form.assigned_agent_id || null,
      allowed_agent_ids: form.allowed_agent_ids.split(',').map(s => s.trim()).filter(Boolean),
      agent_selection_mode: form.agent_selection_mode,
      required_capabilities: form.required_capabilities.split(',').map(s => s.trim()).filter(Boolean),
      model_profile: form.model_profile,
      max_tokens: form.max_tokens ? Number(form.max_tokens) : null,
      reasoning_level: form.reasoning_level,
      budget_policy: form.budget_policy,
      priority: Number(form.priority) || 5,
      timeout_seconds: Number(form.timeout_seconds) || 300,
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
    } as Partial<TaskDefinitionCreate>
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    try {
      if (showModal === 'edit' && selectedTask) {
        await updateTask(selectedTask.id, formToPayload())
        setNotice('Task updated')
      } else {
        await createTask(formToPayload())
        setNotice('Task created')
      }
      setShowModal(null)
      setForm(EMPTY_TASK_FORM)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    }
  }

  async function handleRun(id: string) {
    try {
      const result = await runTask(id)
      setNotice(`Queued — queue item: ${result.queue_item_id} · status: ${result.status}`)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run task')
    }
  }

  async function handleToggle(task: TaskDefinition) {
    try {
      await updateTask(task.id, { enabled: !task.enabled })
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle task')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id)
      setNotice('Task deleted')
      setSelectedId(nextTask?.id ?? previousTask?.id ?? null)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  function openEdit() {
    if (!selectedTask) return
    setForm({
      name: selectedTask.name,
      description: selectedTask.description ?? '',
      task_type: selectedTask.task_type,
      enabled: selectedTask.enabled,
      trigger_modes: selectedTask.trigger_modes.join(', '),
      execution_backend: selectedTask.execution_backend,
      assigned_agent_id: selectedTask.assigned_agent_id ?? '',
      allowed_agent_ids: selectedTask.allowed_agent_ids.join(', '),
      agent_selection_mode: selectedTask.agent_selection_mode,
      required_capabilities: selectedTask.required_capabilities.join(', '),
      model_profile: selectedTask.model_profile,
      max_tokens: selectedTask.max_tokens != null ? String(selectedTask.max_tokens) : '',
      reasoning_level: selectedTask.reasoning_level,
      budget_policy: selectedTask.budget_policy,
      priority: String(selectedTask.priority),
      timeout_seconds: String(selectedTask.timeout_seconds),
      tags: selectedTask.tags.join(', '),
    })
    setShowModal('edit')
  }

  function closeModal() {
    setShowModal(null)
    setForm(EMPTY_TASK_FORM)
  }

  const enabledCount = tasks.filter(t => t.enabled).length
  const scheduledCount = tasks.filter(t => t.trigger_modes.includes('schedule')).length

  return (
    <section className="page tasks-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Definitions</p>
          <h2>Tasks</h2>
          <p className="page-description">Reusable task definitions with agent routing and model policy.</p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadTasks()}>Refresh</button>
          <button className="primary" onClick={() => { setForm(EMPTY_TASK_FORM); setShowModal('create') }}>New Task</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card"><p className="eyebrow">Definitions</p><strong>{tasks.length}</strong><span>Total task definitions</span></article>
        <article className="metric-card"><p className="eyebrow">Enabled</p><strong>{enabledCount}</strong><span>Eligible to run</span></article>
        <article className="metric-card"><p className="eyebrow">Scheduled</p><strong>{scheduledCount}</strong><span>Have schedule trigger</span></article>
      </div>

      <Group orientation="horizontal" className="memory-panels">
        <Panel defaultSize="38%" minSize="28%">
          <div className="memory-index">
            <div className="group-stack">
              <div className="group-label-row">
                <p className="eyebrow">Task Definitions</p>
                <span>{tasks.length} items</span>
              </div>
              <section className="group-card">
                <div className="entry-list">
                  {tasks.map((task) => (
                    <button key={task.id} className={`entry-item ${task.id === selectedTask?.id ? 'selected' : ''}`} onClick={() => setSelectedId(task.id)}>
                      <div>
                        <strong>{task.name}</strong>
                        <p>{task.task_type} · {task.model_profile} · {task.agent_selection_mode === 'fixed' ? (task.assigned_agent_id ?? 'unassigned') : task.agent_selection_mode}</p>
                      </div>
                      <div className="entry-meta">
                        <span>{task.enabled ? 'enabled' : 'disabled'}</span>
                        <span>{task.budget_policy}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="62%" minSize="38%">
          <article className="memory-detail">
            <div className="detail-header">
              <div className="task-detail-toprow">
                <button className="nav-chev" disabled={!previousTask} onClick={() => previousTask && setSelectedId(previousTask.id)}>«</button>
                <div>
                  <p className="eyebrow">Task Definition</p>
                  <h3>{selectedTask?.name ?? 'No task selected'}</h3>
                </div>
                <button className="nav-chev" disabled={!nextTask} onClick={() => nextTask && setSelectedId(nextTask.id)}>»</button>
              </div>
              <div className="detail-meta">
                <span>{selectedTask?.task_type ?? '—'}</span>
                <span>{selectedTask?.model_profile ?? '—'}</span>
                <span>{selectedTask?.enabled ? 'enabled' : 'disabled'}</span>
              </div>
            </div>

            <div className="detail-body">
              {selectedTask ? (
                <>
                  <div className="task-action-row">
                    <button className="primary" onClick={() => void handleRun(selectedTask.id)}>Run Now</button>
                    <button className="secondary" onClick={openEdit}>Edit</button>
                    <button className="secondary" onClick={() => void handleToggle(selectedTask)}>
                      {selectedTask.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="secondary danger" onClick={() => void handleDelete(selectedTask.id)}>Delete</button>
                  </div>

                  <section>
                    <h4>Execution Routing</h4>
                    <ul>
                      <li>Agent mode: {selectedTask.agent_selection_mode}</li>
                      <li>Assigned agent: {selectedTask.assigned_agent_id ?? '—'}</li>
                      <li>Allowed agents: {selectedTask.allowed_agent_ids.join(', ') || '—'}</li>
                      <li>Required capabilities: {selectedTask.required_capabilities.join(', ') || '—'}</li>
                    </ul>
                  </section>

                  <section>
                    <h4>Model Policy</h4>
                    <ul>
                      <li>Profile: {selectedTask.model_profile}</li>
                      <li>Reasoning: {selectedTask.reasoning_level}</li>
                      <li>Budget: {selectedTask.budget_policy}</li>
                      <li>Max tokens: {selectedTask.max_tokens ?? 'default'}</li>
                    </ul>
                  </section>

                  <section>
                    <h4>Scheduling &amp; Config</h4>
                    <ul>
                      <li>Triggers: {selectedTask.trigger_modes.join(', ')}</li>
                      <li>Priority: {selectedTask.priority}</li>
                      <li>Timeout: {selectedTask.timeout_seconds}s</li>
                      <li>Retries: {selectedTask.retry_policy.max_retries} × {selectedTask.retry_policy.retry_delay_seconds}s</li>
                      <li>Tags: {selectedTask.tags.join(', ') || '—'}</li>
                    </ul>
                  </section>

                  {selectedTask.description ? (
                    <section>
                      <h4>Description</h4>
                      <p>{selectedTask.description}</p>
                    </section>
                  ) : null}

                  <section>
                    <h4>Recent Task Runs</h4>
                    {runs.length ? (
                      <div className="runs-list">
                        {runs.map((run) => (
                          <article key={run.id} className="run-card">
                            <div className="group-header">
                              <strong>{run.status}</strong>
                              <span>{run.trigger_source}</span>
                            </div>
                            <p>{run.started_at ?? 'not started'}</p>
                            {run.result_summary ? <p>{run.result_summary}</p> : null}
                            {run.error_message ? <pre className="memory-content">{run.error_message}</pre> : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>No runs yet.</p>
                    )}
                  </section>
                </>
              ) : (
                <section><p>Create or select a task definition to inspect it.</p></section>
              )}
            </div>
          </article>
        </Panel>
      </Group>

      {showModal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="group-header">
              <h4>{showModal === 'edit' ? 'Edit Task' : 'New Task Definition'}</h4>
              <button className="secondary" onClick={closeModal}>Close</button>
            </div>
            <form className="task-form" onSubmit={handleSubmit}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>General</p>
              <input className="section-search" placeholder="Task name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="section-search" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <select className="section-search" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="task-checkbox">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enabled
              </label>
              <input className="section-search" placeholder="Trigger modes (comma-separated: manual, schedule, event)" value={form.trigger_modes} onChange={(e) => setForm({ ...form, trigger_modes: e.target.value })} />

              <p className="eyebrow" style={{ margin: '12px 0 4px' }}>Execution Routing</p>
              <select className="section-search" value={form.agent_selection_mode} onChange={(e) => setForm({ ...form, agent_selection_mode: e.target.value })}>
                {AGENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input className="section-search" placeholder="Assigned agent ID (for fixed mode)" value={form.assigned_agent_id} onChange={(e) => setForm({ ...form, assigned_agent_id: e.target.value })} />
              <input className="section-search" placeholder="Allowed agent IDs (comma-separated)" value={form.allowed_agent_ids} onChange={(e) => setForm({ ...form, allowed_agent_ids: e.target.value })} />
              <input className="section-search" placeholder="Required capabilities (comma-separated)" value={form.required_capabilities} onChange={(e) => setForm({ ...form, required_capabilities: e.target.value })} />

              <p className="eyebrow" style={{ margin: '12px 0 4px' }}>Model Policy</p>
              <select className="section-search" value={form.model_profile} onChange={(e) => setForm({ ...form, model_profile: e.target.value })}>
                {MODEL_PROFILES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="section-search" value={form.reasoning_level} onChange={(e) => setForm({ ...form, reasoning_level: e.target.value })}>
                {REASONING_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select className="section-search" value={form.budget_policy} onChange={(e) => setForm({ ...form, budget_policy: e.target.value })}>
                {BUDGET_POLICIES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <input className="section-search" placeholder="Max tokens (optional)" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} />

              <p className="eyebrow" style={{ margin: '12px 0 4px' }}>Retry / Timeout</p>
              <input className="section-search" placeholder="Priority (1–10)" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              <input className="section-search" placeholder="Timeout seconds" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: e.target.value })} />
              <input className="section-search" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />

              <button className="primary task-submit" type="submit">{showModal === 'edit' ? 'Save Task' : 'Create Task'}</button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Workflows Page
// ---------------------------------------------------------------------------

const EMPTY_WORKFLOW_FORM = {
  name: '',
  description: '',
  enabled: true,
  trigger_modes: 'manual',
}

function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [allTasks, setAllTasks] = useState<TaskDefinition[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [showModal, setShowModal] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState(EMPTY_WORKFLOW_FORM)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [newStepTaskId, setNewStepTaskId] = useState('')

  const selectedWorkflow = workflows.find(w => w.id === selectedId) ?? workflows[0] ?? null

  async function loadData() {
    setError(null)
    try {
      const [wfData, taskData] = await Promise.all([fetchWorkflows(), fetchTasks()])
      setWorkflows(wfData)
      setAllTasks(taskData)
      if (!selectedId && wfData.length) setSelectedId(wfData[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows')
    }
  }

  useEffect(() => { void loadData() }, [])

  function openCreate() {
    setForm(EMPTY_WORKFLOW_FORM)
    setSteps([])
    setNewStepTaskId(allTasks[0]?.id ?? '')
    setShowModal('create')
  }

  function openEdit() {
    if (!selectedWorkflow) return
    setForm({
      name: selectedWorkflow.name,
      description: selectedWorkflow.description ?? '',
      enabled: selectedWorkflow.enabled,
      trigger_modes: selectedWorkflow.trigger_modes.join(', '),
    })
    setSteps(selectedWorkflow.steps)
    setNewStepTaskId(allTasks[0]?.id ?? '')
    setShowModal('edit')
  }

  function closeModal() {
    setShowModal(null)
    setForm(EMPTY_WORKFLOW_FORM)
    setSteps([])
  }

  function addStep() {
    if (!newStepTaskId) return
    const task = allTasks.find(t => t.id === newStepTaskId)
    const stepNum = steps.length + 1
    setSteps([...steps, {
      step_id: `step_${stepNum}`,
      task_definition_id: newStepTaskId,
      name: task?.name ?? newStepTaskId,
      on_success: 'complete',
      on_failure: 'fail_workflow',
      conditions: [],
    }])
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx))
  }

  function updateStepTransition(idx: number, field: 'on_success' | 'on_failure', value: string) {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        enabled: form.enabled,
        trigger_modes: form.trigger_modes.split(',').map(s => s.trim()).filter(Boolean),
        steps,
      }
      if (showModal === 'edit' && selectedWorkflow) {
        await updateWorkflow(selectedWorkflow.id, payload)
        setNotice('Workflow updated')
      } else {
        await createWorkflow(payload)
        setNotice('Workflow created')
      }
      closeModal()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workflow')
    }
  }

  async function handleRun(id: string) {
    try {
      const result = await runWorkflow(id)
      setNotice(`Workflow queued — status: ${result.status}`)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run workflow')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWorkflow(id)
      setNotice('Workflow deleted')
      setSelectedId(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workflow')
    }
  }

  const stepTaskName = (taskId: string) => allTasks.find(t => t.id === taskId)?.name ?? taskId

  return (
    <section className="page tasks-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Orchestration</p>
          <h2>Workflows</h2>
          <p className="page-description">Reusable orchestrations that chain task definitions into sequences.</p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadData()}>Refresh</button>
          <button className="primary" onClick={openCreate}>New Workflow</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card"><p className="eyebrow">Workflows</p><strong>{workflows.length}</strong><span>Definitions</span></article>
        <article className="metric-card"><p className="eyebrow">Enabled</p><strong>{workflows.filter(w => w.enabled).length}</strong><span>Active</span></article>
        <article className="metric-card"><p className="eyebrow">Task Defs</p><strong>{allTasks.length}</strong><span>Available as steps</span></article>
      </div>

      <Group orientation="horizontal" className="memory-panels">
        <Panel defaultSize="38%" minSize="28%">
          <div className="memory-index">
            <div className="group-stack">
              <div className="group-label-row">
                <p className="eyebrow">Workflow Definitions</p>
                <span>{workflows.length} items</span>
              </div>
              <section className="group-card">
                <div className="entry-list">
                  {workflows.map((wf) => (
                    <button key={wf.id} className={`entry-item ${wf.id === selectedWorkflow?.id ? 'selected' : ''}`} onClick={() => setSelectedId(wf.id)}>
                      <div>
                        <strong>{wf.name}</strong>
                        <p>{wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''} · {wf.trigger_modes.join(', ')}</p>
                      </div>
                      <div className="entry-meta">
                        <span>{wf.enabled ? 'enabled' : 'disabled'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="62%" minSize="38%">
          <article className="memory-detail">
            {selectedWorkflow ? (
              <>
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">Workflow</p>
                    <h3>{selectedWorkflow.name}</h3>
                  </div>
                  <div className="detail-meta">
                    <span>{selectedWorkflow.steps.length} steps</span>
                    <span>{selectedWorkflow.enabled ? 'enabled' : 'disabled'}</span>
                  </div>
                </div>
                <div className="detail-body">
                  <div className="task-action-row">
                    <button className="primary" onClick={() => void handleRun(selectedWorkflow.id)}>Run Now</button>
                    <button className="secondary" onClick={openEdit}>Edit</button>
                    <button className="secondary danger" onClick={() => void handleDelete(selectedWorkflow.id)}>Delete</button>
                  </div>

                  {selectedWorkflow.description ? <section><p>{selectedWorkflow.description}</p></section> : null}

                  <section>
                    <h4>Steps</h4>
                    {selectedWorkflow.steps.length ? (
                      <div className="runs-list">
                        {selectedWorkflow.steps.map((step, i) => (
                          <article key={step.step_id} className="run-card">
                            <div className="group-header">
                              <strong>{i + 1}. {step.name}</strong>
                              <span>{step.step_id}</span>
                            </div>
                            <p>Task: {stepTaskName(step.task_definition_id)}</p>
                            <p>On success → {step.on_success} · On failure → {step.on_failure}</p>
                          </article>
                        ))}
                      </div>
                    ) : <p>No steps defined.</p>}
                  </section>

                  <section>
                    <h4>Triggers</h4>
                    <p>{selectedWorkflow.trigger_modes.join(', ')}</p>
                  </section>
                </div>
              </>
            ) : (
              <div className="detail-body"><section><p>Create or select a workflow definition.</p></section></div>
            )}
          </article>
        </Panel>
      </Group>

      {showModal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="group-header">
              <h4>{showModal === 'edit' ? 'Edit Workflow' : 'New Workflow'}</h4>
              <button className="secondary" onClick={closeModal}>Close</button>
            </div>
            <form className="task-form" onSubmit={handleSubmit}>
              <input className="section-search" placeholder="Workflow name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="section-search" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <input className="section-search" placeholder="Trigger modes (comma-separated)" value={form.trigger_modes} onChange={(e) => setForm({ ...form, trigger_modes: e.target.value })} />
              <label className="task-checkbox">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enabled
              </label>

              <p className="eyebrow" style={{ margin: '12px 0 4px' }}>Steps</p>
              {steps.map((step, i) => (
                <div key={step.step_id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ flex: 1, fontSize: '0.85rem' }}>{i + 1}. {step.name}</span>
                  <select style={{ fontSize: '0.8rem' }} value={step.on_success} onChange={(e) => updateStepTransition(i, 'on_success', e.target.value)}>
                    <option value="complete">→ complete</option>
                    {steps.map((s, j) => j !== i && <option key={s.step_id} value={s.step_id}>→ {s.step_id}</option>)}
                  </select>
                  <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => removeStep(i)}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <select className="section-search" style={{ flex: 1 }} value={newStepTaskId} onChange={(e) => setNewStepTaskId(e.target.value)}>
                  {allTasks.map(t => <option key={t.id} value={t.id}>{t.name} ({t.task_type})</option>)}
                </select>
                <button type="button" className="secondary" onClick={addStep}>Add Step</button>
              </div>

              <button className="primary task-submit" type="submit">{showModal === 'edit' ? 'Save Workflow' : 'Create Workflow'}</button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Queue Page
// ---------------------------------------------------------------------------

const STATUS_FILTERS = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled', 'blocked'] as const

function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')

  const selectedItem = items.find(i => i.id === selectedId) ?? items[0] ?? null

  async function loadQueue() {
    setError(null)
    try {
      const data = await fetchQueue(filter === 'all' ? undefined : filter)
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue')
    }
  }

  useEffect(() => { void loadQueue() }, [filter])

  async function handleCancel(id: string) {
    try {
      await cancelQueueItem(id)
      setNotice('Item cancelled')
      await loadQueue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    }
  }

  async function handleRetry(id: string) {
    try {
      await retryQueueItem(id)
      setNotice('Item re-queued')
      await loadQueue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry')
    }
  }

  const statusCounts: Record<string, number> = {}
  items.forEach(item => { statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1 })
  const running = statusCounts['running'] ?? 0
  const queued = statusCounts['queued'] ?? 0
  const failed = statusCounts['failed'] ?? 0

  return (
    <section className="page tasks-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2>Queue</h2>
          <p className="page-description">Live execution queue — pending, running, and completed work items.</p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadQueue()}>Refresh</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card"><p className="eyebrow">Running</p><strong>{running}</strong><span>Executing now</span></article>
        <article className="metric-card"><p className="eyebrow">Queued</p><strong>{queued}</strong><span>Waiting to run</span></article>
        <article className="metric-card"><p className="eyebrow">Failed</p><strong>{failed}</strong><span>Need attention</span></article>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {STATUS_FILTERS.map(f => (
          <button key={f} className={filter === f ? 'primary' : 'secondary'} style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <Group orientation="horizontal" className="memory-panels">
        <Panel defaultSize="42%" minSize="28%">
          <div className="memory-index">
            <div className="group-stack">
              <div className="group-label-row">
                <p className="eyebrow">Queue Items</p>
                <span>{items.length} items</span>
              </div>
              <section className="group-card">
                <div className="entry-list">
                  {items.length === 0 ? (
                    <p style={{ padding: '12px', opacity: 0.6 }}>No items{filter !== 'all' ? ` with status "${filter}"` : ''}.</p>
                  ) : items.map((item) => (
                    <button key={item.id} className={`entry-item ${item.id === selectedItem?.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}>
                      <div>
                        <strong>{item.queue_item_type === 'workflow_run' ? '⛓ workflow' : item.source_definition_id.slice(0, 8) + '…'}</strong>
                        <p>{item.queue_item_type} · {item.model_profile} · p{item.priority}</p>
                      </div>
                      <div className="entry-meta">
                        <span className={`status-pill ${item.status === 'running' ? 'online' : ''}`}>{item.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="58%" minSize="38%">
          <article className="memory-detail">
            {selectedItem ? (
              <>
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">Queue Item</p>
                    <h3>{selectedItem.id.slice(0, 12)}…</h3>
                  </div>
                  <div className="detail-meta">
                    <span>{selectedItem.status}</span>
                    <span>{selectedItem.queue_item_type}</span>
                    <span>p{selectedItem.priority}</span>
                  </div>
                </div>
                <div className="detail-body">
                  <div className="task-action-row">
                    {['queued', 'running', 'blocked'].includes(selectedItem.status) ? (
                      <button className="secondary danger" onClick={() => void handleCancel(selectedItem.id)}>Cancel</button>
                    ) : null}
                    {['failed', 'cancelled'].includes(selectedItem.status) ? (
                      <button className="secondary" onClick={() => void handleRetry(selectedItem.id)}>Retry</button>
                    ) : null}
                  </div>

                  <section>
                    <h4>Routing</h4>
                    <ul>
                      <li>Agent mode: {selectedItem.agent_selection_mode}</li>
                      <li>Assigned agent: {selectedItem.assigned_agent_id ?? '—'}</li>
                      <li>Model profile: {selectedItem.model_profile}</li>
                      <li>Capabilities: {selectedItem.required_capabilities.join(', ') || '—'}</li>
                    </ul>
                  </section>

                  <section>
                    <h4>Execution</h4>
                    <ul>
                      <li>Created: {selectedItem.created_at}</li>
                      <li>Started: {selectedItem.started_at ?? '—'}</li>
                      <li>Completed: {selectedItem.completed_at ?? '—'}</li>
                      <li>Retries: {selectedItem.retry_count} / {selectedItem.max_retries}</li>
                    </ul>
                  </section>

                  {selectedItem.result_summary ? (
                    <section><h4>Result</h4><p>{selectedItem.result_summary}</p></section>
                  ) : null}

                  {selectedItem.error_message ? (
                    <section><h4>Error</h4><pre className="memory-content">{selectedItem.error_message}</pre></section>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="detail-body"><section><p>Select a queue item to inspect it.</p></section></div>
            )}
          </article>
        </Panel>
      </Group>
    </section>
  )
}

function AgentsPage() {
  const [agents, setAgents] = useState<OcAgent[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [gatewayToken, setGatewayToken] = useState<string>('')

  // Chat state
  const [chatHistories, setChatHistories] = useState<Record<string, OcChatMessage[]>>({})
  const [chatInput, setChatInput] = useState('')
  const [streamingAgentId, setStreamingAgentId] = useState<string | null>(null)
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({})
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0] ?? null
  const selectedChatHistory = selectedAgent ? (chatHistories[selectedAgent.id] ?? []) : []
  const selectedStreamingText = selectedAgent ? (streamingTexts[selectedAgent.id] ?? '') : ''
  const streaming = selectedAgent ? streamingAgentId === selectedAgent.id : false

  async function loadAgents() {
    setError(null)
    try {
      const [agentData, sessionData, tokenData] = await Promise.all([
        fetchOcAgents(),
        fetchOcSessions(),
        fetch(`${window.location.protocol}//${window.location.hostname}:8000/api/oc/gateway-token`).then(r => r.json()),
      ])
      setAgents(agentData)
      setSessions(sessionData?.sessions ?? [])
      setGatewayToken(tokenData?.token ?? '')
      setSelectedAgentId((current) => current ?? agentData[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents')
    }
  }

  useEffect(() => {
    void loadAgents()
  }, [])

  function handleClearChat() {
    if (!selectedAgent) return
    setChatHistories((prev) => ({ ...prev, [selectedAgent.id]: [] }))
    setStreamingTexts((prev) => ({ ...prev, [selectedAgent.id]: '' }))
    if (streamingAgentId === selectedAgent.id && abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setStreamingAgentId(null)
    }
    setNotice('Chat history cleared')
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedAgent || !chatInput.trim() || streaming || !gatewayToken) return
    const agentId = selectedAgent.id
    const userMsg = chatInput.trim()
    setChatInput('')
    setStreamingAgentId(agentId)
    setStreamingTexts((prev) => ({ ...prev, [agentId]: '' }))

    const newUserMessage: OcChatMessage = { role: 'user', content: userMsg }
    const updatedHistory = [...selectedChatHistory, newUserMessage]
    setChatHistories((prev) => ({ ...prev, [agentId]: updatedHistory }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await sendOcMessage(
        agentId,
        updatedHistory,
        gatewayToken,
        {
          onToken: (token) => setStreamingTexts((prev) => ({ ...prev, [agentId]: (prev[agentId] ?? '') + token })),
          onDone: (fullContent) => {
            setChatHistories((prev) => ({
              ...prev,
              [agentId]: [...(prev[agentId] ?? []), { role: 'assistant', content: fullContent }],
            }))
            setStreamingTexts((prev) => ({ ...prev, [agentId]: '' }))
            setStreamingAgentId((current) => (current === agentId ? null : current))
          },
          onError: (errMsg) => {
            setError(errMsg)
            setStreamingTexts((prev) => ({ ...prev, [agentId]: '' }))
            setStreamingAgentId((current) => (current === agentId ? null : current))
          },
        },
        controller.signal,
      )
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
      }
      setStreamingTexts((prev) => ({ ...prev, [agentId]: '' }))
      setStreamingAgentId((current) => (current === agentId ? null : current))
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedChatHistory, selectedStreamingText])

  // Keep chat input focused whenever streaming stops or agent switches
  useEffect(() => {
    if (!streaming) {
      chatInputRef.current?.focus()
    }
  }, [streaming, selectedAgentId])

  // Load history from OpenClaw when agent is selected (if not already loaded)
  useEffect(() => {
    if (!selectedAgentId || !sessions.length) return
    // Only fetch if we haven't loaded history for this agent yet
    if (chatHistories[selectedAgentId] !== undefined) return
    // Find the live session key for this agent
    const agentSession = sessions.find((s: any) => s.agentId === selectedAgentId)
    if (!agentSession?.key) return
    fetchSessionHistory(agentSession.key, 60)
      .then((messages) => {
        setChatHistories((prev) => ({
          ...prev,
          [selectedAgentId]: messages,
        }))
      })
      .catch(() => {
        // Silently fall back to empty — history just won't show
        setChatHistories((prev) => ({ ...prev, [selectedAgentId]: [] }))
      })
  }, [selectedAgentId, sessions])

  return (
    <section className="page agents-page">
      <div className="page-header agents-compact-header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2>Agents</h2>
        </div>
        <div className="page-header-actions agents-compact-actions">
          <button className="secondary" onClick={() => void loadAgents()}>Refresh</button>
          <button className="secondary" onClick={handleClearChat} disabled={selectedChatHistory.length === 0 && !selectedStreamingText}>Clear Chat</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <section className="agents-layout">
        <div className="agents-tabs-row">
          <div className="agents-tabs" role="tablist" aria-label="Agent tabs">
            {agents.map((agent) => (
              <button
                key={agent.id}
                role="tab"
                aria-selected={agent.id === selectedAgent?.id}
                className={`agent-tab ${agent.id === selectedAgent?.id ? 'active' : ''}`}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <span className="agent-tab-name">
                  {agent.identityEmoji ?? '🤖'} {agent.identityName ?? agent.id}
                </span>
                <span className="agent-tab-meta">{agent.model ?? 'default'}</span>
              </button>
            ))}
          </div>

          <div className="agents-tabs-status">
            <span className={`status-pill ${gatewayToken ? 'online' : ''}`}>
              {gatewayToken ? 'Gateway Connected' : 'No Gateway Token'}
            </span>
          </div>
        </div>

        <div className="agents-chat-wrap">
          {selectedAgent && gatewayToken ? (
            <div className="chat-container agents-chat">
              <div className="chat-header">
                <div className="chat-header-left">
                  <div>
                    <p className="eyebrow">Chat</p>
                    <h3>{selectedAgent.identityName ?? selectedAgent.id} {selectedAgent.identityEmoji ?? ''}</h3>
                  </div>
                </div>
                <div className="chat-header-actions">
                  <span className="chat-model-label">{selectedAgent.model ?? 'default'}</span>
                  <span className="chat-session-note">{sessions.length} live session{sessions.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div className="chat-messages">
                {selectedChatHistory.length === 0 && !streaming && (
                  <div className="chat-empty">
                    <p className="chat-empty-name">{selectedAgent.identityEmoji ?? '🤖'} {selectedAgent.identityName ?? selectedAgent.id}</p>
                    <p>{selectedAgent.model}</p>
                    <p className="chat-empty-hint">Send a message to start chatting through OpenClaw.</p>
                  </div>
                )}
                {selectedChatHistory.map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`}>
                    <div className="chat-bubble-role">
                      {msg.role === 'user' ? 'You' : (selectedAgent.identityName ?? selectedAgent.id)}
                    </div>
                    <div className="chat-bubble-content">{msg.content}</div>
                  </div>
                ))}
                {streaming && selectedStreamingText && (
                  <div className="chat-bubble assistant streaming">
                    <div className="chat-bubble-role">{selectedAgent.identityName ?? selectedAgent.id}</div>
                    <div className="chat-bubble-content">{selectedStreamingText}<span className="chat-cursor" /></div>
                  </div>
                )}
                {streaming && !selectedStreamingText && (
                  <div className="chat-bubble assistant streaming">
                    <div className="chat-bubble-role">{selectedAgent.identityName ?? selectedAgent.id}</div>
                    <div className="chat-bubble-content"><span className="chat-typing">Thinking...</span></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form className="chat-input-bar" onSubmit={handleSendMessage}>
                <input
                  ref={chatInputRef}
                  className="chat-input"
                  placeholder={`Message ${selectedAgent.identityName ?? selectedAgent.id}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={streaming}
                  autoFocus
                />
                <button className="primary chat-send" type="submit" disabled={streaming || !chatInput.trim()}>
                  {streaming ? '…' : 'Send'}
                </button>
              </form>
            </div>
          ) : (
            <div className="chat-container agents-chat">
              <div className="chat-empty" style={{ flex: 1, justifyContent: 'center' }}>
                <p className="chat-empty-name">No agent selected</p>
                <p className="chat-empty-hint">{!gatewayToken ? 'Gateway token not loaded.' : 'Select an agent tab to start chatting.'}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}


function SystemPage() {
  const [status, setStatus] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [health, setHealth] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadSystem() {
    setError(null)
    try {
      const [statusPayload, logsPayload, healthPayload] = await Promise.all([
        fetchOcStatus(),
        fetchOcLogs(60),
        fetchOcHealth(),
      ])
      setStatus(statusPayload)
      setLogs(logsPayload.lines ?? [])
      setHealth(healthPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system data')
    }
  }

  useEffect(() => {
    void loadSystem()
  }, [])

  const sessionCount = status?.sessions?.count ?? 0
  const agentCount = health?.agents?.length ?? 0
  const heartbeatSeconds = health?.heartbeatSeconds ?? 0

  return (
    <section className="page stub-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Infra</p>
          <h2>System</h2>
          <p className="page-description">Real OpenClaw health, status, gateway summary, and recent logs.</p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadSystem()}>Refresh</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card"><p className="eyebrow">Gateway</p><strong>{health?.ok ? 'OK' : '—'}</strong><span>Bridge health probe</span></article>
        <article className="metric-card"><p className="eyebrow">Sessions</p><strong>{sessionCount}</strong><span>Visible in OpenClaw</span></article>
        <article className="metric-card"><p className="eyebrow">Heartbeat</p><strong>{heartbeatSeconds ? `${Math.round(heartbeatSeconds / 60)}m` : '—'}</strong><span>Main agent cadence</span></article>
      </div>

      <Group orientation="horizontal" className="memory-panels stub-panels">
        <Panel defaultSize="42%" minSize="30%">
          <div className="memory-index stub-index">
            <section className="group-card">
              <div className="group-header"><h4>System Signals</h4><span>{agentCount} agents</span></div>
              <div className="entry-list">
                <button className="entry-item selected"><div><strong>Gateway health</strong><p>{health?.ok ? 'RPC probe OK' : 'Unavailable'}</p></div><div className="entry-meta"><span>{status?.health?.defaultAgentId ?? 'main'}</span></div></button>
                <button className="entry-item"><div><strong>Gateway status</strong><p>Loopback gateway with dashboard and running service.</p></div><div className="entry-meta"><span>{sessionCount} sessions</span></div></button>
                <button className="entry-item"><div><strong>Recent logs</strong><p>{logs[0] ?? 'No logs loaded'}</p></div><div className="entry-meta"><span>{logs.length} lines</span></div></button>
              </div>
            </section>
          </div>
        </Panel>
        <Separator className="resize-handle" />
        <Panel defaultSize="58%" minSize="38%">
          <article className="memory-detail stub-detail">
            <div className="detail-header">
              <div><p className="eyebrow">Bridge Detail</p><h3>OpenClaw runtime summary</h3></div>
              <div className="detail-meta"><span>{agentCount} agents</span><span>{sessionCount} sessions</span></div>
            </div>
            <div className="detail-body">
              <section>
                <h4>Status summary</h4>
                <pre className="memory-content">{status?.summary ?? 'No status yet'}</pre>
              </section>
              <section>
                <h4>Recent logs</h4>
                <pre className="memory-content">{logs.length ? logs.join('\n') : 'No logs yet'}</pre>
              </section>
            </div>
          </article>
        </Panel>
      </Group>
    </section>
  )
}

function MemoryPage() {
  const [agents, setAgents] = useState<OcAgent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('main')
  const [files, setFiles] = useState<OcMemoryFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<OcMemoryFileContent | null>(null)
  const [statuses, setStatuses] = useState<OcMemoryStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<OcMemorySearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  const agentStatus = statuses.find((s) => s.agentId === selectedAgentId)

  async function loadMemory() {
    setLoading(true)
    setError(null)
    try {
      const [agentData, statusData, fileData] = await Promise.all([
        fetchOcAgents(),
        fetchMemoryStatus(),
        fetchMemoryFiles(selectedAgentId),
      ])
      setAgents(agentData)
      setStatuses(statusData)
      setFiles(fileData.files)
      if (!selectedPath && fileData.files.length > 0) {
        setSelectedPath(fileData.files[0].path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMemory()
  }, [selectedAgentId])

  useEffect(() => {
    if (!selectedPath) return
    void fetchMemoryFileContent(selectedPath, selectedAgentId)
      .then(setSelectedDoc)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load memory file')
      })
  }, [selectedPath, selectedAgentId])

  async function handleReindex() {
    try {
      const result = await reindexMemory(selectedAgentId, true)
      setNotice(result.output || 'Reindex triggered')
      await loadMemory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reindex')
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    setError(null)
    try {
      const data = await searchMemory(searchQuery.trim(), selectedAgentId, 10)
      setSearchResults(data.results ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function handleClearSearch() {
    setSearchQuery('')
    setSearchResults(null)
  }

  const grouped = useMemo(() => {
    return Object.entries(
      files.reduce<Record<string, OcMemoryFile[]>>((acc, file) => {
        const key = file.type === 'long_term' ? 'Long-Term' : file.date_label?.slice(0, 7) ?? 'Daily'
        acc[key] ??= []
        acc[key].push(file)
        return acc
      }, {}),
    )
  }, [files])

  return (
    <section className="page memory-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Module</p>
          <h2>Memory</h2>
          <p className="page-description">
            OpenClaw memory — semantic search, daily notes, and long-term memory across agents.
          </p>
        </div>
        <div className="page-header-actions">
          <select
            className="section-search"
            value={selectedAgentId}
            onChange={(e) => {
              setSelectedAgentId(e.target.value)
              setSelectedPath(null)
              setSelectedDoc(null)
              setSearchResults(null)
            }}
            style={{ width: 'auto', minWidth: 120 }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.identityEmoji ?? '🤖'} {a.identityName ?? a.id}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => void loadMemory()}>Refresh</button>
          <button className="primary" onClick={() => void handleReindex()}>Reindex</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card">
          <p className="eyebrow">Files</p>
          <strong>{agentStatus?.status.files ?? files.length}</strong>
          <span>Indexed in OpenClaw</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Chunks</p>
          <strong>{agentStatus?.status.chunks ?? 0}</strong>
          <span>Embedded vector chunks</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Provider</p>
          <strong>{agentStatus?.status.provider ?? '—'}</strong>
          <span>{agentStatus?.status.model ?? 'No model'}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Search</p>
          <strong>{agentStatus?.status.fts?.available ? 'Hybrid' : 'Vector'}</strong>
          <span>{agentStatus?.status.vector?.available ? `${agentStatus.status.vector.dims ?? '?'}d vectors` : 'No vector'}</span>
        </article>
      </div>

      <Group orientation="horizontal" className="memory-panels">
        <Panel defaultSize="34%" minSize="24%">
          <div className="memory-index">
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
              <input
                className="section-search"
                placeholder="Semantic search memory..."
                aria-label="Search memory"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="primary" type="submit" disabled={searching} style={{ whiteSpace: 'nowrap' }}>
                {searching ? '…' : 'Search'}
              </button>
            </form>

            {searchResults !== null ? (
              <div className="group-stack">
                <div className="group-label-row">
                  <p className="eyebrow">Search Results</p>
                  <button className="secondary" onClick={handleClearSearch} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>Clear</button>
                </div>
                {searchResults.length === 0 ? (
                  <p style={{ padding: '8px 12px', opacity: 0.6 }}>No results found.</p>
                ) : (
                  <section className="group-card">
                    <div className="entry-list">
                      {searchResults.map((result, i) => (
                        <button
                          key={`${result.path}-${result.startLine}-${i}`}
                          className={`entry-item ${selectedPath === result.path ? 'selected' : ''}`}
                          onClick={() => setSelectedPath(result.path)}
                        >
                          <div>
                            <strong>{result.path}</strong>
                            <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{result.snippet.slice(0, 120)}…</p>
                          </div>
                          <div className="entry-meta">
                            <span>L{result.startLine}–{result.endLine}</span>
                            <span>{(result.score * 100).toFixed(0)}%</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="group-stack">
                <div className="group-label-row">
                  <p className="eyebrow">Memory Files</p>
                  <span>{loading ? 'Loading…' : `${files.length} files`}</span>
                </div>

                {grouped.map(([group, entries]) => (
                  <section key={group} className="group-card">
                    <div className="group-header">
                      <h4>{group}</h4>
                      <span>{entries.length}</span>
                    </div>
                    <div className="entry-list">
                      {entries.map((file) => (
                        <button
                          key={file.path}
                          className={`entry-item ${file.path === selectedPath ? 'selected' : ''}`}
                          onClick={() => setSelectedPath(file.path)}
                        >
                          <div>
                            <strong>{file.date_label ?? file.path}</strong>
                            <p>{file.summary}</p>
                          </div>
                          <div className="entry-meta">
                            <span>{file.type}</span>
                            <span>{file.word_count} words</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="66%" minSize="40%">
          <article className="memory-detail">
            <div className="detail-header">
              <div>
                <p className="eyebrow">{selectedAgentId}</p>
                <h3>{selectedDoc?.path ?? 'No file selected'}</h3>
              </div>
              <div className="detail-meta">
                <span>{selectedDoc ? `${selectedDoc.word_count} words` : '—'}</span>
                <span>{selectedDoc?.modified ? new Date(selectedDoc.modified).toLocaleString() : '—'}</span>
              </div>
            </div>

            <div className="detail-body">
              {selectedDoc ? (
                <section>
                  <pre className="memory-content">{selectedDoc.content}</pre>
                </section>
              ) : (
                <section>
                  <p>Select a memory file or search to view contents.</p>
                </section>
              )}
            </div>
          </article>
        </Panel>
      </Group>
    </section>
  )
}

export default App
