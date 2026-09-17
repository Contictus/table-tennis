package room

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"sync"

	"table-tennis/server/internal/game"
	"table-tennis/server/internal/protocol"
)

type Manager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

type Room struct {
	Code    string
	Players []*Player
	Match   *game.Match
}

type Player struct {
	ID           string
	Slot         string
	SessionToken string
	Ready        bool
	Online       bool
}

type JoinResponse struct {
	RoomCode     string `json:"roomCode"`
	PlayerID     string `json:"playerId"`
	PlayerSlot   string `json:"playerSlot"`
	SessionToken string `json:"sessionToken"`
}

func NewManager() *Manager { return &Manager{rooms: make(map[string]*Room)} }

func (m *Manager) Create(playerID, token string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	code := newCode()
	room := &Room{Code: code, Players: []*Player{{ID: playerID, Slot: "home", SessionToken: token, Online: false}}}
	m.rooms[code] = room
	return room
}

func (m *Manager) Join(code, playerID, token string) *JoinResponse {
	m.mu.Lock()
	defer m.mu.Unlock()
	room := m.rooms[strings.ToUpper(code)]
	if room == nil || len(room.Players) >= 2 || room.Match != nil {
		return nil
	}
	room.Players = append(room.Players, &Player{ID: playerID, Slot: "away", SessionToken: token, Online: false})
	return &JoinResponse{RoomCode: room.Code, PlayerID: playerID, PlayerSlot: "away", SessionToken: token}
}

func (m *Manager) Lookup(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[strings.ToUpper(code)]
}

func (m *Manager) Authenticate(code, token string) (*Room, *Player) {
	room := m.Lookup(code)
	if room == nil {
		return nil, nil
	}
	for _, player := range room.Players {
		if player.SessionToken == token {
			return room, player
		}
	}
	return nil, nil
}

func (m *Manager) Attach(room *Room) *game.Match {
	m.mu.Lock()
	defer m.mu.Unlock()
	if room.Match == nil && len(room.Players) == 2 {
		room.Match = game.NewMatch(room.Players[0].ID, room.Players[1].ID)
		room.Match.Start()
	}
	return room.Match
}

func (m *Manager) RoomState(room *Room) protocol.RoomStatePayload {
	players := make([]protocol.PlayerState, 0, len(room.Players))
	for _, player := range room.Players {
		players = append(players, protocol.PlayerState{ID: player.ID, Slot: player.Slot, Ready: player.Ready, Online: player.Online})
	}
	return protocol.RoomStatePayload{RoomCode: room.Code, Players: players}
}

func newCode() string {
	value := make([]byte, 3)
	if _, err := rand.Read(value); err != nil {
		return "TABLE"
	}
	return strings.ToUpper(hex.EncodeToString(value)[:5])
}
