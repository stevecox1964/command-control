export type MemoryListItem = {
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

export type MemoryDocument = MemoryListItem & {
  content: string
}

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export async function fetchMemoryList(): Promise<MemoryListItem[]> {
  const response = await fetch(`${API_BASE}/api/memory`)
  if (!response.ok) {
    throw new Error('Failed to fetch memory list')
  }
  return response.json()
}

export async function fetchMemoryDocument(documentId: number): Promise<MemoryDocument> {
  const response = await fetch(`${API_BASE}/api/memory/${documentId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch memory document ${documentId}`)
  }
  return response.json()
}

export async function ingestMemory(): Promise<{ ingested: number; skipped: number; total: number }> {
  const response = await fetch(`${API_BASE}/api/memory/ingest`, { method: 'POST' })
  if (!response.ok) {
    throw new Error('Failed to ingest memory')
  }
  return response.json()
}
