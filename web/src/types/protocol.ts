export type PlayerSlot = 'home' | 'away'
export type MatchStatus = 'waiting' | 'ready' | 'countdown' | 'serving' | 'in_play' | 'point_end' | 'match_end'

export interface Envelope<TType extends string, TPayload> {
  v: 1
  type: TType
  payload: TPayload
}

export interface Session {
  roomCode: string
  playerId: string
  playerSlot: PlayerSlot
  sessionToken: string
  mode?: 'player' | 'cpu'
}

export interface PaddleTarget { x: number; z: number }
export interface BallState { x: number; y: number; z: number; vx: number; vy: number; vz: number }
export interface PaddleState { x: number; z: number }
export interface PlayerState { id: string; slot: PlayerSlot; ready: boolean; online: boolean }

export interface MatchStatePayload {
  tick: number
  lastProcessedInput: Record<string, number>
  ball: BallState
  paddles: Record<PlayerSlot, PaddleState>
  score: Record<PlayerSlot, number>
  rally: number
  server: PlayerSlot
  status: MatchStatus
}

export interface RoomStatePayload { roomCode: string; players: PlayerState[] }
export interface MatchEndedPayload { winner: PlayerSlot | null; score?: Record<PlayerSlot, number>; reason?: 'disconnect' }
export interface PointEndedPayload { winner: PlayerSlot; score: Record<PlayerSlot, number>; rally: number }
export interface BallImpactPayload { id: number; tick: number; x: number; z: number; slot?: PlayerSlot }
export interface ErrorPayload { message: string }

export type ClientMessage =
  | Envelope<'hello', { roomCode: string; sessionToken: string }>
  | Envelope<'player_ready', { ready: boolean }>
  | Envelope<'paddle_move', { seq: number; target: PaddleTarget }>

export type ServerMessage =
  | Envelope<'room_state', RoomStatePayload>
  | Envelope<'match_started', { status: MatchStatus }>
  | Envelope<'match_state', MatchStatePayload>
  | Envelope<'ball_bounced', BallImpactPayload>
  | Envelope<'paddle_hit', BallImpactPayload>
  | Envelope<'point_ended', PointEndedPayload>
  | Envelope<'match_ended', MatchEndedPayload>
  | Envelope<'player_disconnected', { playerId: string }>
  | Envelope<'player_reconnected', { playerId: string }>
  | Envelope<'error', ErrorPayload>

export const message = <TType extends string, TPayload>(type: TType, payload: TPayload) => ({ v: 1 as const, type, payload })
