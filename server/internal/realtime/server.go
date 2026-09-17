package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"table-tennis/server/internal/game"
	"table-tennis/server/internal/protocol"
	"table-tennis/server/internal/room"
)

type Server struct{ rooms *room.Manager }

func NewServer(rooms *room.Manager) *Server { return &Server{rooms: rooms} }

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	var hello protocol.HelloPayload
	if err := readMessage(ctx, conn, "hello", &hello); err != nil {
		_ = writeMessage(ctx, conn, "error", map[string]string{"message": "hello is required"})
		return
	}
	activeRoom, player := s.rooms.Authenticate(hello.RoomCode, hello.SessionToken)
	if activeRoom == nil || player == nil {
		_ = writeMessage(ctx, conn, "error", map[string]string{"message": "invalid room or session"})
		return
	}
	player.Online = true
	match := s.rooms.Attach(activeRoom)
	if match != nil {
		match.SetOnline(player.ID, true, time.Now())
		for _, roomPlayer := range activeRoom.Players {
			if roomPlayer.Ready {
				match.Commands <- game.Command{PlayerID: roomPlayer.ID, Type: "ready", Ready: true}
			}
		}
	}
	_ = writeMessage(ctx, conn, "room_state", s.rooms.RoomState(activeRoom))

	client := &client{conn: conn, ctx: ctx, match: match, playerID: player.ID, room: activeRoom, rooms: s.rooms, writeMu: &sync.Mutex{}}
	if match != nil {
		client.events = match.Subscribe()
		go client.forwardEvents()
	}
	client.readLoop()
}

type client struct {
	conn     *websocket.Conn
	ctx      context.Context
	match    *game.Match
	playerID string
	room     *room.Room
	rooms    *room.Manager
	writeMu  *sync.Mutex
	events   chan game.Event
}

func (c *client) readLoop() {
	defer func() {
		if c.match != nil {
			c.match.SetOnline(c.playerID, false, time.Now())
			c.match.Unsubscribe(c.events)
		}
		for _, player := range c.room.Players {
			if player.ID == c.playerID {
				player.Online = false
			}
		}
	}()
	for {
		_, data, err := c.conn.Read(c.ctx)
		if err != nil {
			return
		}
		var envelope protocol.Envelope
		if json.Unmarshal(data, &envelope) != nil || envelope.Version != protocol.Version {
			continue
		}
		switch envelope.Type {
		case "player_ready":
			var payload protocol.ReadyPayload
			if json.Unmarshal(envelope.Payload, &payload) == nil {
				if player := c.findPlayer(); player != nil {
					player.Ready = payload.Ready
				}
				if c.match != nil {
					c.match.Commands <- game.Command{PlayerID: c.playerID, Type: "ready", Ready: payload.Ready}
				}
				_ = c.write("room_state", c.rooms.RoomState(c.room))
			}
		case "paddle_move":
			var payload protocol.PaddleMovePayload
			if json.Unmarshal(envelope.Payload, &payload) == nil && c.match != nil {
				select {
				case c.match.Commands <- game.Command{PlayerID: c.playerID, Type: "paddle_move", Seq: payload.Seq, Target: payload.Target}:
				default:
				}
			}
		}
	}
}

func (c *client) forwardEvents() {
	for event := range c.events {
		if err := c.write(event.Type, event.Payload); err != nil {
			return
		}
	}
}

func (c *client) findPlayer() *room.Player {
	for _, player := range c.room.Players {
		if player.ID == c.playerID {
			return player
		}
	}
	return nil
}

func (c *client) write(messageType string, payload any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return writeMessage(c.ctx, c.conn, messageType, payload)
}

func readMessage(ctx context.Context, conn *websocket.Conn, expectedType string, target any) error {
	_, data, err := conn.Read(ctx)
	if err != nil {
		return err
	}
	var envelope protocol.Envelope
	if err := json.Unmarshal(data, &envelope); err != nil || envelope.Version != protocol.Version || envelope.Type != expectedType {
		return errInvalidMessage
	}
	return json.Unmarshal(envelope.Payload, target)
}

func writeMessage(ctx context.Context, conn *websocket.Conn, messageType string, payload any) error {
	return conn.Write(ctx, websocket.MessageText, protocol.Message(messageType, payload))
}

type invalidMessageError struct{}

func (invalidMessageError) Error() string { return "invalid websocket message" }

var errInvalidMessage = invalidMessageError{}
