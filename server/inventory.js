// All FridgePolice business rules live here. Pure functions, no Express.
const HOLD_TTL_MS = 30 * 60 * 1000; // approved-but-unclaimed holds expire after 30 min

let state = { items: [], holds: [], history: [] };

function log(entry) {
  state.history.unshift({ at: new Date().toISOString(), ...entry });
}

// Scenario 3: unique id per item, so identical names stay distinct.
export function createItem(name, owner) {
  const item = {
    id: crypto.randomUUID(),
    name,
    owner,
    remaining: 100, // percent of the item left
    addedAt: new Date().toISOString(),
    spoiled: false,
  };
  state.items.push(item);
  log({ type: "create", itemId: item.id, name });
  return item;
}

// Scenario 2: release holds whose time has passed, before any other check.
export function expireHolds(now = Date.now()) {
  for (const hold of state.holds) {
    if (hold.status === "pending" && hold.expiresAt <= now) {
      hold.status = "expired";
      const item = state.items.find((i) => i.id === hold.itemId);
      if (item) item.remaining += hold.percent;
      log({ type: "hold_expired", holdId: hold.id, itemId: hold.itemId });
    }
  }
}

// Scenario 1: check and reserve in one synchronous step, so two requests
// can't both claim the last portion.
export function requestPortion(itemId, requester, percent) {
  expireHolds();
  const item = state.items.find((i) => i.id === itemId);
  if (!item || item.spoiled) throw new Error("Item not available");
  if (percent <= 0) throw new Error("Amount must be positive");
  if (percent > item.remaining) throw new Error(`Only ${item.remaining}% left`);

  item.remaining -= percent; // reserve immediately
  const hold = {
    id: crypto.randomUUID(),
    itemId,
    requester,
    percent,
    status: "pending",
    expiresAt: Date.now() + HOLD_TTL_MS,
  };
  state.holds.push(hold);
  log({ type: "request", holdId: hold.id, itemId, requester, percent });
  return hold;
}

export function markConsumed(holdId) {
  expireHolds();
  const hold = state.holds.find((h) => h.id === holdId);
  if (!hold || hold.status !== "pending") throw new Error("Hold not active");
  hold.status = "consumed";
  log({ type: "consumed", holdId });
  return hold;
}

// Scenario 2: spoiling cancels open holds and returns their portions.
export function spoilItem(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found");
  for (const hold of state.holds) {
    if (hold.itemId === itemId && hold.status === "pending") {
      hold.status = "cancelled";
    }
  }
  item.spoiled = true;
  item.remaining = 0;
  log({ type: "spoiled", itemId });
  return item;
}

// Scenario 4: owner sets the real count; the change is logged.
export function correctCount(itemId, actualPercent) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found");
  const before = item.remaining;
  item.remaining = Math.max(0, Math.min(100, actualPercent));
  log({ type: "correction", itemId, from: before, to: item.remaining });
  return item;
}

export function getState() {
  expireHolds();
  return state;
}
