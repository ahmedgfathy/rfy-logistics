const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(size: number): string {
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return out;
}

/** e.g. MSQ-2026-7KQ4 */
export function quoteReference(): string {
  return `MSQ-${new Date().getFullYear()}-${randomChunk(4)}`;
}

/** e.g. MSJ-2026-9PLA */
export function applicationReference(): string {
  return `MSJ-${new Date().getFullYear()}-${randomChunk(4)}`;
}
