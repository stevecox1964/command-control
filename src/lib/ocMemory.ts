/**
 * OpenClaw Memory API client.
 * Talks to the backend proxy which delegates to OpenClaw's native memory system.
 */

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

// --- Types ---

export interface OcMemoryStatus {
  agentId: string
  status: {
    backend: string
    files: number
    chunks: number
    dirty: boolean
    provider: string
    model: string
    sources: string[]
    cache?: { enabled: boolean; entries: number }
    fts?: { enabled: boolean; available: boolean }
    vector?: { enabled: boolean; available: boolean; dims?: number }
  }
}

export interface OcMemoryFile {
  path: string
  type: 'daily' | 'long_term'
  date_label: string | null
  word_count: number
  char_count: number
  modified: string
  summary: string
}

export interface OcMemoryFileContent {
  path: string
  agent_id: string
  content: string
  word_count: number
  char_count: number
  modified: string
}

export interface OcMemorySearchResult {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
  source: string
}

// --- API calls ---

export async function fetchMemoryStatus(): Promise<OcMemoryStatus[]> {
  const res = await fetch(`${API_BASE}/api/oc/memory/status`)
  if (!res.ok) throw new Error('Failed to fetch memory status')
  return res.json()
}

export async function fetchMemoryFiles(agentId = 'main'): Promise<{ agent_id: string; workspace: string; files: OcMemoryFile[] }> {
  const res = await fetch(`${API_BASE}/api/oc/memory/files?agent_id=${agentId}`)
  if (!res.ok) throw new Error('Failed to fetch memory files')
  return res.json()
}

export async function fetchMemoryFileContent(path: string, agentId = 'main'): Promise<OcMemoryFileContent> {
  const params = new URLSearchParams({ path, agent_id: agentId })
  const res = await fetch(`${API_BASE}/api/oc/memory/file?${params}`)
  if (!res.ok) throw new Error('Failed to fetch memory file')
  return res.json()
}

export async function searchMemory(query: string, agentId = 'main', maxResults = 10): Promise<{ results: OcMemorySearchResult[] }> {
  const res = await fetch(`${API_BASE}/api/oc/memory/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, agent_id: agentId, max_results: maxResults }),
  })
  if (!res.ok) throw new Error('Failed to search memory')
  return res.json()
}

export async function reindexMemory(agentId = 'main', force = false): Promise<{ ok: boolean; output: string }> {
  const params = new URLSearchParams({ agent_id: agentId })
  if (force) params.set('force', 'true')
  const res = await fetch(`${API_BASE}/api/oc/memory/reindex?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reindex memory')
  return res.json()
}
