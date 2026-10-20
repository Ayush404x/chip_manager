import type {
  AuthResponse,
  CreateRoomInput,
  JoinRoomInput,
  RoomHistoryResponse,
  RoomPreview,
  RoomState,
} from '@chiproom/shared';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('Cannot reach the ChipRoom server. Check your connection.', 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      (body as { error?: string } | null)?.error ?? `Request failed (${response.status})`,
      response.status,
      (body as { code?: string } | null)?.code,
    );
  }
  return body as T;
}

export const api = {
  createRoom(input: CreateRoomInput): Promise<AuthResponse> {
    return request('/api/rooms', { method: 'POST', body: JSON.stringify(input) });
  },
  joinRoom(code: string, input: JoinRoomInput): Promise<AuthResponse> {
    return request(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  getPreview(code: string): Promise<RoomPreview> {
    return request(`/api/rooms/${encodeURIComponent(code)}`);
  },
  getState(code: string, token: string): Promise<RoomState> {
    return request(`/api/rooms/${encodeURIComponent(code)}/state`, {
      headers: { 'x-session-token': token },
    });
  },
  getHistory(code: string, token: string): Promise<RoomHistoryResponse> {
    return request(`/api/rooms/${encodeURIComponent(code)}/history`, {
      headers: { 'x-session-token': token },
    });
  },
};
