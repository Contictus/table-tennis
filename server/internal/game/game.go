package game

import (
	"crypto/rand"
	"encoding/binary"
	"math"
	"sync"
	"time"

	"table-tennis/server/internal/protocol"
)

const (
	StatusWaiting   = "waiting"
	StatusReady     = "ready"
	StatusCountdown = "countdown"
	StatusServing   = "serving"
	StatusInPlay    = "in_play"
	StatusPointEnd  = "point_end"
	StatusMatchEnd  = "match_end"
	TickRate        = 60
	minPaddleX      = 0.08
	maxPaddleX      = 0.92
	minHomePaddleZ  = 0.54
	maxHomePaddleZ  = 0.94
	minAwayPaddleZ  = 0.06
	maxAwayPaddleZ  = 0.46
)

// Command is a single validated intent from a player. Paddle moves carry a
// client sequence number so stale or repeated inputs can be rejected.
type Command struct {
	PlayerID string
	Type     string
	Ready    bool
	Seq      uint64
	Target   protocol.PaddleTarget
}

type Match struct {
	Commands      chan Command
	Events        chan Event
	State         State
	players       map[string]*Player
	lastTick      time.Time
	phaseAt       time.Time
	initialServer string
	cpuID         string
	impactID      uint64
	eventMu       sync.RWMutex
	events        map[chan Event]struct{}
	lastHitter    string
	bouncesOnSide int
	currentSide   string
}

type Player struct {
	ID           string
	Slot         string
	Ready        bool
	Online       bool
	LastInput    uint64
	DisconnectAt time.Time
}

type State struct {
	Tick        uint64
	Ball        protocol.BallState
	Paddles     map[string]protocol.PaddleState
	Score       map[string]int
	Rally       int
	Server      string
	Status      string
	PointWinner string
}

type Event struct {
	Type    string
	Payload any
}

func NewMatch(homeID, awayID string) *Match {
	firstServer := "home"
	if randomBit()%2 == 1 {
		firstServer = "away"
	}
	match := &Match{
		Commands: make(chan Command, 128),
		Events:   make(chan Event, 256),
		players: map[string]*Player{
			homeID: {ID: homeID, Slot: "home", Online: true},
			awayID: {ID: awayID, Slot: "away", Online: true},
		},
		State: State{
			Paddles: map[string]protocol.PaddleState{
				"home": {X: 0.5, Z: 0.8},
				"away": {X: 0.5, Z: 0.2},
			},
			Score:  map[string]int{"home": 0, "away": 0},
			Server: firstServer,
			Status: StatusWaiting,
		},
		initialServer: firstServer,
		events:        make(map[chan Event]struct{}),
	}
	return match
}

func NewCPUMatch(homeID, cpuID string) *Match {
	match := NewMatch(homeID, cpuID)
	match.cpuID = cpuID
	match.players[cpuID].Ready = true
	return match
}

func (m *Match) Player(id string) *Player { return m.players[id] }

func (m *Match) Start() {
	m.lastTick = time.Now()
	go m.loop()
}

func (m *Match) loop() {
	ticker := time.NewTicker(time.Second / TickRate)
	defer ticker.Stop()
	for now := range ticker.C {
		for {
			select {
			case command := <-m.Commands:
				m.handle(command, now)
			default:
				goto commandsDone
			}
		}
	commandsDone:
		m.enqueueCPUInput()
		m.step(now.Sub(m.lastTick).Seconds(), now)
		m.lastTick = now
		if m.ShouldTerminate(now) {
			m.State.Status = StatusMatchEnd
			m.emit("match_ended", map[string]any{"winner": nil, "reason": "disconnect"})
		}
		if m.State.Status == StatusMatchEnd {
			return
		}
	}
}

func (m *Match) handle(command Command, now time.Time) {
	player := m.players[command.PlayerID]
	if player == nil {
		return
	}
	switch command.Type {
	case "online":
		player.Online = command.Ready
		if command.Ready {
			player.DisconnectAt = time.Time{}
			m.emit("player_reconnected", map[string]string{"playerId": player.ID})
		} else {
			player.DisconnectAt = now
			m.emit("player_disconnected", map[string]string{"playerId": player.ID})
		}
	case "ready":
		player.Ready = command.Ready
		if m.State.Status == StatusWaiting && m.allReady() {
			m.State.Status = StatusCountdown
			m.phaseAt = now
			m.emit("match_started", map[string]any{"status": StatusCountdown})
		}
	case "paddle_move":
		if command.Seq <= player.LastInput {
			return
		}
		player.LastInput = command.Seq
		if m.State.Status != StatusInPlay && m.State.Status != StatusServing {
			return
		}
		slot := player.Slot
		current := m.State.Paddles[slot]
		minZ, maxZ := paddleZBounds(slot)
		target := protocol.PaddleTarget{
			X: clamp(command.Target.X, minPaddleX, maxPaddleX),
			Z: clamp(command.Target.Z, minZ, maxZ),
		}
		maxStep := 0.08
		m.State.Paddles[slot] = protocol.PaddleState{X: moveToward(current.X, target.X, maxStep), Z: moveToward(current.Z, target.Z, maxStep)}
	}
}

func (m *Match) step(dt float64, now time.Time) {
	if m.State.Status == StatusWaiting || m.State.Status == StatusMatchEnd {
		return
	}
	m.State.Tick++
	switch m.State.Status {
	case StatusCountdown:
		if now.Sub(m.phaseAt) >= time.Second {
			m.beginServe(now)
		}
	case StatusServing:
		if now.Sub(m.phaseAt) >= 500*time.Millisecond {
			m.State.Status = StatusInPlay
			m.impactID++
			m.emit("paddle_hit", protocol.BallImpactPayload{ID: m.impactID, Tick: m.State.Tick, X: m.State.Ball.X, Z: m.State.Ball.Z, Slot: m.State.Server})
		}
	case StatusInPlay:
		m.simulateBall(dt, now)
	case StatusPointEnd:
		if now.Sub(m.phaseAt) >= 800*time.Millisecond {
			if m.State.Score["home"] >= 11 || m.State.Score["away"] >= 11 {
				m.State.Status = StatusMatchEnd
				m.emit("match_ended", map[string]any{"winner": m.State.PointWinner, "score": m.State.Score})
				return
			}
			m.beginServe(now)
		}
	}
	if m.State.Tick%2 == 0 {
		m.emit("match_state", m.snapshot())
	}
}

func (m *Match) beginServe(now time.Time) {
	m.State.Server = m.serverForPoint()
	m.State.Status = StatusServing
	m.State.Rally = 0
	m.lastHitter = m.State.Server
	m.bouncesOnSide = 0
	m.currentSide = ""
	serverZ := 0.20
	velocityZ := 1.25
	if m.State.Server == "home" {
		serverZ = 0.80
		velocityZ = -1.25
	}
	vx := (float64(randomBit()%3) - 1.0) * 0.12
	m.State.Ball = protocol.BallState{
		X:  0.5,
		Y:  0.18,
		Z:  serverZ,
		VX: vx,
		VY: 0.62,
		VZ: velocityZ,
	}
	m.phaseAt = now
}

func (m *Match) simulateBall(dt float64, now time.Time) {
	ball := &m.State.Ball
	prevZ := ball.Z

	ball.X += ball.VX * dt
	ball.Y += ball.VY * dt
	ball.Z += ball.VZ * dt
	ball.VY -= 2.6 * dt

	// 1. File kontrolü: Z = 0.50'de alçak geçen top fileye çarpar
	if (prevZ-0.5)*(ball.Z-0.5) <= 0 {
		if ball.Y < 0.165 {
			ball.Z = 0.5 + math.Copysign(0.015, prevZ-0.5)
			ball.VZ = -ball.VZ * 0.25
			ball.VY = 0.08
			m.impactID++
			m.emit("ball_bounced", protocol.BallImpactPayload{ID: m.impactID, Tick: m.State.Tick, X: ball.X, Z: ball.Z})
			winner := "home"
			if prevZ > 0.5 {
				winner = "away"
			}
			m.point(winner, now)
			return
		}
	}

	// 2. Masa sekmesi
	if ball.Y <= 0.08 {
		ball.Y = 0.08
		isOnTable := ball.X >= 0.05 && ball.X <= 0.95 && ball.Z >= 0.05 && ball.Z <= 0.95
		if !isOnTable {
			winner := "home"
			if m.lastHitter == "home" {
				winner = "away"
			}
			m.point(winner, now)
			return
		}

		ball.VY = math.Max(0.55, math.Abs(ball.VY)*0.72)
		m.impactID++
		m.emit("ball_bounced", protocol.BallImpactPayload{ID: m.impactID, Tick: m.State.Tick, X: ball.X, Z: ball.Z})

		side := "home"
		if ball.Z < 0.50 {
			side = "away"
		}

		if side == m.lastHitter && m.State.Rally > 0 {
			winner := "home"
			if m.lastHitter == "home" {
				winner = "away"
			}
			m.point(winner, now)
			return
		}

		if side == m.currentSide {
			m.bouncesOnSide++
		} else {
			m.currentSide = side
			m.bouncesOnSide = 1
		}

		if m.bouncesOnSide >= 2 {
			winner := "home"
			if side == "home" {
				winner = "away"
			}
			m.point(winner, now)
			return
		}
	}

	// 3. Masayı aşan veya dışarı çıkan toplar
	if ball.Z < 0.03 || ball.Z > 0.97 || ball.X < 0.02 || ball.X > 0.98 {
		winner := "home"
		if ball.Z > 0.97 || (ball.VZ > 0 && (ball.X < 0.02 || ball.X > 0.98)) {
			winner = "away"
		} else if ball.Z < 0.03 || (ball.VZ < 0 && (ball.X < 0.02 || ball.X > 0.98)) {
			winner = "home"
		}
		m.point(winner, now)
		return
	}

	// 4. Raket çarpışması
	for _, player := range m.players {
		paddle := m.State.Paddles[player.Slot]
		if player.Slot == "home" && ball.VZ > 0 {
			zDist := ball.Z - paddle.Z
			inZ := (prevZ <= paddle.Z+0.04 && ball.Z >= paddle.Z-0.08) || math.Abs(zDist) < 0.08
			inX := math.Abs(ball.X-paddle.X) < 0.18
			inY := ball.Y >= 0.06 && ball.Y <= 0.35
			if inZ && inX && inY {
				m.lastHitter = "home"
				m.bouncesOnSide = 0
				m.currentSide = ""
				m.State.Rally++
				ball.Z = paddle.Z - 0.03
				rallySpeed := math.Min(2.1, 1.25+float64(m.State.Rally)*0.03)
				ball.VZ = -rallySpeed
				dx := ball.X - paddle.X
				ball.VX = clamp(ball.VX*0.25+dx*2.0, -1.15, 1.15)
				ball.VY = 0.66 + math.Min(0.25, math.Abs(paddle.Z-0.5)*0.25)
				m.impactID++
				m.emit("paddle_hit", protocol.BallImpactPayload{ID: m.impactID, Tick: m.State.Tick, X: ball.X, Z: ball.Z, Slot: "home"})
				break
			}
		} else if player.Slot == "away" && ball.VZ < 0 {
			zDist := paddle.Z - ball.Z
			inZ := (prevZ >= paddle.Z-0.04 && ball.Z <= paddle.Z+0.08) || math.Abs(zDist) < 0.08
			inX := math.Abs(ball.X-paddle.X) < 0.18
			inY := ball.Y >= 0.06 && ball.Y <= 0.35
			if inZ && inX && inY {
				m.lastHitter = "away"
				m.bouncesOnSide = 0
				m.currentSide = ""
				m.State.Rally++
				ball.Z = paddle.Z + 0.03
				rallySpeed := math.Min(2.1, 1.25+float64(m.State.Rally)*0.03)
				ball.VZ = rallySpeed
				dx := ball.X - paddle.X
				ball.VX = clamp(ball.VX*0.25+dx*2.0, -1.15, 1.15)
				ball.VY = 0.66 + math.Min(0.25, math.Abs(paddle.Z-0.5)*0.25)
				m.impactID++
				m.emit("paddle_hit", protocol.BallImpactPayload{ID: m.impactID, Tick: m.State.Tick, X: ball.X, Z: ball.Z, Slot: "away"})
				break
			}
		}
	}
}

func (m *Match) enqueueCPUInput() {
	if m.cpuID == "" || (m.State.Status != StatusInPlay && m.State.Status != StatusServing) {
		return
	}
	player := m.players[m.cpuID]
	if player == nil {
		return
	}
	targetX := 0.5
	targetZ := 0.22
	if m.State.Ball.VZ < 0 {
		targetX = clamp(m.State.Ball.X, minPaddleX, maxPaddleX)
		targetZ = clamp(m.State.Ball.Z-0.02, minAwayPaddleZ, maxAwayPaddleZ)
	}
	m.handle(Command{PlayerID: m.cpuID, Type: "paddle_move", Seq: player.LastInput + 1, Target: protocol.PaddleTarget{X: targetX, Z: targetZ}}, m.lastTick)
}

func (m *Match) point(winner string, now time.Time) {
	m.State.Score[winner]++
	m.State.PointWinner = winner
	m.State.Status = StatusPointEnd
	m.phaseAt = now
	m.emit("point_ended", map[string]any{"winner": winner, "score": m.State.Score, "rally": m.State.Rally})
}

func (m *Match) serverForPoint() string {
	points := m.State.Score["home"] + m.State.Score["away"]
	if (points/2)%2 == 0 {
		return m.initialServer
	}
	if m.initialServer == "home" {
		return "away"
	}
	return "home"
}

func (m *Match) allReady() bool {
	for _, player := range m.players {
		if !player.Ready {
			return false
		}
	}
	return true
}

func paddleZBounds(slot string) (float64, float64) {
	if slot == "home" {
		return minHomePaddleZ, maxHomePaddleZ
	}
	return minAwayPaddleZ, maxAwayPaddleZ
}

func (m *Match) snapshot() protocol.MatchStatePayload {
	lastProcessed := map[string]uint64{}
	for id, player := range m.players {
		lastProcessed[id] = player.LastInput
	}
	return protocol.MatchStatePayload{
		Tick: m.State.Tick, LastProcessedInput: lastProcessed, Ball: m.State.Ball,
		Paddles: m.State.Paddles, Score: m.State.Score, Rally: m.State.Rally,
		Server: m.State.Server, Status: m.State.Status,
	}
}

func (m *Match) emit(eventType string, payload any) {
	event := Event{Type: eventType, Payload: payload}
	m.eventMu.RLock()
	defer m.eventMu.RUnlock()
	for subscriber := range m.events {
		select {
		case subscriber <- event:
		default:
			if eventType != "match_state" {
				select {
				case <-subscriber:
				default:
				}
				select {
				case subscriber <- event:
				default:
				}
			}
		}
	}
}

func (m *Match) SetOnline(playerID string, online bool, now time.Time) {
	select {
	case m.Commands <- Command{PlayerID: playerID, Type: "online", Ready: online}:
	default:
	}
}

func (m *Match) Subscribe() chan Event {
	subscriber := make(chan Event, 256)
	m.eventMu.Lock()
	m.events[subscriber] = struct{}{}
	m.eventMu.Unlock()
	return subscriber
}

func (m *Match) Unsubscribe(subscriber chan Event) {
	m.eventMu.Lock()
	delete(m.events, subscriber)
	close(subscriber)
	m.eventMu.Unlock()
}

func (m *Match) ShouldTerminate(now time.Time) bool {
	for _, player := range m.players {
		if !player.Online && now.Sub(player.DisconnectAt) >= 10*time.Second {
			return true
		}
	}
	return false
}

func randomBit() byte {
	var value [8]byte
	if _, err := rand.Read(value[:]); err != nil {
		return 0
	}
	return byte(binary.LittleEndian.Uint64(value[:]) & 1)
}

func clamp(value, min, max float64) float64 {
	return math.Max(min, math.Min(max, value))
}

func moveToward(current, target, step float64) float64 {
	delta := target - current
	if math.Abs(delta) <= step {
		return target
	}
	if delta < 0 {
		return current - step
	}
	return current + step
}
