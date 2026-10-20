import type { AuthResponse } from '@chiproom/shared';

const keyFor = (code: string) => `chiproom.session.${code.toUpperCase()}`;

export interface StoredSession {
  sessionToken: string;
  playerId: string;
  isHost: boolean;
  isSpectator: boolean;
}

export function saveSession(code: string, auth: AuthResponse): StoredSession {
  const session: StoredSession = {
    sessionToken: auth.sessionToken,
    playerId: auth.playerId,
    isHost: auth.isHost,
    isSpectator: auth.isSpectator,
  };
  try {
    localStorage.setItem(keyFor(code), JSON.stringify(session));
  } catch {
    // Storage can be disabled; the in-memory session still works for this tab.
  }
  return session;
}

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(keyFor(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.sessionToken || !parsed.playerId) return null;
    return {
      sessionToken: parsed.sessionToken,
      playerId: parsed.playerId,
      isHost: Boolean(parsed.isHost),
      isSpectator: Boolean(parsed.isSpectator),
    };
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(keyFor(code));
  } catch {
    // ignore
  }
}

export function lastRoomCode(): string | null {
  try {
    return localStorage.getItem('chiproom.lastRoom');
  } catch {
    return null;
  }
}

export function rememberRoom(code: string): void {
  try {
    localStorage.setItem('chiproom.lastRoom', code.toUpperCase());
  } catch {
    // ignore
  }
}
