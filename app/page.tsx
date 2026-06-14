"use client";

import clsx from "clsx";
import {
  Check,
  Copy,
  Crown,
  Edit3,
  Eye,
  Loader2,
  LogOut,
  RotateCcw,
  Save,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CARD_VALUES, DEFAULT_STORY, numericCardValue, type CardValue, type RoomView, type Story } from "../lib/poker";

type Mode = "create" | "join";
type BusyAction = "create" | "join" | "vote" | "reveal" | "reset" | "story" | "leave" | null;
type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

const storageKeys = {
  clientId: "scrum-poker-client-id",
  name: "scrum-poker-name"
};

function getOrCreateClientId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(storageKeys.clientId);
  if (existing) {
    return existing;
  }

  const created =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(storageKeys.clientId, created);
  return created;
}

function normalizeRoomInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function displayAverage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function Home() {
  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const nameRef = useRef("");
  const clientIdRef = useRef("");

  const [mode, setMode] = useState<Mode>("create");
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState("");
  const [editingStory, setEditingStory] = useState(false);
  const [storyDraft, setStoryDraft] = useState<Story>(DEFAULT_STORY);

  useEffect(() => {
    const id = getOrCreateClientId();
    const savedName = window.localStorage.getItem(storageKeys.name) ?? "";
    const inviteRoom = normalizeRoomInput(new URLSearchParams(window.location.search).get("room") ?? "");

    setClientId(id);
    setName(savedName);
    setRoomCode(inviteRoom);
    setMode(inviteRoom ? "join" : "create");
    clientIdRef.current = id;
    nameRef.current = savedName;

    const socket = io({
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const activeRoom = roomRef.current;

      if (activeRoom && nameRef.current && clientIdRef.current) {
        socket.emit(
          "room:join",
          { name: nameRef.current, roomCode: activeRoom.code, clientId: clientIdRef.current },
          (response: Ack<RoomView>) => {
            if (response.ok) {
              setRoom(response.data);
            }
          }
        );
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("room:update", (nextRoom: RoomView) => {
      setRoom(nextRoom);
      setMessage("");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    if (room && !editingStory) {
      setStoryDraft(room.story);
    }
  }, [editingStory, room]);

  const currentParticipant = useMemo(
    () => room?.participants.find((participant) => participant.id === room.viewerId) ?? null,
    [room]
  );
  const isModerator = Boolean(currentParticipant?.isModerator);
  const onlineCount = room?.participants.filter((participant) => participant.online).length ?? 0;
  const everyoneVoted = room ? room.participants.length > 0 && room.participants.every((participant) => participant.hasVoted) : false;

  function emitRoomEvent<TPayload extends object>(
    event: string,
    payload: TPayload,
    action: BusyAction,
    onSuccess?: (nextRoom: RoomView) => void
  ) {
    const socket = socketRef.current;

    if (!socket || !connected) {
      setMessage("Socket connection is not ready.");
      return;
    }

    setBusy(action);
    setMessage("");

    socket.emit(event, payload, (response: Ack<RoomView>) => {
      setBusy(null);

      if (!response?.ok) {
        setMessage(response?.error ?? "Something went wrong.");
        return;
      }

      setRoom(response.data);
      onSuccess?.(response.data);
    });
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();

    if (!cleanName) {
      setMessage("Name is required.");
      return;
    }

    window.localStorage.setItem(storageKeys.name, cleanName);
    emitRoomEvent("room:create", { name: cleanName, clientId }, "create");
  }

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanRoomCode = normalizeRoomInput(roomCode);

    if (!cleanName || !cleanRoomCode) {
      setMessage("Name and room code are required.");
      return;
    }

    window.localStorage.setItem(storageKeys.name, cleanName);
    emitRoomEvent("room:join", { name: cleanName, roomCode: cleanRoomCode, clientId }, "join");
  }

  function selectVote(value: CardValue) {
    if (!room || room.revealed) {
      return;
    }

    emitRoomEvent("vote:select", { roomCode: room.code, clientId, value }, "vote");
  }

  function revealVotes() {
    if (!room) {
      return;
    }

    emitRoomEvent("vote:reveal", { roomCode: room.code, clientId }, "reveal");
  }

  function resetVotes() {
    if (!room) {
      return;
    }

    emitRoomEvent("vote:reset", { roomCode: room.code, clientId }, "reset", () => {
      setEditingStory(false);
    });
  }

  function saveStory() {
    if (!room) {
      return;
    }

    emitRoomEvent("story:update", { roomCode: room.code, clientId, story: storyDraft }, "story", () => {
      setEditingStory(false);
    });
  }

  function leaveRoom() {
    if (!room) {
      return;
    }

    socketRef.current?.emit("room:leave", { roomCode: room.code, clientId });
    setRoom(null);
    setMode("join");
    setRoomCode(room.code);
    setBusy(null);
  }

  async function copyInviteLink() {
    if (!room || typeof window === "undefined") {
      return;
    }

    const inviteUrl = `${window.location.origin}?room=${room.code}`;
    try {
      const copied = await copyText(inviteUrl);
      setMessage(copied ? "Invite link copied." : `Invite link: ${inviteUrl}`);
    } catch {
      setMessage(`Invite link: ${inviteUrl}`);
    }
  }

  if (!room) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center">
          <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
            <section className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-3 py-1 text-sm font-medium text-teal-800 shadow-sm">
                <Sparkles aria-hidden="true" size={16} />
                Live planning room
              </div>
              <h1 className="text-5xl font-semibold leading-[1.05] text-zinc-950 sm:text-6xl">Scrum Poker</h1>
              <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600">
                Fast estimates, hidden votes, clean reveals.
              </p>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
              <div className="mb-5 grid grid-cols-2 rounded-lg bg-zinc-100 p-1">
                <button
                  className={clsx(
                    "rounded-md px-4 py-2.5 text-sm font-semibold transition",
                    mode === "create" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                  )}
                  type="button"
                  onClick={() => setMode("create")}
                >
                  Create
                </button>
                <button
                  className={clsx(
                    "rounded-md px-4 py-2.5 text-sm font-semibold transition",
                    mode === "join" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                  )}
                  type="button"
                  onClick={() => setMode("join")}
                >
                  Join
                </button>
              </div>

              <form className="space-y-4" onSubmit={mode === "create" ? handleCreate : handleJoin}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-800">Name</span>
                  <input
                    className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-4 text-base text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    maxLength={32}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Yuvaraj"
                    value={name}
                  />
                </label>

                {mode === "join" ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-zinc-800">Room code</span>
                    <input
                      className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-4 text-base font-semibold uppercase text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                      maxLength={6}
                      onChange={(event) => setRoomCode(normalizeRoomInput(event.target.value))}
                      placeholder="A1B2C3"
                      value={roomCode}
                    />
                  </label>
                ) : null}

                {message ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                    {message}
                  </div>
                ) : null}

                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 font-semibold text-white shadow-card transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!connected || busy === "create" || busy === "join"}
                  type="submit"
                >
                  {busy === "create" || busy === "join" ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
                  {mode === "create" ? "Create Room" : "Join Room"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-4">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/88 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-500">Scrum Poker</p>
              <h1 className="text-xl font-semibold text-zinc-950">Round {room.round}</h1>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-teal-300 hover:text-teal-800"
              onClick={copyInviteLink}
              title="Copy invite link"
              type="button"
            >
              <Copy aria-hidden="true" size={16} />
              {room.code}
            </button>
            <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-600">
              <Users aria-hidden="true" size={16} />
              {onlineCount}/{room.participants.length}
            </div>
            <div
              className={clsx(
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium",
                connected ? "border-teal-200 bg-teal-50 text-teal-800" : "border-rose-200 bg-rose-50 text-rose-800"
              )}
            >
              {connected ? <Wifi aria-hidden="true" size={16} /> : <WifiOff aria-hidden="true" size={16} />}
              {connected ? "Online" : "Offline"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isModerator ? (
              <>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy === "reveal" || room.revealed}
                  onClick={revealVotes}
                  type="button"
                >
                  {busy === "reveal" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Eye aria-hidden="true" size={16} />}
                  Reveal Votes
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-amber-300 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy === "reset"}
                  onClick={resetVotes}
                  type="button"
                >
                  {busy === "reset" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
                  Reset Voting
                </button>
              </>
            ) : null}
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700"
              onClick={leaveRoom}
              type="button"
            >
              <LogOut aria-hidden="true" size={16} />
              Leave
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-500">Story</p>
                {!editingStory ? <h2 className="mt-1 text-2xl font-semibold text-zinc-950">{room.story.title}</h2> : null}
              </div>

              {isModerator ? (
                editingStory ? (
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busy === "story"}
                      onClick={saveStory}
                      type="button"
                    >
                      {busy === "story" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Save aria-hidden="true" size={16} />}
                      Save
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-rose-300 hover:text-rose-700"
                      onClick={() => {
                        setStoryDraft(room.story);
                        setEditingStory(false);
                      }}
                      type="button"
                    >
                      <X aria-hidden="true" size={16} />
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-teal-300 hover:text-teal-800"
                    onClick={() => setEditingStory(true)}
                    type="button"
                  >
                    <Edit3 aria-hidden="true" size={16} />
                    Edit
                  </button>
                )
              ) : null}
            </div>

            {editingStory ? (
              <div className="space-y-3">
                <input
                  className="h-12 w-full rounded-lg border border-zinc-200 px-4 text-lg font-semibold text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  maxLength={120}
                  onChange={(event) => setStoryDraft((current) => ({ ...current, title: event.target.value }))}
                  value={storyDraft.title}
                />
                <textarea
                  className="min-h-32 w-full resize-y rounded-lg border border-zinc-200 px-4 py-3 text-base leading-7 text-zinc-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  maxLength={500}
                  onChange={(event) => setStoryDraft((current) => ({ ...current, description: event.target.value }))}
                  value={storyDraft.description}
                />
              </div>
            ) : (
              <p className="text-base leading-8 text-zinc-600">{room.story.description}</p>
            )}
          </section>

          {room.revealed && room.results ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-500">Results</p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-950">Average {displayAverage(room.results.average)}</h2>
                </div>

                {room.results.consensus ? (
                  <div className="consensus-spark rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900">
                    🎉 Consensus Achieved
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {room.results.allVotes.map((result) => (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3" key={result.participantId}>
                    <p className="truncate text-sm font-semibold text-zinc-600">{result.name}</p>
                    <p className="mt-2 text-3xl font-semibold text-zinc-950">{result.vote ?? "—"}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-500">Participants</p>
              <h2 className="text-xl font-semibold text-zinc-950">{onlineCount} online</h2>
            </div>
            {everyoneVoted && !room.revealed ? (
              <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">Ready</span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {room.participants.map((participant) => (
              <article
                className={clsx(
                  "rounded-lg border bg-white p-3 shadow-card transition",
                  participant.online ? "border-zinc-200" : "border-zinc-200 opacity-60"
                )}
                key={participant.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-semibold text-zinc-950">{participant.name}</p>
                      {participant.isModerator ? <Crown aria-label="Moderator" className="shrink-0 text-amber-500" size={16} /> : null}
                    </div>
                    <p className={clsx("mt-1 text-sm font-medium", participant.online ? "text-teal-700" : "text-zinc-500")}>
                      {participant.online ? "Online" : "Offline"}
                    </p>
                  </div>
                  <VoteStatus participant={participant} revealed={room.revealed} />
                </div>

                <div className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                  <div className="flip-card aspect-[5/7] h-24" data-revealed={room.revealed ? "true" : "false"}>
                    <div className="flip-card-inner">
                      <div className="flip-card-face card-surface rounded-lg border border-zinc-200 text-3xl font-black text-zinc-800 shadow-sm">
                        ?
                      </div>
                      <div className="flip-card-face flip-card-back rounded-lg border border-zinc-950 bg-zinc-950 text-3xl font-black text-white shadow-sm">
                        {participant.vote ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-500">Vote</p>
                    <p className="mt-1 text-base font-semibold text-zinc-900">
                      {room.revealed ? participant.vote ?? "No vote" : participant.hasVoted ? "Voted" : "Waiting..."}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-5 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-500">Your vote</p>
              <h2 className="text-xl font-semibold text-zinc-950">{room.yourVote ? room.yourVote : "No card selected"}</h2>
            </div>
            {room.revealed ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">Revealed</span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 xl:grid-cols-[repeat(13,minmax(0,1fr))]">
            {CARD_VALUES.map((value) => {
              const selected = room.yourVote === value;
              const numeric = numericCardValue(value);

              return (
                <button
                  className={clsx(
                    "group aspect-[5/7] min-h-20 rounded-lg border bg-white p-1 shadow-sm transition hover:-translate-y-1 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-sm",
                    selected ? "border-teal-500 ring-4 ring-teal-100" : "border-zinc-200 hover:border-teal-300"
                  )}
                  disabled={room.revealed || busy === "vote"}
                  key={value}
                  onClick={() => selectVote(value)}
                  type="button"
                >
                  <span
                    className={clsx(
                      "flex h-full w-full items-center justify-center rounded-md border text-2xl font-black transition sm:text-3xl",
                      selected ? "border-teal-200 bg-teal-50 text-teal-900" : "border-zinc-100 card-surface text-zinc-900"
                    )}
                  >
                    {numeric === null && value === "☕" ? "☕" : value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {message ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-800 shadow-card">
          {message}
        </div>
      ) : null}
    </main>
  );
}

function VoteStatus({ participant, revealed }: { participant: RoomView["participants"][number]; revealed: boolean }) {
  if (revealed) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
        {participant.vote ?? "—"}
      </span>
    );
  }

  if (participant.hasVoted) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
        <Check aria-hidden="true" size={14} />
        Voted
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-500">
      Waiting...
    </span>
  );
}
