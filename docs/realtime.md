# Realtime protocol

All WebSocket messages share the envelope `{v, type, payload}` with `v: 1`.
Source schema: `protocol/schema/messages.json`.

## Client to server

- `hello` — authenticate with `{roomCode, sessionToken}`.
- `player_ready` — lobby ready flag `{ready}`.
- `paddle_move` — paddle target `{seq, target: {x, z}}`. `seq` rises per input;
  the server ignores stale repeats and returns `lastProcessedInput` for
  client reconciliation.

## Server to client

- `room_state` — lobby players and ready flags.
- `match_started` — countdown began.
- `match_state` — authoritative snapshot `{tick, ball, paddles, score, rally,
  server, status}` at 30 Hz (simulation runs at 60 Hz).
- `ball_bounced` — table or net impact `{id, tick, x, z}`; drives the ripple
  effect and the wooden tok sound.
- `paddle_hit` — paddle impact with `{slot}`; drives the rubber pock sound.
- `point_ended` — `{winner, score, rally}`.
- `match_ended` — `{winner, score}` or disconnect reason.
- `player_disconnected` / `player_reconnected` — presence during grace period.
- `error` — `{message}` for hello/auth failures.
