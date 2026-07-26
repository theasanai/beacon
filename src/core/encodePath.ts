// Lossy encoding for filesystem-safe keys from workspace paths.
// Shared across paths.ts, hook.ts and fleetStore.ts — if these diverge,
// hook event files and fleet heartbeats stop matching transcript dirs.
export function encodeWorkspacePath(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-')
}
