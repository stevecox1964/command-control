const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export type ChatMessage = {
  id: number
  profile_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export async function fetchChatHistory(profileId: number): Promise<ChatMessage[]> {
  const response = await fetch(`${API_BASE}/api/agent-profiles/${profileId}/chat`)
  if (!response.ok) throw new Error('Failed to fetch chat history')
  return response.json()
}

export async function clearChatHistory(profileId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent-profiles/${profileId}/chat`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to clear chat history')
}

export async function sendChatMessage(
  profileId: number,
  message: string,
  onToken: (token: string) => void,
  onDone: (msg: ChatMessage) => void,
  onError: (error: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent-profiles/${profileId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    throw new Error('Failed to send chat message')
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6))
      if (payload.token) {
        onToken(payload.token)
      } else if (payload.done) {
        onDone(payload.message)
      } else if (payload.error) {
        onError(payload.error)
      }
    }
  }
}
