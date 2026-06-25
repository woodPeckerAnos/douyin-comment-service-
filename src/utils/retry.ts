export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(baseMs: number, jitterMs = 500): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}
