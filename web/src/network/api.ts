import type { Session } from '../types/protocol'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? 'Request failed')
  return body as T
}

export const createRoom = () => request<Session>('/api/rooms', { method: 'POST' })
export const joinRoom = (roomCode: string) => request<Session>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, { method: 'POST' })
export const getRoom = (roomCode: string) => request<{ roomCode: string; players: Array<{ id: string; slot: 'home' | 'away'; ready: boolean; online: boolean }> }>(`/api/rooms/${encodeURIComponent(roomCode)}`)
