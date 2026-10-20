import type {
  RoomHistoryResponse,
  RoomState,
  SettlementPreview,
} from '@chiproom/shared';

/** Shape returned by the socket acknowledgement helpers in useRoom. */
export interface RoomActionResult {
  ok: boolean;
  error?: string;
  preview?: SettlementPreview;
  history?: RoomHistoryResponse;
  state?: RoomState;
  [key: string]: unknown;
}

export type RunAction = (
  event: string,
  payload: Record<string, unknown>,
  successMessage?: string,
) => Promise<RoomActionResult>;
