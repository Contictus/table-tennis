import { useEffect, useRef } from 'react'
import { CircleHelp, Pause, Volume2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../shared/ui/Button'
import IconButton from '../../shared/ui/IconButton'
import { getActiveSocket } from '../../network/socket'
import { GameRuntime } from '../../game/runtime/GameRuntime'
import { useMatchStore, useSessionStore, useUIStore } from '../../state/stores'

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const session = useSessionStore((state) => state.session)
  const socket = getActiveSocket()
  const setSnapshot = useMatchStore((state) => state.setSnapshot)
  const navigate = useNavigate()
  useEffect(() => {
    if (!canvasRef.current || !session || !socket) return
    const runtime = new GameRuntime(canvasRef.current, socket, session.playerSlot, session.playerId, (state) => setSnapshot(state.score, state.rally, state.status, state.server))
    const unsubscribe = socket.subscribe((message) => {
      if (message.type === 'match_state') runtime.applySnapshot(message.payload)
      if (message.type === 'match_ended') { useMatchStore.getState().setWinner(message.payload.winner, message.payload.score); navigate(`/result/${session.roomCode}`) }
    })
    return () => { unsubscribe(); runtime.dispose() }
  }, [navigate, session, setSnapshot, socket])
  return <canvas ref={canvasRef} className="game-canvas" />
}

export default function MatchPage() {
  const { roomCode } = useParams(); const navigate = useNavigate(); const session = useSessionStore((state) => state.session); const { score, rally, status } = useMatchStore(); const { soundOn, pauseOpen, setSoundOn, setPauseOpen } = useUIStore()
  useEffect(() => { if (!session || session.roomCode !== roomCode || !getActiveSocket()) navigate('/') }, [navigate, roomCode, session])
  const homeScore = session?.playerSlot === 'home' ? score.home : score.away; const awayScore = session?.playerSlot === 'home' ? score.away : score.home
  return <main className="game-page"><header className="game-header"><div className="brand compact"><span className="brand-mark">●</span><div><strong>RALLY</strong><small>TABLE TENNIS</small></div></div><div className="scoreboard"><div><small>YOU</small><strong className="score-you">{String(homeScore).padStart(2, '0')}</strong></div><span>/</span><div><small>OPPONENT</small><strong>{String(awayScore).padStart(2, '0')}</strong></div></div><div className="game-actions"><IconButton label="Toggle sound" onClick={() => setSoundOn(!soundOn)}>{soundOn ? <Volume2 size={18} /> : <span>×</span>}</IconButton><IconButton label="Help"><CircleHelp size={18} /></IconButton><IconButton label="Pause menu" onClick={() => setPauseOpen(!pauseOpen)}><Pause size={18} /></IconButton></div></header><div className="game-stage"><div className="stage-label">{status === 'in_play' ? 'BALL IN PLAY' : status.replace('_', ' ').toUpperCase()}</div><GameCanvas /><aside className="rally-card"><small>CURRENT RALLY</small><strong>{String(rally).padStart(2, '0')}</strong><span>FIRST TO 11</span></aside></div>{pauseOpen && <div className="modal-backdrop"><section className="pause-modal"><div className="eyebrow">MATCH PAUSED</div><h2>Take a breath.<br /><em>Take a shot.</em></h2><p>The match continues while this menu is open.</p><Button onClick={() => setPauseOpen(false)}>Continue</Button><Button variant="ghost" onClick={() => navigate('/')}>Leave match</Button></section></div>}<footer className="game-footer"><span>YOU VS PLAYER</span><span>ROOM {roomCode}</span><span>DRAG TO MOVE</span></footer></main>
}
