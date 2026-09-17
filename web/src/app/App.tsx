import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from '../features/home/HomePage'
import RoomPage from '../features/room/RoomPage'
import MatchPage from '../features/match/MatchPage'
import ResultPage from '../features/result/ResultPage'

export default function App() {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/room/:roomCode" element={<RoomPage />} />
    <Route path="/match/:roomCode" element={<MatchPage />} />
    <Route path="/result/:roomCode" element={<ResultPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
