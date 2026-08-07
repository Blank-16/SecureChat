export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface StrengthResult {
  score: StrengthLevel;
  label: string;
}

const LABELS: Record<StrengthLevel, string> = {
  0: "Very weak",
  1: "Weak",
  2: "Fair",
  3: "Strong",
  4: "Very strong",
};

// Lightweight entropy heuristic — no external dependency. Scores 0-4
// based on length and character-class diversity. This is intentionally
// conservative: it favors length over cleverness, since the passphrase
// is the sole protection on the PBKDF2-wrapped private key material.
export function scorePassphrase(passphrase: string): StrengthResult {
  if (passphrase.length === 0) return { score: 0, label: LABELS[0] };

  let classes = 0;
  if (/[a-z]/.test(passphrase)) classes += 1;
  if (/[A-Z]/.test(passphrase)) classes += 1;
  if (/[0-9]/.test(passphrase)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(passphrase)) classes += 1;

  const uniqueChars = new Set(passphrase).size;
  const lengthScore =
    passphrase.length >= 20 ? 3 :
    passphrase.length >= 14 ? 2 :
    passphrase.length >= 8 ? 1 : 0;

  const diversityScore = classes >= 3 ? 1 : 0;
  const repetitionPenalty = uniqueChars < passphrase.length / 3 ? 1 : 0;

  const raw = lengthScore + diversityScore - repetitionPenalty;
  const score = Math.max(0, Math.min(4, raw)) as StrengthLevel;

  return { score, label: LABELS[score] };
}

export const MIN_ACCEPTABLE_SCORE: StrengthLevel = 2;
