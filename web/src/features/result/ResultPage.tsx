import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../shared/ui/Button'
import { getActiveSocket } from '../../network/socket'
import { useMatchStore, useSessionStore } from '../../state/stores'

export default function ResultPage() {
  const navigate = useNavigate(); const { roomCode } = useParams(); const session = useSessionStore((state) => state.session); const { score, winner } = useMatchStore(); const youWon = winner === session?.playerSlot
  return <main className="page-shell centered-page result-page"><div className="result-mark">{winner ? (youWon ? '01' : '02') : '—'}</div><div className="eyebrow">{winner ? 'MATCH COMPLETE' : 'MATCH CANCELLED'}</div><h1>{winner ? (youWon ? 'Point to you.' : 'Good rally.') : 'The rally paused.'}<br /><em>{winner ? (youWon ? 'Well played.' : 'Run it back?') : 'Your opponent left.'}</em></h1><div className="result-score"><div><small>YOU</small><strong>{String(session?.playerSlot === 'home' ? score.home : score.away).padStart(2, '0')}</strong></div><span>—</span><div><small>OPPONENT</small><strong>{String(session?.playerSlot === 'home' ? score.away : score.home).padStart(2, '0')}</strong></div></div><div className="result-actions"><Button onClick={() => { getActiveSocket()?.close(); navigate(`/room/${roomCode}`) }}><RotateCcw size={17} /> Play again</Button><Button variant="ghost" onClick={() => navigate('/')}><ArrowLeft size={17} /> Back home</Button></div></main>
}
