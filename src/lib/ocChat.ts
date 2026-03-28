/**
 * Chat client for OpenClaw Gateway via the backend proxy.
 * All requests go through FastAPI at :8000 which proxies to the gateway on loopback.
 */

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullContent: string) => void
  onError: (error: string) => void
}

/**
 * Send a message to an OpenClaw agent via the backend proxy.
 * Streams tokens back via SSE.
 */
export async function sendMessage(
  agentId: string,
  messages: ChatMessage[],
  _token: string, // kept for API compat but unused now (backend handles auth)
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/oc/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      messages,
      user: `cc:${agentId}`,
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    let msg = `Backend error ${response.status}`
    try {
      const parsed = JSON.parse(body)
      msg = parsed?.detail ?? parsed?.error?.message ?? msg
    } catch { /* ignore */ }
    callbacks.onError(msg)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError('No response stream')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          callbacks.onDone(fullContent)
          return
        }
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            callbacks.onError(parsed.error)
            return
          }
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullContent += content
            callbacks.onToken(content)
          }
        } catch { /* skip malformed chunks */ }
      }
    }
    // Stream ended without [DONE]
    if (fullContent) {
      callbacks.onDone(fullContent)
    }
  } catch (err) {
    if (signal?.aborted) return
    callbacks.onError(err instanceof Error ? err.message : 'Stream error')
  }
}

/**
 * Fetch the list of OpenClaw agents from the backend.
 */
export interface OcAgent {
  id: string
  name?: string
  identityName?: string
  identityEmoji?: string
  model?: string
  workspace?: string
  isDefault?: boolean
}

export async function fetchOcAgents(): Promise<OcAgent[]> {
  const response = await fetch(`${API_BASE}/api/oc/agents`)
  if (!response.ok) throw new Error('Failed to fetch OpenClaw agents')
  return response.json()
}
