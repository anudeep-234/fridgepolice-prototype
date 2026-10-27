# FridgePolice - Changes and Engineering Decisions

## What the app does

FridgePolice tracks shared food in a roommate fridge as percentages. Roommates request a portion, the owner approves it, and the portion is marked consumed when eaten. The prototype has an Express server that holds all state in memory and a React client that polls the server every two seconds.

## Core model

Physical stock is the only stored quantity. Everything else is calculated from it.

- `physical`: the percent physically in the fridge. This is the source of truth. It changes only when a portion is consumed, when the owner corrects the count, or when the item is spoiled.
- `reserved`: the sum of all holds in `requested` or `pending` status.
- `remaining` (free to request): 0 if the item is spoiled, otherwise `max(0, physical - reserved)`.
- `shortfall`: `max(0, reserved - physical)`. This is the amount promised to holds that the fridge doesn't physically have.

Every change recalculates these values, so they can't drift apart.

## Hold lifecycle

- `requested`: a roommate asked for a portion. It reserves stock immediately, so no one else can claim it.
- `pending`: the owner approved it. The hold now has a fresh 30-minute window to be eaten.
- `consumed`: the portion was eaten. `physical` drops by the held amount.
- `expired`: the time window passed before approval or consumption. The hold stops counting against stock.
- `cancelled`: the item was spoiled while the hold was open.

Only `pending` holds can be consumed. `expired` and `cancelled` are final. Expiry never adds stock back, because stock was never removed when the hold was created.

The timer length is `HOLD_TTL_MS`, which defaults to 30 minutes. It can be overridden with an environment variable for testing.

## Scenario 1: Double allocation of the last portion

`requestPortion` checks `remaining` and creates the hold in one synchronous step. A second request for the same portion sees the reduced amount and is rejected with "Only X% left." Because requests reserve stock before approval, two roommates can't both be promised the same last portion.

## Scenario 2: Approved but unclaimed food

A request that isn't approved in time expires and stops counting. An approved hold that isn't eaten in time also expires. Consuming an expired hold is rejected with "Hold not active." Spoiling an item cancels all of its open holds and sets `physical` and `remaining` to 0.

## Scenario 3: Identical items

Each item gets a UUID from `crypto.randomUUID()`. The name is a label only. All lookups use the id, so two items named "Ketchup" are stored, updated, and spoiled separately. The UI shows the last six characters of each id.

## Scenario 4: Inventory correction

The owner enters the amount physically left. `correctCount` sets `physical` to that value and recalculates. Active holds are subtracted to produce `remaining`, so a held portion is never counted twice. Corrections are rejected on spoiled items, and values outside 0 to 100 are rejected. Every correction is logged with the before and after values.

## Edge case: correction below holds, then expiry

Expected sequence with a 10-second timer:

1. Pizza starts at physical 100%.
2. Two requests reserve 25% and 30%. Reserved is 55%, remaining is 45%.
3. The owner corrects physical to 10%. Reserved stays 55%, so remaining is 0% and shortfall is 45%. Nothing is clamped or lost.
4. Both holds expire. Reserved drops to 0%.
5. Final state: physical 10%, remaining 10%, shortfall 0%.

If expiry added stock back, step 5 would show 55%, which would overstate the fridge.

## Assumptions and simplifications

- Owner approval is a single action. The app doesn't record which person approved.
- There is no authentication or user accounts.
- State is in memory, so restarting the server clears all data.
- Quantities are percentages of the whole, not units or weights.
- Holds that exceed physical stock are allowed to exist temporarily, and the shortfall shows them. The owner resolves them by consuming, approving, or waiting for expiry.

## How to test

- Scenario 1: request 75% for one roommate, then 25% twice for another. The second 25% request is rejected.
- Scenario 2: set `HOLD_TTL_MS` to 10000, request a portion, and wait. It expires and the consume button or call is rejected.
- Scenario 3: add two items named "Ketchup", request on one, and confirm the other is unchanged.
- Scenario 4: run the edge-case sequence above.
