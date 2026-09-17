import { FormEvent, useState } from 'react'
import { ArrowUpRight, CircleHelp, Volume2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../../shared/ui/Button'
import IconButton from '../../shared/ui/IconButton'
import { createRoom, joinRoom } from '../../network/api'
import { useSessionStore, useUIStore } from '../../state/stores'

export default function HomePage() {
  const navigate = useNavigate()
  const setSession = useSessionStore((state) => state.setSession)
  const { soundOn, setSoundOn } = useUIStore()
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')

  const startRoom = async () => {
    setError('')
    try { const session = await createRoom(); setSession(session); navigate(`/room/${session.roomCode}`) }
    catch (value) { setError(value instanceof Error ? value.message : 'Room could not be created') }
  }

  const enterRoom = async (event: FormEvent) => {
    event.preventDefault(); if (!roomCode.trim()) return
    setError('')
    try { const session = await joinRoom(roomCode.trim().toUpperCase()); setSession(session); navigate(`/room/${session.roomCode}`) }
    catch (value) { setError(value instanceof Error ? value.message : 'Room could not be joined') }
  }

  return <main className="page-shell home-page">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">●</span><div><strong>RALLY</strong><small>TABLE TENNIS</small></div></div>
      <div className="top-actions"><IconButton label="Toggle sound" onClick={() => setSoundOn(!soundOn)}>{soundOn ? <Volume2 size={19} /> : <span className="muted-icon">×</span>}</IconButton><IconButton label="Help"><CircleHelp size={19} /></IconButton></div>
    </header>
    <section className="home-content">
      <div className="eyebrow">THE EVERYDAY CLUB</div>
      <h1>One table.<br /><em>Two sides.</em></h1>
      <p className="home-copy">A focused table tennis rally, made for two. Pick a side and play the next point.</p>
      <div className="home-actions"><Button onClick={startRoom}>Create a room <ArrowUpRight size={17} /></Button><form onSubmit={enterRoom} className="join-form"><input aria-label="Room code" placeholder="ROOM CODE" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={5} /><button type="submit">Join room <ArrowUpRight size={16} /></button></form></div>
      {error && <p className="form-error">{error}</p>}
    </section>
    <div className="home-foot"><span>REAL-TIME 1V1</span><span>FIRST TO 11</span><span>PLAY ONLINE</span></div>
  </main>
}
