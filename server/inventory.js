// All FridgePolice business rules live here.
// Source of truth: item.physical, the percent physically in the fridge.
// item.remaining is derived: physical minus active holds, or 0 if spoiled.
// Hold lifecycle: requested -> pending (after owner approval) -> consumed,
// or requested/pending -> expired, or any open hold -> cancelled on spoilage.
const HOLD_TTL_MS = Number(process.env.HOLD_TTL_MS) || 30 * 60 * 1000;

let state = { items: [], holds: [], history: [] };

// Holds that still count against stock.
const ACTIVE = ["requested", "pending"];

function log(entry) {
  state.history.unshift({ at: new Date().toISOString(), ...entry });
}

function reservedFor(itemId) {
  return state.holds
    .filter((h) => h.itemId === itemId && ACTIVE.includes(h.status))
    .reduce((sum, h) => sum + h.percent, 0);
}

// Recompute every derived value from physical stock and active holds.
function recalc(item) {
  item.reserved = reservedFor(item.id);
  item.remaining = item.spoiled ? 0 : Math.max(0, item.physical - item.reserved);
  item.shortfall = Math.max(0, item.reserved - item.physical);
  return item;
}

// Scenario 3: unique id per item, so identical names stay distinct.
export function createItem(name, owner) {
  const item = {
    id: crypto.randomUUID(),
    name,
    owner,
    physical: 100,
    reserved: 0,
    remaining: 100,
    shortfall: 0,
    addedAt: new Date().toISOString(),
    spoiled: false,
  };
  state.items.push(item);
  log({ type: "create", itemId: item.id, name });
  return item;
}

// Scenario 2: holds past their time stop counting. Nothing is added back.
export function expireHolds(now = Date.now()) {
  for (const hold of state.holds) {
    if (ACTIVE.includes(hold.status) && hold.expiresAt <= now) {
      hold.status = "expired";
      log({ type: "hold_expired", holdId: hold.id, itemId: hold.itemId, percent: hold.percent });
    }
  }
  for (const item of state.items) recalc(item);
}

// Scenario 1: check and reserve in one synchronous step, so two requests
// can't both claim the last portion. The hold waits for owner approval.
export function requestPortion(itemId, requester, percent) {
  expireHolds();
  const item = state.items.find((i) => i.id === itemId);
  if (!item || item.spoiled) throw new Error("Item not available");
  if (!Number.isFinite(percent) || percent <= 0) throw new Error("Amount must be positive");
  if (percent > item.remaining) throw new Error(`Only ${item.remaining}% left`);

  const hold = {
    id: crypto.randomUUID(),
    itemId,
    requester,
    percent,
    status: "requested",
    expiresAt: Date.now() + HOLD_TTL_MS, // must be approved within the TTL
  };
  state.holds.push(hold);
  recalc(item);
  log({ type: "request", holdId: hold.id, itemId, requester, percent });
  return hold;
}

// Owner approval starts the window in which the portion must be eaten.
export function approveHold(holdId) {
  expireHolds();
  const hold = state.holds.find((h) => h.id === holdId);
  if (!hold || hold.status !== "requested") throw new Error("Hold cannot be approved");
  hold.status = "pending";
  hold.expiresAt = Date.now() + HOLD_TTL_MS;
  log({ type: "approved", holdId, itemId: hold.itemId, requester: hold.requester, percent: hold.percent });
  return hold;
}

// Eating an approved portion removes it from physical stock.
export function markConsumed(holdId) {
  expireHolds();
  const hold = state.holds.find((h) => h.id === holdId);
  if (!hold || hold.status !== "pending") throw new Error("Hold not active");
  hold.status = "consumed";
  const item = state.items.find((i) => i.id === hold.itemId);
  item.physical = Math.max(0, item.physical - hold.percent);
  recalc(item);
  log({ type: "consumed", holdId, itemId: hold.itemId, percent: hold.percent });
  return hold;
}

// Scenario 2: spoiling cancels open holds and removes all stock.
export function spoilItem(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found");
  for (const hold of state.holds) {
    if (hold.itemId === itemId && ACTIVE.includes(hold.status)) hold.status = "cancelled";
  }
  item.spoiled = true;
  item.physical = 0;
  recalc(item);
  log({ type: "spoiled", itemId });
  return item;
}

// Scenario 4: the owner enters what is physically left. Active holds are
// subtracted to get the free amount. If holds exceed physical stock, shortfall
// shows the uncovered amount until those holds expire or are consumed.
export function correctCount(itemId, actualPercent) {
  expireHolds();
  const item = state.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found");
  if (item.spoiled) throw new Error("Item is spoiled");
  const physical = Number(actualPercent);
  if (!Number.isFinite(physical) || physical < 0 || physical > 100) {
    throw new Error("Enter a value from 0 to 100");
  }
  const before = item.remaining;
  item.physical = physical;
  recalc(item);
  log({ type: "correction", itemId, from: before, to: item.remaining, physical, shortfall: item.shortfall });
  return item;
}

export function getState() {
  expireHolds();
  return state;
}
