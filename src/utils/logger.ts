export function logProgress(message: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ${message}`);
}
