const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export async function fetchOcHealth() {
  const response = await fetch(`${API_BASE}/api/oc/health`)
  if (!response.ok) throw new Error('Failed to fetch OpenClaw health')
  return response.json()
}

export async function fetchOcSessions() {
  const response = await fetch(`${API_BASE}/api/oc/sessions`)
  if (!response.ok) throw new Error('Failed to fetch OpenClaw sessions')
  return response.json()
}

export async function fetchOcStatus() {
  const response = await fetch(`${API_BASE}/api/oc/status`)
  if (!response.ok) throw new Error('Failed to fetch OpenClaw status')
  return response.json()
}

export async function fetchOcLogs(limit = 80) {
  const response = await fetch(`${API_BASE}/api/oc/logs?limit=${limit}`)
  if (!response.ok) throw new Error('Failed to fetch OpenClaw logs')
  return response.json()
}
