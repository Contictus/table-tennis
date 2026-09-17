import type { ClientMessage, ServerMessage, Session } from '../types/protocol'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const WS_URL = API_URL.replace(/^http/, 'ws')

export class RoomSocket {
  private socket: WebSocket | null = null
  private listeners = new Set<(message: ServerMessage) => void>()
  private pending: ClientMessage[] = []
  private session: Session

  constructor(session: Session) { this.session = session }

  connect() {
    this.socket = new WebSocket(`${WS_URL}/ws`)
    this.socket.addEventListener('open', () => {
      this.sendNow({ v: 1, type: 'hello', payload: { roomCode: this.session.roomCode, sessionToken: this.session.sessionToken } })
      this.pending.splice(0).forEach((message) => this.sendNow(message))
    })
    this.socket.addEventListener('message', (event) => {
      try { this.listeners.forEach((listener) => listener(JSON.parse(event.data) as ServerMessage)) } catch { /* malformed messages are ignored */ }
    })
  }

  subscribe(listener: (message: ServerMessage) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private sendNow(message: ClientMessage) { this.socket?.send(JSON.stringify(message)) }
  send(message: ClientMessage) { if (this.socket?.readyState === WebSocket.OPEN) this.sendNow(message); else this.pending.push(message) }
  close() { this.socket?.close() }
  get isOpen() { return this.socket?.readyState === WebSocket.OPEN }
}

let activeSocket: RoomSocket | null = null
export const connectRoom = (session: Session) => { activeSocket?.close(); activeSocket = new RoomSocket(session); activeSocket.connect(); return activeSocket }
export const getActiveSocket = () => activeSocket
