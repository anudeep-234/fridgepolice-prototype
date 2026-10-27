# FridgePolice - Changes and Engineering Decisions

## What the app does

FridgePolice is a roommate food tracker. Roommates add shared items, request portions, and the app keeps the remaining amount accurate. The prototype uses an Express server with in-memory state and a React client that polls it every two seconds.

Each item is tracked as a percentage of the whole. Requests reserve a portion immediately as a "hold". A hold becomes "consumed" when the roommate confirms they used it, "expired" if it's not confirmed in time, or "cancelled" if the item is spoiled.

## Scenario 1: Double allocation of the last portion

Requests check and reserve in a single synchronous function (`requestPortion` in `server/inventory.js`). The remaining amount is reduced at the moment of the request, so a second request for the same portion sees the reduced value and is rejected with "Only X% left."

Test result: with Pizza at 75% remaining after one request, a second request for 25% succeeded and left 0%. A third request was rejected with "Only 0% left."

## Scenario 2: Approved but unclaimed food

Every hold has an `expiresAt` timestamp. Before each read or write, `expireHolds` releases any pending hold whose time has passed and returns its percentage to the item. Marking an item spoiled cancels all its pending holds and sets remaining to 0.

Test result: with a 10-second TTL, a 30% hold was not confirmed. After it expired, remaining returned to 100%, the history logged `hold_expired`, and a later consume request was rejected with "Hold not active." Spoiling an item with a pending 20% hold changed that hold to `cancelled` and disabled further requests.

Production setting: `HOLD_TTL_MS` is 30 minutes.

## Scenario 3: Identical items

Every item gets a UUID with `crypto.randomUUID()`. The name is a label only. Matching is always done by id, so two items named "Ketchup" are stored and updated separately.

Test result: a 50% request on the first Ketchup left the second at 100%. Spoiling the second did not affect the first.

## Scenario 4: Inventory correction

`correctCount` sets remaining to the physical amount minus the portions still on hold, so a correction never counts a held portion twice. Every correction is written to history with the before and after values. Corrections on spoiled items are rejected.

Test result: with Pizza at 75% and a 25% hold, entering 40% physically left set remaining to 15%, which is 40% minus the 25% hold. The history logged `correction (75% → 15%)`.

## Assumptions and decisions

- Requests are auto-approved. The brief describes an owner approving a portion, so this is a simplification.
- State is in memory. Restarting the server clears all data.
- Quantities are percentages, not units or weights.
- Corrections clamp at 0 if the physical amount is smaller than the held portions.

## How the system stays correct

Each rule runs in one place in `inventory.js`, and every route calls those functions. Expiry runs before every read and write, so stale holds never block a request. Ids prevent identical names from mixing. The history log records each state change, so every value can be traced.

## Update: correction and spoiled items

- `remaining` always means the amount free to request: the physical amount entered by the owner minus pending holds.
- Corrections subtract pending holds, so a held portion is never counted twice. Example: with a 25% hold, entering 40% physically left sets remaining to 15%.
- Spoiled items cannot be corrected. The API returns "Item is spoiled" and the item stays closed.
- Correction input is validated: non-numeric or negative amounts are rejected.
