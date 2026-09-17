import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { MatchStatus, PlayerState, PlayerSlot, Session } from '../types/protocol'

interface SessionState { session: Session | null; setSession: (session: Session) => void; clearSession: () => void }
export const useSessionStore = create<SessionState>()(persist((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
}), { name: 'rally-session', storage: createJSONStorage(() => sessionStorage) }))

interface RoomState {
  players: PlayerState[]
  connected: boolean
  error: string | null
  setPlayers: (players: PlayerState[]) => void
  setConnected: (connected: boolean) => void
  setError: (error: string | null) => void
}
export const useRoomStore = create<RoomState>((set) => ({
  players: [], connected: false, error: null,
  setPlayers: (players) => set({ players }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
}))

interface MatchState {
  score: Record<PlayerSlot, number>
  rally: number
  status: MatchStatus
  server: PlayerSlot | null
  winner: PlayerSlot | null
  setSnapshot: (score: Record<PlayerSlot, number>, rally: number, status: MatchStatus, server: PlayerSlot) => void
  setWinner: (winner: PlayerSlot | null, score?: Record<PlayerSlot, number>) => void
}
export const useMatchStore = create<MatchState>((set) => ({
  score: { home: 0, away: 0 }, rally: 0, status: 'waiting', server: null, winner: null,
  setSnapshot: (score, rally, status, server) => set({ score, rally, status, server }),
  setWinner: (winner, score) => set({ winner, ...(score ? { score } : {}), status: 'match_end' }),
}))

interface UIState { soundOn: boolean; pauseOpen: boolean; setSoundOn: (value: boolean) => void; setPauseOpen: (value: boolean) => void }
export const useUIStore = create<UIState>((set) => ({
  soundOn: true, pauseOpen: false,
  setSoundOn: (soundOn) => set({ soundOn }),
  setPauseOpen: (pauseOpen) => set({ pauseOpen }),
}))
