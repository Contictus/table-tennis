import { useEffect, useRef, useState } from 'react'
import { Copy, ArrowLeft, Users, Wifi, Check } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../shared/ui/Button'
import IconButton from '../../shared/ui/IconButton'
import { getRoom } from '../../network/api'
import { connectRoom, getActiveSocket } from '../../network/socket'
import { useRoomStore, useSessionStore } from '../../state/stores'

export default function RoomPage() {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const session = useSessionStore((state) => state.session)
  const { players, connected, error, setPlayers, setConnected, setError } = useRoomStore()
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const rebound = useRef(false)

  useEffect(() => {
    if (!session || session.roomCode !== roomCode) { navigate('/'); return }
    let socket = connectRoom(session)
    setConnected(false)
    let unsubscribeStatus = socket.subscribeStatus((status) => setConnected(status === 'open'))
    let unsubscribe = socket.subscribe((message) => {
      if (message.type === 'room_state') { setPlayers(message.payload.players); setConnected(true) }
      if (message.type === 'match_started') navigate(`/match/${roomCode}`)
      if (message.type === 'error') setError(message.payload.message)
    })
    const poll = window.setInterval(async () => {
      try {
        const room = await getRoom(roomCode); setPlayers(room.players)
        if (room.players.length === 2 && !rebound.current) {
          rebound.current = true
          unsubscribe()
          unsubscribeStatus()
          socket = connectRoom(session)
          unsubscribeStatus = socket.subscribeStatus((status) => setConnected(status === 'open'))
          unsubscribe = socket.subscribe((message) => {
            if (message.type === 'room_state') { setPlayers(message.payload.players); setConnected(true) }
            if (message.type === 'match_started') navigate(`/match/${roomCode}`)
            if (message.type === 'error') setError(message.payload.message)
          })
        }
      } catch { /* socket displays the actionable connection error */ }
    }, 1000)
    return () => { unsubscribe(); unsubscribeStatus(); window.clearInterval(poll) }
  }, [navigate, roomCode, session, setConnected, setError, setPlayers])

  const sendReady = () => { setReady(true); getActiveSocket()?.send({ v: 1, type: 'player_ready', payload: { ready: true } }) }
  const copyCode = async () => { await navigator.clipboard?.writeText(roomCode); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  const me = players.find((player) => player.id === session?.playerId)
  const opponent = players.find((player) => player.id !== session?.playerId)

  return <main className="page-shell centered-page">
    <header className="topbar"><button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={16} /> Back</button><div className="brand compact"><span className="brand-mark">●</span><div><strong>RALLY</strong><small>TABLE TENNIS</small></div></div><div className="connection-pill"><span className={connected ? 'status-dot online' : 'status-dot'} />{connected ? 'Connected' : 'Connecting'}</div></header>
    <section className="lobby-card">
      <div className="eyebrow">PRIVATE COURT</div><h1>Waiting for your<br /><em>opponent.</em></h1>
      <button className="room-code" onClick={copyCode}><span>{roomCode}</span>{copied ? <Check size={18} /> : <Copy size={18} />}<small>{copied ? 'COPIED' : 'COPY ROOM CODE'}</small></button>
      <div className="player-list"><div className="player-row"><span className="player-number">01</span><div><strong>You</strong><small>{me?.slot?.toUpperCase() ?? 'HOME'}</small></div><span className="ready-state">{ready ? <><Check size={14} /> Ready</> : 'Not ready'}</span></div><div className="player-row"><span className="player-number">02</span><div><strong>{opponent ? 'Opponent' : 'Open seat'}</strong><small>{opponent?.slot?.toUpperCase() ?? 'AWAY'}</small></div><span className="ready-state">{opponent ? <><Wifi size={14} /> Connected</> : <><Users size={14} /> Invite a friend</>}</span></div></div>
      <Button onClick={sendReady} disabled={ready || !opponent}>{ready ? 'Ready — waiting to start' : 'I’m ready'} </Button>
      {error && <p className="form-error">{error}</p>}
      <p className="lobby-note">Both players must be ready. The match starts automatically.</p>
    </section>
  </main>
}
