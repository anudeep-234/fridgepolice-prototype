import { useEffect, useState } from "react";

const API = "http://127.0.0.1:5000";

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function App() {
  const [state, setState] = useState({ items: [], holds: [], history: [] });
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [forms, setForms] = useState({});

  const refresh = async () => {
    try {
      setState(await api("GET", "/state"));
    } catch (e) {
      setError("Cannot reach server: " + e.message);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  const act = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    refresh();
  };

  const setForm = (id, field, value) =>
    setForms((f) => ({ ...f, [id]: { ...f[id], [field]: value } }));

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>FridgePolice</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <section>
        <h2>Add item</h2>
        <input placeholder="Item name" value={newName} onChange={(e) => setNewName(e.target.value)} />{" "}
        <input placeholder="Owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />{" "}
        <button onClick={() => act(async () => {
          await api("POST", "/items", { name: newName, owner: newOwner });
          setNewName("");
          setNewOwner("");
        })}>Add</button>
      </section>

      <section>
        <h2>Items</h2>
        {state.items.length === 0 && <p>No items yet.</p>}
        {state.items.map((item) => {
          const f = forms[item.id] || {};
          const itemHolds = state.holds.filter((h) => h.itemId === item.id);
          return (
            <div key={item.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12, opacity: item.spoiled ? 0.5 : 1 }}>
              <strong>{item.name}</strong> (id ...{item.id.slice(-6)}) owner: {item.owner}
              <div>
                Physical: <b>{item.physical}%</b> · Held: <b>{item.reserved}%</b> · Free to request: <b>{item.remaining}%</b>
                {item.spoiled && " — SPOILED"}
              </div>
              {item.shortfall > 0 && (
                <div style={{ color: "crimson" }}>
                  Shortfall: {item.shortfall}% is promised to holds but not physically there. It clears when those holds expire or are consumed.
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <input placeholder="Requester" value={f.requester || ""}
                  onChange={(e) => setForm(item.id, "requester", e.target.value)} />{" "}
                <input type="number" placeholder="%" style={{ width: 70 }} value={f.percent || ""}
                  onChange={(e) => setForm(item.id, "percent", e.target.value)} />{" "}
                <button disabled={item.spoiled} onClick={() => act(async () => {
                  await api("POST", `/items/${item.id}/request`, { requester: f.requester, percent: Number(f.percent) });
                  setForm(item.id, "percent", "");
                })}>Request</button>
              </div>

              <div style={{ marginTop: 8 }}>
                <input type="number" placeholder="Actual %" style={{ width: 90 }} value={f.correct || ""}
                  onChange={(e) => setForm(item.id, "correct", e.target.value)} />{" "}
                <button onClick={() => act(() => api("POST", `/items/${item.id}/correct`, { percent: Number(f.correct) }))}>
                  Correct count
                </button>{" "}
                <button disabled={item.spoiled} onClick={() => act(() => api("POST", `/items/${item.id}/spoil`, {}))}>
                  Mark spoiled
                </button>
              </div>

              <ul>
                {itemHolds.map((h) => (
                  <li key={h.id}>
                    {h.requester} — {h.percent}% — {h.status}
                    {h.status === "requested" && (
                      <>
                        {" "}(awaiting owner approval){" "}
                        <button onClick={() => act(() => api("POST", `/holds/${h.id}/approve`, {}))}>
                          Approve
                        </button>
                      </>
                    )}
                    {h.status === "pending" && (
                      <>
                        {" "}(expires {new Date(h.expiresAt).toLocaleTimeString()}){" "}
                        <button onClick={() => act(() => api("POST", `/holds/${h.id}/consume`, {}))}>
                          Mark consumed
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section>
        <h2>History</h2>
        <ol>
          {state.history.slice(0, 20).map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleTimeString()} — {h.type}
              {h.from !== undefined && ` (${h.from}% → ${h.to}%)`}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}