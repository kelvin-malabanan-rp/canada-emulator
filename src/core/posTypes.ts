/** Shared, browser-safe transport types used by main, preload and renderer. */
import type { PricebookLoadResult } from './pricebook';

export type Channel = 'vj' | 'pole';
export type ConnState = 'connected' | 'connecting' | 'disconnected';
export type Status = Record<Channel, ConnState>;

/** Connection target for the CK Player 2.0 CA adapters. */
export interface PosConfig {
  host: string;
  vjPort: number;
  polePort: number;
}

export const DEFAULT_POS_CONFIG: PosConfig = {
  host: '127.0.0.1',
  vjPort: 5438,
  polePort: 5439,
};

/**
 * Player identity / backend credentials — mirrors CKPlayer2.0's
 * `player.code` / `player.key` settings. Editable at runtime in the emulator
 * (like CKPlayer2.0) and used to resolve items against the LIFT backend.
 */
export interface PlayerConfig {
  playerCode: string;
  playerKey: string;
  backendBaseUrl: string;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  playerCode: '',
  playerKey: '',
  backendBaseUrl: 'https://player.circlekliftdev.com/api/lift/',
};

/** Apply defaults + trim to a partial player config (e.g. from persisted storage). */
export function normalizePlayerConfig(partial: Partial<PlayerConfig> | null | undefined): PlayerConfig {
  const trimmed = (v: string | undefined, fallback: string): string => (v ?? fallback).trim();
  return {
    playerCode: trimmed(partial?.playerCode, DEFAULT_PLAYER_CONFIG.playerCode),
    playerKey: trimmed(partial?.playerKey, DEFAULT_PLAYER_CONFIG.playerKey),
    backendBaseUrl:
      trimmed(partial?.backendBaseUrl, DEFAULT_PLAYER_CONFIG.backendBaseUrl) || DEFAULT_PLAYER_CONFIG.backendBaseUrl,
  };
}

/** The emulator bridge exposed on `window.emulator` by the preload. */
export interface EmulatorBridge {
  connect(config: PosConfig): Promise<Status>;
  disconnect(): Promise<Status>;
  send(channel: Channel, data: string): Promise<boolean>;
  getStatus(): Promise<Status>;
  /** Subscribe to status changes; returns an unsubscribe function. */
  onStatus(cb: (status: Status) => void): () => void;
  /** Load the pricebook matching the player code from a local directory. */
  loadPricebook(req: { dir: string; playerCode: string }): Promise<PricebookLoadResult>;
}
