/**
 * Stops the assistant from reading its system prompt back to the tourist.
 * Any run of WINDOW consecutive words that also appears in the prompt counts as a leak.
 * Text before the match has already streamed (at most WINDOW - 1 words of prompt); everything after is dropped.
 */

const WINDOW = 8;
export const LEAK_NOTICE = " I can't share my instructions, but I'm happy to help with your trip to Daet.";

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}₱]+/gu, " ").trim().split(" ").filter(Boolean);

export function createLeakGuard(systemPrompt: string, emit: (delta: string) => void): (delta: string) => void {
  const shingles = new Set<string>();
  const promptWords = words(systemPrompt);
  for (let i = 0; i + WINDOW <= promptWords.length; i++) shingles.add(promptWords.slice(i, i + WINDOW).join(" "));

  let tail: string[] = [];
  let tripped = false;
  return (delta) => {
    if (tripped) return;
    const next = [...tail, ...words(delta)];
    for (let i = 0; i + WINDOW <= next.length; i++) {
      if (shingles.has(next.slice(i, i + WINDOW).join(" "))) {
        tripped = true;
        emit(LEAK_NOTICE);
        return;
      }
    }
    tail = next.slice(-(WINDOW - 1));
    emit(delta);
  };
}
