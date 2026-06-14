import express from "express";
import next from "next";
import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { Server } from "socket.io";
import { CARD_VALUES, DEFAULT_STORY, isCardValue, numericCardValue, type CardValue, type ResultsView, type RoomView, type Story } from "./lib/poker";

type Participant = {
  id: string;
  name: string;
  socketId: string | null;
  online: boolean;
  joinedAt: number;
};

type Room = {
  code: string;
  moderatorId: string;
  participants: Map<string, Participant>;
  votes: Map<string, CardValue>;
  revealed: boolean;
  round: number;
  story: Story;
};

type Ack<T = unknown> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

const rooms = new Map<string, Room>();
const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 32);
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (rooms.has(code));

  return code;
}

function calculateResults(room: Room): ResultsView {
  const allVotes = Array.from(room.participants.values()).map((participant) => ({
    participantId: participant.id,
    name: participant.name,
    vote: room.votes.get(participant.id) ?? null
  }));
  const numericVotes = allVotes
    .map((result) => numericCardValue(result.vote))
    .filter((value): value is number => value !== null);
  const average =
    numericVotes.length > 0
      ? Number((numericVotes.reduce((total, value) => total + value, 0) / numericVotes.length).toFixed(1))
      : null;
  const consensus = numericVotes.length > 0 && new Set(numericVotes).size === 1;

  return {
    allVotes,
    average,
    consensus
  };
}

function serializeRoom(room: Room, viewerId: string): RoomView {
  const participants = Array.from(room.participants.values())
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      online: participant.online,
      isModerator: participant.id === room.moderatorId,
      hasVoted: room.votes.has(participant.id),
      vote: room.revealed ? room.votes.get(participant.id) ?? null : null
    }));

  return {
    code: room.code,
    revealed: room.revealed,
    round: room.round,
    viewerId,
    yourVote: room.votes.get(viewerId) ?? null,
    story: room.story,
    participants,
    results: room.revealed ? calculateResults(room) : null
  };
}

function nextModerator(room: Room) {
  return Array.from(room.participants.values())
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .find((participant) => participant.online)?.id;
}

function emitRoomUpdate(io: Server, room: Room) {
  for (const participant of room.participants.values()) {
    if (participant.online && participant.socketId) {
      io.to(participant.socketId).emit("room:update", serializeRoom(room, participant.id));
    }
  }
}

function leaveRoom(io: Server, socketId: string, roomCode: string, participantId: string) {
  const room = rooms.get(roomCode);

  if (!room) {
    return;
  }

  const participant = room.participants.get(participantId);
  if (!participant || participant.socketId !== socketId) {
    return;
  }

  room.participants.delete(participantId);
  room.votes.delete(participantId);

  if (room.participants.size === 0) {
    rooms.delete(roomCode);
    return;
  }

  if (room.moderatorId === participantId) {
    room.moderatorId = nextModerator(room) ?? Array.from(room.participants.keys())[0];
  }

  io.to(roomCode).emit("user:disconnected", { participantId });
  emitRoomUpdate(io, room);
}

await app.prepare();

const expressApp = express();
const server = createServer(expressApp);
const io = new Server(server);

io.on("connection", (socket) => {
  socket.on("room:create", (payload: { name?: string; clientId?: string }, ack?: Ack<RoomView>) => {
    const name = normalizeName(payload.name ?? "");
    const participantId = payload.clientId?.trim();

    if (!name || !participantId) {
      ack?.({ ok: false, error: "Name is required." });
      return;
    }

    const roomCode = createRoomCode();
    const room: Room = {
      code: roomCode,
      moderatorId: participantId,
      participants: new Map(),
      votes: new Map(),
      revealed: false,
      round: 1,
      story: { ...DEFAULT_STORY }
    };

    room.participants.set(participantId, {
      id: participantId,
      name,
      socketId: socket.id,
      online: true,
      joinedAt: Date.now()
    });

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.participantId = participantId;
    ack?.({ ok: true, data: serializeRoom(room, participantId) });
    emitRoomUpdate(io, room);
  });

  socket.on("room:join", (payload: { name?: string; roomCode?: string; clientId?: string }, ack?: Ack<RoomView>) => {
    const name = normalizeName(payload.name ?? "");
    const roomCode = normalizeRoomCode(payload.roomCode ?? "");
    const participantId = payload.clientId?.trim();
    const room = rooms.get(roomCode);

    if (!name || !participantId) {
      ack?.({ ok: false, error: "Name and room code are required." });
      return;
    }

    if (!room) {
      ack?.({ ok: false, error: "Room not found." });
      return;
    }

    const existing = room.participants.get(participantId);
    room.participants.set(participantId, {
      id: participantId,
      name,
      socketId: socket.id,
      online: true,
      joinedAt: existing?.joinedAt ?? Date.now()
    });

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.participantId = participantId;
    io.to(roomCode).emit("user:connected", { participantId, name });
    ack?.({ ok: true, data: serializeRoom(room, participantId) });
    emitRoomUpdate(io, room);
  });

  socket.on("room:leave", (payload: { roomCode?: string; clientId?: string }) => {
    const roomCode = normalizeRoomCode(payload.roomCode ?? socket.data.roomCode ?? "");
    const participantId = payload.clientId?.trim() || socket.data.participantId;
    leaveRoom(io, socket.id, roomCode, participantId);
    socket.leave(roomCode);
    socket.data.roomCode = null;
    socket.data.participantId = null;
  });

  socket.on("vote:select", (payload: { roomCode?: string; clientId?: string; value?: unknown }, ack?: Ack<RoomView>) => {
    const roomCode = normalizeRoomCode(payload.roomCode ?? "");
    const participantId = payload.clientId?.trim();
    const room = rooms.get(roomCode);

    if (!room || !participantId || !room.participants.has(participantId)) {
      ack?.({ ok: false, error: "Room session not found." });
      return;
    }

    if (room.revealed) {
      ack?.({ ok: false, error: "Start a new round to vote again." });
      return;
    }

    if (!isCardValue(payload.value)) {
      ack?.({ ok: false, error: "Invalid card value." });
      return;
    }

    room.votes.set(participantId, payload.value);
    ack?.({ ok: true, data: serializeRoom(room, participantId) });
    emitRoomUpdate(io, room);
  });

  socket.on("vote:reveal", (payload: { roomCode?: string; clientId?: string }, ack?: Ack<RoomView>) => {
    const roomCode = normalizeRoomCode(payload.roomCode ?? "");
    const participantId = payload.clientId?.trim();
    const room = rooms.get(roomCode);

    if (!room || !participantId) {
      ack?.({ ok: false, error: "Room session not found." });
      return;
    }

    if (room.moderatorId !== participantId) {
      ack?.({ ok: false, error: "Only the moderator can reveal votes." });
      return;
    }

    room.revealed = true;
    ack?.({ ok: true, data: serializeRoom(room, participantId) });
    emitRoomUpdate(io, room);
  });

  socket.on("vote:reset", (payload: { roomCode?: string; clientId?: string }, ack?: Ack<RoomView>) => {
    const roomCode = normalizeRoomCode(payload.roomCode ?? "");
    const participantId = payload.clientId?.trim();
    const room = rooms.get(roomCode);

    if (!room || !participantId) {
      ack?.({ ok: false, error: "Room session not found." });
      return;
    }

    if (room.moderatorId !== participantId) {
      ack?.({ ok: false, error: "Only the moderator can reset voting." });
      return;
    }

    room.votes.clear();
    room.revealed = false;
    room.round += 1;
    ack?.({ ok: true, data: serializeRoom(room, participantId) });
    emitRoomUpdate(io, room);
  });

  socket.on("story:update", (payload: { roomCode?: string; clientId?: string; story?: Partial<Story> }, ack?: Ack<RoomView>) => {
    const roomCode = normalizeRoomCode(payload.roomCode ?? "");
    const participantId = payload.clientId?.trim();
    const room = rooms.get(roomCode);

    if (!room || !participantId) {
      ack?.({ ok: false, error: "Room session not found." });
      return;
    }

    if (room.moderatorId !== participantId) {
      ack?.({ ok: false, error: "Only the moderator can edit the story." });
      return;
    }

    room.story = {
      title: payload.story?.title?.trim().slice(0, 120) || DEFAULT_STORY.title,
      description: payload.story?.description?.trim().slice(0, 500) || DEFAULT_STORY.description
    };

    ack?.({ ok: true, data: serializeRoom(room, participantId) });
    emitRoomUpdate(io, room);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const participantId = socket.data.participantId;

    if (!roomCode || !participantId) {
      return;
    }

    const room = rooms.get(roomCode);
    const participant = room?.participants.get(participantId);

    if (!room || !participant || participant.socketId !== socket.id) {
      return;
    }

    participant.online = false;
    participant.socketId = null;
    if (room.moderatorId === participantId) {
      room.moderatorId = nextModerator(room) ?? participantId;
    }
    io.to(roomCode).emit("user:disconnected", { participantId });
    emitRoomUpdate(io, room);
  });
});

expressApp.use((req, res) => {
  void handle(req, res);
});

server.listen(port, hostname, () => {
  console.log(`Scrum Poker is ready on http://${hostname}:${port}`);
});
