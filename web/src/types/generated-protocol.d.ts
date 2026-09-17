// Generated from protocol/schema/messages.json. Do not edit.

export type TableTennisProtocol = ClientMessage | ServerMessage;
export type ClientMessage =
  | {
      v: 1;
      type: "hello";
      payload: {
        roomCode: string;
        sessionToken: string;
      };
    }
  | {
      v: 1;
      type: "player_ready";
      payload: {
        ready: boolean;
      };
    }
  | {
      v: 1;
      type: "paddle_move";
      payload: {
        seq: number;
        target: PaddleTarget;
      };
    };

export interface PaddleTarget {
  x: number;
  z: number;
}
export interface ServerMessage {
  v: 1;
  type:
    | "room_state"
    | "match_started"
    | "match_state"
    | "ball_bounced"
    | "paddle_hit"
    | "point_ended"
    | "match_ended"
    | "player_disconnected"
    | "player_reconnected"
    | "error";
  payload: {
    [k: string]: unknown;
  };
}
