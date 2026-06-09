import { useEffect, useMemo, useState } from 'react';
import { useEmulator } from './useEmulator';
import { formatCurrency, type PosLocale } from '../../core/currency';
import { paginate } from '../../core/quickkeys';
import type { AdItem } from '../../core/adTriggers';
import { REGISTER_TYPES, portsForRegisterType, type ConnState, type RegisterType } from '../../core/posTypes';
import './App.css';

const QK_PER_PAGE = 9; // 3 columns × 3 rows

function Dot({ state }: { state: ConnState }): JSX.Element {
  const color = state === 'connected' ? '#3ec46d' : state === 'connecting' ? '#e6b450' : '#d9534f';
  return <span className="dot" style={{ background: color }} title={state} />;
}

/** Quick keys driven by .qk files: 3-wide grid that fills the column, paginated, colored. */
function QuickKeys({ e, locale }: { e: ReturnType<typeof useEmulator>; locale: PosLocale }): JSX.Element {
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const perPage = QK_PER_PAGE; // fixed 3×3 grid
  const files = e.quickKeyFiles;
  const active = files[Math.min(tab, Math.max(0, files.length - 1))];
  const pages = useMemo(() => paginate(active?.entries ?? [], perPage), [active, perPage]);
  const safePage = Math.min(page, pages.length - 1);
  const current = pages[safePage] ?? [];

  useEffect(() => setPage(0), [tab]);

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
      <div className="grid qk3">
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

/**
 * Triggers & Completers — lists the live ads (from the backend manifest), each
 * with Triggers (UPCs that fire it) and Completers (items that complete its
 * offer). Click an item in the modal to scan it straight into the basket.
 */
function TriggersCompleters({ e }: { e: ReturnType<typeof useEmulator> }): JSX.Element {
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<{
    ad: { id: string; name: string };
    kind: 'triggers' | 'completers';
    items: AdItem[];
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "<id>:triggers" | "<id>:completers"
  const perPage = 5;
  const ads = e.adManifest;
  const pageCount = Math.max(1, Math.ceil(ads.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const current = ads.slice(safePage * perPage, safePage * perPage + perPage);

  // Prefetch the visible page's details so each row can show whether it has a
  // completer (only the 4 shown — keeps the lazy/fast behaviour).
  const visibleIds = current.map((a) => a.id).join(',');
  const { loadAdDetail, adDetails } = e;
  useEffect(() => {
    current.forEach((ad) => {
      if (!adDetails[ad.id]) void loadAdDetail(ad.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, loadAdDetail]);

  // Completer indicator per ad: 'has' (green) / 'none' (grey) / 'unknown' (faint, still loading).
  const completerState = (id: string): 'has' | 'none' | 'unknown' => {
    const d = adDetails[id];
    if (!d) return 'unknown';
    return d.completers.length > 0 ? 'has' : 'none';
  };

  const open = async (ad: { id: string; name: string }, kind: 'triggers' | 'completers'): Promise<void> => {
    setBusy(`${ad.id}:${kind}`);
    const detail = e.adDetails[ad.id] ?? (await e.loadAdDetail(ad.id));
    setBusy(null);
    const items = !detail ? [] : kind === 'triggers' ? detail.triggers : detail.completers;
    setModal({ ad, kind, items });
  };

  // Scanning a trigger fires the ad → close the triggers modal and surface that
  // ad's completers (mirrors the real basket flow). Scanning a completer just
  // rings it up and leaves the modal open.
  const onItemClick = (it: AdItem): void => {
    if (!modal) return;
    e.scan(it.code, it.description);
    if (modal.kind === 'triggers') {
      // Trigger fired → close this modal and open the ad's completers.
      const completers = e.adDetails[modal.ad.id]?.completers ?? [];
      setModal({ ad: modal.ad, kind: 'completers', items: completers });
    } else {
      // Completer selected → close the modal.
      setModal(null);
    }
  };

  return (
    <div className="tc">
      <div className="tcctl">
        <button onClick={() => void e.loadAds()} disabled={e.adsStatus.loading}>
          {e.adsStatus.loading ? 'Loading…' : 'Load ads'}
        </button>
        {e.adsStatus.error ? (
          <small className="tcerr" title={e.adsStatus.error}>{e.adsStatus.error}</small>
        ) : ads.length > 0 ? (
          <small className="hint">{ads.length} ad(s) — <span className="tcdot has" /> has completers</small>
        ) : (
          <small className="hint">Register the player, then Load ads</small>
        )}
      </div>

      {ads.length > 0 && (
        <>
          <div className="tclist">
            {current.map((ad) => {
              const cs = completerState(ad.id);
              return (
                <div key={ad.id || ad.name} className="tcrow">
                  <span
                    className={`tcdot ${cs}`}
                    title={cs === 'has' ? 'Has completers' : cs === 'none' ? 'No completers' : 'Checking…'}
                  />
                  <span className="tcname" title={ad.name}>{ad.name}</span>
                  <button className="tcbtn" disabled={busy !== null} onClick={() => void open(ad, 'triggers')}>
                    {busy === `${ad.id}:triggers` ? '…' : 'Triggers'}
                  </button>
                  <button className="tcbtn" disabled={busy !== null} onClick={() => void open(ad, 'completers')}>
                    {busy === `${ad.id}:completers` ? '…' : 'Compl.'}
                  </button>
                </div>
              );
            })}
          </div>
          {pageCount > 1 && (
            <div className="qkpager">
              <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button>
              <span>{safePage + 1}/{pageCount}</span>
              <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>›</button>
            </div>
          )}
        </>
      )}

      {modal && (
        <div className="tcmodal" onClick={() => setModal(null)}>
          <div className="tcmodalbox" onClick={(ev) => ev.stopPropagation()}>
            <div className="tcmodalhead">
              <b>{modal.kind === 'triggers' ? 'Triggers' : 'Completers'} — {modal.ad.name}</b>
              <button onClick={() => setModal(null)}>×</button>
            </div>
            {modal.items.length === 0 ? (
              <small className="hint">{modal.kind === 'triggers' ? 'No triggers.' : 'No completers.'}</small>
            ) : (
              <div className="tcitems">
                {modal.items.map((it) => (
                  <button
                    key={it.code}
                    className="tcitem"
                    title={modal.kind === 'triggers' ? 'Scan to fire this ad, then pick a completer' : 'Scan this completer into the basket'}
                    onClick={() => onItemClick(it)}
                  >
                    <span>{it.description || it.code}</span>
                    <small>{it.code}</small>
                  </button>
                ))}
              </div>
            )}
            <small className="hint">
              {modal.kind === 'triggers'
                ? 'Click a trigger to scan it — then its completers appear.'
                : 'Click a completer to scan it into the basket.'}
            </small>
          </div>
        </div>
      )}
    </div>
  );
}

function App(): JSX.Element {
  const e = useEmulator();
  const { snapshot } = e;
  const locale = snapshot.locale;

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
        <span className="lbl">Player Key</span>
        <input
          className="pkey"
          type="text"
          value={e.playerConfig.playerKey}
          placeholder="player.key"
          onChange={(ev) => e.setPlayerConfig({ ...e.playerConfig, playerKey: ev.target.value })}
        />
        <button onClick={() => void e.registerPlayer()}>Register</button>
        <small className="hint">
          Register resolves the datacenter, player code &amp; backend automatically (like CKP2 + legacy).
        </small>
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

          <h3>Triggers &amp; Completers</h3>
          <TriggersCompleters e={e} />
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
