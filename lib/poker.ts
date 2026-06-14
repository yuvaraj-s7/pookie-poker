export const CARD_VALUES = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "☕"] as const;

export type CardValue = (typeof CARD_VALUES)[number];

export type Story = {
  title: string;
  description: string;
};

export type ParticipantView = {
  id: string;
  name: string;
  online: boolean;
  isModerator: boolean;
  hasVoted: boolean;
  vote: CardValue | null;
};

export type VoteResult = {
  participantId: string;
  name: string;
  vote: CardValue | null;
};

export type ResultsView = {
  allVotes: VoteResult[];
  average: number | null;
  consensus: boolean;
};

export type RoomView = {
  code: string;
  revealed: boolean;
  round: number;
  viewerId: string;
  yourVote: CardValue | null;
  story: Story;
  participants: ParticipantView[];
  results: ResultsView | null;
};

export const DEFAULT_STORY: Story = {
  title: "Implement Authentication",
  description: "Allow users to register, login and reset passwords."
};

export function isCardValue(value: unknown): value is CardValue {
  return typeof value === "string" && CARD_VALUES.includes(value as CardValue);
}

export function numericCardValue(value: CardValue | null | undefined): number | null {
  if (value === null || value === undefined || value === "?" || value === "☕") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
