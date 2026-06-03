/**
 * PosTransport — Electron main-process TCP client to CK Player 2.0's CA
 * adapters. The player listens as a TCP server on the virtual-journal and
 * pole-display ports (default 5438 / 5439); this connects as a client and
 * writes the encoder's bytes. Auto-reconnects when the player restarts.
 *
 * Node-only (uses `net`). Holds NO business logic — it ships bytes.
 */
import net from 'net';

export type Channel = 'vj' | 'pole';
export type ConnState = 'connected' | 'connecting' | 'disconnected';
export type Status = Record<Channel, ConnState>;

export interface PosTransportConfig {
  host: string;
  vjPort: number;
  polePort: number;
  /** Delay before retrying a dropped/failed connection. Default 2000ms. */
  reconnectDelayMs?: number;
}

interface Connection {
  socket: net.Socket | null;
  state: ConnState;
  port: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export class PosTransport {
  private readonly host: string;
  private readonly reconnectDelayMs: number;
  private readonly conns: Record<Channel, Connection>;
  private closed = false;
  private statusListeners: Array<(s: Status) => void> = [];

  constructor(config: PosTransportConfig) {
    this.host = config.host;
    this.reconnectDelayMs = config.reconnectDelayMs ?? 2000;
    this.conns = {
      vj: { socket: null, state: 'disconnected', port: config.vjPort, reconnectTimer: null },
      pole: { socket: null, state: 'disconnected', port: config.polePort, reconnectTimer: null },
    };
  }

  /** Begin connecting both channels. Resolves once both attempts are initiated. */
  async connect(): Promise<void> {
    this.closed = false;
    this.openChannel('vj');
    this.openChannel('pole');
  }

  private openChannel(channel: Channel): void {
    if (this.closed) return;
    const conn = this.conns[channel];
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }

    this.setState(channel, 'connecting');
    const socket = net.connect({ host: this.host, port: conn.port });
    conn.socket = socket;

    socket.on('connect', () => this.setState(channel, 'connected'));
    socket.on('error', () => {
      /* 'close' follows; reconnect is scheduled there */
    });
    socket.on('close', () => {
      conn.socket = null;
      this.setState(channel, 'disconnected');
      this.scheduleReconnect(channel);
    });
  }

  private scheduleReconnect(channel: Channel): void {
    if (this.closed) return;
    const conn = this.conns[channel];
    if (conn.reconnectTimer) return;
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      this.openChannel(channel);
    }, this.reconnectDelayMs);
  }

  /** Write bytes to a channel. No-op (returns false) if not connected. */
  send(channel: Channel, data: string): boolean {
    const conn = this.conns[channel];
    if (conn.socket && conn.state === 'connected') {
      conn.socket.write(data);
      return true;
    }
    return false;
  }

  status(): Status {
    return { vj: this.conns.vj.state, pole: this.conns.pole.state };
  }

  onStatus(listener: (s: Status) => void): void {
    this.statusListeners.push(listener);
  }

  private setState(channel: Channel, state: ConnState): void {
    if (this.conns[channel].state === state) return;
    this.conns[channel].state = state;
    const snapshot = this.status();
    for (const l of this.statusListeners) l(snapshot);
  }

  close(): void {
    this.closed = true;
    for (const channel of ['vj', 'pole'] as Channel[]) {
      const conn = this.conns[channel];
      if (conn.reconnectTimer) {
        clearTimeout(conn.reconnectTimer);
        conn.reconnectTimer = null;
      }
      conn.socket?.destroy();
      conn.socket = null;
      conn.state = 'disconnected';
    }
  }
}
