const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export type AgentProfile = {
  id: number
  name: string
  role: string
  purpose: string | null
  status: string
  preferred_model: string | null
  notes: string | null
  capability: string | null
  created_at: string
  updated_at: string
}

export async function fetchAgentProfiles(): Promise<AgentProfile[]> {
  const response = await fetch(`${API_BASE}/api/agent-profiles`)
  if (!response.ok) throw new Error('Failed to fetch agent profiles')
  return response.json()
}

export async function createAgentProfile(payload: Omit<AgentProfile, 'id' | 'created_at' | 'updated_at'>): Promise<AgentProfile> {
  const response = await fetch(`${API_BASE}/api/agent-profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('Failed to create agent profile')
  return response.json()
}

export async function updateAgentProfile(profileId: number, payload: Partial<Omit<AgentProfile, 'id' | 'created_at' | 'updated_at'>>): Promise<AgentProfile> {
  const response = await fetch(`${API_BASE}/api/agent-profiles/${profileId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('Failed to update agent profile')
  return response.json()
}

export async function deleteAgentProfile(profileId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent-profiles/${profileId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete agent profile')
}

export type ModelOption = {
  id: string
  name: string
  vendor: string
}

export async function fetchModels(): Promise<ModelOption[]> {
  const response = await fetch(`${API_BASE}/api/models`)
  if (!response.ok) throw new Error('Failed to fetch models')
  return response.json()
}
