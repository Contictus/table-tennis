package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"table-tennis/server/internal/realtime"
	"table-tennis/server/internal/room"
)

func main() {
	rooms := room.NewManager()
	ws := realtime.NewServer(rooms)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/rooms", func(w http.ResponseWriter, r *http.Request) {
		playerID := newID("player")
		sessionToken := newToken()
		newRoom := rooms.Create(playerID, sessionToken)
		writeJSON(w, http.StatusCreated, map[string]string{
			"roomCode":     newRoom.Code,
			"playerId":     playerID,
			"playerSlot":   "home",
			"sessionToken": sessionToken,
			"mode":         "player",
		})
	})
	mux.HandleFunc("POST /api/matches/cpu", func(w http.ResponseWriter, r *http.Request) {
		playerID := newID("player")
		sessionToken := newToken()
		newRoom := rooms.CreateCPU(playerID, sessionToken)
		writeJSON(w, http.StatusCreated, map[string]string{
			"roomCode":     newRoom.Code,
			"playerId":     playerID,
			"playerSlot":   "home",
			"sessionToken": sessionToken,
			"mode":         "cpu",
		})
	})
	mux.HandleFunc("POST /api/rooms/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/rooms/"), "/"), "/")
		if len(parts) != 2 || parts[1] != "join" || parts[0] == "" {
			writeError(w, http.StatusBadRequest, "invalid room code")
			return
		}
		newPlayer := rooms.Join(parts[0], newID("player"), newToken())
		if newPlayer == nil {
			writeError(w, http.StatusNotFound, "room is not available")
			return
		}
		writeJSON(w, http.StatusOK, newPlayer)
	})
	mux.HandleFunc("GET /api/rooms/", func(w http.ResponseWriter, r *http.Request) {
		code := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/rooms/"), "/")
		activeRoom := rooms.Lookup(code)
		if activeRoom == nil {
			writeError(w, http.StatusNotFound, "room is not available")
			return
		}
		writeJSON(w, http.StatusOK, rooms.RoomState(activeRoom))
	})
	mux.Handle("/ws", ws)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: withCORS(mux)}
	log.Printf("table tennis server listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func newID(prefix string) string {
	return prefix + "-" + hex.EncodeToString(randomBytes(6))
}

func newToken() string {
	return hex.EncodeToString(randomBytes(24))
}

func randomBytes(size int) []byte {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
