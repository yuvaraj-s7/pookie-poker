"use client";

import clsx from "clsx";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronUp,
  CircleDot,
  Copy,
  Crown,
  Eye,
  GitBranch,
  Layers3,
  Loader2,
  LogOut,
  Menu,
  Moon,
  QrCode,
  RotateCcw,
  Search,
  Share2,
  Shield,
  Sparkles,
  Sun,
  UserX,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { io, type Socket } from "socket.io-client";
import { CARD_VALUES, numericCardValue, type CardValue, type RoomView } from "../lib/poker";

type Mode = "create" | "join";
type BusyAction = "create" | "join" | "vote" | "reveal" | "reset" | "leave" | "kick" | null;
type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
const VISIBLE_CARD_VALUES = CARD_VALUES;
const ESTIMATE_VALUES = VISIBLE_CARD_VALUES.filter((value) => numericCardValue(value) !== null);

const storageKeys = {
  clientId: "scrum-poker-client-id",
  name: "scrum-poker-name",
  theme: "scrum-poker-theme"
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
  const [darkMode, setDarkMode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [copiedInvite, setCopiedInvite] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    const id = getOrCreateClientId();
    const savedName = window.localStorage.getItem(storageKeys.name) ?? "";
    const inviteRoom = normalizeRoomInput(new URLSearchParams(window.location.search).get("room") ?? "");
    const savedTheme = window.localStorage.getItem(storageKeys.theme);
    const useDarkMode = savedTheme ? savedTheme === "dark" : true;

    setClientId(id);
    setName(savedName);
    setRoomCode(inviteRoom);
    setMode(inviteRoom ? "join" : "create");
    setDarkMode(useDarkMode);
    document.documentElement.classList.toggle("dark", useDarkMode);
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

    socket.on("room:kicked", () => {
      setRoom(null);
      setMode("join");
      setMessage("You were removed from the room by the moderator.");
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

  const currentParticipant = useMemo(
    () => room?.participants.find((participant) => participant.id === room.viewerId) ?? null,
    [room]
  );
  const isModerator = Boolean(currentParticipant?.isModerator);
  const onlineCount = room?.participants.filter((participant) => participant.online).length ?? 0;
  const votedCount = room?.participants.filter((participant) => participant.hasVoted).length ?? 0;
  const totalParticipants = room?.participants.length ?? 0;
  const voteProgress = totalParticipants > 0 ? Math.round((votedCount / totalParticipants) * 100) : 0;
  const everyoneVoted = room ? totalParticipants > 0 && votedCount === totalParticipants : false;
  const inviteUrl = typeof window !== "undefined" && room ? `${window.location.origin}?room=${room.code}` : "";
  const voteDistribution = useMemo(() => {
    if (!room?.revealed || !room.results) {
      return ESTIMATE_VALUES.map((value) => ({ value, count: 0 }));
    }

    return ESTIMATE_VALUES.map((value) => ({
      value,
      count: room.results!.allVotes.filter((result) => result.vote === value).length
    }));
  }, [room]);
  const maxVoteCount = Math.max(1, ...voteDistribution.map((result) => result.count));
  const revealedNumericVotes = useMemo(() => {
    if (!room?.revealed || !room.results) {
      return [];
    }

    return room.results.allVotes
      .map((result) => numericCardValue(result.vote))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
  }, [room]);
  const medianVote =
    revealedNumericVotes.length === 0
      ? null
      : revealedNumericVotes.length % 2 === 1
        ? revealedNumericVotes[Math.floor(revealedNumericVotes.length / 2)]
        : (revealedNumericVotes[revealedNumericVotes.length / 2 - 1] + revealedNumericVotes[revealedNumericVotes.length / 2]) / 2;
  const highestVote = revealedNumericVotes.at(-1) ?? null;
  const lowestVote = revealedNumericVotes[0] ?? null;
  const consensusPercent =
    room?.revealed && room.results && room.results.allVotes.length > 0
      ? Math.round((Math.max(...voteDistribution.map((result) => result.count), 0) / room.results.allVotes.length) * 100)
      : 0;
  const roomState = !connected ? "Disconnected" : room?.revealed ? (room.results?.consensus ? "Consensus achieved" : "Revealed") : votedCount > 0 ? "Voting" : "Waiting";
  const filteredParticipants =
    room?.participants.filter((participant) => participant.name.toLowerCase().includes(participantSearch.trim().toLowerCase())) ?? [];

  function toggleTheme() {
    const nextDarkMode = !darkMode;
    setDarkMode(nextDarkMode);
    document.documentElement.classList.toggle("dark", nextDarkMode);
    window.localStorage.setItem(storageKeys.theme, nextDarkMode ? "dark" : "light");
  }

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

  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const columns = window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 4 : 7;
    const keyOffset: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns
    };
    const offset = keyOffset[event.key];

    if (offset === undefined) {
      return;
    }

    event.preventDefault();
    const nextIndex = Math.min(Math.max(index + offset, 0), VISIBLE_CARD_VALUES.length - 1);
    document.querySelector<HTMLButtonElement>(`[data-vote-card-index="${nextIndex}"]`)?.focus();
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

    emitRoomEvent("vote:reset", { roomCode: room.code, clientId }, "reset");
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

    try {
      const copied = await copyText(inviteUrl);
      setCopiedInvite(copied ? "link" : null);
      setMessage(copied ? "Invite link copied." : `Invite link: ${inviteUrl}`);
    } catch {
      setCopiedInvite(null);
      setMessage(`Invite link: ${inviteUrl}`);
    }
  }

  async function copyRoomCode() {
    if (!room) {
      return;
    }

    try {
      const copied = await copyText(room.code);
      setCopiedInvite(copied ? "code" : null);
      setMessage(copied ? "Room code copied." : `Room code: ${room.code}`);
    } catch {
      setCopiedInvite(null);
      setMessage(`Room code: ${room.code}`);
    }
  }

  function openShareModal() {
    setCopiedInvite(null);
    setShareOpen(true);
    setNavOpen(false);
  }

  function kickParticipant(targetId: string) {
    if (!room) {
      return;
    }

    emitRoomEvent("participant:kick", { roomCode: room.code, clientId, targetId }, "kick", () => {
      setMessage("Participant removed.");
    });
  }

  const themeButton = (
    <button
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 shadow-sm transition hover:border-teal-300/50 hover:bg-teal-300/10 hover:text-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-300/60"
      onClick={toggleTheme}
      title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      {darkMode ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    </button>
  );

  if (!room) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <div className="fixed right-4 top-4 z-20">{themeButton}</div>
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
    <main className="min-h-screen bg-[#0B0F13] pb-28 text-slate-100 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0B0F13]/88 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1500px] grid-cols-[1fr_auto] items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#24D6C5] text-[#071112] shadow-[0_0_32px_rgba(36,214,197,.28)]">
              <Layers3 aria-hidden="true" size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">Scrum Poker</h1>
              <p className="hidden text-xs font-medium text-slate-400 sm:block">Planning Room</p>
            </div>
          </div>

          <div className="hidden min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-center shadow-2xl shadow-black/20 lg:block">
            <p className="truncate text-sm font-semibold text-slate-100">Room {room.code}</p>
            <p className="text-xs text-slate-400">Sprint 24 · Story SP-{room.round.toString().padStart(3, "0")} · Round {room.round}</p>
          </div>

          <div className="hidden items-center justify-end gap-2 md:flex">
            <StatusPill connected={connected} />
            <button className="premium-icon-button" onClick={openShareModal} type="button" title="Share room">
              <Share2 aria-hidden="true" size={18} />
            </button>
            {themeButton}
            <button className="premium-button premium-button-ghost" onClick={leaveRoom} type="button">
              <LogOut aria-hidden="true" size={16} />
              Leave
            </button>
          </div>

          <button className="premium-icon-button md:hidden" onClick={() => setNavOpen((current) => !current)} title="Open menu" type="button">
            {navOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          </button>
        </div>

        {navOpen ? (
          <div className="mx-auto mt-3 grid max-w-[1500px] gap-2 border-t border-white/[0.08] pt-3 md:hidden">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <p className="text-sm font-semibold text-slate-50">Room {room.code}</p>
              <p className="text-xs text-slate-400">Sprint 24 · Story SP-{room.round.toString().padStart(3, "0")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="premium-button premium-button-primary" onClick={openShareModal} type="button">
                <Share2 aria-hidden="true" size={16} />
                Share
              </button>
              <button className="premium-button premium-button-ghost" onClick={toggleTheme} type="button">
                {darkMode ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
                Theme
              </button>
              <button className="premium-button premium-button-ghost" onClick={leaveRoom} type="button">
                <LogOut aria-hidden="true" size={16} />
                Leave
              </button>
            </div>
            <StatusPill connected={connected} />
          </div>
        ) : null}
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.8fr)_360px] lg:px-8">
        <section className="premium-panel lg:col-span-3">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge tone="accent">Priority High</Badge>
                <Badge>Sprint 24</Badge>
                <Badge>Linear · ENG-128</Badge>
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Current Story</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{room.story.title || "No story selected"}</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                {room.story.description || "Choose a story to start estimation with your team."}
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-3 sm:min-w-80">
              <MiniMetric icon={<Activity size={16} />} label="Complexity" value="Medium" />
              <MiniMetric icon={<GitBranch size={16} />} label="History" value="5 · 8 · 8" />
              <MiniMetric icon={<Shield size={16} />} label="Criteria" value="3/5" />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {["User can join using a room code", "Votes stay hidden until reveal", "Invite link and QR remain copyable"].map((item) => (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4" key={item}>
                <Check aria-hidden="true" className="mb-3 text-[#24D6C5]" size={18} />
                <p className="text-sm leading-6 text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-panel">
          <PanelHeader icon={<BarChart3 size={18} />} title="Consensus" meta={roomState} />
          <div className="mt-6 flex flex-col items-center text-center">
            <div className="relative flex h-32 w-32 items-center justify-center rounded-[2rem] border border-[#24D6C5]/30 bg-[#24D6C5]/10 shadow-[0_0_60px_rgba(36,214,197,.18)]">
              <span className="text-5xl font-semibold text-slate-50">{room.revealed && room.results ? displayAverage(room.results.average) : "?"}</span>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              {votedCount} of {totalParticipants} voted · {voteProgress}% complete
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-[#24D6C5] transition-all duration-300" style={{ width: `${voteProgress}%` }} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniMetric label="Median" value={medianVote === null ? "—" : displayAverage(medianVote)} />
            <MiniMetric label="Consensus" value={`${consensusPercent}%`} />
            <MiniMetric label="Highest" value={highestVote === null ? "—" : String(highestVote)} />
            <MiniMetric label="Lowest" value={lowestVote === null ? "—" : String(lowestVote)} />
          </div>

          <div className="mt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Vote Distribution</p>
            <div className="flex h-32 items-end gap-2">
              {voteDistribution.map((result) => {
                const averageMatch = room.revealed && numericCardValue(result.value) === room.results?.average;
                const barHeight = room.revealed ? Math.max(10, (result.count / maxVoteCount) * 96) : 10;

                return (
                  <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={result.value}>
                    <div
                      className={clsx(
                        "w-full rounded-t-xl transition-all duration-300",
                        averageMatch ? "bg-[#24D6C5] shadow-[0_0_24px_rgba(36,214,197,.45)]" : result.count > 0 ? "bg-slate-400" : "bg-white/[0.08]"
                      )}
                      style={{ height: `${barHeight}px` }}
                    />
                    <span className="text-[11px] font-medium text-slate-500">{result.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="premium-panel">
          <PanelHeader icon={<CircleDot size={18} />} title="Story Details" meta="ENG-128" />
          <div className="mt-5 space-y-4">
            <DetailRow label="Linked issue" value="Linear · ENG-128" />
            <DetailRow label="Priority" value="High" />
            <DetailRow label="Sprint" value="Sprint 24" />
            <DetailRow label="Estimate range" value="5–13 pts" />
            <DetailRow label="Progress" value={`${voteProgress}% voted`} />
          </div>
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Empty State Ready</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">When no story is selected, this panel becomes a polished issue picker empty state.</p>
          </div>
        </section>

        <aside className="premium-panel hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-hidden">
          <PanelHeader icon={<Crown size={18} />} title="Participants" meta={`${votedCount} of ${totalParticipants} voted`} />
          <ParticipantSearch value={participantSearch} onChange={setParticipantSearch} />
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {filteredParticipants.length === 0 ? <EmptyPanel title="No participants found" /> : null}
            {filteredParticipants.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                revealed={room.revealed}
                isModerator={isModerator}
                busy={busy}
                onKick={kickParticipant}
              />
            ))}
          </div>
        </aside>
      </div>

      <section className="mx-auto max-w-[1500px] px-4 pb-5 sm:px-6 lg:px-8">
        <div className="premium-panel">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <PanelHeader icon={<Sparkles size={18} />} title="Choose Estimate" meta={`Selected: ${room.yourVote ?? "none"}`} />
            <button className="premium-button premium-button-ghost lg:hidden" onClick={() => setParticipantsOpen(true)} type="button">
              <ChevronUp aria-hidden="true" size={16} />
              Participants
            </button>
          </div>

          <div className="premium-card-scroll grid auto-cols-[78px] grid-flow-col gap-3 overflow-x-auto pb-3 snap-x snap-mandatory sm:grid-flow-row sm:grid-cols-4 md:grid-cols-7 xl:grid-cols-[repeat(13,minmax(0,1fr))]">
            {VISIBLE_CARD_VALUES.map((value, index) => {
              const selected = room.yourVote === value;
              const numeric = numericCardValue(value);

              return (
                <button
                  aria-pressed={selected}
                  className={clsx("premium-vote-card snap-center", selected && "premium-vote-card-selected")}
                  data-vote-card-index={index}
                  disabled={room.revealed || busy === "vote"}
                  key={value}
                  onClick={() => selectVote(value)}
                  onKeyDown={(event) => handleCardKeyDown(event, index)}
                  type="button"
                >
                  {selected ? <Check aria-hidden="true" className="absolute right-3 top-3 text-[#24D6C5]" size={18} /> : null}
                  <span>{numeric === null && value === "☕" ? "☕" : value}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto hidden max-w-[1500px] px-4 pb-8 sm:px-6 md:block lg:px-8">
        <div className="premium-panel flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Action Bar</p>
            <p className="text-xs text-slate-500">Moderator actions appear when available.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="premium-button premium-button-primary" disabled={!isModerator || busy === "reveal" || room.revealed} onClick={revealVotes} type="button">
              {busy === "reveal" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Eye aria-hidden="true" size={16} />}
              Reveal Votes
            </button>
            <button className="premium-button premium-button-secondary" disabled={!isModerator || busy === "reset"} onClick={resetVotes} type="button">
              {busy === "reset" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
              Reset Voting
            </button>
            <button className="premium-button premium-button-ghost" onClick={copyInviteLink} type="button">
              <Copy aria-hidden="true" size={16} />
              Copy Invite
            </button>
            <button className="premium-button premium-button-ghost" disabled type="button">
              <ArrowRight aria-hidden="true" size={16} />
              Next Story
            </button>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#0B0F13]/92 p-3 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button className="premium-button premium-button-primary" disabled={!isModerator || busy === "reveal" || room.revealed} onClick={revealVotes} type="button">
            <Eye aria-hidden="true" size={16} />
            Reveal
          </button>
          <button className="premium-button premium-button-secondary" disabled={!isModerator || busy === "reset"} onClick={resetVotes} type="button">
            <RotateCcw aria-hidden="true" size={16} />
            Reset
          </button>
          <button className="premium-button premium-button-ghost" onClick={openShareModal} type="button">
            <Share2 aria-hidden="true" size={16} />
            Share
          </button>
        </div>
      </div>

      {participantsOpen ? (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setParticipantsOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-[28px] border border-white/[0.08] bg-[#12161C] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
            <PanelHeader icon={<Crown size={18} />} title="Participants" meta={`${votedCount} of ${totalParticipants} voted`} />
            <ParticipantSearch value={participantSearch} onChange={setParticipantSearch} />
            <div className="mt-4 max-h-[56vh] space-y-2 overflow-y-auto pb-3">
              {filteredParticipants.length === 0 ? <EmptyPanel title="No participants found" /> : null}
              {filteredParticipants.map((participant) => (
                <ParticipantRow
                  key={participant.id}
                  participant={participant}
                  revealed={room.revealed}
                  isModerator={isModerator}
                  busy={busy}
                  onKick={kickParticipant}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {shareOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-room-title"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] border border-white/[0.08] bg-[#12161C] p-5 shadow-2xl shadow-black/50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-50" id="share-room-title">
                Invite Team
              </h2>
              <button
                className="premium-icon-button h-9 w-9"
                onClick={() => setShareOpen(false)}
                title="Close invite dialog"
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>

            <div className="mx-auto mb-4 flex w-36 justify-center rounded-3xl border border-white/[0.08] bg-white p-3 shadow-[0_0_48px_rgba(36,214,197,.12)]">
              {inviteUrl ? <QRCodeSVG bgColor="#ffffff" fgColor="#18181b" level="M" marginSize={2} size={104} value={inviteUrl} /> : null}
            </div>

            <button
              className="mb-3 flex min-h-16 w-full items-center justify-between rounded-2xl border border-[#24D6C5]/20 bg-[#24D6C5]/10 px-4 py-3 text-left transition hover:bg-[#24D6C5]/15 focus:outline-none focus:ring-2 focus:ring-[#24D6C5]/60"
              onClick={copyRoomCode}
              type="button"
            >
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[#8FF7ED]">Room code</span>
                <span className="mt-1 block text-sm font-black uppercase text-slate-50">{room.code}</span>
              </span>
              {copiedInvite === "code" ? <Check aria-hidden="true" className="text-[#24D6C5]" size={18} /> : <Copy aria-hidden="true" className="text-[#24D6C5]" size={18} />}
            </button>

            <button
              className="premium-button premium-button-primary w-full"
              onClick={copyInviteLink}
              type="button"
            >
              {copiedInvite === "link" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
              {copiedInvite === "link" ? "Copied Invite Link" : "Copy Invite Link"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-800 shadow-card">
          {message}
        </div>
      ) : null}
    </main>
  );
}

function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" }) {
  return (
    <span
      className={clsx(
        "inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold",
        tone === "accent" ? "border-[#24D6C5]/30 bg-[#24D6C5]/10 text-[#8FF7ED]" : "border-white/[0.08] bg-white/[0.04] text-slate-300"
      )}
    >
      {children}
    </span>
  );
}

function PanelHeader({ icon, title, meta }: { icon: ReactNode; title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[#24D6C5]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-50">{title}</h2>
          {meta ? <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p> : null}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center gap-2 text-[#24D6C5]">{icon}</div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="truncate text-sm font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.025] p-6 text-center">
      <Sparkles aria-hidden="true" className="mx-auto mb-3 text-slate-500" size={24} />
      <p className="text-sm font-medium text-slate-400">{title}</p>
    </div>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold",
        connected ? "border-[#24D6C5]/25 bg-[#24D6C5]/10 text-[#8FF7ED]" : "border-rose-400/25 bg-rose-400/10 text-rose-200"
      )}
    >
      {connected ? <Wifi aria-hidden="true" size={16} /> : <WifiOff aria-hidden="true" size={16} />}
      {connected ? "Online" : "Disconnected"}
    </div>
  );
}

function ParticipantSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 text-slate-400">
      <Search aria-hidden="true" size={16} />
      <input
        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search participants"
        value={value}
      />
    </label>
  );
}

function ParticipantRow({
  participant,
  revealed,
  isModerator,
  busy,
  onKick
}: {
  participant: RoomView["participants"][number];
  revealed: boolean;
  isModerator: boolean;
  busy: BusyAction;
  onKick: (id: string) => void;
}) {
  return (
    <article className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 transition duration-200 hover:border-[#24D6C5]/25 hover:bg-white/[0.06]">
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#24D6C5] to-cyan-300 text-sm font-bold text-[#071112]">
        {participant.name.trim().charAt(0) || "?"}
        <span className={clsx("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#12161C]", participant.online ? "bg-[#24D6C5]" : "bg-slate-600")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-100">{participant.name}</p>
          {participant.isModerator ? <Badge tone="accent">Host</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">{participant.online ? "Developer" : "Offline"} · {participant.hasVoted ? "Vote submitted" : "Waiting"}</p>
      </div>
      <VoteStatus participant={participant} revealed={revealed} />
      {isModerator && !participant.isModerator ? (
        <button
          className="premium-icon-button h-9 w-9 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          disabled={busy === "kick"}
          onClick={() => onKick(participant.id)}
          title={`Kick ${participant.name}`}
          type="button"
        >
          <UserX aria-hidden="true" size={15} />
        </button>
      ) : null}
    </article>
  );
}

function VoteStatus({ participant, revealed }: { participant: RoomView["participants"][number]; revealed: boolean }) {
  if (revealed) {
    return (
      <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs font-semibold text-slate-200">
        {participant.vote ?? "—"}
      </span>
    );
  }

  if (participant.hasVoted) {
    return (
      <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border border-[#24D6C5]/25 bg-[#24D6C5]/10 px-2.5 text-xs font-semibold text-[#8FF7ED]">
        <Check aria-hidden="true" size={14} />
        Voted
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 text-xs font-semibold text-slate-500">
      Waiting...
    </span>
  );
}
