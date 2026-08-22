# Weav3r Arbitrage Helper

A Tampermonkey userscript for Weav3r/TornW3B item pages. It compares the lowest purchasable item price with trusted trader buy prices and displays a prominent arbitrage status card.

## Installation

1. Install the Tampermonkey browser extension.
2. Open `weav3r-arbitrage-helper.user.js` from this repository.
3. Copy the entire file into a new Tampermonkey script.
4. Save the script and visit a supported Weav3r item page.

No build step is required.

## Supported pages

The script runs on:

```text
https://weav3r.dev/item/*
https://www.torn.com/bazaar.php*
https://www.torn.com/trade.php*
```

The Weav3r item ID is read from the path, such as `/item/367`. Torn Trade URL fragments such as `#step=start&userID=...` are handled at runtime with `window.location.hash`; fragments are not part of the Tampermonkey `@match` rules.

## How it works

The script uses documented Weav3r API data where available and DOM parsing where no documented API endpoint exists.

- Bazaar for the current item primarily uses `GET /api/marketplace/{itemId}`.
- Bazaar for Watchlist scans uses one batch `GET /api/marketplace` request.
- Bazaar calculations use `lowest_price` or detailed listing `price`; `market_price` is never treated as an available purchase listing.
- Item Market listings still use temporary same-origin hidden Weav3r frames and semantic table parsing.
- Trader prices, ratings, and activity still use temporary same-origin hidden Weav3r frames and semantic table parsing.

The calculation is:

```text
profitPerItem = bestTraderBuyPrice - lowestPurchasePrice
profitPercentage = profitPerItem / lowestPurchasePrice * 100
```

`BUY & SELL` requires both configured thresholds to be met:

- Minimum Profit Per Item, default `$100,000`
- Minimum Relative Profit, default `2.0%`

The current card and Watchlist rows display absolute and relative profit together, such as `+$6,600 · +0.61%` or `-$110,429 · -0.82%`. Thresholds are configured in Settings and no longer occupy a main metric tile.

## Defaults and cache freshness

- Minimum Trader Rating: `+4`
- Minimum Profit Per Item: `$100,000`
- Minimum Relative Profit: `2.0%`
- Bazaar cache: `60 seconds`
- Item Market cache: `45 seconds`
- Trader cache: `30 minutes`
- Marketplace batch API cache: `60 seconds`
- Recheck debounce for dynamic page changes: about `250 ms`

Fresh source ages are shown as neutral secondary text. Approaching-expiry and stale data use warning colors. Repeated Bazaar rechecks within 60 seconds may return the same server-side cached Weav3r API data.

## Dynamic content and navigation

Weav3r may insert tables after the first page load or change content through SPA navigation. The script watches for dynamic DOM changes with a `MutationObserver`, listens to `history.pushState`, `history.replaceState`, and `popstate`, and ignores mutations inside its own card, dialog, backdrop, and hidden collector frames.

The `Recheck` button is for the current item only. It reparses the current DOM page, forces a current-item Bazaar API attempt, removes active current-item collector frames, and retries stale or missing Item Market and Trader sources. It does not scan the Watchlist.

When collapsed, the large card becomes a compact right-edge pill that shows `STATUS · PROFIT PER ITEM`. The expanded card returns to the upper-right default position; only the collapsed pill can be dragged vertically, and its saved vertical position is restored on future page loads. Clicking or tapping the pill expands the full card.

Settings now open in a separate userscript-owned dialog instead of expanding inside the main card. Opening Settings also locks the background page, focuses the first field without scrolling the page, and lets the dialog scroll internally only when the viewport is too short. Cancel, Escape, or a direct backdrop click discard unsaved drafts; Save validates all fields before persisting. The main card is constrained to the viewport with internal overflow protection so its controls remain reachable on short screens. All Settings fields created by the script have stable `id` and `name` attributes with matching labels.

## Arbitrage Watchlist

Use `☆ Add to Watchlist` in the expanded card to add the current item. Use `★ Watchlisted` to remove it. Duplicate item IDs are ignored, insertion order is preserved in storage, and the MVP limit is 20 items.

The current item automatically synchronizes into its Watchlist row when the main card result changes. Adding the currently open item immediately initializes the row from the current result when one is available. Opening the Watchlist hydrates rows from fresh cached source data, so a manual scan is not required merely to display already-known fresh results.

`Watchlist (N)` opens a separate userscript-owned, scrollable dialog instead of expanding inside the fixed card. The Settings and Watchlist dialogs are mutually exclusive, so only one backdrop is active at a time. Opening either dialog locks the background page and restores the exact page scroll position when the dialog closes. Up to 20 entries can be browsed in the dialog; the header and scan controls stay visible while only the row area scrolls independently. The Watchlist result area can be scrolled immediately after opening without first clicking inside it, and overscroll at its boundaries does not move the page behind the dialog. Close the dialog with the Close button, Escape, or a direct backdrop click.

Watchlist scans are manual and start only when you press `Scan Watchlist`; they do not run automatically on page load.

During a scan:

- one batch Marketplace API request supplies Bazaar `lowest_price` data for all Watchlist items;
- fresh Item Market and Trader caches are reused;
- stale or missing Item Market and Trader sources are queued for hidden-frame collection;
- at most two hidden collector frames run at once;
- new hidden-frame starts are paced by at least about two seconds;
- no more than 20 hidden-frame starts are attempted in a rolling minute;
- a dedicated progress area shows completed items, processed source checks, currently active source jobs, and queued jobs;
- no ETA is displayed because iframe render time is unpredictable;
- `Scan Watchlist` is replaced by a prominent `Stop Scan` control while scanning;
- when all selected items and source checks finish, the header changes to `Scan complete`, `Stop Scan` disappears, and `Scan Again` becomes available;
- completed summaries group rows as opportunity (`BUY & SELL`), below targets (`NOT WORTH IT`), and incomplete (`DATA MISSING`, `DATA STALE`, `NO TRUSTED TRADER`, `NO ELIGIBLE TRADER`, `NO ACCEPTABLE TRADER`, cancelled rows, or source errors);
- cancelled scans show a separate cancelled state and preserve completed results;
- results appear progressively and BUY & SELL rows are highlighted;
- `Stop Scan` cancels queued and active Watchlist work and removes hidden frames.

Each row uses a compact Buy / Sell / Profit comparison layout with a status badge, item name and Item ID on a tight header line where space allows, selected purchase source, Trader summary, and absolute plus relative profit with explicit spacing. Source states use a consistent compact chip format such as `Bazaar · fresh · 1m`, `Item Market · stale · 1m`, or `Traders · checking`. Missing or incomplete calculations display `—`; a displayed `$0 · 0.00%` is reserved for genuine zero-profit cases where both valid prices are equal.

Watchlist rows include direct, context-sensitive manual actions. `BUY & SELL` rows can show `Trade now`, `Open cheapest offer`, `Trader price list`, `Open Item`, `Rescan Item`, and `Remove`. `NOT WORTH IT`, no-trader, and incomplete rows retain `Open cheapest offer` whenever the latest per-item caches contain a valid priced Bazaar or Item Market candidate—even when a batch result does not yet contain the final offer URL. The click-time refresh must still resolve a concrete validated URL before anything opens. Row-level `Rescan Item` manually scans only that item and uses the existing queue/rate limits. All actions require a direct click and never purchase, initiate a Trade, submit a form, or rate automatically.

## Torn handoff helpers

The Weav3r action buttons can pass a short-lived, local Tampermonkey handoff to Torn pages matched by the same userscript. Direct Torn visits without a matching handoff are unaffected.

- The item card and every Watchlist `Open cheapest offer` action call one shared opener with the canonical item ID, item name, and calculated result. The clicked control shows `Checking…` while the existing 15-second freshness check refreshes stale Bazaar and Item Market competitors through the normal queue; no intermediate blank checking page is opened. Bazaar winners create a correlation-keyed record in `WEAV3R_ARBITRAGE_BAZAAR_HANDOFFS`, so the exact matching Torn tab receives the canonical item name without consuming another tab’s handoff. Item Market winners use the validated item-specific form `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=<ID>`. No generic market fallback, listing selection, or purchase action is used.
- `Trade now` stores a Trade handoff for 15 minutes and then opens the existing Torn Trade URL. If the Trade hash `userID` matches the stored Trader, an empty Trade Description is filled as `<Item name> for $<unit price> each`, for example `Box of Grenades for $1,080,000 each`. Existing non-empty descriptions are preserved.
- If Torn visibly receives the generated Trade Description but leaves the existing `INITIATE TRADE` button disabled, the helper may locally remove that disabled state after strict validation. The script never clicks `INITIATE TRADE`; the user must review the description and click the button manually. If the script-managed description is cleared, the managed button is disabled again.
- The Trade handoff remains available after the start step. A tab-scoped `sessionStorage` association prevents unrelated Torn Trade tabs from consuming another record, and the created Trade ID is captured from runtime hash routes such as `#step=view&ID=12880042` or `#step=add&ID=12880042`. URL fragments are parsed at runtime rather than in `@match`.
- Pending Trade handoffs now live in the version-2 multi-record `WEAV3R_ARBITRAGE_TRADE_HANDOFFS` collection, keyed by handoff ID. The legacy singleton is migrated only after read-back succeeds. Each Torn tab resolves only its session-associated handoff; the opening URL carries that handoff ID, and ambiguous same-Trader records are never guessed. On the first associated `step=add` or `step=view` route, the exact Trade ID is bound before mismatch rejection and an authoritative `WEAV3R_ARBITRAGE_TRADE_VERIFICATIONS` record is promoted immediately—`addStepEnteredAt` is not required for record creation. Cleanup removes only the matching handoff.
- On the real Torn add-items page, the helper recognizes both parent and child rows below `#inventory-container` and resolves identity from item image paths like `/images/items/<ITEM_ID>/large.png`. Because Torn can lazy-load inventory entries, the helper performs a bounded progressive scroll before reporting that a target is absent. A successful search keeps the target centered and visible; an unsuccessful search restores the previous position only while the same handoff, Trade ID, and route remain current.
- `Show All Items` restores the complete native inventory list without changing Torn controls. `Show Target Item Only` may reapply the local visibility filter from the live DOM. Filters and highlights are removed on route cleanup.
- When Torn exposes one unambiguous quantity input, the panel resolves available quantity first from `.item-amount.qty`, then an isolated `xN`/`Nx` label in `.name-wrap`, and finally an explicit maximum or quantity data attribute. It displays `Available: N` and offers a manual `Use All N` button. Clicking it fills only that quantity field; the user must still select the item and click Torn's add control manually.

The Torn helpers never select an item, add an item, change a price field, submit a form, initiate or accept a trade, purchase a Bazaar item, send a Torn API request, or click Torn action controls. Apart from the explicitly clicked `Use All` quantity helper, the add-items filter only adds userscript-owned classes and a userscript-owned panel; it never changes checkboxes or clicks `ADD TO TRADE`.

### Trader activity eligibility and Trade verification

Torn requires a Trader to have been online within the previous six hours before a new Trade can be requested. The helper treats this as a fixed rule, not a setting: only trusted Traders with parsed activity inside that six-hour window are used for actionable Sell prices and BUY & SELL decisions. Inactive or unknown-activity Traders may still be shown as reference quotes, but they are marked unavailable; `NO ELIGIBLE TRADER` is distinct from `NO TRUSTED TRADER`.

Trader activity is parsed relative to the source record's captured time, so cached eligibility can expire without an additional request. The helper schedules a local recalculation at the next eligibility boundary and rechecks eligibility again when `Trade now` is clicked. Trade handoffs store the Trader activity expiry and Torn `step=start` performs a final local expiry check before inserting a Description or enabling the manual initiation button.

After a Weav3r-assisted Trade reaches the matching Trade view, the short initiation handoff is promoted into a per-Trade verification record stored under the Trade ID. Verification records are stored in `WEAV3R_ARBITRAGE_TRADE_VERIFICATIONS`, can coexist for multiple Trades, and expire after 24 hours. Every `#step=view&ID=<TRADE_ID>` route loads only `records[TRADE_ID]`; no active/latest handoff, item match, Trader-name match, or other Trade record is used as a fallback. Missing exact records render `VERIFICATION RECORD MISSING`, collection writes preserve unrelated IDs, and remote storage changes rerender only the current route's Trade ID.

The Trade-view verification panel is advisory only. It primarily identifies the user's item and quantity from the left-side `#step=remove` link's `itemID` and `aria-label`, falling back to exact cleaned item-name text after removing Torn Tools value annotations. It reads current Trader money only from the right participant's money row and computes expected payment from the Trade-ID-bound agreed unit price using `BigInt`; Torn Tools item, total, and log values never determine identity, quantity, or payment.

If an exact record is missing on a full Trade view, recovery is attempted only from one exact current-Trade remove-link item, one matching `<Item> for $<price> each` own comment, and one conclusive right-side profile identity. Successful records are marked `recordSource: trade-dom-recovery`; failures remain `VERIFICATION RECORD MISSING` and never borrow another Trade record. The final snapshot also classifies Trade composition. Only a simple target-item-for-counterparty-money Trade—with no additional items, own money, or properties on either side—may become one ledger SELL. Mixed and barter Trades may still be verified and completed, but are not flattened into an inaccurate simple sale.

The panel distinguishes matching, underpaid, overpaid, waiting-for-item, waiting-for-payment, missing-record, target-mismatch, and Trade-ID-mismatch states. Every successful full-view rerun stores a route-bound snapshot. A capture-phase listener on the exact native `#step=accept&ID=<TRADE_ID>` link and a conservative `pagehide` fallback persist the latest snapshot without preventing, changing, or triggering ACCEPT. The reduced success page is recognized only from the exact green alert `Trade was accepted and is now complete!`; its Trade ID comes from the current hash or exact Back to Trade link, and payment amounts are reused only from the prior snapshot—not reconstructed from the reduced DOM. Completed records retain the original 24-hour expiry. An unknown/not-rated Trader receives a manual `Rate <Trader>` action for the exact stored Trader ID; decisive positive/negative ratings suppress it.

Acceptance is still derived conservatively from newest-first Trade Log events, so a newer item or money mutation invalidates an older acceptance. The script never accepts or confirms a Trade, never edits money, and never clicks Torn controls.

### Personal TornW3B Trader ratings

Public aggregate Trader scores such as `[+68]` are separate from your own personal TornW3B rating. The helper tracks only decisively observed personal states from narrowly matched Weav3r pricelist pages (`https://weav3r.dev/pricelist/*`): `positive`, `negative`, `not-rated`, and `unknown`. Ambiguous or missing controls remain `unknown`; the public aggregate score is never treated as your personal rating.

Only a decisive `negative` personal rating excludes a Trader from actionable Sell selection, profit calculations, BUY & SELL decisions, Watchlist Sell targets, `Trade now`, and new Trade handoffs. `unknown`, `not-rated`, and `positive` remain usable, and `NO ACCEPTABLE TRADER` is distinct from `NO TRUSTED TRADER` and `NO ELIGIBLE TRADER`.

The userscript observes personal rating controls conservatively and never clicks or submits a rating. Cross-tab rating changes update open Weav3r item pages and Torn Trade pages through GM storage change notifications, with focus/visibility rereads as a fallback.

When a matching Trade is conclusively completed with a verified match, underpayment, or overpayment and your personal rating remains `unknown` or `not-rated`, the panel offers a manual `Rate <Trader>` button. It constructs the pricelist URL only from the validated stored Trader ID, opens it after your click, and does not change your rating. `Dismiss` hides the prompt only for that Trade.

## Confirmed transaction ledger

The helper maintains a versioned permanent ledger under `WEAV3R_ARBITRAGE_TRANSACTION_LEDGER`. It contains confirmed transaction events only. Item IDs and quantities are validated positive integers, while all Torn monetary values are stored losslessly as canonical decimal strings and converted to `BigInt` only for validation or calculation. Historical records are immutable: identical deterministic IDs are duplicates, materially different content is an explicit conflict, and critical writes use fresh merge plus read-back verification rather than claiming success after a best-effort write. Trade handoffs, verification records, Bazaar handoffs, purchase transports, and the ledger use the same durable critical-write policy with bounded retries where records are merged.

A Weav3r-assisted Trader Trade creates a confirmed `sell` event only after Torn shows the exact green completion message `Trade was accepted and is now complete!` for the same Trade ID and the exact Trade-ID verification record still contains a valid pre-ACCEPT snapshot. The transaction uses the actual completed Trader money as `totalPrice`; expected unit and total prices remain separate context. If the actual total divides evenly by quantity, the exact quotient is stored as `unitPrice`; otherwise `unitPrice` remains `null`. Repeated observers, rerenders, or revisits deduplicate on `sell:trade:<TRADE_ID>:item:<ITEM_ID>`.

Opening an offer creates a correlation-ID-keyed GM transport under `WEAV3R_ARBITRAGE_PURCHASE_TRANSPORTS` with a 30-minute TTL. This survives the `weav3r.dev` → `www.torn.com` origin boundary. A matching Bazaar handoff carries the same correlation ID; an exact Item Market `itemID` route claims only its matching transport. Torn then stores claimed records in the tab-local multi-record `WEAV3R_ARBITRAGE_TORN_PENDING_PURCHASES` collection, preserving unrelated transports for other tabs and reloads. Purchase transports, Torn pending claims, and permanent transaction history are separate layers and none is proof of purchase.

**Opening an offer is not a purchase. Clicking BUY is not a confirmed purchase. Only an exact supported Torn success signal may create a BUY transaction.** The repository does not yet contain confirmed live Bazaar or Item Market purchase-success DOM, so both purchase confirmation adapters deliberately return unconfirmed and no BUY ledger entry is created from a generic green message, click, submit, modal close, listing change, navigation, timeout, inventory change, or cash change. Live success DOM is required before BUY promotion can be enabled. The transaction subsystem never buys, selects, submits, or clicks a Torn market control.

### Transaction History

The main Arbitrage card's **History** button opens the accessible **Arbitrage History** modal using the same focus restoration, Escape handling, backdrop, and background-scroll locking as Watchlist and Settings. Its default **Transactions** view contains only normalized, confirmed ledger entries, newest first. Rows identify BUY or SELL, item, quantity, actual unit and total values, source, and confirmation time; **Details** reveals available counterparty, Trade, origin, expected-value, confirmation-method, correlation, and schema metadata without exposing unrelated storage.

Type and source filters, a local item/counterparty/Trade search, and newest/oldest sorting operate on one normalized in-memory read. Actual-minus-expected differences are calculated with `BigInt`, including exact positive and negative differences. A deliberately absent unit price remains `—` when an actual total is not evenly divisible by quantity; History never rounds or fabricates one. The summary reports only confirmed transaction, buy, and sell counts—there is no profit, ROI, cost-basis, FIFO, LIFO, or inventory-matching analysis.

Manual **Export JSON** and **Export CSV** links export normalized confirmed transactions in deterministic order. JSON uses schema version 1 and an export timestamp; CSV uses stable columns and raw canonical decimal money strings. Temporary purchase correlations are excluded from both exports. Ledger events remain immutable: History provides no edit, delete, quantity, price, or manual status controls. Invalid stored records remain untouched but are excluded with a visible raw/valid/rejected integrity warning. GM value-change listeners update an open view after ledger changes in another tab while preserving filters, expanded IDs, and scroll where practical.

The separate **Pending Purchases** tab displays unexpired normalized records from `WEAV3R_ARBITRAGE_PURCHASE_TRANSPORTS`, including item, source, origin, expected market quote when known, seller when known, correlation ID, age, expiry, and current evidence state. It is diagnostics only until exact confirmation. A successfully recorded Bazaar purchase is removed from Pending and appears as a confirmed BUY in Transactions.

On a matching Torn destination, a claimed correlation now has a tab-local, multi-record purchase-attempt model. Every supported native interaction will receive a unique `purchase-attempt:<timestamp>:<random>` ID, preserve the original expected/displayed Weav3r quote separately from values observed in Torn's purchase UI, and start a bounded 15-second diagnostic observer. Quantity is never assumed; a calculated attempt total is kept distinct from a Torn-observed total and uses `BigInt`. Detailed diagnostics expire with the 30-minute pending context and never enter the permanent ledger.

### Confirmed Bazaar purchases

Bazaar BUY capture supports Torn's semantic `data-testid` lifecycle. The delegated adapter resolves `[data-testid="item"]` from its native `/images/items/<ID>/` image when the user opens the Buy menu, while that original image still exists, and keeps this row-scoped identity only briefly. The subsequent native `[data-testid="buy-menu"] button[data-testid="buy-button"]` click must have the same item name and supplies the live unit price and quantity. That click marks the attempt as submitted and immediately starts the React-resilient result watcher; no additional Yes step is required. Clicking the initial `activate-buy-button` creates no purchase attempt. An optional native confirmation Yes can refine an already submitted attempt. The script never clicks any of these controls.

Only `[data-testid="success-message"][aria-label="Success"]` can confirm a Bazaar BUY. Its non-empty `aria-labelledby` must resolve to an internal `[data-testid="description"]` whose complete normalized text matches `You bought <quantity> x <item> from <seller>'s bazaar for a total of $<total>`. The successful quantity must match the submitted quantity. Torn's successful total is authoritative; a difference from the staged unit-price quote is retained as expected-versus-actual data rather than rejecting genuine success. Item ID comes from the exact staged native item image. A securely staged seller name must match; otherwise the exact Success seller name is retained with a null seller ID. Seller IDs are retained only when strong pre-purchase Bazaar identities agree. `#tt-total-cost`, `.tt-*`, and `#tt-*` Torn Tools annotations are never transaction evidence.

Helper-originated purchases preserve three lossless values: `marketQuoteUnitPrice` is the earlier Weav3r quote, `expectedUnitPrice` is the exact native Bazaar price shown at the submitted Buy action, and `unitPrice`/`totalPrice` come from the confirmed success. The optional quote field remains backward-compatible in ledger schema version 1 and is appended to CSV exports. Direct manual Bazaar flows create the same temporary correlation with `origin: direct-bazaar` only after an exact Buy-menu interaction, then use the same result-watcher, confirmation, and ledger path.

Confirmed Bazaar transactions use deterministic IDs `buy:bazaar:<attemptId>`. Repeated observer callbacks become duplicates; separate identical purchases have separate attempt IDs. Exact compact confirmation evidence is saved tab-locally before the durable ledger write. If storage fails or conflicts, evidence and pending state remain available for deterministic retry. Only a verified new write or identical duplicate cleans up that exact context, transport, handoff, stage, and observer while preserving unrelated purchases.

The small Torn tracking panel shows the exact correlation and offers manual **Copy diagnostics**. Its sanitized payload contains only whitelisted structural fingerprints, bounded text, route/item/correlation metadata, attempt values, at most 20 deduplicated candidate events, and the confirmation result—never HTML, arbitrary attributes, credentials, tokens, or full storage.

Pending History uses a narrow temporary GM mirror to show only evidenced progression: **Awaiting destination**, **Destination claimed**, **Purchase interaction observed**, or **Awaiting confirmed Torn purchase evidence**. Detailed events remain in the claiming Torn tab. Multiple correlations and attempts remain independent. Item Market BUYs are recorded only after a native BUY, matching confirmation, manual Yes action, and exact correlated Torn success message. Bazaar selectors are never reused for Item Market.

History JSON and CSV downloads use revocable Blob object URLs rather than potentially large data URLs. URLs are reused while normalized ledger content is unchanged and revoked when replaced, when History closes, or when the page unloads. Exports still include confirmed normalized ledger records only.

**Clicking Buy is not a confirmed purchase. Clicking Yes is not a confirmed purchase. Only the exact supported Torn Bazaar success message creates a confirmed Bazaar BUY.**

**Opening an offer is not a purchase. A pending purchase correlation is not a purchase. Clicking BUY is not a confirmed purchase. Only exact supported Torn success evidence may create a confirmed BUY.**

## Bazaar-Verkaufsmanager

The **Bazaar-Verkaufsmanager** runs only when the pathname is exactly `/bazaar.php` and the hash begins with `#/add`. It augments Torn's current, visible `ul.items-cont` inventory panel; it does not replace Torn's list or inputs and does not run on Bazaar purchase/manage pages, Item Market, Trade, or Weav3r.

Rows are identified from native item image paths (`/images/items/<ID>/`), names are cross-checked between Torn's name text and image alt text, and quantity comes from `.item-amount.qty`. Market Value per item is the first currency value in `[title="Market value"]`. Both documented TornTools stack-total layouts are recognized for diagnostics; sorting always uses the lossless BigInt calculation `value per item × quantity`, so a missing or inconsistent injected total cannot corrupt the normalized total.

The toolbar defaults to **Verkaufbarer Marktwert ↓** and also supports Name, quantity, Market Value per item, and total Market Value. It applies CSS `order` to the active category's native rows instead of moving React-managed nodes. The optional **Geschützte ausblenden** filter is visual only, and **Preis-Anpassung** retains the signed price offset. The manager also reconciles Torn's in-page hash navigation, so entering `#/add` does not require a reload. Per-item **Regel** values persist under `WEAV3R_ARBITRAGE_BAZAAR_SELL_RULES` (version 1):

Inventory quantity and sell-rule eligibility remain independent of Market Value availability. Market Value is used only for valuation, sorting, and the summary; sale-price filling continues to use current Bazaar marketplace data. Grouped and unique-item rows use separate row/instance keys for UI writes while continuing to share market data by Torn item ID. Groups are never opened automatically, and **1 behalten** requires manual instance selection.

- **Alles verkaufen** selects the full available quantity.
- **1 behalten** reserves one item and sells the remainder.
- **Nicht verkaufen** makes the effective sellable quantity zero.

**Verkaufbare auswählen** prepares Torn's native selection only. Text quantities are set to the rule-derived amount. Aggregate checkboxes are selected only when they can represent the requested amount exactly; “Keep 1” on a multi-item aggregate group is deliberately skipped until the user expands and selects it manually. **Auswahl leeren** clears only quantity/checkbox selections in the visible category, leaving prices, rules, sorting, caches, and history untouched.

**Preise füllen** reads the current native selection in the visible category and fills prices only; it never changes quantities or checkbox state. Users may reduce a quantity manually before starting it, while each sell rule remains the maximum safety limit. Fresh detailed caches are reused, and only selected stale or missing items are refreshed on demand through the same detail scheduler with at most two active requests. A guarded or failed item does not stop other selected items. The intended workflow is therefore **Verkaufbare auswählen** → optionally adjust quantities → **Preise füllen** → review → manually use Torn's ADD TO BAZAAR action. **Auswahl leeren** continues to clear selection only.

Each supported row has an independently implemented **Füllen** control. It prepares that row's sellable quantity and immediately uses a fresh detailed Bazaar cache when available. If that exact cache is missing or stale, the explicit click requests only that item ID from `https://weav3r.dev/api/marketplace/<ITEM_ID>`, shows **Bazaar-Preise werden geladen …**, stores valid detailed offers in the existing Bazaar cache, and then applies the current row, rule, adjustment, and price safeguards. Sorting, rendering, category changes, rule changes, bulk selection, and reset never trigger price requests, so there is no automatic mass scan.

The detail request is anonymous and intentionally sends only the requested item ID to `weav3r.dev`; it sends no Torn API key, Torn session, personal inventory, transaction history, or row payload. A network or malformed-response failure displays **Bazaar-Preise konnten nicht geladen werden**, while a valid empty result displays **Keine Bazaar-Angebote gefunden**. Existing stale offers are not presented as current choices after a failed refresh.

The strategy remains the cheapest normalized detailed Bazaar listing plus a configurable signed adjustment (default `-1`). Market Value and TornTools totals are never sale-price quotes. The compact row context shows up to eight fresh Bazaar offers; choosing one is an explicit manual price action.

Automatic price writing is refused when the cheapest listing (at least $10,000) is below 70% of the average of the next two or three listings, or when the proposal would lower a non-empty Torn price by more than 7%. A missing/stale Bazaar cache leaves the price unchanged. If `.torn-bazaar-fill-qty-price` indicates another Price Filler, only this helper's **Füllen** controls are disabled; sorting, rules, and bulk selection remain available.

"Verkaufbare auswählen" prepares Torn's native selection only.

"Füllen" prepares quantity/selection and price only.

The native "ADD TO BAZAAR" action always remains manual.

Selecting or listing an item is not recorded as a confirmed transaction. The manager never clicks, submits, navigates, confirms, or performs the final Bazaar sale.

## Torn inventory identity and History

On `item.php`, the helper parses only semantic Torn row attributes and item image/name crosschecks. Stack/parent rows retain their `g<itemId>` identity, while only rows with matching `data-armoryid` and `u<armoryId>` receive an instance identity. Open grouped instance rows always count as one each, regardless of Torn's group-internal `data-qty`. Each valid current row receives one compact button that opens the existing Shared History filtered by `itemId`; it does not claim instance-level accounting or calculate inventory value.

## Safety notes

- Prices can change quickly between scanning and purchase. Treat the card and Watchlist as convenience checks, not guarantees.
- The script does not use the Torn API and does not require or store an API key.
- The script does not automate purchases, sales, trades, Torn-control clicks, page opening, or form submission on `torn.com`. Only an explicit Bazaar Add Manager bulk/Fill action may prepare native quantity, checkbox, or price inputs; the final ADD TO BAZAAR action always remains manual. Its Trade inventory discovery may scroll to load rows, but it restores the prior position and never selects or adds an item. Modal scroll locking does not change these boundaries.
- The script does not use undocumented Weav3r API endpoints.
- Temporary hidden Weav3r frames are removed after success, failure, timeout, cancellation, or current-item route changes.
- Links such as `Open cheapest offer`, `Trader price list`, `Trade now`, and `Open Item` are normal links that open only when you click them.

### Neu in 0.3.6

- Native Weav3r-Klicks auf Bazaar-, Item-Market- und Trader-Ziele bewahren den exakten Item-/Zielkontext; ein manuell gewählter Trader wird nicht durch die automatische Auswahl ersetzt.
- Die gemeinsame Transaction History ist auf relevanten Torn-Seiten verfügbar und folgt sicheren Item-/Trade-Kontexten bei SPA-Navigation.
- `item.php` erhält in diesem Stand ausschließlich den History-Zugang; Inventarbewertung folgt separat.

### Neu in 0.4.0

- Bestätigte Transactions werden append-only unter einem eigenen Storage-Key pro Event gespeichert; parallele Tabs können dadurch keine unabhängigen Einträge gegenseitig überschreiben.
- Bestehende 0.3.x-History wird idempotent migriert, während der Legacy-Key als unveränderte Sicherheitskopie erhalten bleibt.
- Shared History auf Weav3r und Torn liest dieselben v2-Events über eine gecachte Repository-/Projection-Schicht und aktualisiert sich über einen Cross-Tab-Revision-Key.
- Das Event-Schema unterstützt mehrere Item-Lines für spätere Multi-Item-Abrechnung, ohne Cashbeträge willkürlich auf Lines zu verteilen.
- Item-Market-BUY-Bestätigung und `item.php`-Inventarbewertung folgen weiterhin in separaten Schritten.


### Neu in 0.4.1

- Ein konservativer Item-Market-Adapter korreliert native Offer-, Confirmation-, Yes- und Success-Zustände; nur exakte Torn-Erfolgsevidenz erzeugt einen bestätigten BUY-Event.
- Direkte Torn-Käufe und eindeutig passende Weav3r Purchase Transports werden unterstützt, wobei Live-Torn-Daten Vorrang haben.
- Failure, Abbruch, Timeout oder Item-/Seller-/Mengen-/Total-Mismatch erzeugen keine Transaction.
- `item.php`-Inventarbewertung, Cost Basis und automatische Käufe bleiben ausdrücklich außerhalb dieses Releases.

### Neu in 0.4.2

- Bazaar-Erfolgsmeldungen werden über einen React-/SPA-robusten Result-Watcher mit sofortigem Scan und sicherem Rebinding beobachtet.
- Ein Bazaar BUY wird weiterhin nur bei exakter Item-, Verkäufer- und Mengenkorrelation sowie semantisch validiertem Torn-Total dauerhaft bestätigt; Pending-Daten werden erst nach erfolgreichem v2-Write entfernt.

### Neu in 0.4.3

- Der Bazaar-Result-Watcher startet jetzt synchron beim echten nativen `buy-button`-Klick; der Live-Flow benötigt keinen zusätzlichen Yes-Schritt.
- `activate-buy-button` öffnet weiterhin nur das Menü und erzeugt weder Attempt noch Transaction; Torn-Success-Daten bleiben strikt mit dem eingereichten Snapshot korreliert.

### Neu in 0.4.4

- Bestätigte direkte Torn-Bazaar-Käufe benötigen keinen Weav3r-Handoff und keinen vorab bekannten Verkäufer; der Verkäufername darf aus der exakten Torn-Success-Evidenz stammen.
- Ein sicher vorab bekannter Verkäufer wird weiterhin strikt abgeglichen, Seller-IDs werden niemals aus Namen erraten, und mehrdeutige aktive Attempts bleiben unbestätigt.

### Neu in 0.4.5

- Der native `activate-buy-button` sichert kurzlebig Item-ID und Itemname, bevor Torn die ursprüngliche Row durch das Buy-Menü ersetzt; allein dadurch entsteht weiterhin weder Attempt noch Transaction.
- Der nachfolgende native `buy-button` übernimmt diese sichere Identität. Eine Item-ID in `bought-msg-<itemId>-…` dient ausschließlich als zusätzlicher Crosscheck gegen die Pre-Stage-ID.

### Neu in 0.4.6

- Item-Market-Offer und Confirmation werden über die logische Attempt-ID statt über ersetzbare React-Rows korreliert; Confirmation-Texte bleiben auch mit angehängtem `YesNo` parsebar.
- Der manuelle Yes-Klick startet einen document-level Result-Watcher mit Initial-Scan, Descendant-Prüfung, Deduplizierung und durablem v2-Cleanup erst nach bestätigtem Success.

### Neu in 0.5.0

- `item.php` erhält einen konservativen Inventory-Row-Parser mit getrennter Item-, Row-, Armory-Instance- und Group-Identität; konkrete `u<armoryId>`-Rows zählen unabhängig von Torn-`data-qty` jeweils als eine Instanz.
- Geschlossene `g<itemId>`-Parents und zusammenhängende offene `data-group="item"`-Blöcke werden als alternative Zustände derselben Gruppe modelliert. Jede gültige aktuelle Row erhält einen idempotenten Einstieg in die bestehende itemId-gefilterte Shared History.
- Preisbewertung, Cost Basis, Inventarwert, Gewinnberechnung, Sortierung und Item-Aktions-Tracking bleiben bewusst späteren Versionen vorbehalten.

### Neu in 0.5.1

- `item.php` zeigt pro logischem Item- bzw. geöffnetem Gruppenblock eine konservative, Item-ID-basierte Auswertung bestätigter v2-Events: getrackte Bestandsabdeckung, bestätigte Einkaufskosten und den gewichteten bestätigten Einkaufspreis.
- Eingehende und ausgehende Item-Lines werden mengenmäßig getrennt aggregiert. Unbekannte Preise, ungetrackte Bestände und Abweichungen zwischen Event-Verlauf und Torn-Bestand werden ausdrücklich als partiell, ungetrackt oder nicht vollständig rekonstruierbar ausgewiesen.
- Geldberechnungen bleiben BigInt-basiert; Multi-Line-Cash wird nie willkürlich verteilt. Offene Armory-Gruppen erhalten nur eine gemeinsame Basisanzeige, und konkrete Instanzen erben keine behauptete instanzspezifische Kaufhistorie.

### Neu in 0.5.2

- `item.php` zeigt pro logischem Inventory-Block zusätzlich den möglichen Bazaar-Bruttoverkaufswert aus derselben zentralen Preisempfehlung und Anomaly-Prüfung, die der Bazaar Add Manager verwendet.
- Die vorhandene signierte Bazaar-Preisanpassung gilt auch für die Bewertung. Stück- und Gesamtwerte werden BigInt-sicher berechnet; sie sind weder garantierter Erlös noch eine Profit- oder ROI-Aussage.
- Detail-Cache, laufende Requests und die bestehende Queue mit begrenzter Parallelität werden geteilt. Offene Gruppen werden nur einmal bewertet, unsichere oder fehlende Preise bleiben ausdrücklich nicht verfügbar.

### Neu in 0.5.3

- Sicher beobachtete, konkrete Trader-Buy-Preise aus der bestehenden Weav3r-Trader-Tabelle werden dauerhaft mit Item-, Trader- und Condition-Identität gespeichert. Gleiche Beobachtungen erhöhen Zähler und `lastSeenAt`; Preis- oder Condition-Änderungen bleiben als getrennte Historie erhalten.
- Trader-Quotes besitzen keinen TTL-Verfall. `item.php` bevorzugt junge Quotes aktuell eligible Trader, zeigt bei fehlender aktueller Verifizierbarkeit aber weiterhin den jüngsten gespeicherten Preis mit sichtbarem Alter und entsprechend vorsichtigem Status.
- Weav3r bleibt ausschließlich die aktualisierende Quelle: Ist die Seite nicht erreichbar, werden keine Daten erfunden oder gelöscht. Cost Basis, Bazaar und Trader bleiben getrennte Bewertungen; Best Sale, Profit und ROI folgen später.


### Neu in 0.5.4

- `item.php` zeigt pro logischem Inventory-Block zusätzlich **Best Sale**: Der reine Resolver vergleicht ausschließlich die sichere Bazaar-Preisempfehlung mit aktuell eligible Trader-Quotes und bevorzugt bei Gleichstand Bazaar.
- Nicht verifizierte gespeicherte Trader-Quotes schlagen keinen sicheren Bazaar-Wert. Nur wenn kein aktuell verifizierter Verkaufsweg existiert, erscheinen sie ausdrücklich als historischer, unverified Fallback.
- Stück- und Bruttogesamtwerte bleiben BigInt-basiert. Cost Basis, Bazaar und Trader bleiben separat sichtbar; Profit, ROI und Verkaufsausführung sind nicht Bestandteil dieser Version.


### Neu in 0.5.5

- `item.php` zeigt pro logischem Inventory-Block einen potentiellen Bruttogewinn und ROI ausschließlich für kostenmäßig sicher abgedeckte Einheiten und einen aktuell verifizierten Best-Sale-Kanal.
- Die aktuelle Restbestandsbasis verwendet bei vollständig bekannten bestätigten Inbounds eine BigInt-rationale WAC-Rechnung. Historische Gesamtkosten werden nach Outbounds nicht als Restbasis missverstanden; unbekannte oder widersprüchliche Zuordnungen bleiben nicht verfügbar.
- Partielle Coverage weist die einbezogene Menge sichtbar aus. Gespeicherte, aktuell unverified Trader-Quotes, unbekannte Bestandsanteile und Verkaufsgebühren fließen nicht in Profit oder ROI ein.


### Neu in 0.5.6

- Manuell geöffnete `weav3r.dev/item/<ID>`-Seiten persistieren sicher erkannte Trader-Tabellen nun über denselben Parser und Quote-Store wie der Hidden-Iframe-Collector. Initial Scan, asynchrones Rendering und SPA-Routenwechsel werden ohne Polling unterstützt.
- Der bestehende Quote-Key dedupliziert unveränderte Tabellenbeobachtungen im selben History-Record und erhöht deren Beobachtungszähler; Preisänderungen erzeugen weiterhin neue historische Records. Der bestehende `item.php`-Storage-Listener aktualisiert Trader, Best Sale und Profit tabübergreifend ohne Reload.


### Neu in 0.5.7

- `item.php` kann die aktuell dargestellten logischen Inventory-Blöcke nach Name, Menge sowie den bereits aufgelösten Basis-, Bazaar-, Trader-, Best-Sale-, Profit- und ROI-Werten sortieren. Fehlende Bewertungswerte bleiben in beiden Richtungen am Ende.
- Offene Gruppen werden ausschließlich als zusammenhängender Block verschoben; ihre Child-Reihenfolge bleibt erhalten. Containerbezogene stabile Block-Identitäten bewahren die ursprüngliche Torn-Reihenfolge auch über Group-Toggles, Search, Load More und asynchrone Refreshes.
- Sortierkriterium und Richtung werden separat persistent gespeichert. Exakte BigInt-/Ratio-Vergleiche nutzen ausschließlich die im bestehenden Inventory-Refresh bereits berechneten Strukturen und lösen keine zusätzlichen Store-Lesevorgänge oder Requests aus.


### Neu in 0.5.8

- Der Trader-Parser crosscheckt Trader-IDs nun über Profile-, Trade-Now- und Pricelist-Links in Trader- **und** Actions-Zelle. Dadurch werden reale Tabellen wie die Xanax-Seite auch dann sicher persistiert, wenn die ID-tragenden Links außerhalb der Trader-Zelle gerendert sind. Strukturierte DEBUG-Ereignisse verfolgen Route, Tabelle, Row-Rejections, Normalisierung, Store-Write, Eligibility und item.php-Auflösung.
- Die item.php-Sortierung sammelt relevante Sort-Key-Änderungen in einer Quiet-Period und erzwingt spätestens nach einer begrenzten Batch-Zeit eine Anwendung. Unveränderte aktive Keys lösen keine Sortierung aus; Benutzeränderungen und statische Kriterien reagieren unmittelbar.
- Eigene Blockverschiebungen werden vom Inventory-Observer erkannt und unterdrückt. Async Bazaar-, Trader-, Best-Sale- und Profit-Updates führen damit zu wenigen stabilen Batch-Sorts statt zu einem Reorder pro Einzelergebnis.


### Neu in 0.5.9

- Auf `item.php` lädt WAH Torns zunächst lazy dargestelltes eigenes Inventory über das vorhandene `#load-more-items`-Control und Torns normalen delegierten jQuery-Clickweg vollständig nach. Es werden weder private Torn-Funktionen noch eigene Inventory-Endpunkte oder künstliches Scrollen verwendet.
- Der Full-Load-Coordinator wartet nach jedem Trigger auf echten Fortschritt bei `data-from`, Row-Anzahl oder `data-all`, erkennt aktive Containerwechsel und bricht bei fehlendem Fortschritt, fehlendem Control oder fehlendem jQuery begrenzt ab. Im Fehlerfall bleibt das vorhandene Teil-Inventar normal nutzbar.
- Während des Full Loads bleibt die Reihenfolge stabil. Danach warten Bazaar-abhängige Sortierungen auf die bereits gestartete deduplizierte Bewertungsrunde und wenden einen aktuellen Snapshot statt einzelner Zwischenstände an; lokale und statische Kriterien warten nicht unnötig auf Bazaar.
- Pricing-, Trader-, Cost-Basis-, Best-Sale-, Profit- und ROI-Semantik bleiben unverändert.


### Neu in 0.5.10

- Der `item.php`-Full-Load-Coordinator behandelt noch fehlende `data-all`-, `data-from`- und `data-queue`-Attribute sowie verspätetes Load-More-Control oder jQuery als begrenzten, wiederaufnehmbaren Startup-Zustand. Readiness-Wiederholungen verbrauchen keine echten Load-Versuche; nur ausbleibender Fortschritt kann terminal abbrechen.
- Bazaar-abhängige Sortierungen erhalten nach dem vollständigen Inventory bereits nach einer kurzen Settle-Phase einen ersten Snapshot mit Missing-last, statt auf sämtliche Detailpreise zu warten. Weitere Ergebnisse werden in größeren Ergebnis- beziehungsweise Quiet-Period-Batches und abschließend nach Rundenende aktualisiert.
- Einzelne Bazaar-Ergebnisse starten nicht länger jeweils einen vollständigen Inventory-Refresh. Der vorhandene Cache-, Queue- und Request-Deduplizierungspfad bleibt unverändert; lokale Kriterien wie Name, Menge, Basis und Trader warten weiterhin nicht auf Bazaar.


### Neu in 0.5.11

- Der Full-Inventory-Loader greift über Tampermonkeys `unsafeWindow` auf Torns tatsächlich registriertes Seiten-jQuery zu. Ein bereits ladebereiter Live-Container triggert unmittelbar; der Load-More-Button wird vor jedem Trigger frisch aufgelöst und auf verbundenen, aktiven Zustand geprüft. Private Torn-Inventory-APIs oder Scroll-Automation werden weiterhin nicht verwendet.
- Sichere, anomaly-freie Marketplace-Detail-Beobachtungen werden kompakt und ohne TTL pro Item unter `WEAV3R_ARBITRAGE_BAZAAR_QUOTES_V1` gespeichert. Gleiche Preise aktualisieren `lastSeenAt` und den Beobachtungszähler; Preisänderungen ersetzen die letzte sichere Beobachtung.
- Bazaar-Sortierungen können sofort die gespeicherte Marktbeobachtung verwenden und wenden die aktuelle Bazaar-Anpassung jedes Mal neu über die bestehende Pricing Engine an. Fehlende Werte bleiben am Ende; Live-Abfragen laufen priorisiert und mit unveränderter Queue/Concurrency im Hintergrund.
- Gespeicherte Bazaar-Werte sind ausdrücklich nur Sortier- und Fallback-Anzeigen. Sie werden nicht als aktuell verifizierter Best Sale behandelt und erzeugen keinen regulären Profit oder ROI; Background-Ergebnisse bleiben gebatcht, damit nicht jede Antwort neu sortiert.


### Neu in 0.5.12

- Die `item.php`-Sortierung wendet nach dem vollständigen Inventory genau einen unveränderlichen Snapshot aus den aktuellen strukturierten Blockdaten an. Persistente Bazaar-Beobachtungen liefern dabei sofort Bazaar-Stück- und Gesamtwert-Keys; eine zusätzliche Preis-Settle-Phase ist für den ersten Snapshot nicht erforderlich.
- Background-Bazaar-, Best-Sale- und Profit-Aktualisierungen aktualisieren weiterhin Badges und Stores, verändern einen bereits angewandten Sort-Snapshot aber nicht mehr automatisch. Auch das Ende einer Background-Runde löst kein finales Auto-Resort aus.
- Veränderte aktive Sort-Keys markieren die Reihenfolge als **„Preise aktualisiert“**. Der neue kompakte **„Neu sortieren“**-Button sowie Änderungen von Kriterium oder Richtung wenden genau einmal einen frischen Snapshot aus den bereits aufgelösten Records an und lösen keine Preisabfrage aus.
- Verified Best Sale, Profit/ROI, Missing-last, Originalreihenfolge und logische Gruppen bleiben fachlich unverändert.

### Neu in 0.5.13

- Weav3r bindet sichtbare Trader-Tabellen an Item-ID **und** Route-Generation. Bei schnellen SPA-Wechseln bleibt die alte Tabelle gesperrt, bis der neue Item-DOM übernommen wurde; veraltete Auswertungen und Antworten können den aktuellen Item-State nicht überschreiben. Legacy-Trader-Caches ohne explizite Item-Bindung werden vorsorglich nicht wiederverwendet.
- `item.php` bietet den kombinierbaren Filter **„Nur Bazaar-Verkauf“**. Er verwendet direkt die vorhandenen Bazaar-Add-Regeln (`alle verkaufen`, `1 behalten`, `nicht verkaufen`), blendet Verkaufsmenge 0 blockweise aus und zeigt die geplante Verkaufsmenge statt sie aus dem Gesamtbestand neu zu erfinden.
- Die Weav3r-Itemkarte verlinkt **Bazaar** und **Trade** direkt mit der aktuellen stabilen Item-ID. Beide Ziel-URLs initialisieren die passende Item-Ansicht ohne vorherigen Listenbesuch.

### Neu in 0.5.14

- Der Bazaar-Verkaufsfilter ordnet Inventory-Rows nun über bereits vorhandene `data-rowkey`-Referenzen zu. Der irrtümlich vorausgesetzte, aber nie definierte `cssEscape`-Global entfällt; der produktive `item.php`-Refresh erreicht damit wieder Sort-Control, Verkaufsfilter und die Item-gebundenen Weav3r-Links.
- Weav3r-SPA-Routenwechsel invalidieren den sichtbaren item-spezifischen Arbitrage-/Trader-State synchron und zeigen sofort einen an Item-ID und Route-Generation gebundenen Loading-Zustand. Alte Timer, Collector-Ergebnisse und Render-Aufrufe dürfen die neue Route weder persistierend noch sichtbar überschreiben.
- Bazaar- und Trade-Links werden auf `item.php` pro logischem Inventory-Block aus dessen eigener Item-ID erzeugt. Bewertungs-, Sell-Rule- und Snapshot-Sortiersemantik bleiben unverändert.

### Neu in 0.5.15

- Der SPA-Route-Lifecycle verwendet für Source-Table-Header nun den bereits vorhandenen zentralen `normalizeHeaderText`-Helper; der irrtümlich angenommene, nicht definierte `normalizeText`-Name entfällt.
- Beim Item-Wechsel wird die sichtbare itemgebundene UI vor der optionalen Source-Table-Snapshot-Analyse neutralisiert. Schlägt der sekundäre Snapshot in einem unvollständigen DOM fehl, bleibt die Route konservativ im Loading-Zustand statt mit Trader-Daten der vorherigen Route stehen zu bleiben.
- VM-Integrationstests führen den echten A→B→C-Transition-Pfad mit Source-Tabellen aus. Ein zusätzlicher statischer Call-Scope-Scan prüft die neueren Route-, Inventory-, Sort-, Filter- und Quote-Funktionen auf nicht definierte Helper-Aufrufe.

### Neu in 0.5.16

- Der Weav3r-Routenwechsel behandelt den alten Source-Table-Snapshot nur noch als negativen Schutz für sichtbares DOM. Sicher an aktuelle Item-ID und Route-Generation gebundene Collector- oder Cache-Ergebnisse dürfen das Panel unabhängig davon aus dem Loading-Zustand lösen.
- In-place wiederverwendete Source-Tabellen werden anhand normalisierter Header, Row-Anzahl und relevanter Zeileninhalte erkannt. Reine Class-/Style-Änderungen geben stale DOM nicht frei; semantisch geänderte Inhalte dagegen schon.
- Die komplette WAH-Inventory-Ausgabe liegt pro logischem Block in einer eigenen, umbrechenden `.wah-item-row` zwischen Torns `.title-wrap` und `.cont-wrap`. Torn- und TornTools-Titel beziehungsweise Preise bleiben dadurch von History, Bewertungen, Links und Verkaufsmenge getrennt.
