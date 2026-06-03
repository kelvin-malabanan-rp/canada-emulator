import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RegisterSession, type WireMessage, type SessionSnapshot, type TenderKind } from '../../core/RegisterSession';
import {
  DEFAULT_POS_CONFIG,
  DEFAULT_PLAYER_CONFIG,
  normalizePlayerConfig,
  type PosConfig,
  type PlayerConfig,
  type Status,
} from '../../core/posTypes';
import type { PosLocale } from '../../core/currency';

export interface LogEntry {
  id: number;
  channel: WireMessage['channel'];
  text: string;
  at: string;
}

export interface PricebookItem {
  code: string;
  description: string;
  priceCents: number;
}

/** A small CAD pricebook for the quick-key grid. */
export const PRICEBOOK: PricebookItem[] = [
  { code: '049000000443', description: 'Coke 20oz', priceCents: 229 },
  { code: '012000001291', description: 'Lays Chips', priceCents: 319 },
  { code: '060410000016', description: 'Cafe Moyen', priceCents: 194 },
  { code: '067000001234', description: 'Beignet', priceCents: 159 },
  { code: '628700001111', description: 'Eau 500ml', priceCents: 199 },
  { code: '063500001019', description: 'Barre Choc', priceCents: 249 },
];

const idleStatus: Status = { vj: 'disconnected', pole: 'disconnected' };
const PLAYER_CFG_KEY = 'r6ca.playerConfig';

export function useEmulator(): {
  snapshot: SessionSnapshot;
  status: Status;
  config: PosConfig;
  setConfig: (c: PosConfig) => void;
  playerConfig: PlayerConfig;
  setPlayerConfig: (c: PlayerConfig) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  log: LogEntry[];
  clearLog: () => void;
  setLocale: (l: PosLocale) => void;
  addItem: (item: PricebookItem) => void;
  addCustom: (input: { code: string; description: string; priceCents: number; quantity: number }) => void;
  scan: (code: string) => void;
  voidLine: (lineNumber: number) => void;
  setQuantity: (lineNumber: number, qty: number) => void;
  setPrice: (lineNumber: number, priceCents: number) => void;
  loyalty: (cardNumber: string) => void;
  tender: (kind: TenderKind, amountCents?: number) => void;
  voidTicket: () => void;
} {
  const sessionRef = useRef<RegisterSession>(null as unknown as RegisterSession);
  if (sessionRef.current === null) sessionRef.current = new RegisterSession();
  const session = sessionRef.current;

  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.snapshot());
  const [status, setStatus] = useState<Status>(idleStatus);
  const [config, setConfig] = useState<PosConfig>(DEFAULT_POS_CONFIG);
  const [playerConfig, setPlayerConfigState] = useState<PlayerConfig>(() => {
    try {
      return normalizePlayerConfig(JSON.parse(localStorage.getItem(PLAYER_CFG_KEY) ?? 'null'));
    } catch {
      return DEFAULT_PLAYER_CONFIG;
    }
  });
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);

  const setPlayerConfig = useCallback((c: PlayerConfig) => {
    const normalized = normalizePlayerConfig(c);
    setPlayerConfigState(normalized);
    try {
      localStorage.setItem(PLAYER_CFG_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, []);

  useEffect(() => {
    const unsub = window.emulator.onStatus(setStatus);
    void window.emulator.getStatus().then(setStatus);
    return unsub;
  }, []);

  const dispatch = useCallback(
    (messages: WireMessage[]) => {
      const entries: LogEntry[] = [];
      for (const m of messages) {
        void window.emulator.send(m.channel, m.data);
        entries.push({
          id: logId.current++,
          channel: m.channel,
          text: m.data.replace(/\r\n$/, ''),
          at: new Date().toLocaleTimeString(),
        });
      }
      setLog((prev) => [...entries.reverse(), ...prev].slice(0, 300));
      setSnapshot(session.snapshot());
    },
    [session],
  );

  const connect = useCallback(async () => {
    const s = await window.emulator.connect(config);
    setStatus(s);
  }, [config]);

  const disconnect = useCallback(async () => {
    const s = await window.emulator.disconnect();
    setStatus(s);
  }, []);

  const setLocale = useCallback(
    (l: PosLocale) => {
      session.setLocale(l);
      setSnapshot(session.snapshot());
    },
    [session],
  );

  return useMemo(
    () => ({
      snapshot,
      status,
      config,
      setConfig,
      playerConfig,
      setPlayerConfig,
      connect,
      disconnect,
      log,
      clearLog: () => setLog([]),
      setLocale,
      addItem: (item: PricebookItem) => dispatch(session.addItem(item)),
      addCustom: (input: { code: string; description: string; priceCents: number; quantity: number }) =>
        dispatch(session.addItem(input)),
      scan: (code: string) => {
        const known = PRICEBOOK.find((p) => p.code === code);
        dispatch(session.addItem(known ?? { code, description: `UPC ${code}`, priceCents: 100 }));
      },
      voidLine: (lineNumber: number) => dispatch(session.voidLine(lineNumber)),
      setQuantity: (lineNumber: number, qty: number) => dispatch(session.setQuantity(lineNumber, qty)),
      setPrice: (lineNumber: number, priceCents: number) => dispatch(session.setPrice(lineNumber, priceCents)),
      loyalty: (cardNumber: string) => dispatch(session.loyalty(cardNumber)),
      tender: (kind: TenderKind, amountCents?: number) => dispatch(session.tender(kind, amountCents)),
      voidTicket: () => dispatch(session.voidTicket()),
    }),
    [snapshot, status, config, playerConfig, setPlayerConfig, log, connect, disconnect, dispatch, setLocale, session],
  );
}
