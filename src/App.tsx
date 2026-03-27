import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { fetchMemoryDocument, fetchMemoryList, ingestMemory } from './lib/api'
import { createTask, deleteTask, fetchTaskRuns, fetchTasks, runTask, updateTask } from './lib/tasks'
import { fetchOcHealth, fetchOcLogs, fetchOcSessions, fetchOcStatus } from './lib/oc'
import { type ModelOption, createAgentProfile, deleteAgentProfile, fetchAgentProfiles, fetchModels, updateAgentProfile } from './lib/agentProfiles'
import { type ChatMessage, clearChatHistory, fetchChatHistory, sendChatMessage } from './lib/chat'
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

type MemoryListItem = {
  id: number
  title: string
  doc_type: 'daily' | 'long_term'
  source_path: string
  date_label: string | null
  word_count: number
  char_count: number
  updated_at: string
  summary: string
}

type MemoryDocument = MemoryListItem & {
  content: string
}

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
    eyebrow: 'Flow',
    title: 'Workflows',
    description: 'Define future multi-step workflows that will orchestrate sequences of tasks and agents.',
    primaryAction: 'New Workflow',
    secondaryAction: 'Open Workflow',
    cards: [
      { title: 'Workflows', value: '2', note: 'early concepts only' },
      { title: 'Sequences', value: '0', note: 'not built yet' },
      { title: 'Milestones', value: '3', note: 'tasks, agents, settings' },
    ],
    listTitle: 'Workflow List',
    listItems: [
      { name: 'Research → Distill → Package', meta: 'future orchestration flow', status: 'Planned' },
      { name: 'Usage Monitor → Pause', meta: 'control flow', status: 'Draft' },
      { name: 'Video Harvest → Summary', meta: 'external integration later', status: 'Planned' },
    ],
    detailTitle: 'Workflows control stub',
    detailText: [
      'Workflows will become the place where sequences of tasks and agents are stitched together into real execution flows.',
      'For now this is still a placeholder until the workflow model is implemented properly.',
    ],
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

function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [runs, setRuns] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const emptyForm = {
    name: '',
    task_type: 'manual',
    enabled: true,
    interval_minutes: '',
    command: '',
    working_directory: '',
    target_url: '',
    notes: '',
  }
  const [form, setForm] = useState(emptyForm)

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null
  const selectedIndex = selectedTask ? tasks.findIndex((task) => task.id === selectedTask.id) : -1
  const previousTask = selectedIndex > 0 ? tasks[selectedIndex - 1] : null
  const nextTask = selectedIndex >= 0 && selectedIndex < tasks.length - 1 ? tasks[selectedIndex + 1] : null

  async function loadTasks() {
    setError(null)
    try {
      const data = await fetchTasks()
      setTasks(data)
      const nextId = selectedId ?? data[0]?.id ?? null
      setSelectedId(nextId)
      if (nextId != null) {
        const runData = await fetchTaskRuns(nextId)
        setRuns(runData)
      } else {
        setRuns([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [])

  useEffect(() => {
    if (selectedTask?.id == null) return
    void fetchTaskRuns(selectedTask.id)
      .then(setRuns)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load task runs'))
  }, [selectedTask?.id])

  async function handleCreateTask(event: React.FormEvent) {
    event.preventDefault()
    try {
      await createTask({
        name: form.name,
        task_type: form.task_type as any,
        enabled: form.enabled,
        interval_minutes: form.interval_minutes ? Number(form.interval_minutes) : null,
        command: form.command || null,
        working_directory: form.working_directory || null,
        target_url: form.target_url || null,
        notes: form.notes || null,
      })
      setNotice('Task created')
      setShowCreateModal(false)
      setForm(emptyForm)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    }
  }

  async function handleSaveTask(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedTask) return
    try {
      await updateTask(selectedTask.id, {
        name: form.name,
        task_type: form.task_type as any,
        enabled: form.enabled,
        interval_minutes: form.interval_minutes ? Number(form.interval_minutes) : null,
        command: form.command || null,
        working_directory: form.working_directory || null,
        target_url: form.target_url || null,
        notes: form.notes || null,
      })
      setNotice('Task updated')
      setShowEditModal(false)
      setForm(emptyForm)
      setSelectedId(selectedTask.id)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task')
    }
  }

  async function handleRunTask(taskId: number) {
    try {
      const result = await runTask(taskId)
      setNotice(`Task run finished with status: ${result.status}`)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run task')
    }
  }

  async function handleToggleTask(task: any) {
    try {
      await updateTask(task.id, { enabled: !task.enabled })
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task')
    }
  }

  async function handleDeleteTask(taskId: number) {
    try {
      await deleteTask(taskId)
      setNotice('Task deleted')
      setSelectedId(nextTask?.id ?? previousTask?.id ?? null)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  function openEditModal() {
    if (!selectedTask) return
    setForm({
      name: selectedTask.name ?? '',
      task_type: selectedTask.task_type ?? 'manual',
      enabled: Boolean(selectedTask.enabled),
      interval_minutes: selectedTask.interval_minutes ? String(selectedTask.interval_minutes) : '',
      command: selectedTask.command ?? '',
      working_directory: selectedTask.working_directory ?? '',
      target_url: selectedTask.target_url ?? '',
      notes: selectedTask.notes ?? '',
    })
    setShowEditModal(true)
  }

  function closeModals() {
    setShowCreateModal(false)
    setShowEditModal(false)
    setForm(emptyForm)
  }

  return (
    <section className="page tasks-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Tasks</h2>
          <p className="page-description">
            Real task definitions, scheduling, run-now execution, and execution history.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadTasks()}>Refresh</button>
          <button className="primary" onClick={() => setShowCreateModal(true)}>Create Task</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card">
          <p className="eyebrow">Tasks</p>
          <strong>{tasks.length}</strong>
          <span>Total task definitions</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Enabled</p>
          <strong>{tasks.filter((task) => task.enabled).length}</strong>
          <span>Eligible to run</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Scheduled</p>
          <strong>{tasks.filter((task) => task.interval_minutes).length}</strong>
          <span>Recurring interval tasks</span>
        </article>
      </div>

      <Group orientation="horizontal" className="memory-panels">
        <Panel defaultSize="38%" minSize="28%">
          <div className="memory-index">
            <div className="group-stack">
              <div className="group-label-row">
                <p className="eyebrow">Task Queue</p>
                <span>{tasks.length} items</span>
              </div>
              <section className="group-card">
                <div className="entry-list">
                  {tasks.map((task) => (
                    <button key={task.id} className={`entry-item ${task.id === selectedTask?.id ? 'selected' : ''}`} onClick={() => setSelectedId(task.id)}>
                      <div>
                        <strong>{task.name}</strong>
                        <p>{task.task_type} · {task.interval_minutes ? `every ${task.interval_minutes}m` : 'manual trigger'}</p>
                      </div>
                      <div className="entry-meta">
                        <span>{task.enabled ? 'enabled' : 'disabled'}</span>
                        <span>{task.last_status ?? 'never run'}</span>
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
                <button className="nav-chev" disabled={!previousTask} onClick={() => previousTask && setSelectedId(previousTask.id)}>
                  «
                </button>
                <div>
                  <p className="eyebrow">Selected Task</p>
                  <h3>{selectedTask?.name ?? 'No task selected'}</h3>
                </div>
                <button className="nav-chev" disabled={!nextTask} onClick={() => nextTask && setSelectedId(nextTask.id)}>
                  »
                </button>
              </div>
              <div className="detail-meta">
                <span>{selectedTask?.task_type ?? '—'}</span>
                <span>{selectedTask?.enabled ? 'enabled' : 'disabled'}</span>
                <span>{selectedTask?.last_status ?? 'never run'}</span>
              </div>
            </div>

            <div className="detail-body">
              {selectedTask ? (
                <>
                  <div className="task-action-row">
                    <button className="primary" onClick={() => void handleRunTask(selectedTask.id)}>Run Now</button>
                    <button className="secondary" onClick={openEditModal}>Edit</button>
                    <button className="secondary" onClick={() => void handleToggleTask(selectedTask)}>
                      {selectedTask.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="secondary danger" onClick={() => void handleDeleteTask(selectedTask.id)}>Delete</button>
                  </div>

                  <section>
                    <h4>Configuration</h4>
                    <ul>
                      <li>Type: {selectedTask.task_type}</li>
                      <li>Interval: {selectedTask.interval_minutes ? `${selectedTask.interval_minutes} minutes` : 'none'}</li>
                      <li>Working dir: {selectedTask.working_directory ?? 'default project root'}</li>
                      <li>Target URL: {selectedTask.target_url ?? '—'}</li>
                    </ul>
                  </section>

                  <section>
                    <h4>Command / Payload</h4>
                    <pre className="memory-content">{selectedTask.command || selectedTask.notes || 'No payload'}</pre>
                  </section>

                  <section>
                    <h4>Recent Runs</h4>
                    {runs.length ? (
                      <div className="runs-list">
                        {runs.map((run) => (
                          <article key={run.id} className="run-card">
                            <div className="group-header">
                              <strong>{run.status}</strong>
                              <span>{run.duration_ms != null ? `${run.duration_ms} ms` : '—'}</span>
                            </div>
                            <p>{run.started_at}</p>
                            <pre className="memory-content">{run.output}</pre>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>No runs yet.</p>
                    )}
                  </section>
                </>
              ) : (
                <section><p>Create or select a task to inspect it.</p></section>
              )}
            </div>
          </article>
        </Panel>
      </Group>

      {(showCreateModal || showEditModal) ? (
        <div className="modal-backdrop" onClick={closeModals}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="group-header">
              <h4>{showEditModal ? 'Edit Task' : 'Create Task'}</h4>
              <button className="secondary" onClick={closeModals}>Close</button>
            </div>
            <form className="task-form" onSubmit={showEditModal ? handleSaveTask : handleCreateTask}>
              <input className="section-search" placeholder="Task name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <select className="section-search" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })}>
                <option value="manual">manual</option>
                <option value="shell">shell</option>
                <option value="python">python</option>
                <option value="web_fetch">web_fetch</option>
              </select>
              <input className="section-search" placeholder="Interval minutes (optional)" value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: e.target.value })} />
              <input className="section-search" placeholder="Command or python code" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
              <input className="section-search" placeholder="Target URL" value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} />
              <input className="section-search" placeholder="Working directory" value={form.working_directory} onChange={(e) => setForm({ ...form, working_directory: e.target.value })} />
              <textarea className="section-search task-textarea" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <label className="task-checkbox">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enabled
              </label>
              <button className="primary task-submit" type="submit">{showEditModal ? 'Save Task' : 'Create Task'}</button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function AgentsPage() {
  const [data, setData] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [chatMode, setChatMode] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState({
    name: '',
    role: '',
    purpose: '',
    status: 'planned',
    preferred_model: 'claude-sonnet-4-6',
    notes: '',
    capability: '',
  })

  async function loadAgents() {
    setError(null)
    try {
      const [sessions, logsPayload, profileData, modelData] = await Promise.all([
        fetchOcSessions(),
        fetchOcLogs(40),
        fetchAgentProfiles(),
        fetchModels(),
      ])
      setData(sessions)
      setLogs(logsPayload.lines ?? [])
      setProfiles(profileData)
      setModels(modelData)
      setSelectedSessionKey((current) => current ?? sessions?.sessions?.[0]?.key ?? null)
      setSelectedProfileId((current) => current ?? profileData?.[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents')
    }
  }

  useEffect(() => {
    void loadAgents()
  }, [])

  const sessions = data?.sessions ?? []
  const selectedSession = sessions.find((session: any) => session.key === selectedSessionKey) ?? sessions[0] ?? null
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null
  const liveAgentIds = Array.from(new Set((sessions || []).map((s: any) => s.agentId)))

  async function handleCreateProfile(event: React.FormEvent) {
    event.preventDefault()
    try {
      await createAgentProfile(form)
      setNotice('Agent profile created')
      setShowProfileModal(false)
      setForm({
        name: '', role: '', purpose: '', status: 'planned', preferred_model: 'gpt-5.4', notes: '', capability: '',
      })
      await loadAgents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent profile')
    }
  }

  async function handlePromoteProfile() {
    if (!selectedProfile) return
    try {
      await updateAgentProfile(selectedProfile.id, { status: selectedProfile.status === 'live' ? 'planned' : 'live' })
      setNotice('Agent profile updated')
      await loadAgents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agent profile')
    }
  }

  async function handleDeleteProfile() {
    if (!selectedProfile) return
    try {
      await deleteAgentProfile(selectedProfile.id)
      setNotice('Agent profile deleted')
      setSelectedProfileId(null)
      setChatMode(false)
      await loadAgents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent profile')
    }
  }

  async function openChat() {
    if (!selectedProfile) return
    setChatMode(true)
    setStreamingText('')
    try {
      const history = await fetchChatHistory(selectedProfile.id)
      setChatMessages(history)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat history')
    }
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedProfile || !chatInput.trim() || streaming) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setStreaming(true)
    setStreamingText('')

    const optimisticUser: ChatMessage = {
      id: Date.now(),
      profile_id: selectedProfile.id,
      role: 'user',
      content: userMsg,
      created_at: new Date().toISOString(),
    }
    setChatMessages((prev) => [...prev, optimisticUser])

    try {
      await sendChatMessage(
        selectedProfile.id,
        userMsg,
        (token) => setStreamingText((prev) => prev + token),
        (savedMsg) => {
          setChatMessages((prev) => [...prev, savedMsg])
          setStreamingText('')
          setStreaming(false)
        },
        (errMsg) => {
          setError(errMsg)
          setStreaming(false)
          setStreamingText('')
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
      setStreaming(false)
      setStreamingText('')
    }
  }

  async function handleClearChat() {
    if (!selectedProfile) return
    try {
      await clearChatHistory(selectedProfile.id)
      setChatMessages([])
      setStreamingText('')
      setNotice('Chat history cleared')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear chat')
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingText])

  useEffect(() => {
    setChatMode(false)
    setChatMessages([])
    setStreamingText('')
  }, [selectedProfileId])

  return (
    <section className="page stub-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2>Agents</h2>
          <p className="page-description">
            Live OpenClaw sessions plus editable agent profiles for the specialist workers you want to build.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadAgents()}>Refresh</button>
          <button className="primary" onClick={() => setShowProfileModal(true)}>New Profile</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card">
          <p className="eyebrow">Live Sessions</p>
          <strong>{sessions.length}</strong>
          <span>Active OpenClaw sessions</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Live Agent IDs</p>
          <strong>{liveAgentIds.length}</strong>
          <span>{liveAgentIds.join(', ') || 'none detected'}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Agent Profiles</p>
          <strong>{profiles.length}</strong>
          <span>Editable worker definitions</span>
        </article>
      </div>

      <Group orientation="horizontal" className="memory-panels stub-panels">
        <Panel defaultSize="34%" minSize="26%">
          <div className="memory-index stub-index">
            <section className="group-card">
              <div className="group-header"><h4>Live Sessions</h4><span>{sessions.length}</span></div>
              <div className="entry-list">
                {sessions.map((session: any) => (
                  <button
                    key={session.key}
                    className={`entry-item ${session.key === selectedSession?.key ? 'selected' : ''}`}
                    onClick={() => setSelectedSessionKey(session.key)}
                  >
                    <div>
                      <strong>{session.agentId}</strong>
                      <p>{session.model} · {session.kind}</p>
                    </div>
                    <div className="entry-meta">
                      <span>{Math.round((session.ageMs ?? 0) / 60000)}m old</span>
                      <span>{session.totalTokens ?? 0} tok</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="group-card">
              <div className="group-header"><h4>Agent Profiles</h4><span>{profiles.length}</span></div>
              <div className="entry-list">
                {profiles.map((profile) => (
                  <button key={profile.id} className={`entry-item ${profile.id === selectedProfile?.id ? 'selected' : ''}`} onClick={() => setSelectedProfileId(profile.id)}>
                    <div>
                      <strong>{profile.name}</strong>
                      <p>{profile.role}</p>
                    </div>
                    <div className="entry-meta">
                      <span>{profile.status}</span>
                      <span>{profile.preferred_model ?? '—'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="66%" minSize="40%">
          {chatMode && selectedProfile ? (
            <div className="chat-container">
              <div className="chat-header">
                <div className="chat-header-left">
                  <button className="secondary chat-back-btn" onClick={() => setChatMode(false)}>Back</button>
                  <div>
                    <p className="eyebrow">Chat</p>
                    <h3>{selectedProfile.name}</h3>
                  </div>
                </div>
                <div className="chat-header-actions">
                  <select
                    className="chat-model-select"
                    value={selectedProfile.preferred_model ?? 'claude-sonnet-4-6'}
                    onChange={(e) => {
                      void updateAgentProfile(selectedProfile.id, { preferred_model: e.target.value }).then(() => loadAgents())
                    }}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <button className="secondary" onClick={() => void handleClearChat()}>Clear</button>
                </div>
              </div>

              <div className="chat-messages">
                {chatMessages.length === 0 && !streaming && (
                  <div className="chat-empty">
                    <p className="chat-empty-name">{selectedProfile.name}</p>
                    <p>{selectedProfile.purpose ?? selectedProfile.role}</p>
                    <p className="chat-empty-hint">Send a message to start the conversation.</p>
                  </div>
                )}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                    <div className="chat-bubble-role">{msg.role === 'user' ? 'You' : selectedProfile.name}</div>
                    <div className="chat-bubble-content">{msg.content}</div>
                  </div>
                ))}
                {streaming && streamingText && (
                  <div className="chat-bubble assistant streaming">
                    <div className="chat-bubble-role">{selectedProfile.name}</div>
                    <div className="chat-bubble-content">{streamingText}<span className="chat-cursor" /></div>
                  </div>
                )}
                {streaming && !streamingText && (
                  <div className="chat-bubble assistant streaming">
                    <div className="chat-bubble-role">{selectedProfile.name}</div>
                    <div className="chat-bubble-content"><span className="chat-typing">Thinking...</span></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form className="chat-input-bar" onSubmit={handleSendMessage}>
                <input
                  className="chat-input"
                  placeholder={`Message ${selectedProfile.name}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={streaming}
                  autoFocus
                />
                <button className="primary chat-send" type="submit" disabled={streaming || !chatInput.trim()}>
                  Send
                </button>
              </form>
            </div>
          ) : (
            <article className="memory-detail stub-detail">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Selected Profile</p>
                  <h3>{selectedProfile?.name ?? 'No profile selected'}</h3>
                </div>
                <div className="detail-meta">
                  <span>{selectedProfile?.status ?? '—'}</span>
                  <span>{selectedProfile?.preferred_model ?? '—'}</span>
                  <span>{selectedSession?.agentId ?? 'no live match'}</span>
                </div>
              </div>
              <div className="detail-body">
                <div className="task-action-row">
                  <button className="primary" onClick={() => void openChat()} disabled={!selectedProfile}>Chat</button>
                  <button className="secondary" onClick={() => void handlePromoteProfile()} disabled={!selectedProfile}>
                    {selectedProfile?.status === 'live' ? 'Mark Planned' : 'Mark Live'}
                  </button>
                  <button className="secondary danger" onClick={() => void handleDeleteProfile()} disabled={!selectedProfile}>Delete Profile</button>
                </div>

                <section>
                  <h4>Profile definition</h4>
                  {selectedProfile ? (
                    <ul>
                      <li>Role: {selectedProfile.role}</li>
                      <li>Purpose: {selectedProfile.purpose ?? '—'}</li>
                      <li>Capability: {selectedProfile.capability ?? '—'}</li>
                      <li>Preferred model: {selectedProfile.preferred_model ?? '—'}</li>
                      <li>Notes: {selectedProfile.notes ?? '—'}</li>
                    </ul>
                  ) : (
                    <p>No profile selected.</p>
                  )}
                </section>

                <section>
                  <h4>Selected live session</h4>
                  {selectedSession ? (
                    <ul>
                      <li>Session ID: {selectedSession.sessionId}</li>
                      <li>Total tokens: {selectedSession.totalTokens}</li>
                      <li>Context window: {selectedSession.contextTokens}</li>
                      <li>Provider: {selectedSession.modelProvider}</li>
                      <li>Last activity age: {Math.round((selectedSession.ageMs ?? 0) / 1000)}s</li>
                    </ul>
                  ) : (
                    <p>No session data available.</p>
                  )}
                </section>

                <section>
                  <h4>Agent / runtime logs</h4>
                  <pre className="memory-content">{logs.length ? logs.join('\n') : 'No logs loaded'}</pre>
                </section>
              </div>
            </article>
          )}
        </Panel>
      </Group>

      {showProfileModal ? (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="group-header">
              <h4>New Agent Profile</h4>
              <button className="secondary" onClick={() => setShowProfileModal(false)}>Close</button>
            </div>
            <form className="task-form" onSubmit={handleCreateProfile}>
              <input className="section-search" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="section-search" placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required />
              <input className="section-search" placeholder="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              <select className="section-search" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="planned">planned</option>
                <option value="live">live</option>
                <option value="draft">draft</option>
              </select>
              <select className="section-search" value={form.preferred_model} onChange={(e) => setForm({ ...form, preferred_model: e.target.value })}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.vendor})</option>
                ))}
              </select>
              <input className="section-search" placeholder="Capability" value={form.capability} onChange={(e) => setForm({ ...form, capability: e.target.value })} />
              <textarea className="section-search task-textarea" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button className="primary task-submit" type="submit">Create Profile</button>
            </form>
          </div>
        </div>
      ) : null}
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
  const [items, setItems] = useState<MemoryListItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<MemoryDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ingestStatus, setIngestStatus] = useState<string>('')

  async function loadMemory() {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchMemoryList()
      setItems(list)
      const nextSelected = selectedId ?? list[0]?.id ?? null
      setSelectedId(nextSelected)
      if (nextSelected != null) {
        const doc = await fetchMemoryDocument(nextSelected)
        setSelectedDoc(doc)
      } else {
        setSelectedDoc(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMemory()
  }, [])

  useEffect(() => {
    if (selectedId == null) return
    void fetchMemoryDocument(selectedId)
      .then(setSelectedDoc)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load memory document')
      })
  }, [selectedId])

  const grouped = useMemo(() => {
    return Object.entries(
      items.reduce<Record<string, MemoryListItem[]>>((acc, entry) => {
        const key = entry.doc_type === 'long_term' ? 'Long-Term' : entry.date_label?.slice(0, 7) ?? 'Daily'
        acc[key] ??= []
        acc[key].push(entry)
        return acc
      }, {}),
    )
  }, [items])

  async function handleIngest() {
    try {
      const result = await ingestMemory()
      setIngestStatus(`Ingested ${result.ingested}, skipped ${result.skipped}, total ${result.total}`)
      await loadMemory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ingest memory')
    }
  }

  return (
    <section className="page memory-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Module</p>
          <h2>Memory</h2>
          <p className="page-description">
            Real local memory files ingested through FastAPI into SQLite. Vector search comes next.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="secondary" onClick={() => void loadMemory()}>
            Refresh
          </button>
          <button className="primary" onClick={() => void handleIngest()}>
            Ingest
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {ingestStatus ? <div className="notice success">{ingestStatus}</div> : null}

      <div className="metrics-grid">
        <article className="metric-card">
          <p className="eyebrow">Documents</p>
          <strong>{items.length}</strong>
          <span>Currently indexed into SQLite</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Daily Files</p>
          <strong>{items.filter((item) => item.doc_type === 'daily').length}</strong>
          <span>Journal-style memories</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Long-Term</p>
          <strong>{items.filter((item) => item.doc_type === 'long_term').length}</strong>
          <span>Curated memory documents</span>
        </article>
      </div>

      <Group orientation="horizontal" className="memory-panels">
        <Panel defaultSize="34%" minSize="24%">
          <div className="memory-index">
            <input
              className="section-search"
              placeholder="Search memory..."
              aria-label="Search memory"
              disabled
            />

            <article className="pinned-card">
              <p className="eyebrow">Backend</p>
              <h3>SQLite Memory Index</h3>
              <p>
                Files from the workspace are now intended to flow through FastAPI into a local SQLite database.
              </p>
              <div className="meta-row">
                <span>API on :8000</span>
                <span>Search next</span>
              </div>
            </article>

            <div className="group-stack">
              <div className="group-label-row">
                <p className="eyebrow">Indexed Files</p>
                <span>{loading ? 'Loading…' : `${items.length} items`}</span>
              </div>

              {grouped.map(([group, entries]) => (
                <section key={group} className="group-card">
                  <div className="group-header">
                    <h4>{group}</h4>
                    <span>{entries.length}</span>
                  </div>
                  <div className="entry-list">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        className={`entry-item ${entry.id === selectedId ? 'selected' : ''}`}
                        onClick={() => setSelectedId(entry.id)}
                      >
                        <div>
                          <strong>{entry.title}</strong>
                          <p>{entry.summary}</p>
                        </div>
                        <div className="entry-meta">
                          <span>{entry.doc_type}</span>
                          <span>{entry.word_count} words</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="66%" minSize="40%">
          <article className="memory-detail">
            <div className="detail-header">
              <div>
                <p className="eyebrow">Selected Entry</p>
                <h3>{selectedDoc?.title ?? 'No memory selected'}</h3>
              </div>
              <div className="detail-meta">
                <span>{selectedDoc?.doc_type ?? '—'}</span>
                <span>{selectedDoc?.source_path ?? 'No source'}</span>
                <span>{selectedDoc ? `${selectedDoc.word_count} words` : '—'}</span>
              </div>
            </div>

            <div className="detail-body">
              {selectedDoc ? (
                <>
                  <div className="time-title-row">
                    <span className="time-link">Source</span>
                    <strong>{selectedDoc.summary}</strong>
                  </div>

                  <section>
                    <h4>Path</h4>
                    <p>{selectedDoc.source_path}</p>
                  </section>

                  <section>
                    <h4>Contents</h4>
                    <pre className="memory-content">{selectedDoc.content}</pre>
                  </section>
                </>
              ) : (
                <section>
                  <p>Once the backend is running, indexed memory documents will appear here.</p>
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
