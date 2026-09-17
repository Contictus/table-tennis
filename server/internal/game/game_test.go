package game

import (
	"testing"
	"time"

	"table-tennis/server/internal/protocol"
)

func TestNewMatchCreatesTwoPlayerSlots(t *testing.T) {
	match := NewMatch("home-player", "away-player")
	if len(match.players) != 2 {
		t.Fatalf("expected two players, got %d", len(match.players))
	}
	if match.initialServer != "home" && match.initialServer != "away" {
		t.Fatalf("unexpected initial server %q", match.initialServer)
	}
}

func TestReadyCommandsStartCountdown(t *testing.T) {
	match := NewMatch("home-player", "away-player")
	now := time.Now()
	match.handle(Command{PlayerID: "home-player", Type: "ready", Ready: true}, now)
	if match.State.Status != StatusWaiting {
		t.Fatalf("match started before both players were ready")
	}
	match.handle(Command{PlayerID: "away-player", Type: "ready", Ready: true}, now)
	if match.State.Status != StatusCountdown {
		t.Fatalf("expected countdown, got %s", match.State.Status)
	}
}

func TestPaddleInputIsBoundedAndOrdered(t *testing.T) {
	match := NewMatch("home-player", "away-player")
	match.State.Status = StatusInPlay
	now := time.Now()
	match.handle(Command{PlayerID: "home-player", Type: "paddle_move", Seq: 2, Target: protocol.PaddleTarget{X: 5, Z: -1}}, now)
	first := match.State.Paddles["home"]
	if first.X < 0 || first.X > 1 || first.Z < 0 || first.Z > 1 {
		t.Fatalf("paddle escaped bounds: %+v", first)
	}
	match.handle(Command{PlayerID: "home-player", Type: "paddle_move", Seq: 1, Target: protocol.PaddleTarget{X: 0, Z: 0}}, now)
	if match.State.Paddles["home"] != first {
		t.Fatalf("stale sequence changed paddle")
	}
}

func TestServerChangesEveryTwoPoints(t *testing.T) {
	match := NewMatch("home-player", "away-player")
	match.initialServer = "home"
	match.State.Server = "home"
	match.State.Score = map[string]int{"home": 0, "away": 0}
	if got := match.serverForPoint(); got != "home" {
		t.Fatalf("at 0 points: got %s", got)
	}
	match.State.Score["home"] = 2
	if got := match.serverForPoint(); got != "away" {
		t.Fatalf("at 2 points: got %s", got)
	}
	match.State.Score["home"] = 4
	if got := match.serverForPoint(); got != "home" {
		t.Fatalf("at 4 points: got %s", got)
	}
}

func TestDisconnectedPlayerTerminatesAfterGracePeriod(t *testing.T) {
	match := NewMatch("home-player", "away-player")
	now := time.Now()
	match.handle(Command{PlayerID: "away-player", Type: "online", Ready: false}, now)
	if match.ShouldTerminate(now.Add(9 * time.Second)) {
		t.Fatal("match terminated before grace period elapsed")
	}
	if !match.ShouldTerminate(now.Add(10 * time.Second)) {
		t.Fatal("match did not terminate after grace period")
	}
}
