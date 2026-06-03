import { useState } from 'react';
import { useEmulator, PRICEBOOK } from './useEmulator';
import { formatCurrency } from '../../core/currency';
import type { ConnState } from '../../core/posTypes';
import './App.css';

function Dot({ state }: { state: ConnState }): JSX.Element {
  const color = state === 'connected' ? '#3ec46d' : state === 'connecting' ? '#e6b450' : '#d9534f';
  return <span className="dot" style={{ background: color }} title={state} />;
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
        <strong>Radiant6 Canada Emulator</strong>
        <span className="conn">
          <Dot state={e.status.vj} /> VJ {e.config.host}:{e.config.vjPort}
          <Dot state={e.status.pole} /> Pole {e.config.host}:{e.config.polePort}
        </span>
        <input
          className="host"
          value={e.config.host}
          onChange={(ev) => e.setConfig({ ...e.config, host: ev.target.value })}
        />
        <input
          className="port"
          type="number"
          value={e.config.vjPort}
          onChange={(ev) => e.setConfig({ ...e.config, vjPort: Number(ev.target.value) })}
        />
        <input
          className="port"
          type="number"
          value={e.config.polePort}
          onChange={(ev) => e.setConfig({ ...e.config, polePort: Number(ev.target.value) })}
        />
        <button onClick={() => void e.connect()}>Connect</button>
        <button onClick={() => void e.disconnect()}>Disconnect</button>
        <span className="spacer" />
        <div className="locale">
          <button className={locale === 'en' ? 'on' : ''} onClick={() => e.setLocale('en')}>EN-CA</button>
          <button className={locale === 'fr' ? 'on' : ''} onClick={() => e.setLocale('fr')}>FR-CA</button>
        </div>
      </header>

      <div className="body">
        <section className="left">
          <h3>Quick Keys</h3>
          <div className="grid">
            {PRICEBOOK.map((p) => (
              <button key={p.code} className="key" onClick={() => e.addItem(p)}>
                <span>{p.description}</span>
                <small>{formatCurrency(p.priceCents, locale)}</small>
              </button>
            ))}
          </div>

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
