const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type TaskType =
  | 'web_fetch' | 'script' | 'agent_job' | 'coding' | 'review'
  | 'reminder' | 'check' | 'transform' | 'notification' | 'approval' | 'custom'

export type AgentSelectionMode = 'fixed' | 'pool' | 'auto'
export type ModelProfile = 'token_light' | 'balanced' | 'coding_heavy' | 'high_reasoning' | 'premium'
export type ReasoningLevel = 'low' | 'medium' | 'high'
export type BudgetPolicy = 'cheap' | 'balanced' | 'premium'
export type QueueItemStatus = 'queued' | 'running' | 'blocked' | 'waiting_for_dependency' | 'completed' | 'failed' | 'cancelled'
export type TriggerSource = 'manual' | 'schedule' | 'event' | 'dependency' | 'workflow'
export type ExecutionBackend = 'openclaw' | 'wrapper' | 'hybrid'

export type RetryPolicy = {
  max_retries: number
  retry_delay_seconds: number
}

export type WorkflowStep = {
  step_id: string
  task_definition_id: string
  name: string
  on_success: string
  on_failure: string
  conditions: unknown[]
}

export type TaskDefinition = {
  id: string
  name: string
  description: string | null
  task_type: TaskType
  owner_type: 'user' | 'bot' | 'system'
  trigger_modes: string[]
  enabled: boolean
  config: Record<string, unknown>
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  execution_backend: ExecutionBackend
  assigned_agent_id: string | null
  allowed_agent_ids: string[]
  agent_selection_mode: AgentSelectionMode
  required_capabilities: string[]
  model_profile: ModelProfile
  max_tokens: number | null
  reasoning_level: ReasoningLevel
  budget_policy: BudgetPolicy
  priority: number
  timeout_seconds: number
  retry_policy: RetryPolicy
  tags: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export type TaskDefinitionCreate = Omit<TaskDefinition, 'id' | 'created_at' | 'updated_at'>

export type WorkflowDefinition = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger_modes: string[]
  schedule: string | null
  steps: WorkflowStep[]
  error_policy: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

export type WorkflowDefinitionCreate = Omit<WorkflowDefinition, 'id' | 'created_at' | 'updated_at'>

export type QueueItem = {
  id: string
  queue_item_type: 'task_run' | 'workflow_run'
  source_type: 'task_definition' | 'workflow_definition' | 'workflow_step'
  source_definition_id: string
  workflow_run_id: string | null
  parent_queue_item_id: string | null
  status: QueueItemStatus
  assigned_agent_id: string | null
  allowed_agent_ids: string[]
  agent_selection_mode: AgentSelectionMode
  required_capabilities: string[]
  model_profile: ModelProfile
  priority: number
  payload: Record<string, unknown>
  retry_count: number
  max_retries: number
  timeout_seconds: number
  created_by: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  result_summary: string | null
  error_message: string | null
}

export type TaskRun = {
  id: string
  task_definition_id: string
  queue_item_id: string
  workflow_run_id: string | null
  trigger_source: TriggerSource
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown>
  status: string
  agent_id: string | null
  model_profile: string | null
  started_at: string | null
  completed_at: string | null
  result_summary: string | null
  error_message: string | null
}

export type WorkflowRun = {
  id: string
  workflow_definition_id: string
  queue_item_id: string
  trigger_source: TriggerSource
  input_payload: Record<string, unknown>
  status: string
  current_step: string | null
  started_at: string | null
  completed_at: string | null
  result_summary: string | null
  error_message: string | null
}

// ---------------------------------------------------------------------------
// Task Definitions API
// ---------------------------------------------------------------------------

export async function fetchTasks(): Promise<TaskDefinition[]> {
  const r = await fetch(`${API_BASE}/api/tasks`)
  if (!r.ok) throw new Error('Failed to fetch task definitions')
  return r.json()
}

export async function fetchTask(id: string): Promise<TaskDefinition> {
  const r = await fetch(`${API_BASE}/api/tasks/${id}`)
  if (!r.ok) throw new Error('Failed to fetch task definition')
  return r.json()
}

export async function createTask(payload: Partial<TaskDefinitionCreate>): Promise<TaskDefinition> {
  const r = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Failed to create task definition')
  return r.json()
}

export async function updateTask(id: string, payload: Partial<TaskDefinitionCreate>): Promise<TaskDefinition> {
  const r = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Failed to update task definition')
  return r.json()
}

export async function deleteTask(id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/tasks/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('Failed to delete task definition')
}

export async function runTask(id: string): Promise<TaskRun> {
  const r = await fetch(`${API_BASE}/api/tasks/${id}/run`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to run task')
  return r.json()
}

// ---------------------------------------------------------------------------
// Workflow Definitions API
// ---------------------------------------------------------------------------

export async function fetchWorkflows(): Promise<WorkflowDefinition[]> {
  const r = await fetch(`${API_BASE}/api/workflows`)
  if (!r.ok) throw new Error('Failed to fetch workflows')
  return r.json()
}

export async function fetchWorkflow(id: string): Promise<WorkflowDefinition> {
  const r = await fetch(`${API_BASE}/api/workflows/${id}`)
  if (!r.ok) throw new Error('Failed to fetch workflow')
  return r.json()
}

export async function createWorkflow(payload: Partial<WorkflowDefinitionCreate>): Promise<WorkflowDefinition> {
  const r = await fetch(`${API_BASE}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Failed to create workflow')
  return r.json()
}

export async function updateWorkflow(id: string, payload: Partial<WorkflowDefinitionCreate>): Promise<WorkflowDefinition> {
  const r = await fetch(`${API_BASE}/api/workflows/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Failed to update workflow')
  return r.json()
}

export async function deleteWorkflow(id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/workflows/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('Failed to delete workflow')
}

export async function runWorkflow(id: string): Promise<WorkflowRun> {
  const r = await fetch(`${API_BASE}/api/workflows/${id}/run`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to run workflow')
  return r.json()
}

// ---------------------------------------------------------------------------
// Queue API
// ---------------------------------------------------------------------------

export async function fetchQueue(status?: string): Promise<QueueItem[]> {
  const url = status ? `${API_BASE}/api/queue?status=${encodeURIComponent(status)}` : `${API_BASE}/api/queue`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Failed to fetch queue')
  return r.json()
}

export async function fetchQueueItem(id: string): Promise<QueueItem> {
  const r = await fetch(`${API_BASE}/api/queue/${id}`)
  if (!r.ok) throw new Error('Failed to fetch queue item')
  return r.json()
}

export async function cancelQueueItem(id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/queue/${id}/cancel`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to cancel queue item')
}

export async function retryQueueItem(id: string): Promise<QueueItem> {
  const r = await fetch(`${API_BASE}/api/queue/${id}/retry`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to retry queue item')
  return r.json()
}

// ---------------------------------------------------------------------------
// Task Runs & Workflow Runs history
// ---------------------------------------------------------------------------

export async function fetchTaskRuns(taskDefinitionId?: string): Promise<TaskRun[]> {
  const url = taskDefinitionId
    ? `${API_BASE}/api/task-runs?task_definition_id=${encodeURIComponent(taskDefinitionId)}`
    : `${API_BASE}/api/task-runs`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Failed to fetch task runs')
  return r.json()
}

export async function fetchWorkflowRuns(workflowDefinitionId?: string): Promise<WorkflowRun[]> {
  const url = workflowDefinitionId
    ? `${API_BASE}/api/workflow-runs?workflow_definition_id=${encodeURIComponent(workflowDefinitionId)}`
    : `${API_BASE}/api/workflow-runs`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Failed to fetch workflow runs')
  return r.json()
}
