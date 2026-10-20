import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  BettingActionInput,
  RoomHistoryResponse,
  RoomState,
  SettlementPreview,
} from '@chiproom/shared';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface AckResponse {
  ok: boolean;
  error?: string;
  preview?: SettlementPreview;
  history?: RoomHistoryResponse;
  state?: RoomState;
  [key: string]: unknown;
}

export function useRoom(code: string, sessionToken: string | null) {
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>(
    sessionToken ? 'connecting' : 'disconnected',
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!sessionToken) {
      setState(null);
      setConnection('disconnected');
      return;
    }

    setAuthError(null);
    setConnection('connecting');

    const socket = io(import.meta.env.VITE_API_URL as string | undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit(
        'room:subscribe',
        { code, sessionToken },
        (response: AckResponse) => {
          if (!response?.ok) {
            setAuthError(response?.error ?? 'Could not join this room session');
            setConnection('disconnected');
            return;
          }
          if (response.state) setState(response.state);
          setConnection('connected');
        },
      );
    };

    const onConnect = () => {
      setConnection('connecting');
      subscribe();
    };
    const onDisconnect = () => setConnection('disconnected');
    const onState = (next: RoomState) => {
      setState(next);
      setConnection('connected');
    };
    const onRemoved = (payload: { message?: string }) => {
      setAuthError(payload?.message ?? 'You no longer have access to this room');
      setConnection('disconnected');
    };
    const onError = (payload: { message?: string }) => {
      if (payload?.message) toast.error('Action failed', payload.message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('room:removed', onRemoved);
    socket.on('room:error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('room:removed', onRemoved);
      socket.off('room:error', onError);
      socket.disconnect();
      socketRef.current = null;
    };
    // toast functions are stable (memoized in ToastProvider).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, sessionToken]);

  const emitAck = useCallback(
    (event: string, payload: Record<string, unknown>, timeoutMs = 12_000): Promise<AckResponse> => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        return Promise.resolve({ ok: false, error: 'You are offline. Reconnecting…' });
      }
      return new Promise((resolve) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ ok: false, error: 'The server did not respond. Please try again.' });
        }, timeoutMs);
        socket.emit(event, payload, (response: AckResponse) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(response ?? { ok: false, error: 'No response from server' });
        });
      });
    },
    [],
  );

  const run = useCallback(
    async (event: string, payload: Record<string, unknown>, successMessage?: string) => {
      setPending(true);
      const response = await emitAck(event, payload);
      setPending(false);
      if (!response.ok) {
        toast.error('Action failed', response.error ?? 'Please try again');
        return response;
      }
      if (successMessage) toast.success(successMessage);
      return response;
    },
    [emitAck, toast],
  );

  const sendAction = useCallback(
    async (action: Omit<BettingActionInput, 'actionId'>) => {
      const actionId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setPending(true);
      const response = await emitAck('room:action', {
        code,
        action: { ...action, actionId },
      });
      setPending(false);
      if (!response.ok) {
        toast.error('Action not accepted', response.error ?? 'Please try again');
      }
      return response;
    },
    [code, emitAck, toast],
  );

  const fetchHistory = useCallback(async (): Promise<RoomHistoryResponse | null> => {
    if (!sessionToken) return null;
    try {
      return await api.getHistory(code, sessionToken);
    } catch (error) {
      toast.error('Could not load history', error instanceof Error ? error.message : undefined);
      return null;
    }
  }, [code, sessionToken, toast]);

  const refresh = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const next = await api.getState(code, sessionToken);
      setState(next);
      setConnection('connected');
    } catch (error) {
      toast.error('Could not refresh room', error instanceof Error ? error.message : undefined);
    }
  }, [code, sessionToken, toast]);

  return {
    state,
    connection,
    authError,
    pending,
    setAuthError,
    sendAction,
    run,
    fetchHistory,
    refresh,
  };
}
