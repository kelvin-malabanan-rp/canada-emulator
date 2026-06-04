import { useEffect, useMemo, useRef, useState } from 'react';
import { useEmulator } from './useEmulator';
import { formatCurrency, type PosLocale } from '../../core/currency';
import { paginate } from '../../core/quickkeys';
import { REGISTER_TYPES, portsForRegisterType, type ConnState, type RegisterType } from '../../core/posTypes';
import './App.css';

const QK_COLS = 3;
const QK_ROW_STRIDE = 72; // key height (64) + grid gap (8)

function Dot({ state }: { state: ConnState }): JSX.Element {
  const color = state === 'connected' ? '#3ec46d' : state === 'connecting' ? '#e6b450' : '#d9534f';
  return <span className="dot" style={{ background: color }} title={state} />;
}

/** Quick keys driven by .qk files: 3-wide grid that fills the column, paginated, colored. */
function QuickKeys({ e, locale }: { e: ReturnType<typeof useEmulator>; locale: PosLocale }): JSX.Element {
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(9);
  const gridRef = useRef<HTMLDivElement>(null);
  const files = e.quickKeyFiles;
  const active = files[Math.min(tab, Math.max(0, files.length - 1))];
  const pages = useMemo(() => paginate(active?.entries ?? [], perPage), [active, perPage]);
  const safePage = Math.min(page, pages.length - 1);
  const current = pages[safePage] ?? [];

  useEffect(() => setPage(0), [tab]);

  // Fill the available column height: compute how many 3-wide rows fit. Re-runs
  // when the grid mounts (quick keys load async, so the grid isn't in the DOM on
  // first render) and whenever the active file changes.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const recompute = (): void => {
      const rows = Math.max(1, Math.floor((el.clientHeight + 8) / QK_ROW_STRIDE));
      setPerPage(rows * QK_COLS);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return (
    <div className="qk">
      {files.length > 1 && (
        <div className="qktabs">
          {files.map((f, i) => (
            <button key={f.file} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
              {f.file.replace(/\.qk$/i, '')}
            </button>
          ))}
        </div>
      )}
      <div className="grid qk3" ref={gridRef}>
        {current.map((entry, i) => (
          <button
            key={`${entry.upc}-${i}`}
            className={`key ${e.quickKeyColorFor(entry.upc)}`}
            title={entry.upc}
            onClick={() => e.fireQuickKey(entry)}
          >
            <span>{entry.description}</span>
            <small>{formatCurrency(entry.priceCents, locale)}</small>
          </button>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="qkpager">
          <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            ‹
          </button>
          <span>
            {safePage + 1}/{pages.length}
          </span>
          <button disabled={safePage >= pages.length - 1} onClick={() => setPage(safePage + 1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function App(): JSX.Element {
  const e = useEmulator();
  const { snapshot } = e;
  const locale = snapshot.locale;
  const [scanCode, setScanCode] = useState('');
  const [card, setCard] = useState('8018782603800034999992');

  return (
    <div className="app">
      <header className="bar">
        <strong>Canada Emulator</strong>
        <span className="conn">
          <Dot state={e.status.vj} /> VJ {e.config.host}:{e.config.vjPort}
          <Dot state={e.status.pole} /> Pole {e.config.host}:{e.config.polePort}
        </span>
        <input
          className="host"
          value={e.config.host}
          onChange={(ev) => e.setConfig({ ...e.config, host: ev.target.value })}
        />
        <select
          className="regtype"
          value={e.config.registerType}
          title="Register type — sets the VJ/pole ports automatically"
          onChange={(ev) => {
            const registerType = ev.target.value as RegisterType;
            e.setConfig({ ...e.config, registerType, ...portsForRegisterType(registerType) });
          }}
        >
          {REGISTER_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label} (VJ {r.vjPort} / Pole {r.polePort})
            </option>
          ))}
        </select>
        <button onClick={() => void e.connect()}>Connect</button>
        <button onClick={() => void e.disconnect()}>Disconnect</button>
        <span className="spacer" />
        <div className="locale">
          <button className={locale === 'en' ? 'on' : ''} onClick={() => e.setLocale('en')}>EN-CA</button>
          <button className={locale === 'fr' ? 'on' : ''} onClick={() => e.setLocale('fr')}>FR-CA</button>
        </div>
      </header>

      <header className="bar creds">
        <span className="lbl">Player Code</span>
        <input
          className="host"
          value={e.playerConfig.playerCode}
          placeholder="e.g. 31989"
          onChange={(ev) => e.setPlayerConfig({ ...e.playerConfig, playerCode: ev.target.value })}
        />
        <span className="lbl">Player Key</span>
        <input
          className="pkey"
          type="text"
          value={e.playerConfig.playerKey}
          placeholder="player.key"
          onChange={(ev) => e.setPlayerConfig({ ...e.playerConfig, playerKey: ev.target.value })}
        />
        <span className="lbl">Backend</span>
        <input
          className="url"
          value={e.playerConfig.backendBaseUrl}
          placeholder="https://player.circlekliftdev.com/api/lift/"
          onChange={(ev) => e.setPlayerConfig({ ...e.playerConfig, backendBaseUrl: ev.target.value })}
        />
        <button onClick={() => void e.registerPlayer()}>Register</button>
        <small className="hint">Register sends the player.key to the datacenters (like CKP2 + legacy).</small>
      </header>

      {(e.globalInit || e.globalInitError) && (
        <div className="initcfg">
          {e.globalInit ? (
            <>
              <div className="initmeta">
                <span>player.code=<b>{e.globalInit.playerCode}</b></span>
                <span>tenant=<b>{e.globalInit.tenant}</b></span>
                <span>{e.globalInit.datacenter}</span>
              </div>
              <pre>{e.globalInit.raw}</pre>
            </>
          ) : (
            <div className="initerr">Register failed: {e.globalInitError}</div>
          )}
        </div>
      )}

      <div className="body">
        <section className="left">
          <h3>Quick Keys</h3>
          <QuickKeys e={e} locale={locale} />

          <h3>Scan</h3>
          <form
            className="row"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (scanCode.trim()) e.scan(scanCode.trim());
              setScanCode('');
            }}
          >
            <input placeholder="UPC / barcode" value={scanCode} onChange={(ev) => setScanCode(ev.target.value)} />
            <button type="submit">Scan</button>
          </form>

          <h3>Loyalty (EasyPay / EventId 1024)</h3>
          <div className="row">
            <input value={card} onChange={(ev) => setCard(ev.target.value)} placeholder="loyalty # or 12-digit UPC" />
            <button onClick={() => e.loyalty(card.trim())}>Scan Card</button>
          </div>
        </section>

        <section className="center">
          <h3>Transaction #{snapshot.tx}</h3>
          <table className="basket">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Ext</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snapshot.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">No items — tap a quick key</td>
                </tr>
              )}
              {snapshot.lines.map((li) => (
                <tr key={li.lineNumber} className={li.voided ? 'voided' : ''}>
                  <td>{li.lineNumber}</td>
                  <td>{li.description}</td>
                  <td>{li.quantity}</td>
                  <td>{formatCurrency(li.unitPriceCents, locale)}</td>
                  <td>{formatCurrency(li.extendedCents, locale)}</td>
                  <td className="lineactions">
                    {!li.voided && (
                      <>
                        <button onClick={() => e.setQuantity(li.lineNumber, li.quantity + 1)}>+1</button>
                        <button onClick={() => e.setPrice(li.lineNumber, Math.max(0, li.unitPriceCents - 10))}>-10¢</button>
                        <button onClick={() => e.voidLine(li.lineNumber)}>void</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div><span>Subtotal</span><b>{formatCurrency(snapshot.subtotalCents, locale)}</b></div>
            <div><span>Tax</span><b>{formatCurrency(snapshot.taxCents, locale)}</b></div>
            <div className="grand"><span>Total</span><b>{formatCurrency(snapshot.totalCents, locale)}</b></div>
          </div>

          <div className="tender">
            <button onClick={() => e.tender('cash-exact')}>Cash (exact)</button>
            <button onClick={() => e.tender('next-dollar')}>Next $</button>
            <button onClick={() => e.tender('amount', snapshot.totalCents + 500)}>Cash +$5</button>
            <button className="voidticket" onClick={() => e.voidTicket()}>Void Ticket</button>
          </div>
        </section>

        <section className="right">
          <div className="loghead">
            <h3>Wire Log</h3>
            <button onClick={e.clearLog}>clear</button>
          </div>
          <div className="log">
            {e.log.map((l) => (
              <div key={l.id} className={`logline ${l.channel}`}>
                <span className="tag">{l.channel.toUpperCase()}</span>
                <code>{l.text}</code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
