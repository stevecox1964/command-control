const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export type TaskType = 'manual' | 'shell' | 'python' | 'web_fetch'
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'paused'

export type TaskRecord = {
  id: number
  name: string
  task_type: TaskType
  enabled: boolean
  interval_minutes: number | null
  command: string | null
  working_directory: string | null
  target_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  last_run_at: string | null
  next_run_at: string | null
  last_status: TaskStatus | null
  last_output: string | null
}

export type TaskRunRecord = {
  id: number
  task_id: number
  started_at: string
  finished_at: string | null
  status: TaskStatus
  output: string
  error: string | null
  duration_ms: number | null
}

export type TaskCreate = {
  name: string
  task_type: TaskType
  enabled: boolean
  interval_minutes: number | null
  command: string | null
  working_directory: string | null
  target_url: string | null
  notes: string | null
}

export async function fetchTasks(): Promise<TaskRecord[]> {
  const response = await fetch(`${API_BASE}/api/tasks`)
  if (!response.ok) throw new Error('Failed to fetch tasks')
  return response.json()
}

export async function fetchTaskRuns(taskId: number): Promise<TaskRunRecord[]> {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}/runs`)
  if (!response.ok) throw new Error('Failed to fetch task runs')
  return response.json()
}

export async function createTask(payload: TaskCreate): Promise<TaskRecord> {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('Failed to create task')
  return response.json()
}

export async function updateTask(taskId: number, payload: Partial<TaskCreate>): Promise<TaskRecord> {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('Failed to update task')
  return response.json()
}

export async function deleteTask(taskId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete task')
}

export async function runTask(taskId: number): Promise<TaskRunRecord> {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}/run`, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to run task')
  return response.json()
}
