import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Pause, Volume2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../shared/ui/Button'
import IconButton from '../../shared/ui/IconButton'
import { getActiveSocket, type SocketStatus } from '../../network/socket'
import { GameRuntime } from '../../game/runtime/GameRuntime'
import { AudioManager } from '../../game/audio/AudioManager'
import MatchHelp from './MatchHelp'
import './MatchPage.css'
import { useMatchStore, useSessionStore, useUIStore } from '../../state/stores'

function GameCanvas({ soundOn }: { soundOn: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const session = useSessionStore((state) => state.session)
  const socket = getActiveSocket()
  const setSnapshot = useMatchStore((state) => state.setSnapshot)
  const setPointWinner = useMatchStore((state) => state.setPointWinner)
  const navigate = useNavigate()
  const audioRef = useRef<AudioManager | null>(null)
  useEffect(() => {
    const audio = new AudioManager(); audioRef.current = audio
    const handleGesture = () => { audio.unlock() }
    window.addEventListener('pointerdown', handleGesture, { passive: true })
    window.addEventListener('keydown', handleGesture, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', handleGesture)
      window.removeEventListener('keydown', handleGesture)
      audio.dispose()
      audioRef.current = null
    }
  }, [])
  useEffect(() => { audioRef.current?.setEnabled(soundOn) }, [soundOn])
  useEffect(() => {
    if (!canvasRef.current || !session || !socket) return
    const audio = audioRef.current
    const runtime = new GameRuntime(canvasRef.current, socket, session.playerSlot, session.playerId, (state) => setSnapshot(state.score, state.rally, state.status, state.server), audio ?? undefined)
    const unsubscribe = socket.subscribe((message) => {
      if (message.type === 'match_state') runtime.applySnapshot(message.payload)
      if (message.type === 'ball_bounced') { runtime.playBounceEffect(message.payload); audioRef.current?.play('ball_bounced') }
      if (message.type === 'paddle_hit') audioRef.current?.play('paddle_hit')
      if (message.type === 'match_started') audioRef.current?.play('match_started')
      if (message.type === 'point_ended') { setPointWinner(message.payload.winner); audioRef.current?.play('point_ended') }
      if (message.type === 'match_ended') { audioRef.current?.play('match_ended'); useMatchStore.getState().setWinner(message.payload.winner, message.payload.score); navigate(`/result/${session.roomCode}`) }
    })
    return () => { unsubscribe(); runtime.dispose() }
  }, [navigate, session, setPointWinner, setSnapshot, socket])
  return <canvas ref={canvasRef} className="game-canvas" />
}

export default function MatchPage() {
  const { roomCode } = useParams(); const navigate = useNavigate(); const session = useSessionStore((state) => state.session); const { score, rally, status, pointWinner, clearPointWinner } = useMatchStore(); const { soundOn, pauseOpen, setSoundOn, setPauseOpen } = useUIStore(); const socket = getActiveSocket(); const [helpOpen, setHelpOpen] = useState(false); const [connectionStatus, setConnectionStatus] = useState<SocketStatus>(socket?.status ?? 'connecting')
  useEffect(() => { if (!session || session.roomCode !== roomCode || !getActiveSocket()) navigate('/') }, [navigate, roomCode, session])
  useEffect(() => { if (!socket) return; setConnectionStatus(socket.status); const unsubscribe = socket.subscribeStatus(setConnectionStatus); return () => { unsubscribe() } }, [socket])
  useEffect(() => { if (!pointWinner) return; const timer = window.setTimeout(clearPointWinner, 900); return () => window.clearTimeout(timer) }, [clearPointWinner, pointWinner])
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setHelpOpen(false) }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [])
  const homeScore = session?.playerSlot === 'home' ? score.home : score.away; const awayScore = session?.playerSlot === 'home' ? score.away : score.home
  const connectionLabel = connectionStatus === 'open' ? 'Connected' : connectionStatus === 'reconnecting' ? 'Reconnecting' : connectionStatus === 'closed' ? 'Disconnected' : 'Connecting'
  const connectionClass = connectionStatus === 'open' ? 'online' : connectionStatus === 'reconnecting' ? 'reconnecting' : ''
  const phaseLabel = status === 'countdown' ? 'GET READY' : status === 'serving' ? 'SERVE' : status === 'in_play' ? 'BALL IN PLAY' : status.replace('_', ' ').toUpperCase()
  const pointLabel = pointWinner ? (pointWinner === session?.playerSlot ? 'POINT TO YOU' : 'POINT TO OPPONENT') : null
  return <main className="game-page"><header className="game-header"><div className="brand compact"><span className="brand-mark">●</span><div><strong>RALLY</strong><small>TABLE TENNIS</small></div></div><div className="scoreboard"><div><small>YOU</small><strong className="score-you">{String(homeScore).padStart(2, '0')}</strong></div><span>/</span><div><small>OPPONENT</small><strong>{String(awayScore).padStart(2, '0')}</strong></div></div><div className="game-actions"><div className="connection-pill"><span className={`status-dot ${connectionClass}`} />{connectionLabel}</div><IconButton label="Toggle sound" onClick={() => setSoundOn(!soundOn)}>{soundOn ? <Volume2 size={18} /> : <span>×</span>}</IconButton><IconButton label="Help" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></IconButton><IconButton label="Pause menu" onClick={() => setPauseOpen(!pauseOpen)}><Pause size={18} /></IconButton></div></header><div className="game-stage"><div className="stage-label" role="status" aria-live="polite">{phaseLabel}</div>{pointLabel && <div className="point-callout" role="status">{pointLabel}</div>}<GameCanvas soundOn={soundOn} /><aside className="rally-card"><small>CURRENT RALLY</small><strong>{String(rally).padStart(2, '0')}</strong><span>FIRST TO 11</span></aside></div>{helpOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false) }}><MatchHelp onClose={() => setHelpOpen(false)} /></div>}{pauseOpen && <div className="modal-backdrop"><section className="pause-modal"><div className="eyebrow">MATCH PAUSED</div><h2>Take a breath.<br /><em>Take a shot.</em></h2><p>The match continues while this menu is open.</p><Button onClick={() => setPauseOpen(false)}>Continue</Button><Button variant="ghost" onClick={() => navigate('/')}>Leave match</Button></section></div>}<footer className="game-footer"><span>{session?.mode === 'cpu' ? 'YOU VS COMPUTER' : 'YOU VS PLAYER'}</span><span>ROOM {roomCode}</span><span>DRAG TO MOVE</span></footer></main>
}
