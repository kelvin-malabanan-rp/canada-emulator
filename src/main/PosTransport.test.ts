import { describe, it, expect, afterEach } from 'vitest';
import net from 'net';
import { PosTransport } from './PosTransport';

interface TestServer {
  server: net.Server;
  port: number;
  received: () => string;
  /** Force-close the server AND any live client sockets (simulate player going away). */
  drop: () => Promise<void>;
}

function listen(port = 0): Promise<TestServer> {
  return new Promise((resolve) => {
    let buf = '';
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('data', (d) => {
        buf += d.toString('utf-8');
      });
    });
    server.listen(port, '127.0.0.1', () => {
      const actualPort = (server.address() as net.AddressInfo).port;
      const drop = (): Promise<void> => {
        for (const s of sockets) s.destroy();
        return new Promise<void>((r) => server.close(() => r()));
      };
      resolve({ server, port: actualPort, received: () => buf, drop });
    });
  });
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let transport: PosTransport | undefined;
const servers: net.Server[] = [];

afterEach(async () => {
  transport?.close();
  transport = undefined;
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  servers.length = 0;
});

describe('PosTransport', () => {
  it('connects to both ports and reports connected status', async () => {
    const vj = await listen();
    const pole = await listen();
    servers.push(vj.server, pole.server);

    transport = new PosTransport({ host: '127.0.0.1', vjPort: vj.port, polePort: pole.port });
    await transport.connect();
    await wait(50);

    expect(transport.status()).toEqual({ vj: 'connected', pole: 'connected' });
  });

  it('sends VJ and pole bytes to the right server byte-for-byte', async () => {
    const vj = await listen();
    const pole = await listen();
    servers.push(vj.server, pole.server);

    transport = new PosTransport({ host: '127.0.0.1', vjPort: vj.port, polePort: pole.port });
    await transport.connect();
    await wait(50);

    transport.send('vj', 'EventId=1001,TerminalNumber=1\r\n');
    transport.send('pole', 'Balance Due    $1.94');
    await wait(50);

    expect(vj.received()).toBe('EventId=1001,TerminalNumber=1\r\n');
    expect(pole.received()).toBe('Balance Due    $1.94');
  });

  it('auto-reconnects after the server drops and comes back', async () => {
    const vj = await listen();
    const pole = await listen();
    servers.push(pole.server);

    transport = new PosTransport({
      host: '127.0.0.1',
      vjPort: vj.port,
      polePort: pole.port,
      reconnectDelayMs: 30,
    });
    await transport.connect();
    await wait(50);
    expect(transport.status().vj).toBe('connected');

    // Drop the VJ server (force-closing the live client socket), then bring a
    // new one up on the same port.
    await vj.drop();
    await wait(60);
    expect(transport.status().vj).not.toBe('connected');

    const vj2 = await listen(vj.port);
    servers.push(vj2.server);
    await wait(150);
    expect(transport.status().vj).toBe('connected');
  });
});
