package protocol

import "encoding/json"

const Version = 1

type Envelope struct {
	Version int             `json:"v"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type HelloPayload struct {
	RoomCode     string `json:"roomCode"`
	SessionToken string `json:"sessionToken"`
}

type ReadyPayload struct {
	Ready bool `json:"ready"`
}

type PaddleMovePayload struct {
	Seq    uint64       `json:"seq"`
	Target PaddleTarget `json:"target"`
}

type PaddleTarget struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

type BallState struct {
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	Z  float64 `json:"z"`
	VX float64 `json:"vx"`
	VY float64 `json:"vy"`
	VZ float64 `json:"vz"`
}

type PaddleState struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

type MatchStatePayload struct {
	Tick               uint64                 `json:"tick"`
	LastProcessedInput map[string]uint64      `json:"lastProcessedInput"`
	Ball               BallState              `json:"ball"`
	Paddles            map[string]PaddleState `json:"paddles"`
	Score              map[string]int         `json:"score"`
	Rally              int                    `json:"rally"`
	Server             string                 `json:"server"`
	Status             string                 `json:"status"`
}

type RoomStatePayload struct {
	RoomCode string        `json:"roomCode"`
	Players  []PlayerState `json:"players"`
}

type PlayerState struct {
	ID     string `json:"id"`
	Slot   string `json:"slot"`
	Ready  bool   `json:"ready"`
	Online bool   `json:"online"`
}

func Message(messageType string, payload any) []byte {
	value, _ := json.Marshal(struct {
		Version int    `json:"v"`
		Type    string `json:"type"`
		Payload any    `json:"payload"`
	}{Version, messageType, payload})
	return value
}
