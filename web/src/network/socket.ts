import type { ClientMessage, ServerMessage, Session } from '../types/protocol'

const API_URL = import.meta.env.VITE_API_URL ?? ''
const getWsUrl = () => {
  if (API_URL) return API_URL.replace(/^http/, 'ws')
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  return 'ws://localhost:8080'
}
const WS_URL = getWsUrl()
export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export class RoomSocket {
  private socket: WebSocket | null = null
  private listeners = new Set<(message: ServerMessage) => void>()
  private statusListeners = new Set<(status: SocketStatus) => void>()
  private pending: ClientMessage[] = []
  private session: Session
  private reconnectTimer: number | null = null
  private retryAttempt = 0
  private closedByUser = false
  private currentStatus: SocketStatus = 'idle'

  constructor(session: Session) { this.session = session }

  connect() {
    this.closedByUser = false
    this.retryAttempt = 0
    this.open()
  }

  private open() {
    if (this.closedByUser) return
    this.setStatus(this.retryAttempt === 0 ? 'connecting' : 'reconnecting')
    const socket = new WebSocket(`${WS_URL}/ws`)
    this.socket = socket
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.retryAttempt = 0
      this.setStatus('open')
      this.sendNow({ v: 1, type: 'hello', payload: { roomCode: this.session.roomCode, sessionToken: this.session.sessionToken } })
      this.pending.splice(0).forEach((message) => this.sendNow(message))
    })
    socket.addEventListener('message', (event) => {
      try { this.listeners.forEach((listener) => listener(JSON.parse(event.data) as ServerMessage)) } catch { /* malformed messages are ignored */ }
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.closedByUser) { this.setStatus('closed'); return }
      this.scheduleReconnect()
    })
  }

  subscribe(listener: (message: ServerMessage) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  subscribeStatus(listener: (status: SocketStatus) => void) { this.statusListeners.add(listener); listener(this.currentStatus); return () => this.statusListeners.delete(listener) }
  private sendNow(message: ClientMessage) { this.socket?.send(JSON.stringify(message)) }
  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) { this.sendNow(message); return }
    if (message.type === 'paddle_move') {
      const pendingIndex = this.pending.findIndex((pending) => pending.type === 'paddle_move')
      if (pendingIndex >= 0) { this.pending[pendingIndex] = message; return }
    }
    this.pending.push(message)
  }
  private scheduleReconnect() {
    if (this.reconnectTimer !== null || this.closedByUser) return
    const delay = Math.min(1000 * 2 ** this.retryAttempt, 5000)
    this.retryAttempt += 1
    this.setStatus('reconnecting')
    this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; this.open() }, delay)
  }
  private setStatus(status: SocketStatus) { this.currentStatus = status; this.statusListeners.forEach((listener) => listener(status)) }
  close() {
    this.closedByUser = true
    if (this.reconnectTimer !== null) { window.clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    const socket = this.socket; this.socket = null; socket?.close(); this.setStatus('closed')
  }
  get isOpen() { return this.socket?.readyState === WebSocket.OPEN }
  get status() { return this.currentStatus }
}

let activeSocket: RoomSocket | null = null
export const connectRoom = (session: Session) => { activeSocket?.close(); activeSocket = new RoomSocket(session); activeSocket.connect(); return activeSocket }
export const getActiveSocket = () => activeSocket
