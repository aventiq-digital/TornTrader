'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../weav3r-arbitrage-helper.user.js', `file://${__filename}`), 'utf8');

assert.match(source, /\.items-cont > li\[data-group="parent"\], \.items-cont > li\[data-group="child"\]/);
assert.match(source, /async function findTradeTargetWithProgressiveScroll\(\{ inventory, targetItemId, signal, isContextCurrent/);
assert.match(source, /step < TRADE_TARGET_DISCOVERY_MAX_STEPS && Date\.now\(\) < deadline && !signal\?\.aborted/);
assert.match(source, /tornState\.inventoryDiscoveryController\?\.abort\(\)/);
assert.match(source, /rowHasTradeItemId\(row, targetItemId\)/);
assert.match(source, /row\.querySelector\('\.item-amount\.qty'\)/);
assert.match(source, /input\[name="amount"\]/);
assert.match(source, /useAll\.textContent = `Use All \$\{available\}`/);
assert.match(source, /setControlledInputValue\(input, String\(available\), \{ change: true \}\)/);
assert.match(source, /if \(!found && isContextCurrent\(\)\)/);
assert.match(source, /currentTarget\?\.scrollIntoView\(\{ behavior: 'auto', block: 'center' \}\)/);
assert.match(source, /function getSafeWatchlistCheapestOffer\(entry, result\)/);
assert.match(source, /function resolveCheapestConcreteOffer\(result\)/);
assert.match(source, /function resolveCurrentMarketOfferCandidates\(itemId, result/);
assert.match(source, /const OFFER_CLICK_FRESHNESS_MS = 15 \* 1000/);
assert.match(source, /action: 'watchlist-open-cheapest-offer'/);
assert.match(source, /function refreshCurrentConcreteOffer\(itemId\)/);
assert.match(source, /function openCheapestOfferForItem\(\{ itemId, itemName, result = null, triggerElement = null, origin = 'item-page' \}\)/);
assert.match(source, /openCheapestOfferForItem\(\{ itemId, itemName: entry\?\.itemName, result: calculateWatchlistItem\(itemId\), triggerElement: target, origin: 'watchlist' \}\)/);
assert.match(source, /openCheapestOfferForItem\(\{ itemId: state\.itemId, itemName: getCurrentItemName\(\), result: state\.lastResult, triggerElement: target, origin: 'item-page' \}\)/);
assert.doesNotMatch(source, /openFreshCheapestOffer/);
assert.doesNotMatch(source, /window\.open\('', '_blank'\)/);
assert.doesNotMatch(source, /Checking current market offers…/);
assert.match(source, /state\.offerCheckingItems\.has\(id\)/);
assert.match(source, /name === `Item \$\{id\}`/);
assert.match(source, /writeBazaarHandoff\(handoff\)/);

const focusedSection = source.slice(source.indexOf('function collectTradeInventoryRows'), source.indexOf('function captureTradeIdIfNeeded'));
assert.doesNotMatch(focusedSection, /\.click\s*\(/);
assert.doesNotMatch(focusedSection, /requestSubmit|\.submit\s*\(/);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const offerContext = {
  URL,
  URLSearchParams,
  BigInt,
  normalizePositiveInt(value) { const number = Number.parseInt(value, 10); return Number.isInteger(number) && number > 0 ? number : null; },
  normalizeBoundedText(value, length) { return String(value || '').trim().slice(0, length); },
  logDebug() {},
};
vm.createContext(offerContext);
vm.runInContext(`${extractFunction('parseTornItemMarketUrl')}\n${extractFunction('buildTornItemMarketUrl')}\n${extractFunction('normalizeConcreteMarketUrl')}\n${extractFunction('normalizeConcreteOffer')}\n${extractFunction('resolveCheapestConcreteOffer')}`, offerContext);
const bazaar = { sourceType: 'bazaar', price: 1630000, sellerUrl: 'https://www.torn.com/bazaar.php?userId=3754506', sellerId: 3754506, capturedAt: 100 };
const itemMarket = { sourceType: 'itemMarket', price: 1629428, offerUrl: 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=361', capturedAt: 90 };
assert.equal(offerContext.resolveCheapestConcreteOffer({ itemId: 361, bazaarOffers: [bazaar], itemMarketOffers: [itemMarket] }).source, 'item-market');
assert.equal(offerContext.resolveCheapestConcreteOffer({ itemId: 361, bazaarOffers: [{ ...bazaar, price: 100 }], itemMarketOffers: [{ ...itemMarket, price: 200 }] }).source, 'bazaar');
assert.equal(offerContext.resolveCheapestConcreteOffer({ itemId: 361, bazaarOffers: [{ ...bazaar, price: 100, capturedAt: 10 }], itemMarketOffers: [{ ...itemMarket, price: 100, capturedAt: 20 }] }).source, 'item-market');
assert.equal(offerContext.resolveCheapestConcreteOffer({ itemId: 361, bazaarOffers: [], itemMarketOffers: [{ ...itemMarket, offerUrl: 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=999' }] }), null);

offerContext.loadCachedItemData = () => ({ bazaar: { capturedAt: 200, offers: [{ sourceType: 'bazaar', price: 2152000, sellerUrl: null }] }, itemMarket: null });
vm.runInContext(`${extractFunction('resolveCurrentMarketOfferCandidates')}\n${extractFunction('resolveCurrentMarketOffer')}`, offerContext);
assert.equal(offerContext.resolveCurrentMarketOffer(517, { lowestPurchase: { sourceType: 'bazaar', price: 2152000 } }).unitPrice, 2152000);
assert.equal(offerContext.resolveCurrentMarketOffer(517, { lowestPurchase: { sourceType: 'bazaar', price: 2152000 } }).source, 'bazaar');
assert.equal(offerContext.normalizeConcreteMarketUrl('item-market', 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=517', 517).includes('itemID=517'), true);
assert.equal(offerContext.parseTornItemMarketUrl('https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=403').itemId, 403);
assert.equal(offerContext.parseTornItemMarketUrl('https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=nope'), null);
assert.equal(offerContext.parseTornItemMarketUrl('https://www.torn.com/page.php?sid=ItemMarket#/market/view=home&itemID=403'), null);
assert.equal(offerContext.parseTornItemMarketUrl('https://www.torn.com/page.php?sid=ItemMarket#/market/view=search'), null);
assert.equal(offerContext.parseTornItemMarketUrl('https://www.torn.com/page.php#/market/view=search&itemID=403'), null);
assert.equal(offerContext.parseTornItemMarketUrl('https://www.torn.com/market.php?sid=ItemMarket#/market/view=search&itemID=403'), null);
assert.equal(offerContext.parseTornItemMarketUrl('http://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=403'), null);
assert.equal(offerContext.parseTornItemMarketUrl('https://evil.example/page.php?sid=ItemMarket#/market/view=search&itemID=403'), null);
assert.equal(offerContext.normalizeConcreteMarketUrl('item-market', 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=403', 404), '');

const handoffContext = {
  Date,
  BAZAAR_HANDOFF_TTL_MS: 5 * 60 * 1000,
  makeHandoffId() { return 'handoff-test'; },
  normalizePositiveInt: offerContext.normalizePositiveInt,
  normalizeNonNegativeInt(value) { const number = Number(value); return Number.isSafeInteger(number) && number >= 0 ? number : null; },
  normalizeBoundedText(value, length) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, length); },
  normalizeConcreteMarketUrl: offerContext.normalizeConcreteMarketUrl,
};
vm.createContext(handoffContext);
vm.runInContext(extractFunction('createBazaarHandoffFromConcreteOffer'), handoffContext);
const westonOffer = { source: 'bazaar', itemId: 517, unitPrice: 2152000, url: 'https://www.torn.com/bazaar.php?userId=12345', sellerId: 12345 };
const westonHandoff = handoffContext.createBazaarHandoffFromConcreteOffer(westonOffer, '  Weston   Marlin 177  ');
assert.equal(westonHandoff.itemId, 517);
assert.equal(westonHandoff.itemName, 'Weston Marlin 177');
assert.equal(westonHandoff.action, 'open-cheapest-offer');
assert.equal(westonHandoff.sellerId, 12345);
assert.ok(westonHandoff.expiresAt > westonHandoff.createdAt);

const ledgerStore = new Map();
const ledgerContext = {
  BigInt,
  Date,
  TRANSACTION_LEDGER_KEY: 'WEAV3R_ARBITRAGE_TRANSACTION_LEDGER',
  TRANSACTION_EVENT_PREFIX: 'WEAV3R_ARBITRAGE_TX_V2:',
  TRANSACTION_STORE_META_KEY: 'WEAV3R_ARBITRAGE_TX_STORE_META_V2',
  TRANSACTION_STORE_REVISION_KEY: 'WEAV3R_ARBITRAGE_TX_REVISION_V2',
  transactionStoreCache: { revision: null, events: null },
  Math,
  normalizePositiveInt: offerContext.normalizePositiveInt,
  normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); },
  gmGet(key, fallback) { return ledgerStore.has(key) ? structuredClone(ledgerStore.get(key)) : fallback; },
  gmSet(key, value) { ledgerStore.set(key, structuredClone(value)); },
  GM_listValues() { return Array.from(ledgerStore.keys()); },
  gmSetDurable(key, value, verifyFn) { ledgerStore.set(key, structuredClone(value)); return verifyFn(structuredClone(ledgerStore.get(key))) ? { ok: true } : { ok: false }; },
  logDebug() {},
};
vm.createContext(ledgerContext);
vm.runInContext([
  'normalizeMoneyString',
  'getConfirmedTransactionId',
  'normalizeConfirmedTransaction',
  'normalizeTransactionLedger',
  'diagnoseTransactionLedger',
  'transactionEventStorageKey',
  'transactionEventIdFromStorageKey',
  'listStoredTransactionEventKeys',
  'normalizeTransactionEventV2',
  'legacyTransactionToEvent',
  'transactionEventsMateriallyEqual',
  'invalidateTransactionEventCache',
  'signalTransactionStoreRevision',
  'readTransactionEvent',
  'recordTransactionEvent',
  'listTransactionEvents',
  'queryTransactionEvents',
  'projectTransactionEvent',
  'projectTransactionEvents',
  'legacyLedgerSignature',
  'migrateLegacyLedgerV1',
  'ensureTransactionStoreReady',
  'getTransactionStoreDiagnostics',
  'readTransactionLedgerDiagnostics',
  'readTransactionLedger',
  'transactionsMateriallyEqual',
  'recordConfirmedTransaction',
  'buildConfirmedTradeSale',
  'recordConfirmedTradeSale',
].map(extractFunction).join('\n'), ledgerContext);
assert.equal(JSON.stringify(ledgerContext.normalizeTransactionLedger(null)), '{"version":1,"transactions":{}}');
const tradeRecord = { version: 1, verificationId: 'verify-12888988', handoffId: 'handoff-12888988', tradeId: 12888988, traderId: 3546645, traderName: 'Brittany8781', itemId: 1298, itemName: 'Tin of Treats', unitSellPrice: 1416822, quantity: 5, expectedTotal: '7084110', offeredTotal: '7084110', snapshotAt: 1786119999000, simpleItemForMoneyTrade: true };
const completionEvidence = { tradeId: 12888988, evidenceText: 'Trade was accepted and is now complete!', confirmationMethod: 'trade-completion' };
const sale = ledgerContext.buildConfirmedTradeSale(tradeRecord, completionEvidence, 1786120000000);
assert.equal(sale.id, 'sell:trade:12888988:item:1298');
assert.equal(sale.type, 'sell');
assert.equal(sale.quantity, 5);
assert.equal(sale.unitPrice, '1416822');
assert.equal(sale.totalPrice, '7084110');
assert.equal(sale.expectedUnitPrice, '1416822');
assert.equal(sale.expectedTotalPrice, '7084110');
assert.equal(sale.counterpartyId, 3546645);
assert.equal(sale.confirmationMethod, 'trade-completion');
assert.equal(sale.confidence, 'confirmed');
assert.equal(ledgerContext.recordConfirmedTradeSale(tradeRecord, completionEvidence, 1786120000000).duplicate, false);
assert.equal(ledgerContext.recordConfirmedTradeSale(tradeRecord, completionEvidence, 1786120001000).duplicate, true);
assert.equal(Object.keys(ledgerContext.readTransactionLedger().transactions).length, 1);
assert.equal(ledgerContext.buildConfirmedTradeSale({ ...tradeRecord, snapshotAt: null }, completionEvidence), null);
assert.equal(ledgerContext.buildConfirmedTradeSale(tradeRecord, { ...completionEvidence, tradeId: 12881361 }), null);
assert.equal(ledgerContext.buildConfirmedTradeSale(tradeRecord, { ...completionEvidence, evidenceText: 'PAYMENT MATCHES' }), null);
assert.equal(ledgerContext.buildConfirmedTradeSale(tradeRecord, { ...completionEvidence, evidenceText: '' }), null);
assert.equal(ledgerContext.recordConfirmedTransaction({ ...sale, confidence: 'unknown' }).ok, false);
assert.equal(ledgerContext.recordConfirmedTransaction({ ...sale, confirmationMethod: '' }).ok, false);
assert.equal(ledgerContext.recordConfirmedTransaction({ ...sale, itemId: 0 }).ok, false);
assert.equal(ledgerContext.recordConfirmedTransaction({ ...sale, quantity: 0 }).ok, false);
assert.equal(ledgerContext.recordConfirmedTransaction({ ...sale, totalPrice: '0' }).ok, false);
assert.equal(ledgerContext.recordConfirmedTransaction({ ...sale, totalPrice: '-1' }).ok, false);
const overpaid = ledgerContext.buildConfirmedTradeSale({ ...tradeRecord, offeredTotal: '7084115' }, completionEvidence, 1786120002000);
assert.equal(overpaid.totalPrice, '7084115');
assert.equal(overpaid.unitPrice, '1416823');
assert.equal(overpaid.expectedTotalPrice, '7084110');
const nonDivisible = ledgerContext.buildConfirmedTradeSale({ ...tradeRecord, tradeId: 12888989, quantity: 3, offeredTotal: '100', expectedTotal: '4240000' }, { ...completionEvidence, tradeId: 12888989 }, 1786120003000);
assert.equal(nonDivisible.totalPrice, '100');
assert.equal(nonDivisible.unitPrice, null);
const unrelated = ledgerContext.normalizeConfirmedTransaction({ ...sale, tradeId: 12881361, itemId: 361, itemName: 'Neumune Tablet', quantity: 1, unitPrice: '1629428', totalPrice: '1629428', expectedUnitPrice: '1629428', expectedTotalPrice: '1629428', confirmedAt: 1786120004000 });
assert.equal(ledgerContext.recordConfirmedTransaction(unrelated).ok, true);
assert.equal(Object.keys(ledgerContext.readTransactionLedger().transactions).length, 2);
const conflict = ledgerContext.recordConfirmedTransaction({ ...sale, totalPrice: '7084115', unitPrice: '1416823' });
assert.equal(conflict.ok, false);
assert.equal(conflict.reason, 'transaction-conflict');
assert.match(source, /if \(snapshot\) recordConfirmedTradeSale\(record, completion, Date\.now\(\)\)/);

vm.runInContext([
  'diagnoseTransactionLedger',
  'formatLedgerMoney',
  'getTransactionDifference',
  'normalizeHistorySearch',
  'filterAndSortTransactions',
  'summarizeTransactions',
].map(extractFunction).join('\n'), ledgerContext);
const futureKrillSale = ledgerContext.normalizeConfirmedTransaction({ type: 'sell', source: 'trade', itemId: 361, itemName: 'Neumune Tablet', quantity: 2, unitPrice: '1650759', totalPrice: '3301518', counterpartyId: 3247296, counterpartyName: 'KRILL', tradeId: 12900646, origin: 'trader-trade', expectedUnitPrice: '1650759', expectedTotalPrice: '3301518', confirmedAt: 1786121000000, confirmationMethod: 'trade-completion', confidence: 'confirmed' });
const historyRows = [sale, futureKrillSale];
assert.equal(ledgerContext.formatLedgerMoney('7084110'), '$7,084,110');
assert.equal(ledgerContext.formatLedgerMoney(ledgerContext.getTransactionDifference({ totalPrice: '7084115', expectedTotalPrice: '7084110' }), true), '+$5');
assert.equal(ledgerContext.formatLedgerMoney(ledgerContext.getTransactionDifference({ totalPrice: '900', expectedTotalPrice: '1000' }), true), '-$100');
assert.equal(nonDivisible.unitPrice, null);
assert.equal(ledgerContext.filterAndSortTransactions(historyRows, { type: 'sell', source: 'trade', search: 'Tin of Treats', sort: 'newest' }).length, 1);
for (const query of ['1298', 'Brittany8781', '3546645', '12888988']) assert.equal(ledgerContext.filterAndSortTransactions(historyRows, { search: query }).at(0).itemId, 1298);
assert.equal(ledgerContext.filterAndSortTransactions(historyRows, { search: 'KRILL' }).at(0).tradeId, 12900646);
assert.equal(ledgerContext.filterAndSortTransactions(historyRows, { sort: 'newest' }).at(0).tradeId, 12900646);
assert.equal(ledgerContext.filterAndSortTransactions(historyRows, { sort: 'oldest' }).at(0).tradeId, 12888988);
assert.deepEqual(JSON.parse(JSON.stringify(ledgerContext.summarizeTransactions([...historyRows, { ...sale, type: 'buy' }]))), { confirmed: 3, buys: 1, sells: 2 });
const diagnosed = ledgerContext.diagnoseTransactionLedger({ version: 1, transactions: { a: sale, b: futureKrillSale, bad1: {}, bad2: { ...sale, quantity: 0 } } });
assert.equal(diagnosed.rawCount, 4);
assert.equal(diagnosed.validCount, 2);
assert.equal(diagnosed.rejectedCount, 2);
assert.match(source, /data-action="open-history-dialog"/);
assert.match(source, /role', 'dialog'/);
assert.match(source, /Warning: \$\{diagnostics\.rejectedCount\} stored transaction record\(s\) could not be validated/);
ledgerContext.TRANSACTION_CSV_COLUMNS = ['id', 'type', 'confirmedAt', 'itemId', 'itemName', 'quantity', 'unitPrice', 'totalPrice', 'source', 'origin', 'counterpartyId', 'counterpartyName', 'tradeId', 'expectedUnitPrice', 'expectedTotalPrice', 'confirmationMethod', 'correlationId', 'marketQuoteUnitPrice'];
vm.runInContext(['getExportTransactions', 'serializeTransactionJson', 'escapeCsvField', 'serializeTransactionCsv'].map(extractFunction).join('\n'), ledgerContext);
const exportLedger = { version: 1, transactions: { pendingMustNotAppear: { type: 'pending' }, futureKrillSale, sale } };
const jsonExport = JSON.parse(ledgerContext.serializeTransactionJson(exportLedger, '2026-08-08T00:00:00.000Z'));
assert.equal(jsonExport.exportedAt, '2026-08-08T00:00:00.000Z');
assert.equal(jsonExport.schemaVersion, 1);
assert.deepEqual(jsonExport.transactions.map((transaction) => transaction.id), ['sell:trade:12888988:item:1298', 'sell:trade:12900646:item:361']);
assert.equal(typeof jsonExport.transactions[0].totalPrice, 'string');
assert.equal(jsonExport.transactions.some((transaction) => transaction.type === 'pending'), false);
const specialSale = ledgerContext.normalizeConfirmedTransaction({ ...futureKrillSale, tradeId: 12900647, itemId: 362, itemName: 'Quoted, "Item"\nName', confirmedAt: 1786122000000 });
const csvExport = ledgerContext.serializeTransactionCsv({ version: 1, transactions: { sale, specialSale } });
assert.equal(csvExport.split('\r\n')[0], ledgerContext.TRANSACTION_CSV_COLUMNS.join(','));
assert.match(csvExport, /1416822,7084110/);
assert.match(csvExport, /"Quoted, ""Item"" Name"/);
assert.equal(ledgerContext.escapeCsvField('Line one\nLine two'), '"Line one\nLine two"');
assert.doesNotMatch(csvExport, /pendingMustNotAppear/);
assert.match(source, /download="weav3r-arbitrage-transactions-\$\{date\}\.json"/);
assert.match(source, /download="weav3r-arbitrage-transactions-\$\{date\}\.csv"/);
assert.match(source, /Awaiting confirmed Torn purchase evidence/);
assert.match(source, /Pending correlations are temporary diagnostics, not confirmed transactions/);
assert.match(source, /GM_addValueChangeListener\(PURCHASE_TRANSPORTS_KEY/);
assert.match(source, /new Blob\(\[json\]/);
assert.match(source, /URL\.createObjectURL/);
assert.match(source, /URL\.revokeObjectURL/);
assert.doesNotMatch(source, /data:application\/json/);
assert.doesNotMatch(source, /data:text\/csv/);
assert.match(source, /lastKnownState: 'destination-claimed'/);
assert.match(source, /lastKnownState: \['purchase-submitted', 'awaiting-confirmation'\]\.includes\(attempt\.attemptState\)/);
assert.match(source, /'destination-claimed': 'Destination claimed'/);
assert.match(source, /'interaction-observed': 'Purchase interaction observed'/);
assert.match(source, /'awaiting-confirmation': 'Awaiting confirmed Torn purchase evidence'/);

const pendingSession = new Map();
const pendingContext = {
  Date,
  Math,
  PENDING_PURCHASE_CONTEXTS_SESSION_KEY: 'WEAV3R_ARBITRAGE_PENDING_PURCHASE_CONTEXTS',
  PENDING_PURCHASE_TTL_MS: 30 * 60 * 1000,
  PURCHASE_DIAGNOSTIC_EVENT_LIMIT: 20,
  sessionStorage: {
    getItem(key) { return pendingSession.get(key) || null; },
    setItem(key, value) { pendingSession.set(key, value); },
  },
  normalizePositiveInt: offerContext.normalizePositiveInt,
  normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); },
  normalizeMoneyString: ledgerContext.normalizeMoneyString,
  logDebug() {},
  logWarn() {},
};
vm.createContext(pendingContext);
vm.runInContext([
  'appendPurchaseDiagnosticEvent',
  'normalizePurchaseAttempt',
  'createPurchaseAttempt',
  'normalizePendingPurchaseContext',
  'readPendingPurchaseContexts',
  'writePendingPurchaseContexts',
  'prunePendingPurchaseContexts',
  'createPendingPurchaseContext',
  'deletePendingPurchaseContext',
  'resolveConfirmedBazaarPurchase',
  'resolveConfirmedItemMarketPurchase',
].map(extractFunction).join('\n'), pendingContext);
const pendingNow = 1786120000000;
const watchlistPending = pendingContext.createPendingPurchaseContext({ source: 'bazaar', itemId: 517, itemName: 'Weston Marlin 177', sellerId: 12345, displayedUnitPrice: 2152000, origin: 'watchlist' }, pendingNow);
const itemPagePending = pendingContext.createPendingPurchaseContext({ source: 'item-market', itemId: 403, itemName: 'Can of Taurine Elite', displayedUnitPrice: '3000000', origin: 'item-page' }, pendingNow + 1);
assert.equal(watchlistPending.ok, true);
assert.equal(watchlistPending.context.origin, 'watchlist');
assert.equal(watchlistPending.context.source, 'bazaar');
assert.equal(watchlistPending.context.displayedUnitPrice, '2152000');
assert.equal(watchlistPending.context.intendedQuantity, undefined);
assert.equal(itemPagePending.context.source, 'item-market');
assert.equal(itemPagePending.context.origin, 'item-page');
assert.notEqual(watchlistPending.context.correlationId, itemPagePending.context.correlationId);
assert.equal(Object.keys(pendingContext.readPendingPurchaseContexts(pendingNow + 2).pending).length, 2);
assert.equal(Object.keys(pendingContext.readPendingPurchaseContexts(pendingNow + 30 * 60 * 1000 + 2).pending).length, 0);
assert.equal(pendingContext.resolveConfirmedBazaarPurchase().confirmed, false);
assert.equal(pendingContext.resolveConfirmedBazaarPurchase().reason, 'bazaar-source-mismatch');
assert.equal(pendingContext.resolveConfirmedItemMarketPurchase().confirmed, false);
assert.equal(pendingContext.resolveConfirmedItemMarketPurchase().reason, 'item-market-attempt-not-awaiting-success');

const claimedForAttempts = { ...watchlistPending.context, claimedAt: pendingNow + 5 };
const firstAttempt = pendingContext.createPurchaseAttempt(claimedForAttempts, { interactionMethod: 'button', observedUnitPrice: '1425000', observedQuantity: 3, route: '/bazaar.php' }, pendingNow + 10);
const secondAttempt = pendingContext.createPurchaseAttempt(claimedForAttempts, { interactionMethod: 'form', observedUnitPrice: '900719925474099312345', observedQuantity: null, route: '/bazaar.php' }, pendingNow + 11);
assert.ok(firstAttempt.attemptId.startsWith('purchase-attempt:'));
assert.notEqual(firstAttempt.attemptId, secondAttempt.attemptId);
assert.equal(firstAttempt.correlationId, claimedForAttempts.correlationId);
assert.equal(claimedForAttempts.displayedUnitPrice, '2152000');
assert.equal(firstAttempt.observedUnitPrice, '1425000');
assert.equal(firstAttempt.observedQuantity, 3);
assert.equal(firstAttempt.calculatedAttemptTotal, '4275000');
assert.equal(secondAttempt.observedUnitPrice, '900719925474099312345');
assert.equal(secondAttempt.observedQuantity, undefined);
const evidenceAttempt = pendingContext.normalizePurchaseAttempt({ ...firstAttempt, lastConfirmationResult: 'confirmed', persistenceState: 'write-failed', confirmationEvidence: { itemName: 'Plastic Watch', quantity: 1, sellerName: 'DoctorManhattan', totalPrice: '386', evidenceText: "You bought 1 x Plastic Watch from DoctorManhattan's bazaar for a total of $386", confirmedAt: pendingNow + 20 } });
assert.equal(evidenceAttempt.persistenceState, 'write-failed');
assert.equal(evidenceAttempt.confirmationEvidence.totalPrice, '386');
let buffered = firstAttempt;
for (let index = 0; index < 21; index += 1) buffered = pendingContext.appendPurchaseDiagnosticEvent(buffered, { type: `event-${index}`, observedAt: pendingNow + index, summary: `summary-${index}` });
assert.equal(buffered.diagnosticEvents.length, 20);
assert.equal(buffered.diagnosticEvents[0].type, 'event-1');
const beforeDuplicate = buffered.diagnosticEvents.length;
buffered = pendingContext.appendPurchaseDiagnosticEvent(buffered, { type: 'event-20', observedAt: pendingNow + 99, summary: 'summary-20' });
assert.equal(buffered.diagnosticEvents.length, beforeDuplicate);
assert.equal(Object.values(ledgerContext.readTransactionLedger().transactions).filter((transaction) => transaction.type === 'buy').length, 0);
pendingContext.sanitizePurchaseDiagnosticElement = undefined;
vm.runInContext(extractFunction('sanitizePurchaseDiagnosticElement'), pendingContext);
const requestedAttributes = [];
const diagnosticElement = { nodeType: 1, tagName: 'BUTTON', id: 'purchase-control', textContent: `  Buy   now ${'x'.repeat(400)}  `, classList: ['buy', 'react-123'], parentElement: { tagName: 'FORM', id: 'purchase-form', getAttribute(name) { return name === 'role' ? 'form' : null; } }, getAttribute(name) { requestedAttributes.push(name); return ({ type: 'submit', name: 'purchase', role: 'button', 'aria-label': 'Buy item', 'data-testid': 'market-buy', token: 'MUST-NOT-LEAK', csrf: 'MUST-NOT-LEAK' })[name] || null; } };
const sanitized = pendingContext.sanitizePurchaseDiagnosticElement(diagnosticElement);
assert.equal(sanitized.tag, 'button');
assert.equal(sanitized.text.length <= 300, true);
assert.equal(sanitized.dataTestId, 'market-buy');
assert.equal('outerHTML' in sanitized, false);
assert.equal('innerHTML' in sanitized, false);
assert.equal(requestedAttributes.some((name) => /token|csrf|auth|session|key|secret/i.test(name)), false);
const bazaarPurchaseContext = { BigInt, Math, Date, URL, location: { href: 'https://www.torn.com/bazaar.php?userId=1750790', pathname: '/bazaar.php', search: '?userId=1750790', hash: '' }, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); }, normalizeMoneyString: ledgerContext.normalizeMoneyString, normalizedItemText(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }, sanitizePurchaseDiagnosticElement() { return { tag: 'div' }; } };
vm.createContext(bazaarPurchaseContext);
vm.runInContext(['getBazaarItemImages', 'parseBazaarItemImageId', 'resolveBazaarItemIdentity', 'parseNativeBazaarMoney', 'resolveStrongBazaarSellerId', 'parseBazaarBuyStage', 'parseConfirmedBazaarSuccess', 'findMatchingBazaarPurchaseAttempts', 'resolveConfirmedBazaarPurchase', 'collectBazaarSuccessCandidates'].map(extractFunction).join('\n'), bazaarPurchaseContext);
const image = { getAttribute(name) { return name === 'src' ? '/images/items/58/large.png' : name === 'alt' ? 'Plastic Watch' : ''; } };
const cardName = { textContent: 'Plastic Watch' };
const plasticWatchItem = { matches(selector) { return selector === '[data-testid="item"]'; }, querySelectorAll(selector) { return selector.includes('img') ? [image] : []; }, querySelector(selector) { return selector.includes('buy-item-name') ? null : selector.includes('[data-testid="name"]') ? cardName : null; } };
assert.deepEqual({ ...bazaarPurchaseContext.resolveBazaarItemIdentity(plasticWatchItem) }, { itemId: 58, itemName: 'Plastic Watch' });
const menuNodes = { '[data-testid="buy-item-name"]': { textContent: 'Book of Carols' }, '[data-testid="buy-item-price"]': { textContent: '$13,503,599' }, '[data-testid="buy-amount-field"] input[data-testid="number-input"]': { value: '1' } };
const menu = { querySelector(selector) { return menuNodes[selector] || (selector === '#tt-total-cost' ? { textContent: '$999' } : null); } };
const bookItem = { matches(selector) { return selector === '[data-testid="item"]'; }, querySelectorAll() { return [{ getAttribute(name) { return name === 'src' ? '/images/items/58/large.png' : ''; } }]; }, querySelector(selector) { if (selector === '[data-testid="buy-menu"]') return menu; if (selector.includes('buy-item-name')) return menuNodes['[data-testid="buy-item-name"]']; return null; } };
const stagedBook = bazaarPurchaseContext.parseBazaarBuyStage(bookItem, null, 1000).stage;
assert.equal(stagedBook.itemName, 'Book of Carols');
assert.equal(stagedBook.observedUnitPrice, '13503599');
assert.equal(stagedBook.observedQuantity, 1);
assert.equal(stagedBook.calculatedAttemptTotal, '13503599');
assert.notEqual(stagedBook.observedUnitPrice, '999');
const description = { textContent: "You bought 1 x Skeleton Key from DoctorManhattan's bazaar for a total of $79,199", getAttribute(name) { return name === 'data-testid' ? 'description' : null; } };
const successNode = { matches(selector) { return selector === '[data-testid="success-message"][aria-label="Success"]'; }, getAttribute(name) { return name === 'aria-labelledby' ? 'bought-msg-1204-0' : null; }, contains(node) { return node === description; }, ownerDocument: { getElementById(id) { return id === 'bought-msg-1204-0' ? description : null; } } };
const parsedSkeleton = bazaarPurchaseContext.parseConfirmedBazaarSuccess(successNode);
assert.deepEqual({ ...parsedSkeleton }, { quantity: 1, itemName: 'Skeleton Key', sellerName: 'DoctorManhattan', totalPrice: '79199', evidenceText: "You bought 1 x Skeleton Key from DoctorManhattan's bazaar for a total of $79,199", labelledItemId: 1204 });
const makeSuccess = (text, overrides = {}) => { const labelledBy = overrides.labelledBy === undefined ? 'message-id' : overrides.labelledBy; const nodeDescription = { textContent: text, getAttribute(name) { return name === 'data-testid' ? (overrides.descriptionTestId || 'description') : null; } }; return { matches(selector) { return !overrides.badSelector && selector === '[data-testid="success-message"][aria-label="Success"]'; }, getAttribute(name) { return name === 'aria-labelledby' ? labelledBy : null; }, contains(node) { return !overrides.outside && node === nodeDescription; }, ownerDocument: { getElementById(id) { return id === labelledBy ? nodeDescription : null; } } }; };
const parsedFineChisel = bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess("You bought 1 x Fine Chisel from XuraCut's bazaar for a total of $30"));
assert.deepEqual({ ...parsedFineChisel }, { quantity: 1, itemName: 'Fine Chisel', sellerName: 'XuraCut', totalPrice: '30', evidenceText: "You bought 1 x Fine Chisel from XuraCut's bazaar for a total of $30" });
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess('Purchase successful')), null);
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess("You bought 0 x Skeleton Key from DoctorManhattan's bazaar for a total of $79,199")), null);
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess('You bought 1 x Skeleton Key from DoctorManhattan bazaar for a total of $79,199')), null);
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess('You bought 1 x Skeleton Key from DoctorManhattan’s bazaar for a total of $79,199')).sellerName, 'DoctorManhattan');
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess("You bought 1 x Skeleton Key from DoctorManhattan's bazaar for a total of $nope")), null);
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess("You bought 1 x Skeleton Key from DoctorManhattan's bazaar for a total of $79,199", { labelledBy: '' })), null);
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess("You bought 1 x Skeleton Key from DoctorManhattan's bazaar for a total of $79,199", { outside: true })), null);
assert.equal(bazaarPurchaseContext.parseConfirmedBazaarSuccess(makeSuccess("You bought 1 x Skeleton Key from DoctorManhattan's bazaar for a total of $79,199", { descriptionTestId: 'other' })), null);
const strictContext = { source: 'bazaar', correlationId: 'purchase:test', activeAttemptId: 'attempt:test' };
const strictAttempt = { attemptId: 'attempt:test', correlationId: 'purchase:test', attemptState: 'purchase-submitted', confirmationObservationExpiresAt: 2000, itemId: 1204, itemName: 'Skeleton Key', observedSellerName: 'DoctorManhattan', observedQuantity: 1, calculatedAttemptTotal: '79199' };
bazaarPurchaseContext.readPendingPurchaseContexts = () => ({ pending: { [strictContext.correlationId]: { ...strictContext, attempts: { [strictAttempt.attemptId]: strictAttempt } } } });
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, strictAttempt, { contains: () => true }, 1500).confirmed, true);
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, itemName: 'Plastic Watch' }, { contains: () => true }, 1500).reason, 'bazaar-success-item-mismatch');
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, observedSellerName: 'AnotherTrader' }, { contains: () => true }, 1500).reason, 'bazaar-success-seller-mismatch');
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, observedQuantity: 2 }, { contains: () => true }, 1500).reason, 'bazaar-success-quantity-mismatch');
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, observedTotalPrice: '79200' }, { contains: () => true }, 1500).reason, 'bazaar-success-total-mismatch');
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, calculatedAttemptTotal: '79200' }, { contains: () => true }, 1500).confirmed, true);
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, attemptState: 'interaction-observed' }, { contains: () => true }, 1500).reason, 'bazaar-purchase-not-submitted');
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, { ...strictAttempt, attemptState: 'awaiting-confirmation', manualConfirmationAction: 'yes' }, { contains: () => true }, 1500).confirmed, true);
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(successNode, strictContext, strictAttempt, { contains: () => true }, 2500).reason, 'bazaar-confirmation-window-expired');
const directContext = { source: 'bazaar', correlationId: 'purchase:direct-fine-chisel', activeAttemptId: 'attempt:direct-fine-chisel', origin: 'direct-bazaar' };
const directAttempt = { attemptId: directContext.activeAttemptId, correlationId: directContext.correlationId, attemptState: 'purchase-submitted', confirmationObservationExpiresAt: 2000, itemId: 359, itemName: 'Fine Chisel', observedQuantity: 1, observedUnitPrice: '30', calculatedAttemptTotal: '30' };
const directSuccessNode = makeSuccess("You bought 1 x Fine Chisel from XuraCut's bazaar for a total of $30", { labelledBy: 'bought-msg-359-20554289128' });
bazaarPurchaseContext.readPendingPurchaseContexts = () => ({ pending: { [directContext.correlationId]: { ...directContext, attempts: { [directAttempt.attemptId]: directAttempt } } } });
const directConfirmation = bazaarPurchaseContext.resolveConfirmedBazaarPurchase(directSuccessNode, directContext, directAttempt, { contains: () => true }, 1500);
assert.equal(directConfirmation.confirmed, true);
assert.equal(directConfirmation.sellerName, 'XuraCut');
assert.equal(directConfirmation.sellerId, null);
bazaarPurchaseContext.readPendingPurchaseContexts = () => ({ pending: { first: { ...directContext, correlationId: 'first', activeAttemptId: 'first-attempt', attempts: { 'first-attempt': { ...directAttempt, correlationId: 'first', attemptId: 'first-attempt' } } }, second: { ...directContext, correlationId: 'second', activeAttemptId: 'second-attempt', attempts: { 'second-attempt': { ...directAttempt, correlationId: 'second', attemptId: 'second-attempt' } } } } });
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(directSuccessNode, { ...directContext, correlationId: 'first', activeAttemptId: 'first-attempt' }, { ...directAttempt, correlationId: 'first', attemptId: 'first-attempt' }, { contains: () => true }, 1500).reason, 'bazaar-success-attempt-ambiguous');
const thompsonPreStage = { preStageId: 'bazaar-menu:thompson', itemId: 487, itemName: 'Thompson', createdAt: 1000, expiresAt: 3000 };
const thompsonImage = { getAttribute(name) { return name === 'src' ? '/images/items/487/large.png' : name === 'alt' ? 'Thompson' : ''; } };
const thompsonInitialItem = { matches: () => true, querySelectorAll: (selector) => selector.includes('img') ? [thompsonImage] : [], querySelector(selector) { return selector.includes('[data-testid="name"]') ? { textContent: 'Thompson' } : null; } };
bazaarPurchaseContext.tornState = { bazaarMenuPreStages: new WeakMap() }; bazaarPurchaseContext.BAZAAR_BUY_STAGE_TTL_MS = 120000; bazaarPurchaseContext.logDebug = () => {};
vm.runInContext(extractFunction('captureBazaarMenuPreStage'), bazaarPurchaseContext);
const capturedThompsonPreStage = bazaarPurchaseContext.captureBazaarMenuPreStage(thompsonInitialItem, 1000);
assert.equal(capturedThompsonPreStage.itemId, 487);
assert.equal(capturedThompsonPreStage.itemName, 'Thompson');
assert.equal(bazaarPurchaseContext.tornState.bazaarMenuPreStages.get(thompsonInitialItem).preStageId, capturedThompsonPreStage.preStageId);
const thompsonMenuNodes = { '[data-testid="buy-item-name"]': { textContent: 'Thompson' }, '[data-testid="buy-item-price"]': { textContent: '$515' }, '[data-testid="buy-amount-field"] input[data-testid="number-input"]': { value: '1' } };
const thompsonMenu = { querySelector: (selector) => thompsonMenuNodes[selector] || null };
const thompsonMenuItemWithoutImage = { querySelector: (selector) => selector === '[data-testid="buy-menu"]' ? thompsonMenu : null, querySelectorAll: () => [], matches: () => true };
const thompsonStage = bazaarPurchaseContext.parseBazaarBuyStage(thompsonMenuItemWithoutImage, null, 1500, thompsonPreStage).stage;
assert.equal(thompsonStage.itemId, 487);
assert.equal(thompsonStage.itemName, 'Thompson');
assert.equal(thompsonStage.observedUnitPrice, '515');
assert.equal(thompsonStage.observedQuantity, 1);
assert.equal(bazaarPurchaseContext.parseBazaarBuyStage({ ...thompsonMenuItemWithoutImage, querySelector(selector) { if (selector === '[data-testid="buy-menu"]') return { querySelector(inner) { return inner === '[data-testid="buy-item-name"]' ? { textContent: 'Another Item' } : thompsonMenuNodes[inner] || null; } }; return null; } }, null, 1500, thompsonPreStage).reason, 'bazaar-stage-name-mismatch');
const thompsonContext = { source: 'bazaar', correlationId: 'purchase:thompson', activeAttemptId: 'attempt:thompson' };
const thompsonAttempt = { attemptId: 'attempt:thompson', correlationId: 'purchase:thompson', attemptState: 'purchase-submitted', confirmationObservationExpiresAt: 3000, itemId: 487, itemName: 'Thompson', observedQuantity: 1, observedUnitPrice: '515', calculatedAttemptTotal: '515' };
bazaarPurchaseContext.readPendingPurchaseContexts = () => ({ pending: { [thompsonContext.correlationId]: { ...thompsonContext, attempts: { [thompsonAttempt.attemptId]: thompsonAttempt } } } });
const thompsonSuccess = makeSuccess("You bought 1 x Thompson from XuraCut's bazaar for a total of $515", { labelledBy: 'bought-msg-487-20442307880' });
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(thompsonSuccess, thompsonContext, thompsonAttempt, { contains: () => true }, 2000).confirmed, true);
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(makeSuccess("You bought 1 x Thompson from XuraCut's bazaar for a total of $515", { labelledBy: 'bought-msg-999-20442307880' }), thompsonContext, thompsonAttempt, { contains: () => true }, 2000).reason, 'bazaar-success-labelled-item-mismatch');
assert.equal(bazaarPurchaseContext.resolveConfirmedBazaarPurchase(makeSuccess("You bought 1 x Thompson from XuraCut's bazaar for a total of $515"), thompsonContext, thompsonAttempt, { contains: () => true }, 2000).confirmed, true);
const successDescendant = { nodeType: 1, matches: () => false, querySelectorAll: () => [successNode, successNode] };
assert.equal(bazaarPurchaseContext.collectBazaarSuccessCandidates(successDescendant).length, 1);
assert.equal(bazaarPurchaseContext.collectBazaarSuccessCandidates({ nodeType: 3 }).length, 0);
const replacementBazaarRoot = { isConnected: true };
const fallbackBody = { isConnected: true };
bazaarPurchaseContext.document = { getElementById(id) { return id === 'bazaarRoot' ? replacementBazaarRoot : null; }, body: fallbackBody, documentElement: { isConnected: true } };
vm.runInContext(extractFunction('getCurrentBazaarResultRoot'), bazaarPurchaseContext);
assert.equal(bazaarPurchaseContext.getCurrentBazaarResultRoot({ isConnected: false }), replacementBazaarRoot);
bazaarPurchaseContext.document.getElementById = () => null;
assert.equal(bazaarPurchaseContext.getCurrentBazaarResultRoot({ isConnected: false }), fallbackBody);
const exerciseBazaarWatcher = ({ initialSuccess = false, replaceRoot = false }) => {
  const observers = []; let persisted = 0; const candidate = { nodeType: 1 };
  const oldRoot = { nodeType: 1, isConnected: true, matches: () => false, contains: () => true, querySelectorAll: () => initialSuccess ? [candidate] : [] };
  const newRoot = { nodeType: 1, isConnected: true, matches: () => false, contains: () => true, querySelectorAll: () => [candidate] };
  let currentRoot = oldRoot;
  class FakeMutationObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe(root) { this.root = root; } disconnect() {} }
  const watcherContext = { Date, Array, Set, WeakSet, MutationObserver: FakeMutationObserver, setTimeout: () => 1, clearTimeout() {}, PURCHASE_CONFIRMATION_OBSERVATION_MS: 15000, document: { getElementById: () => currentRoot, body: { nodeType: 1, isConnected: true }, documentElement: { nodeType: 1, isConnected: true } }, tornState: { purchaseObservers: new Map() }, updatePendingPurchaseAttempt() {}, readPendingPurchaseContexts: () => ({ pending: { correlation: { source: 'bazaar', correlationId: 'correlation', activeAttemptId: 'attempt', attempts: { attempt: { attemptId: 'attempt' } } } } }), resolveConfirmedBazaarPurchase: (_node, _context, _attempt, root) => ({ confirmed: root === currentRoot }), collectBazaarSuccessCandidates: (node) => node === candidate ? [candidate] : Array.from(node.querySelectorAll?.() || []), getCurrentBazaarResultRoot: () => currentRoot, logDebug() {}, sanitizePurchaseDiagnosticElement() { return {}; }, showTornStatus() {}, persistBazaarConfirmationEvidence() {}, handleConfirmedBazaarPurchase() { persisted += 1; return { ok: true }; }, stopPurchaseConfirmationObserver() {} };
  vm.createContext(watcherContext); vm.runInContext(extractFunction('startBazaarSuccessObserver'), watcherContext);
  const attempt = { attemptId: 'attempt', correlationId: 'correlation' }; assert.equal(watcherContext.startBazaarSuccessObserver({ correlationId: 'correlation' }, attempt, oldRoot), true);
  if (replaceRoot) { oldRoot.isConnected = false; currentRoot = newRoot; observers[0].callback([]); }
  return persisted;
};
assert.equal(exerciseBazaarWatcher({ initialSuccess: true }), 1);
assert.equal(exerciseBazaarWatcher({ replaceRoot: true }), 1);
let submittedWatcherStarts = 0; let submittedState = '';
const submitContext = { Date, location: { pathname: '/bazaar.php', search: '?userId=7', hash: '' }, BAZAAR_BUY_STAGE_TTL_MS: 120000, readPendingPurchaseContexts: () => ({ pending: { correlation: { correlationId: 'correlation', itemId: 359, itemName: 'Fine Chisel' } } }), normalizedItemText: (value) => String(value).toLowerCase(), getBazaarObservationRoot: () => ({ isConnected: true }), createPurchaseAttempt: (_context, input) => ({ attemptId: 'submitted-attempt', correlationId: 'correlation', attemptState: 'interaction-observed', observedQuantity: input.observedQuantity, observedUnitPrice: input.observedUnitPrice, calculatedAttemptTotal: '30' }), updatePendingPurchaseAttempt: (_id, attempt) => { submittedState = attempt.attemptState; }, sanitizePurchaseDiagnosticElement: () => ({}), logDebug() {}, startBazaarSuccessObserver: () => { submittedWatcherStarts += 1; }, renderTornPurchaseTracking() {} };
vm.createContext(submitContext); vm.runInContext(extractFunction('submitBazaarPurchaseStage'), submitContext);
const submitTarget = { closest: () => ({}) };
assert.equal(submitContext.submitBazaarPurchaseStage({}, submitTarget, { correlationId: 'correlation', itemId: 359, itemName: 'Fine Chisel', observedQuantity: 1, observedUnitPrice: '30', buyButtonObservedAt: Date.now() }).attemptState, 'purchase-submitted');
assert.equal(submittedState, 'purchase-submitted');
assert.equal(submittedWatcherStarts, 1);
vm.runInContext(extractFunction('buildConfirmedBazaarBuy'), ledgerContext);
const buyContext = { correlationId: 'purchase:plastic-watch', origin: 'watchlist', displayedUnitPrice: '1420000' };
const buyAttempt = { attemptId: 'purchase-attempt:plastic-watch', correlationId: buyContext.correlationId, itemId: 58, itemName: 'Plastic Watch', observedQuantity: 1, observedUnitPrice: '1425000', calculatedAttemptTotal: '1425000', observedSellerId: 1750790 };
const buyConfirmation = { confirmed: true, itemId: 58, itemName: 'Plastic Watch', quantity: 1, totalPrice: '1425000', sellerId: 1750790, sellerName: 'DoctorManhattan', confirmedAt: 1786200000000 };
const confirmedBuy = ledgerContext.buildConfirmedBazaarBuy(buyContext, buyAttempt, buyConfirmation);
assert.equal(confirmedBuy.id, 'buy:bazaar:purchase-attempt:plastic-watch');
assert.equal(confirmedBuy.type, 'buy');
assert.equal(confirmedBuy.source, 'bazaar');
assert.equal(confirmedBuy.unitPrice, '1425000');
assert.equal(confirmedBuy.totalPrice, '1425000');
assert.equal(confirmedBuy.expectedUnitPrice, '1425000');
assert.equal(confirmedBuy.expectedTotalPrice, '1425000');
assert.equal(confirmedBuy.marketQuoteUnitPrice, '1420000');
assert.equal(confirmedBuy.counterpartyId, 1750790);
assert.equal(confirmedBuy.confirmationMethod, 'bazaar-purchase-confirmation');
assert.equal(ledgerContext.recordConfirmedTransaction(confirmedBuy).duplicate, false);
assert.equal(ledgerContext.recordConfirmedTransaction(confirmedBuy).duplicate, true);
const retryBuy = ledgerContext.buildConfirmedBazaarBuy(buyContext, { ...buyAttempt, attemptId: 'retry' }, buyConfirmation);
const eventWriter = ledgerContext.gmSet;
ledgerContext.gmSet = () => {};
assert.equal(ledgerContext.recordConfirmedTransaction(retryBuy).reason, 'transaction-ledger-write-failed');
ledgerContext.gmSet = eventWriter;
assert.equal(ledgerContext.recordConfirmedTransaction(retryBuy).ok, true);
const bazaarConflict = ledgerContext.recordConfirmedTransaction({ ...confirmedBuy, totalPrice: '1500000', unitPrice: '1500000' });
assert.equal(bazaarConflict.reason, 'transaction-conflict');
assert.equal(ledgerContext.readTransactionLedger().transactions[confirmedBuy.id].totalPrice, '1425000');
const buyExportJson = JSON.parse(ledgerContext.serializeTransactionJson({ version: 1, transactions: { buy: confirmedBuy } }, '2026-08-09T00:00:00.000Z'));
assert.equal(buyExportJson.transactions[0].marketQuoteUnitPrice, '1420000');
assert.match(ledgerContext.serializeTransactionCsv({ version: 1, transactions: { buy: confirmedBuy } }), /purchase:plastic-watch,1420000/);
const partialBuy = ledgerContext.buildConfirmedBazaarBuy(buyContext, { ...buyAttempt, attemptId: 'partial', observedQuantity: 10, observedUnitPrice: '386', calculatedAttemptTotal: '3860' }, { ...buyConfirmation, quantity: 7, totalPrice: '2702' });
assert.equal(partialBuy.quantity, 7);
assert.equal(partialBuy.unitPrice, '386');
assert.equal(partialBuy.totalPrice, '2702');
assert.equal(partialBuy.expectedTotalPrice, '3860');
const changedTotal = ledgerContext.buildConfirmedBazaarBuy(buyContext, { ...buyAttempt, attemptId: 'changed', observedQuantity: 3, observedUnitPrice: '100', calculatedAttemptTotal: '300' }, { ...buyConfirmation, quantity: 3, totalPrice: '303' });
assert.equal(changedTotal.unitPrice, '101');
assert.equal(changedTotal.expectedUnitPrice, '100');
assert.equal(changedTotal.expectedTotalPrice, '300');
const unevenBuy = ledgerContext.buildConfirmedBazaarBuy(buyContext, { ...buyAttempt, attemptId: 'uneven' }, { ...buyConfirmation, quantity: 3, totalPrice: '100' });
assert.equal(unevenBuy.unitPrice, null);
const directBuy = ledgerContext.buildConfirmedBazaarBuy({ correlationId: 'purchase:direct', origin: 'direct-bazaar' }, { ...buyAttempt, attemptId: 'direct', correlationId: 'purchase:direct' }, buyConfirmation);
assert.equal(directBuy.origin, 'direct-bazaar');
assert.notEqual(directBuy.id, confirmedBuy.id);
const directUnknownSellerBuy = ledgerContext.buildConfirmedBazaarBuy({ correlationId: directContext.correlationId, origin: 'direct-bazaar' }, { ...buyAttempt, attemptId: directAttempt.attemptId, correlationId: directContext.correlationId, itemId: 359, itemName: 'Fine Chisel', observedSellerId: null, observedQuantity: 1, observedUnitPrice: '30', calculatedAttemptTotal: '30' }, { ...directConfirmation, itemId: 359, itemName: 'Fine Chisel', quantity: 1, totalPrice: '30', sellerId: null, sellerName: 'XuraCut' });
assert.equal(directUnknownSellerBuy.counterpartyId, undefined);
assert.equal(directUnknownSellerBuy.counterpartyName, 'XuraCut');
assert.equal(directUnknownSellerBuy.origin, 'direct-bazaar');
assert.match(source, /button\[data-testid="activate-buy-button"\]/);
assert.match(source, /button\[data-testid="buy-button"\]/);
assert.match(source, /captureBazaarBuyStage\(itemContainer\); if \(stage\) submitBazaarPurchaseStage/);
assert.match(source, /attempt\.attemptState = 'purchase-submitted'/);
assert.match(source, /startBazaarSuccessObserver\(context, attempt, observationRoot\)/);
assert.doesNotMatch(extractFunction('resolveConfirmedBazaarPurchase'), /manualConfirmationAction !== 'yes'/);
assert.match(source, /\[data-testid="buy-confirmation-controls"\]/);
assert.match(source, /button\[aria-label="Yes"\]/);
assert.match(source, /button\[aria-label="No"\]/);
assert.match(source, /buy:bazaar:\$\{attempt\.attemptId\}/);
assert.match(source, /bazaar-success-quantity-mismatch/);
assert.match(source, /bazaar-success-total-mismatch/);
assert.match(source, /Bazaar initial success scan/);
assert.match(source, /Bazaar observer root disconnected/);
assert.match(source, /Bazaar result observer rebound\/fallback/);
assert.match(source, /deletePurchaseTransportById\(context\.correlationId\)/);
assert.match(source, /marketQuoteUnitPrice/);
assert.doesNotMatch(source, /live-bazaar-purchase-control-dom-required/);
assert.match(source, /createPurchaseTransport\(\{ source: latestOffer\.source, itemId: id, itemName: name/);
assert.match(source, /PENDING_PURCHASE_TTL_MS = 30 \* 60 \* 1000/);
assert.match(source, /PURCHASE_CONFIRMATION_OBSERVATION_MS = 15 \* 1000/);
assert.match(source, /function createBazaarPurchaseObserver\(\).*supported: true/);
assert.match(source, /Item Market purchase adapter activated/);
assert.match(source, /Copy diagnostics/);
assert.doesNotMatch(source, /ACTIVE_PURCHASE/);
assert.doesNotMatch(source, /confirmationMethod: ['"](?:generic-green|button-click|form-submit|route-navigation|timeout)['"]/);
assert.doesNotMatch(source, /\.click\s*\(/);
assert.doesNotMatch(source, /\.submit\s*\(/);
assert.doesNotMatch(source, /requestSubmit\s*\(/);
assert.doesNotMatch(source, /dispatchEvent\s*\(\s*new\s+(?:MouseEvent|PointerEvent)/);

const tradeHandoffStore = new Map();
const handoffCollectionContext = {
  TRADE_HANDOFFS_KEY: 'WEAV3R_ARBITRAGE_TRADE_HANDOFFS', TRADE_HANDOFF_KEY: 'WEAV3R_ARBITRAGE_TRADE_HANDOFF',
  gmGet(key, fallback) { return tradeHandoffStore.has(key) ? structuredClone(tradeHandoffStore.get(key)) : fallback; },
  gmSet(key, value) { tradeHandoffStore.set(key, structuredClone(value)); }, gmDelete(key) { tradeHandoffStore.delete(key); },
  normalizeBoundedText(value, length) { return String(value || '').trim().slice(0, length); },
  normalizeHandoff(value) { return value && value.expiresAt > Date.now() ? { ...value, version: 2 } : null; },
  mergeCriticalRecord(key, fallback, recordKey, record, normalizeCollection) { const latest = normalizeCollection(tradeHandoffStore.has(key) ? structuredClone(tradeHandoffStore.get(key)) : fallback); latest.records[recordKey] = record; tradeHandoffStore.set(key, structuredClone(latest)); return { ok: true, collection: normalizeCollection(structuredClone(latest)) }; },
  gmSetDurable(key, value) { tradeHandoffStore.set(key, structuredClone(value)); return { ok: true }; },
  getActiveTradeAssociation() { return 'A'; }, logDebug() {},
};
vm.createContext(handoffCollectionContext);
vm.runInContext(['normalizeTradeHandoffsCollection', 'readTradeHandoffs', 'writeTradeHandoffs', 'getTradeHandoffById', 'upsertTradeHandoff', 'deleteTradeHandoffById', 'migrateLegacyTradeHandoff'].map(extractFunction).join('\n'), handoffCollectionContext);
const validUntil = Date.now() + 60000;
tradeHandoffStore.set('WEAV3R_ARBITRAGE_TRADE_HANDOFF', { version: 1, handoffId: 'A', traderId: 1, expiresAt: validUntil, progress: { descriptionAppliedAt: 1 } });
handoffCollectionContext.migrateLegacyTradeHandoff();
assert.equal(handoffCollectionContext.getTradeHandoffById('A').progress.descriptionAppliedAt, 1);
assert.equal(tradeHandoffStore.has('WEAV3R_ARBITRAGE_TRADE_HANDOFF'), false);
handoffCollectionContext.upsertTradeHandoff({ version: 2, handoffId: 'B', traderId: 2, expiresAt: validUntil, progress: {} });
assert.deepEqual(Object.keys(handoffCollectionContext.readTradeHandoffs().records).sort(), ['A', 'B']);
assert.equal(handoffCollectionContext.deleteTradeHandoffById('A'), true);
assert.deepEqual(Object.keys(handoffCollectionContext.readTradeHandoffs().records), ['B']);
assert.match(source, /handoff = captureTradeIdIfNeeded\(handoff, route\);\n    const verificationRoute/);
assert.match(source, /promoteHandoffToVerification\(handoff\)/);
assert.match(source, /recordSource: 'handoff-promotion'/);
assert.doesNotMatch(source, /function readTradeHandoff\(\) \{ const handoff = normalizeHandoff\(gmGet\(TRADE_HANDOFF_KEY/);

const recoveryContext = { normalizePositiveInt: offerContext.normalizePositiveInt, normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); }, normalizedItemText(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }, TRADE_VERIFICATION_TTL_MS: 86400000 };
vm.createContext(recoveryContext);
vm.runInContext(`${extractFunction('parseTradeRecoveryComment')}\n${extractFunction('recoverTradeVerificationFromEvidence')}`, recoveryContext);
const recovered = recoveryContext.recoverTradeVerificationFromEvidence({ tradeId: 12900646, items: [{ tradeId: 12900646, itemId: 361, itemName: 'Neumune Tablet', quantity: 2 }], comments: [{ text: 'Neumune Tablet for $1,650,759 each', xids: [999], traderId: 3247296 }], counterparties: [{ traderId: 3247296, traderName: 'KRILL' }] }, 1786200000000);
assert.equal(recovered.record.tradeId, 12900646);
assert.equal(recovered.record.traderId, 3247296);
assert.equal(recovered.record.itemId, 361);
assert.equal(recovered.record.quantity, 2);
assert.equal(recovered.record.unitSellPrice, 1650759);
assert.equal(recovered.record.recordSource, 'trade-dom-recovery');
assert.equal(1650759n * 2n, 3301518n);
assert.equal(recoveryContext.recoverTradeVerificationFromEvidence({ tradeId: 12900646, items: [{ tradeId: 999, itemId: 361, itemName: 'Neumune Tablet', quantity: 2 }], comments: [], counterparties: [] }).record, null);
assert.equal(recoveryContext.recoverTradeVerificationFromEvidence({ tradeId: 12900646, items: [{ tradeId: 12900646, itemId: 361, itemName: 'Neumune Tablet', quantity: 2 }, { tradeId: 12900646, itemId: 1298, itemName: 'Tin of Treats', quantity: 1 }], comments: [], counterparties: [] }).record, null);
assert.equal(recoveryContext.recoverTradeVerificationFromEvidence({ tradeId: 12900646, items: [{ tradeId: 12900646, itemId: 361, itemName: 'Neumune Tablet', quantity: 2 }], comments: [{ text: 'Other Item for $1,650,759 each', xids: [] }], counterparties: [{ traderId: 3247296, traderName: 'KRILL' }] }).record, null);
assert.equal(ledgerContext.buildConfirmedTradeSale({ ...tradeRecord, simpleItemForMoneyTrade: false }, completionEvidence), null);
assert.match(source, /Completed Trade not recorded as simple SELL because additional Trade assets were present/);

let durableValue = null; let corruptWrites = 0;
const durableContext = { logWarn() {}, GM_setValue(_key, value) { durableValue = corruptWrites-- > 0 ? { version: 1, records: {} } : structuredClone(value); }, GM_getValue(_key, fallback) { return durableValue ?? fallback; } };
vm.createContext(durableContext);
vm.runInContext(extractFunction('gmSetDurable'), durableContext);
assert.equal(durableContext.gmSetDurable('key', { value: 1 }).ok, true);
durableContext.GM_setValue = () => { throw new Error('write failed'); };
assert.equal(durableContext.gmSetDurable('key', { value: 2 }).ok, false);
assert.match(source, /transaction-ledger-write-failed/);
assert.match(source, /transaction-conflict/);
assert.match(source, /const BAZAAR_HANDOFFS_KEY = 'WEAV3R_ARBITRAGE_BAZAAR_HANDOFFS'/);
assert.match(source, /const PURCHASE_TRANSPORTS_KEY = 'WEAV3R_ARBITRAGE_PURCHASE_TRANSPORTS'/);
assert.match(source, /const PENDING_PURCHASE_CONTEXTS_SESSION_KEY = 'WEAV3R_ARBITRAGE_TORN_PENDING_PURCHASES'/);
assert.match(source, /claimPurchaseTransportForTorn\('bazaar', handoff\.correlationId, handoff\.itemId\)/);
assert.match(source, /claimPurchaseTransportForTorn\(source, '', routeItemId\)/);
assert.match(source, /function loadWatchlist\(\) \{ const stored = gmGet\(WATCHLIST_KEY, \[\]\)/);
assert.match(source, /function mergeCriticalRecord\([^)]*attempts = 3\)/);

const quantityContext = { logDebug() {} };
vm.createContext(quantityContext);
vm.runInContext(extractFunction('getTradeRowQuantityControl'), quantityContext);
const amountInput = { type: 'text', disabled: false, readOnly: false, dataset: {}, getAttribute() { return null; } };
const amountRow = {
  dataset: {},
  querySelectorAll() { return [amountInput]; },
  querySelector(selector) { return selector === '.item-amount.qty' ? { textContent: ' 5 ', matches() { return false; } } : null; },
};
assert.equal(quantityContext.getTradeRowQuantityControl(amountRow).available, 5);
assert.equal(quantityContext.getTradeRowQuantityControl(amountRow).source, 'item-amount');

assert.match(source, /a\[href\*="#step=remove"\]\[href\*="itemID="\]/);
assert.match(source, /#trade-container \.trade-cont > \.user\.right li\.color1 \.name\.left/);
assert.match(source, /'PAYMENT MATCHES'/);
assert.match(source, /'UNDERPAID'/);
assert.match(source, /'OVERPAID'/);
assert.match(source, /`https:\/\/weav3r\.dev\/pricelist\/\$\{traderId\}`/);
assert.match(source, /completionState: 'completed', completedAt:/);
assert.match(source, /records: \{ \.\.\.latest\.records, \.\.\.\(collection\.records \|\| \{\}\) \}/);
assert.match(source, /GM_addValueChangeListener\(TRADE_VERIFICATIONS_KEY/);
assert.match(source, /if \(remote\) processTradeVerificationForRoute\(resolveTradeVerificationRoute\(\)\)/);
const recordContext = { normalizePositiveInt: offerContext.normalizePositiveInt };
vm.createContext(recordContext);
vm.runInContext(extractFunction('getTradeVerificationRecordForId'), recordContext);
const parallelRecords = { records: { '12888988': { tradeId: 12888988, traderId: 3546645 }, '12881361': { tradeId: 12881361, traderId: 3754506 } } };
assert.equal(recordContext.getTradeVerificationRecordForId(12888988, parallelRecords).traderId, 3546645);
assert.equal(recordContext.getTradeVerificationRecordForId(12881361, parallelRecords).traderId, 3754506);
assert.equal(recordContext.getTradeVerificationRecordForId(99999999, parallelRecords), null);
assert.doesNotMatch(source, /if \(!readTradeHandoff\(\) && !hasVerification\) return/);
assert.match(source, /document\.addEventListener\('click', captureTradeSnapshotBeforeAccept, true\)/);
assert.match(source, /a\[href\*="#step=accept"\]\[href\*="ID="\]/);
assert.match(source, /window\.addEventListener\('pagehide', captureTradeSnapshotOnPageHide\)/);
assert.match(source, /finalSnapshotSource: source/);
assert.match(source, /completionState === 'completed' \? record\.quantity \|\| record\.lastObservedQuantity/);
assert.match(source, /completionState === 'completed' && \(record\.offeredTotal \|\| record\.lastObservedTraderMoney\)/);

const tradeContext = {
  URL,
  URLSearchParams,
  BigInt,
  location: { href: 'https://www.torn.com/trade.php#step=view&ID=12881361' },
  normalizePositiveInt(value) { const number = Number.parseInt(value, 10); return Number.isInteger(number) && number > 0 ? number : null; },
  parseTradeHash(hash) { const params = new URLSearchParams(String(hash).replace(/^#/, '')); return { tradeId: Number.parseInt(params.get('ID'), 10) || null }; },
};
vm.createContext(tradeContext);
vm.runInContext(`${extractFunction('parseRemoveTradeItemLink')}\n${extractFunction('parseTornMoney')}\n${extractFunction('calculateExpectedTradeTotal')}\n${extractFunction('compareTradeMoney')}`, tradeContext);
const removeLink = { getAttribute(name) { return name === 'href' ? 'trade.php#step=remove&itemID=361&armoryID=0&ID=12881361' : name === 'aria-label' ? 'Remove Neumune Tablet x1 from trade.' : ''; }, href: '' };
assert.deepEqual({ ...tradeContext.parseRemoveTradeItemLink(removeLink) }, { itemId: 361, quantity: 1, tradeId: 12881361 });
assert.equal(tradeContext.parseTornMoney('$1,629,428 in trade'), 1629428n);
const expected = tradeContext.calculateExpectedTradeTotal(1629428, 1);
assert.equal(expected, 1629428n);
assert.equal(tradeContext.compareTradeMoney(expected, 1629428n).status, 'match');
assert.equal(tradeContext.compareTradeMoney(expected, 1600000n).difference, -29428n);
assert.equal(tradeContext.compareTradeMoney(expected, 1700000n).difference, 70572n);
const treatsLink = { getAttribute(name) { return name === 'href' ? 'trade.php#step=remove&itemID=1298&armoryID=0&ID=12888988' : name === 'aria-label' ? 'Remove Tin of Treats x5 from trade.' : ''; }, href: '' };
assert.deepEqual({ ...tradeContext.parseRemoveTradeItemLink(treatsLink) }, { itemId: 1298, quantity: 5, tradeId: 12888988 });
assert.equal(tradeContext.parseTornMoney('$7,084,110 in trade'), 7084110n);
assert.equal(tradeContext.calculateExpectedTradeTotal(1416822, 5), 7084110n);
assert.equal(tradeContext.compareTradeMoney(7084110n, 7084110n).status, 'match');
assert.match(source, /#trade-container \.info-msg-cont\.green \.msg\[role="alert"\]/);
assert.match(source, /Trade was accepted and is now complete!/);
assert.match(source, /Previous payment verification data is unavailable\./);

const bazaarAddContext = {
  BigInt,
  BAZAAR_ADD_RULES: Object.freeze(['sell-all', 'keep-one', 'dont-sell']),
  tornState: { bazaarAdd: { groups: [], runtimeRowKeys: new WeakMap(), nextRuntimeRowKey: 1 } },
  logDebug() {},
  DEFAULT_BAZAAR_ADD_SETTINGS: Object.freeze({ sortField: 'sellableMarketValue', sortDirection: 'desc', hideProtected: false, priceAdjustment: '-1' }),
  normalizePositiveInt(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; },
  normalizeMoneyString(value) { const normalized = String(value ?? ''); return /^(?:0|[1-9]\d*)$/.test(normalized) ? normalized : null; },
  formatMoney(value) { return value == null ? '—' : `$${BigInt(value).toLocaleString('en-US')}`; },
};
vm.createContext(bazaarAddContext);
vm.runInContext(`${extractFunction('extractTornItemIdFromImageSource')}\n${extractFunction('isTornBazaarAddRoute')}\n${extractFunction('normalizeBazaarSellRules')}\n${extractFunction('normalizeBazaarAddSettings')}\n${extractFunction('getBazaarSellRule')}\n${extractFunction('parseBazaarAddCurrencyValues')}\n${extractFunction('calculateBazaarSellable')}\n${extractFunction('parseBazaarAddMarketValue')}\n${extractFunction('compareBigIntStrings')}\n${extractFunction('compareNullableMoneyStrings')}\n${extractFunction('bazaarSellableSortGroup')}\n${extractFunction('compareBazaarAddModels')}\n${extractFunction('getBazaarAddGroupForRow')}\n${extractFunction('shouldHideBazaarAddRow')}\n${extractFunction('summarizeBazaarAddRows')}\n${extractFunction('getBazaarSelectionPlan')}\n${extractFunction('normalizeBazaarPriceOffers')}\n${extractFunction('calculateAdjustedBazaarPrice')}\n${extractFunction('evaluateBazaarAutoPrice')}\n${extractFunction('resolveBazaarRecommendedPrice')}\n${extractFunction('buildInventoryBazaarValuation')}\n${extractFunction('getBazaarRowDisplayState')}\n${extractFunction('getBazaarFillMessage')}`, bazaarAddContext);
assert.equal(bazaarAddContext.isTornBazaarAddRoute('/bazaar.php', '#/add'), true);
assert.equal(bazaarAddContext.isTornBazaarAddRoute('/bazaar.php', '#/add?category=all'), true);
assert.equal(bazaarAddContext.isTornBazaarAddRoute('/bazaar.php', '#/manage'), false);
assert.equal(bazaarAddContext.isTornBazaarAddRoute('/trade.php', '#/add'), false);
assert.deepEqual([...bazaarAddContext.parseBazaarAddCurrencyValues('$328,806 | 4x = $1,315,224')], ['328806', '1315224']);
assert.deepEqual(['$174', '$992', '$2,166', '$87,013', '$120,491', '$1,315,224', '$4,093,996'].map((value) => bazaarAddContext.parseBazaarAddCurrencyValues(value)[0]), ['174', '992', '2166', '87013', '120491', '1315224', '4093996']);
assert.equal(bazaarAddContext.extractTornItemIdFromImageSource('/images/items/587/large.png'), 587);
assert.equal(bazaarAddContext.extractTornItemIdFromImageSource('/images/items/8/large.png'), 8);
assert.equal(bazaarAddContext.extractTornItemIdFromImageSource('/images/items/634/large.png'), 634);
assert.equal(bazaarAddContext.extractTornItemIdFromImageSource('/images/items/1028/large.png'), 1028);
assert.equal(bazaarAddContext.extractTornItemIdFromImageSource('/images/items/180/large.png'), 180);
assert.deepEqual({ ...bazaarAddContext.calculateBazaarSellable(4, '328806', 'sell-all') }, { sellableQuantity: 4, sellableMarketValue: '1315224' });
assert.deepEqual({ ...bazaarAddContext.calculateBazaarSellable(4, '328806', 'keep-one') }, { sellableQuantity: 3, sellableMarketValue: '986418' });
assert.deepEqual({ ...bazaarAddContext.calculateBazaarSellable(4, '328806', 'dont-sell') }, { sellableQuantity: 0, sellableMarketValue: '0' });
assert.deepEqual([...bazaarAddContext.parseBazaarAddCurrencyValues('$2,166 | 6x = $12,996')], ['2166', '12996']);
assert.deepEqual([...bazaarAddContext.parseBazaarAddCurrencyValues('$87,013 | 3x = $261,039')], ['87013', '261039']);
assert.equal(bazaarAddContext.calculateBazaarSellable(1, '4093996', 'sell-all').sellableMarketValue, '4093996');
assert.equal(bazaarAddContext.calculateBazaarSellable(137, '996', 'sell-all').sellableMarketValue, '136452');
const marketContainer = (textContent, hasTotal = false) => ({ textContent, querySelector(selector) { return selector === '.tt-item-quantity' && hasTotal ? {} : null; } });
const marketRow = (textContent, hasTotal = false) => ({ querySelector(selector) { return selector === '[title="Market value"]' ? marketContainer(textContent, hasTotal) : null; } });
assert.deepEqual({ ...bazaarAddContext.parseBazaarAddMarketValue(marketRow('$197'), 1) }, { marketValueEach: '197', totalMarketValue: '197', displayedTotalMarketValue: null });
assert.deepEqual({ ...bazaarAddContext.parseBazaarAddMarketValue(marketRow('$2,166 | 6x = $12,996', true), 6) }, { marketValueEach: '2166', totalMarketValue: '12996', displayedTotalMarketValue: '12996' });
assert.deepEqual({ ...bazaarAddContext.parseBazaarAddMarketValue(marketRow('$87,013 | 3x = $261,039', true), 3) }, { marketValueEach: '87013', totalMarketValue: '261039', displayedTotalMarketValue: '261039' });
assert.equal(bazaarAddContext.parseBazaarAddMarketValue(marketRow('$120,491'), 1).marketValueEach, '120491');
assert.equal(bazaarAddContext.parseBazaarAddMarketValue(marketRow('$4,093,996'), 1).marketValueEach, '4093996');
const unknownSellAll = bazaarAddContext.calculateBazaarSellable(8, null, 'sell-all', true);
assert.deepEqual({ ...unknownSellAll }, { sellableQuantity: 8, sellableMarketValue: null });
assert.equal(bazaarAddContext.shouldHideBazaarAddRow({ isTradable: true, ...unknownSellAll }, true), false);
const unknownKeepOne = bazaarAddContext.calculateBazaarSellable(4, null, 'keep-one', true);
assert.deepEqual({ ...unknownKeepOne }, { sellableQuantity: 3, sellableMarketValue: null });
assert.equal(bazaarAddContext.shouldHideBazaarAddRow({ isTradable: true, ...unknownKeepOne }, true), false);
const unknownProtected = bazaarAddContext.calculateBazaarSellable(4, null, 'dont-sell', true);
assert.equal(unknownProtected.sellableQuantity, 0);
assert.equal(bazaarAddContext.shouldHideBazaarAddRow({ isTradable: true, ...unknownProtected }, true), true);
const liveValues = ['$197', '$2,166', '$87,013', '$120,491', '$4,093,996'].map((value) => bazaarAddContext.calculateBazaarSellable(1, bazaarAddContext.parseBazaarAddCurrencyValues(value)[0], 'sell-all', true));
assert.equal(liveValues.filter((model) => !bazaarAddContext.shouldHideBazaarAddRow({ isTradable: true, ...model }, true)).length, 5);
assert.deepEqual({ ...bazaarAddContext.summarizeBazaarAddRows([{ isTradable: true, ...unknownSellAll }, { isTradable: true, sellableQuantity: 2, sellableMarketValue: '400' }]) }, { positions: 2, quantity: 10, knownValue: '400', hasUnknownValue: true });
const normalizedRules = bazaarAddContext.normalizeBazaarSellRules({ version: 1, rules: { 587: 'keep-one', 768: 'dont-sell', bad: 'sell-all', 8: 'unknown' } });
assert.equal(bazaarAddContext.getBazaarSellRule(587, normalizedRules), 'keep-one');
assert.equal(bazaarAddContext.getBazaarSellRule(768, normalizedRules), 'dont-sell');
assert.equal(bazaarAddContext.getBazaarSellRule(8, normalizedRules), 'sell-all');
assert.equal(JSON.stringify(bazaarAddContext.normalizeBazaarSellRules('broken')), JSON.stringify({ version: 1, rules: {} }));
const sortable = [
  { itemId: 1, itemName: 'A', sellableMarketValue: '986418', isTradable: true, resolved: true, sellableQuantity: 3, sellRule: 'keep-one', originalIndex: 0 },
  { itemId: 2, itemName: 'B', sellableMarketValue: '1315224', isTradable: true, resolved: true, sellableQuantity: 4, sellRule: 'sell-all', originalIndex: 1 },
  { itemId: 3, itemName: 'C', sellableMarketValue: '261039', isTradable: true, resolved: true, sellableQuantity: 3, sellRule: 'sell-all', originalIndex: 2 },
];
assert.deepEqual(sortable.sort((a, b) => bazaarAddContext.compareBazaarAddModels(a, b, { sortField: 'sellableMarketValue', sortDirection: 'desc' })).map((row) => row.itemName), ['B', 'A', 'C']);
const unresolvedSort = [{ itemName: 'Known', sellableMarketValue: '10', isTradable: true, resolved: true, sellableQuantity: 1, sellRule: 'sell-all', originalIndex: 0 }, { itemName: 'Unknown', sellableMarketValue: null, isTradable: true, resolved: true, sellableQuantity: 1, sellRule: 'sell-all', originalIndex: 1 }];
assert.equal([...unresolvedSort].sort((a, b) => bazaarAddContext.compareBazaarAddModels(a, b, { sortField: 'sellableMarketValue', sortDirection: 'asc' }))[1].itemName, 'Unknown');
assert.equal([...unresolvedSort].sort((a, b) => bazaarAddContext.compareBazaarAddModels(a, b, { sortField: 'sellableMarketValue', sortDirection: 'desc' }))[1].itemName, 'Unknown');
assert.equal(bazaarAddContext.compareBigIntStrings('900719925474099312345', '900719925474099312344'), 1);
const selectionBase = { resolved: true, isTradable: true, isDisabled: false, quantity: 4, sellableQuantity: 4, sellRule: 'sell-all', selectableMode: 'quantity' };
assert.equal(bazaarAddContext.getBazaarSelectionPlan(selectionBase).value, '4');
assert.equal(bazaarAddContext.getBazaarSelectionPlan({ ...selectionBase, sellRule: 'keep-one', sellableQuantity: 3 }).value, '3');
assert.equal(bazaarAddContext.getBazaarSelectionPlan({ ...selectionBase, quantity: 1, sellRule: 'keep-one', sellableQuantity: 0 }).reason, 'protected');
assert.equal(bazaarAddContext.getBazaarSelectionPlan({ ...selectionBase, sellRule: 'dont-sell', sellableQuantity: 0 }).action, 'clear');
assert.equal(bazaarAddContext.getBazaarSelectionPlan({ ...selectionBase, quantity: 1, selectableMode: 'checkbox' }).checked, true);
assert.equal(bazaarAddContext.getBazaarSelectionPlan({ ...selectionBase, quantity: 6, sellableQuantity: 5, sellRule: 'keep-one', selectableMode: 'checkbox' }).reason, 'partial-aggregate');
assert.equal(bazaarAddContext.evaluateBazaarAutoPrice([{ price: '330000', quantity: 3 }, { price: '331000', quantity: 1 }], '-1').proposal, '329999');
assert.equal(bazaarAddContext.evaluateBazaarAutoPrice([{ price: '100000' }, { price: '200000' }, { price: '210000' }, { price: '220000' }], '-1').reason, 'anomaly');
assert.equal(bazaarAddContext.evaluateBazaarAutoPrice([{ price: '90001' }, { price: '91000' }, { price: '92000' }], '-1', '100000').reason, 'price-drop');
assert.equal(bazaarAddContext.evaluateBazaarAutoPrice([], '-1').reason, 'unavailable');
assert.equal(bazaarAddContext.calculateAdjustedBazaarPrice('900719925474099312345', '-1'), '900719925474099312344');
const recommendedMinusOne = bazaarAddContext.resolveBazaarRecommendedPrice(1084, { offers: [{ price: '301', quantity: 4 }], adjustment: '-1', source: 'marketplaceDetail', fetchedAt: 123 });
assert.equal(recommendedMinusOne.status, 'available'); assert.equal(recommendedMinusOne.marketUnitPrice, '301'); assert.equal(recommendedMinusOne.recommendedUnitPrice, '300'); assert.equal(recommendedMinusOne.adjustment, '-1'); assert.equal(recommendedMinusOne.source, 'marketplaceDetail');
assert.equal(bazaarAddContext.resolveBazaarRecommendedPrice(1084, { offers: [{ price: '301' }], adjustment: '0' }).recommendedUnitPrice, '301');
assert.equal(bazaarAddContext.resolveBazaarRecommendedPrice(1084, { offers: [{ price: '301' }], adjustment: '+5' }).recommendedUnitPrice, '306');
const inventoryValuation = bazaarAddContext.buildInventoryBazaarValuation(recommendedMinusOne, 4); assert.equal(inventoryValuation.recommendedTotal, '1200');
assert.equal(bazaarAddContext.buildInventoryBazaarValuation(recommendedMinusOne, 1).recommendedTotal, '300');
assert.equal(bazaarAddContext.buildInventoryBazaarValuation({ status: 'available', recommendedUnitPrice: '900719925474099312345' }, 999999).recommendedTotal, (900719925474099312345n * 999999n).toString());
const guardedRecommendation = bazaarAddContext.resolveBazaarRecommendedPrice(28, { offers: [{ price: '100000' }, { price: '200000' }, { price: '210000' }, { price: '220000' }], adjustment: '-1' }); assert.equal(guardedRecommendation.status, 'unsafe'); assert.equal(guardedRecommendation.recommendedUnitPrice, null);
assert.equal(bazaarAddContext.resolveBazaarRecommendedPrice(28, { offers: [], adjustment: '-1' }).status, 'unavailable');
const displayBase = { isTradable: true, sellRule: 'sell-all', sellableQuantity: 137, sellableMarketValue: '136452' };
assert.deepEqual({ ...bazaarAddContext.getBazaarRowDisplayState(displayBase) }, { mode: 'sell-all', metadata: '', fillDisabled: false });
assert.equal(bazaarAddContext.getBazaarRowDisplayState({ ...displayBase, sellRule: 'keep-one', sellableQuantity: 3, sellableMarketValue: '986418' }).metadata, '3 verkaufbar · $986,418');
assert.deepEqual({ ...bazaarAddContext.getBazaarRowDisplayState({ ...displayBase, sellRule: 'dont-sell', sellableQuantity: 0 }) }, { mode: 'protected', metadata: 'Geschützt', fillDisabled: true });
assert.equal(bazaarAddContext.getBazaarFillMessage({ state: 'loading' }), 'Bazaar-Preise werden geladen …');
assert.equal(bazaarAddContext.getBazaarFillMessage({ ok: false, reason: 'request-failed' }), 'Bazaar-Preise konnten nicht geladen werden');
assert.equal(bazaarAddContext.getBazaarFillMessage({ ok: false, reason: 'no-listings' }), 'Keine Bazaar-Angebote gefunden');
assert.equal(bazaarAddContext.getBazaarFillMessage({ ok: false, reason: 'partial-aggregate' }), 'Teilmenge hier nicht sicher auswählbar');
assert.match(extractFunction('applyResolvedBazaarAddPrice'), /resolveBazaarRecommendedPrice/);
assert.match(extractFunction('applySelectedBazaarAddPrice'), /resolveBazaarRecommendedPrice/);
const identityContext = { tornState: { bazaarAdd: { runtimeRowKeys: new WeakMap(), nextRuntimeRowKey: 1 } }, logDebug() {} };
vm.createContext(identityContext);
vm.runInContext(`${extractFunction('bazaarAddDomIdentityValues')}\n${extractFunction('resolveBazaarAddRowIdentity')}\n${extractFunction('domSafeBazaarRowKey')}\n${extractFunction('getBazaarAddGroupForRow')}\n${extractFunction('getBazaarAddGroupSelection')}\n${extractFunction('validateBazaarGroupSelection')}`, identityContext);
function identityRow(role, values) { const descendants = values.map((value) => ({ attributes: [{ name: 'value', value }] })); return { attributes: [{ name: 'data-group', value: role }], getAttribute(name) { return name === 'data-group' ? role : null; }, querySelectorAll() { return descendants; } }; }
const uniqueA = identityContext.resolveBazaarAddRowIdentity(identityRow('child', ['230-20380771325']), 230, 1, 'group:230');
const uniqueB = identityContext.resolveBazaarAddRowIdentity(identityRow('child', ['230-20380771326']), 230, 2, 'group:230');
assert.equal(uniqueA.instanceKey, '230-20380771325');
assert.notEqual(uniqueA.rowKey, uniqueB.rowKey);
assert.equal(identityContext.domSafeBazaarRowKey(uniqueA.rowKey), 'instance-230-20380771325');
const fallbackRow = identityRow('child', []); const fallbackA = identityContext.resolveBazaarAddRowIdentity(fallbackRow, 230, 3, 'group:230'); const fallbackAgain = identityContext.resolveBazaarAddRowIdentity(fallbackRow, 230, 3, 'group:230');
assert.equal(fallbackA.rowKey, fallbackAgain.rowKey);
assert.notEqual(fallbackA.rowKey, '230');
const selectedFlags = Array.from({ length: 8 }, (_unused, index) => ({ rowKey: `instance:230-${index}`, groupRole: 'child', selectableMode: 'checkbox', element: { querySelector() { return { checked: index < 7 }; } } }));
const uniqueGroup = { isUniqueGroup: true, expanded: true, totalQuantity: 8, sellableQuantity: 7, rows: selectedFlags };
selectedFlags.forEach((row) => { row.group = uniqueGroup; row.sellRule = 'keep-one'; });
assert.equal(identityContext.validateBazaarGroupSelection(selectedFlags[0]).valid, true);
selectedFlags[7].element.querySelector = () => ({ checked: true });
const exceeded = identityContext.validateBazaarGroupSelection(selectedFlags[7]);
assert.equal(exceeded.valid, false);
assert.equal(exceeded.reason, 'group-rule-exceeded');
assert.equal(exceeded.maximum, 7);
const closedGroup = { ...uniqueGroup, expanded: false }; const closedRow = { ...selectedFlags[0], group: closedGroup };
assert.equal(identityContext.validateBazaarGroupSelection(closedRow).reason, 'group-closed');
assert.deepEqual({ ...bazaarAddContext.calculateBazaarSellable(8, '10000000', 'keep-one', true) }, { sellableQuantity: 7, sellableMarketValue: '70000000' });
assert.match(extractFunction('handleBazaarAddBulkPriceFill'), /rows: targets/);
assert.doesNotMatch(extractFunction('handleBazaarAddBulkPriceFill'), /new Set/);
assert.match(extractFunction('resolveSelectedBazaarAddPrice'), /resolveCurrentBazaarAddModelByRowKey\(rowKey\)/);
assert.match(extractFunction('handleBazaarAddFill'), /fillRequests\.get\(rowKey\)/);
assert.match(extractFunction('queueBazaarAddMarketplaceDetail'), /priceRequests\.get\(key\)/);
assert.doesNotMatch(source, /\.click\s*\(\s*\)/);

const selectionReadContext = { getBazaarAddPriceInputs(model) { return model.hasPrice ? [{}] : []; }, validateBazaarGroupSelection() { return { valid: true }; }, getBazaarAddGroupForRow() { return null; } };
vm.createContext(selectionReadContext);
vm.runInContext(`${extractFunction('readBazaarAddNativeSelection')}\n${extractFunction('classifyBazaarBulkPriceResult')}\n${extractFunction('getBazaarBulkSelectionMessage')}`, selectionReadContext);
function selectionModel({ stock, sellable, rule, value = '', checked = false, type = 'text', hasPrice = true }) { const input = { type, value, checked }; return { quantity: stock, sellableQuantity: sellable, sellRule: rule, resolved: true, isTradable: true, isDisabled: false, hasPrice, element: { querySelector() { return input; } } }; }
assert.deepEqual({ ...selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 137, sellable: 137, rule: 'sell-all', value: '20' })) }, { selected: true, valid: true, selectedQuantity: 20, maximumSellableQuantity: 137, reason: null });
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 14, sellable: 13, rule: 'keep-one', value: '13' })).valid, true);
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 14, sellable: 13, rule: 'keep-one', value: '5' })).valid, true);
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 14, sellable: 13, rule: 'keep-one', value: '14' })).reason, 'rule-exceeded');
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 14, sellable: 0, rule: 'dont-sell', value: '1' })).reason, 'protected');
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 6, sellable: 5, rule: 'keep-one', type: 'checkbox', checked: true })).reason, 'partial-aggregate');
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 137, sellable: 137, rule: 'sell-all', value: '' })).selected, false);
assert.equal(selectionReadContext.readBazaarAddNativeSelection(selectionModel({ stock: 137, sellable: 137, rule: 'sell-all', value: '00' })).selected, false);
assert.equal(selectionReadContext.getBazaarBulkSelectionMessage('rule-exceeded'), 'Auswahl überschreitet Verkaufsregel');
assert.equal(selectionReadContext.classifyBazaarBulkPriceResult({ ok: true }), 'prepared');
assert.equal(selectionReadContext.classifyBazaarBulkPriceResult({ reason: 'anomaly' }), 'guarded');
assert.equal(selectionReadContext.classifyBazaarBulkPriceResult({ reason: 'request-failed' }), 'failed');
assert.match(source, /Object\.getOwnPropertyDescriptor\(HTMLInputElement\.prototype, 'checked'\)/);
assert.match(source, /input\.dispatchEvent\(new Event\('input'/);
assert.match(source, /input\.dispatchEvent\(new Event\('change'/);
assert.match(source, /\.amount input\[name="amount"\]/);
assert.match(source, /style\.order = String\(order\+\+\)/);
assert.doesNotMatch(source, /appendChild\(model\.element\)/);
assert.match(source, /data-weav3r-bazaar-fill="1"/);
assert.match(source, /Bazaar-Verkaufsmanager/);
assert.match(source, /Verkaufbare auswählen/);
assert.match(source, /Auswahl leeren/);
assert.match(source, /Geschützte ausblenden/);
assert.match(source, /Preis-Anpassung:/);
assert.match(source, /Sortierrichtung: \$\{descending \? 'absteigend' : 'aufsteigend'\}/);
assert.match(source, /Verkaufbar: \$\{summary\.positions\} Positionen/);
assert.match(source, /Marktwert teilweise unbekannt/);
assert.match(source, /\.weav3r-bazaar-manager button:focus-visible/);
assert.match(source, /\.weav3r-bazaar-row-tools__prices\{[^}]*flex-wrap:wrap/);
assert.match(source, /\.weav3r-bazaar-row-tools__prices\{[^}]*max-width:100%/);
assert.match(source, /\.weav3r-bazaar-row-tools\{[^}]*min-width:0/);
assert.doesNotMatch(source, /#weav3r-bazaar-add-manager\s+button\s*,\s*select/);
assert.match(source, /loadCachedItemData\(itemId\)/);
assert.match(source, /\.torn-bazaar-fill-qty-price/);
assert.doesNotMatch(extractFunction('renderBazaarAddManager'), /queueBazaarAddMarketplaceDetail|requestBazaarAddMarketplaceDetail/);
assert.doesNotMatch(extractFunction('bulkPrepareBazaarAddSelection'), /queueBazaarAddMarketplaceDetail|requestBazaarAddMarketplaceDetail/);
assert.match(source, />Regel<\/span><select aria-label="Verkaufsregel für/);
assert.match(source, /loading \? 'Lädt …' : 'Füllen'/);
assert.match(source, /Menge und Preis für \$\{escapeAttribute\(model\.itemName\)\} füllen/);
assert.match(source, /rowFeedback\.set\(model\.rowKey/);
assert.doesNotMatch(extractFunction('renderBazaarPriceContext'), /BAZAAR_ADD_MANAGER_ID/);
assert.doesNotMatch(extractFunction('renderBazaarAddRowTools'), /Kein Bazaar-Preis verfügbar/);
assert.match(source, /\$\{loading \? 'Lädt …' : 'Füllen'\}/);
assert.match(source, /void handleBazaarAddFill\(target\.dataset\.weav3rBazaarRowKey\)/);
assert.doesNotMatch(source, /Kein Bazaar-Preis verfügbar/);
assert.match(extractFunction('collectBazaarWithApi'), /`\$\{location\.origin\}\/api\/marketplace\/\$\{encodeURIComponent\(itemId\)\}`/);
assert.match(extractFunction('collectBazaarWithApi'), /isCurrentRoute\(itemId, generation\)/);
assert.match(extractFunction('getMarketplaceBatch'), /MARKETPLACE_BATCH_KEY/);
assert.match(source, /@version\s+0\.5\.15/);
assert.match(extractFunction('handleItemMarketClick'), /startItemMarketResultObserver\(stage\)/);
assert.match(extractFunction('createItemMarketPurchaseObserver'), /control: document/);
assert.match(extractFunction('startItemMarketResultObserver'), /inspect\(root, 'initial'\)/);
assert.match(source, /@grant\s+GM_xmlhttpRequest/);
assert.match(source, /@connect\s+weav3r\.dev/);
assert.doesNotMatch(source, /@connect\s+\*/);
assert.match(source, /anonymous: true/);
assert.match(source, /data-weav3r-bazaar-fill-selected/);
assert.match(source, /Preise für ausgewählte verkaufbare Positionen füllen/);
assert.doesNotMatch(extractFunction('handleBazaarAddBulkPriceFill'), /applyBazaarSelectionPlan|setControlledCheckboxValue|setControlledInputValue/);
assert.doesNotMatch(extractFunction('resolveSelectedBazaarAddPrice'), /applyBazaarSelectionPlan|setControlledCheckboxValue|setControlledInputValue/);

const detailContext = {
  Date,
  normalizePositiveInt: bazaarAddContext.normalizePositiveInt,
  rememberItemName() {},
  resolveBazaarRecommendedPrice(itemId, options) { return { status: 'available', itemId, source: options.source, marketUnitPrice: String(options.offers[0].price), offers: options.offers }; },
  observeSafeBazaarQuote() {},
  saveCachedSourceData(itemId, sourceType, parsedKey, offers, sourceUrl, extra) { return { itemId, sourceType, parsedKey, offers, sourceUrl, extra, capturedAt: Date.now() }; },
};
vm.createContext(detailContext);
vm.runInContext(`${extractFunction('normalizeDetailedMarketplaceResponse')}\n${extractFunction('getWeav3rMarketplaceDetailUrl')}\n${extractFunction('saveDetailedMarketplaceResponse')}`, detailContext);
assert.equal(detailContext.getWeav3rMarketplaceDetailUrl(180), 'https://weav3r.dev/api/marketplace/180');
assert.equal(detailContext.getWeav3rMarketplaceDetailUrl('bad'), '');
const detailEntry = detailContext.saveDetailedMarketplaceResponse(180, { item_id: 180, item_name: 'Bottle of Beer', listings: [{ price: 996, quantity: 137, player_id: 7, player_name: 'Seller' }, { price: 1000, quantity: 2 }, { price: 1001, quantity: 1 }] }, 'https://weav3r.dev/api/marketplace/180');
assert.equal(detailEntry.sourceType, 'bazaar');
assert.equal(detailEntry.offers.length, 3);
assert.equal(detailEntry.extra.apiSource, 'marketplaceDetail');
assert.throws(() => detailContext.saveDetailedMarketplaceResponse(180, { item_id: 181, listings: [] }, 'https://weav3r.dev/api/marketplace/180'), /Malformed/);
assert.throws(() => detailContext.saveDetailedMarketplaceResponse(180, { item_id: 180, listings: [] }, 'https://weav3r.dev/api/marketplace/180'), (error) => error.code === 'no-listings');

let bazaarQuoteStorage = { version: 1, records: {} }; const bazaarQuoteContext = { Date, BigInt, Map, BAZAAR_QUOTES_KEY: 'WEAV3R_ARBITRAGE_BAZAAR_QUOTES_V1', BAZAAR_QUOTE_RECENT_MS: 86400000, normalizePositiveInt: bazaarAddContext.normalizePositiveInt, normalizeMoneyString: ledgerContext.normalizeMoneyString, normalizeBoundedText(value, limit) { return String(value || '').trim().slice(0, limit); }, normalizeBazaarPriceOffers: bazaarAddContext.normalizeBazaarPriceOffers, resolveBazaarRecommendedPrice: bazaarAddContext.resolveBazaarRecommendedPrice, buildInventoryBazaarValuation(result, quantity) { return { ...result, quantity, recommendedTotal: (BigInt(result.recommendedUnitPrice) * BigInt(quantity)).toString() }; }, gmGet(_key, fallback) { return bazaarQuoteStorage || fallback; }, gmSetDurable(_key, value, verify) { bazaarQuoteStorage = structuredClone(value); return { ok: verify(bazaarQuoteStorage) }; }, logDebug() {} }; vm.createContext(bazaarQuoteContext); vm.runInContext(['normalizeBazaarQuoteRecord', 'normalizeBazaarQuoteCollection', 'readBazaarQuotes', 'indexBazaarQuotes', 'observeSafeBazaarQuote', 'resolveStoredBazaarSortValuation'].map(extractFunction).join('\n'), bazaarQuoteContext);
const safeBazaarObservation = (price, offers = [{ price, quantity: 1 }, { price: String(BigInt(price) + 1n), quantity: 1 }, { price: String(BigInt(price) + 2n), quantity: 1 }]) => ({ status: 'available', itemId: 206, marketUnitPrice: String(price), offers, source: 'marketplaceDetail' }); const firstBazaarQuote = bazaarQuoteContext.observeSafeBazaarQuote(safeBazaarObservation('834074'), 1000); assert.equal(firstBazaarQuote.marketPrice, '834074'); assert.equal(firstBazaarQuote.observationCount, 1); const repeatedBazaarQuote = bazaarQuoteContext.observeSafeBazaarQuote(safeBazaarObservation('834074'), 2000); assert.equal(repeatedBazaarQuote.observedAt, 1000); assert.equal(repeatedBazaarQuote.lastSeenAt, 2000); assert.equal(repeatedBazaarQuote.observationCount, 2); const changedBazaarQuote = bazaarQuoteContext.observeSafeBazaarQuote(safeBazaarObservation('839999'), 3000); assert.equal(changedBazaarQuote.marketPrice, '839999'); assert.equal(changedBazaarQuote.observedAt, 3000); assert.equal(changedBazaarQuote.observationCount, 1); assert.equal(bazaarQuoteContext.observeSafeBazaarQuote({ ...safeBazaarObservation('839999'), status: 'unsafe' }, 4000), null); assert.equal(bazaarQuoteContext.observeSafeBazaarQuote(safeBazaarObservation('0'), 4000), null); assert.equal(bazaarQuoteContext.readBazaarQuotes().records['206'].marketPrice, '839999');
const adjustedStored = bazaarQuoteContext.resolveStoredBazaarSortValuation(changedBazaarQuote, 20, '-1', 3000 + 47 * 86400000); assert.equal(adjustedStored.status, 'sort-available'); assert.equal(adjustedStored.recommendedUnitPrice, '839998'); assert.equal(adjustedStored.recommendedTotal, '16799960'); assert.equal(adjustedStored.freshness, 'stored-stale'); const readjustedStored = bazaarQuoteContext.resolveStoredBazaarSortValuation(changedBazaarQuote, 20, '+5', 4000); assert.equal(readjustedStored.recommendedUnitPrice, '840004'); assert.equal(bazaarQuoteContext.readBazaarQuotes().records['206'].lastSeenAt, 3000); const hugeBazaarQuote = bazaarQuoteContext.observeSafeBazaarQuote({ ...safeBazaarObservation('900719925474099312345'), itemId: 999 }, 5000); assert.equal(hugeBazaarQuote.marketPrice, '900719925474099312345');

(async () => {
  let active = 0; let maximumActive = 0; let calls = 0;
  const schedulerContext = { Promise, BAZAAR_ADD_DETAIL_CONCURRENCY: 2, tornState: { bazaarAdd: { activePriceRequests: 0, priceRequestQueue: [], priceRequests: new Map() } }, normalizePositiveInt: bazaarAddContext.normalizePositiveInt, getWeav3rMarketplaceDetailUrl: detailContext.getWeav3rMarketplaceDetailUrl, requestBazaarAddMarketplaceDetail() {}, saveDetailedMarketplaceResponse(itemId) { return { itemId }; }, logDebug() {} };
  vm.createContext(schedulerContext);
  vm.runInContext(`${extractFunction('pumpBazaarAddPriceRequests')}\n${extractFunction('queueBazaarAddMarketplaceDetail')}`, schedulerContext);
  const transport = (itemId) => new Promise((resolve) => { calls += 1; active += 1; maximumActive = Math.max(maximumActive, active); setTimeout(() => { active -= 1; resolve({ item_id: itemId, listings: [{ price: 1 }] }); }, 5); });
  const first = schedulerContext.queueBazaarAddMarketplaceDetail(180, transport);
  const duplicate = schedulerContext.queueBazaarAddMarketplaceDetail(180, transport);
  assert.strictEqual(first, duplicate);
  await Promise.all([first, duplicate, schedulerContext.queueBazaarAddMarketplaceDetail(112, transport), schedulerContext.queueBazaarAddMarketplaceDetail(258, transport), schedulerContext.queueBazaarAddMarketplaceDetail(587, transport)]);
  assert.equal(calls, 4);
  let recommendationRequests = 0; let cacheFresh = true;
  const recommendationLoadContext = { normalizePositiveInt: bazaarAddContext.normalizePositiveInt, normalizeBazaarAddSettings: bazaarAddContext.normalizeBazaarAddSettings, gmGet() { return { priceAdjustment: '-1' }; }, BAZAAR_ADD_UI_SETTINGS_KEY: 'settings', getBazaarAddCachedOffers() { return { fresh: cacheFresh, offers: [{ price: '301' }] }; }, loadCachedItemData() { return { bazaar: { apiSource: 'marketplaceDetail', capturedAt: 123, offers: [{ price: '301' }] } }; }, resolveBazaarRecommendedPrice: bazaarAddContext.resolveBazaarRecommendedPrice, queueBazaarAddMarketplaceDetail() { recommendationRequests += 1; return Promise.resolve({ apiSource: 'marketplaceDetail', capturedAt: 124, offers: [{ price: '401' }] }); } };
  vm.createContext(recommendationLoadContext); vm.runInContext(extractFunction('loadBazaarRecommendedPrice').replace(/^function /, 'async function '), recommendationLoadContext);
  assert.equal((await recommendationLoadContext.loadBazaarRecommendedPrice(1084, { adjustment: '-1' })).recommendedUnitPrice, '300'); assert.equal(recommendationRequests, 0);
  cacheFresh = false; assert.equal((await recommendationLoadContext.loadBazaarRecommendedPrice(1084, { adjustment: '-1' })).recommendedUnitPrice, '400'); assert.equal(recommendationRequests, 1);
  assert.equal(maximumActive, 2);
  assert.equal(schedulerContext.tornState.bazaarAdd.priceRequests.size, 0);

  let detailRequests = 0; let applications = 0; let rendered = 0; let resolveDetail;
  const fillContext = {
    Promise,
    normalizePositiveInt: bazaarAddContext.normalizePositiveInt,
    tornState: { bazaarAdd: { fillRequests: new Map(), settings: { priceAdjustment: '-1' } } },
    resolveCurrentBazaarAddModelByRowKey(rowKey) { return { rowKey, itemId: 180, isTradable: true, sellableQuantity: 1 }; },
    prepareBazaarAddRowForFill() { return { ok: true }; },
    getBazaarAddCachedOffers() { return { fresh: false, offers: [] }; },
    renderBazaarPriceContext() { rendered += 1; },
    logDebug() {},
    queueBazaarAddMarketplaceDetail() { detailRequests += 1; return new Promise((resolve) => { resolveDetail = resolve; }); },
    isTornBazaarAddRoute() { return true; },
    normalizeBazaarPriceOffers(offers) { return offers; },
    applyResolvedBazaarAddPrice(rowKey, itemId, offers) { applications += 1; return { ok: true, proposal: '995', offers, model: { rowKey, itemId } }; },
  };
  vm.createContext(fillContext);
  vm.runInContext(extractFunction('handleBazaarAddFill'), fillContext);
  const missingFirst = fillContext.handleBazaarAddFill('row:180:A');
  const missingDuplicate = fillContext.handleBazaarAddFill('row:180:A');
  assert.strictEqual(missingFirst, missingDuplicate);
  assert.equal(detailRequests, 1);
  resolveDetail({ offers: [{ price: 996 }, { price: 1000 }, { price: 1001 }] });
  const missingResult = await missingFirst;
  assert.equal(missingResult.proposal, '995');
  assert.equal(applications, 1);
  assert.ok(rendered >= 2);
  assert.equal(fillContext.tornState.bazaarAdd.fillRequests.size, 0);

  detailRequests = 0; applications = 0;
  fillContext.getBazaarAddCachedOffers = () => ({ fresh: true, offers: [{ price: 996 }, { price: 1000 }, { price: 1001 }] });
  const freshResult = await fillContext.handleBazaarAddFill('row:180:A');
  assert.equal(detailRequests, 0);
  assert.equal(applications, 1);
  assert.equal(freshResult.proposal, '995');

  const makePriceModel = (visibleValue = '', hiddenValue = '') => { const visible = { type: 'text', value: visibleValue }; const hidden = { type: 'hidden', name: 'price', value: hiddenValue }; return { itemId: 180, rowKey: 'row:180:A', element: { querySelectorAll() { return [visible, hidden]; } }, visible, hidden }; };
  let currentPriceModel = makePriceModel();
  const priceWriteContext = {
    BigInt,
    normalizeMoneyString: bazaarAddContext.normalizeMoneyString,
    setControlledInputValue(input, value) { if (input.rejectWrite) return false; input.value = input.type === 'text' ? Number(value).toLocaleString('en-US') : value; return true; },
    resolveCurrentBazaarAddModelByRowKey() { return currentPriceModel; },
  };
  vm.createContext(priceWriteContext);
  vm.runInContext(`${extractFunction('getBazaarAddPriceInputs')}\n${extractFunction('normalizeBazaarAddPriceControlValue')}\n${extractFunction('readBazaarAddVisiblePrice')}\n${extractFunction('writeBazaarAddPrice')}`, priceWriteContext);
  const xanaxProposal = bazaarAddContext.calculateAdjustedBazaarPrice('829969', '-1');
  assert.equal(xanaxProposal, '829968');
  assert.equal(priceWriteContext.writeBazaarAddPrice(currentPriceModel, xanaxProposal), true);
  assert.equal(priceWriteContext.readBazaarAddVisiblePrice(currentPriceModel), '829968');
  assert.equal(bazaarAddContext.getBazaarFillMessage({ ok: true, proposal: xanaxProposal }), 'Preis $829,968 vorbereitet');
  currentPriceModel = makePriceModel('700000', '700000'); currentPriceModel.visible.rejectWrite = true;
  assert.equal(priceWriteContext.writeBazaarAddPrice(currentPriceModel, xanaxProposal), false);
  assert.equal(bazaarAddContext.getBazaarFillMessage({ ok: false, proposal: xanaxProposal }), 'Preis konnte nicht gesetzt werden');

  let addRoute = false; let managerPresent = false; let initCount = 0; let teardownCount = 0; const lifecycleHandlers = {}; let lifecycleObserverCallback;
  const lifecycleContext = {
    BAZAAR_ADD_MANAGER_ID: 'weav3r-bazaar-add-manager',
    tornState: { bazaarAdd: { lifecycleListenersAttached: false, lifecycleObserver: null, root: null, bulkPriceOperation: { cancelled: false } } },
    isTornBazaarAddRoute() { return addRoute; },
    initBazaarAddManager() { initCount += 1; managerPresent = true; lifecycleContext.tornState.bazaarAdd.root = {}; },
    teardownBazaarAddManager() { teardownCount += 1; managerPresent = false; lifecycleContext.tornState.bazaarAdd.root = null; lifecycleContext.tornState.bazaarAdd.bulkPriceOperation.cancelled = true; },
    window: { addEventListener(type, handler) { lifecycleHandlers[type] = handler; } },
    document: { documentElement: {}, getElementById() { return managerPresent ? {} : null; } },
    MutationObserver: class { constructor(callback) { lifecycleObserverCallback = callback; } observe() {} },
  };
  vm.createContext(lifecycleContext);
  vm.runInContext(`${extractFunction('reconcileBazaarAddLifecycle')}\n${extractFunction('initBazaarAddLifecycle')}`, lifecycleContext);
  lifecycleContext.initBazaarAddLifecycle();
  assert.equal(initCount, 0);
  assert.equal(lifecycleContext.tornState.bazaarAdd.lifecycleListenersAttached, true);
  addRoute = true; lifecycleHandlers.hashchange();
  assert.equal(initCount, 1);
  lifecycleObserverCallback();
  assert.equal(initCount, 1);
  addRoute = false; lifecycleHandlers.hashchange();
  assert.equal(lifecycleContext.tornState.bazaarAdd.bulkPriceOperation.cancelled, true);
  addRoute = true; lifecycleHandlers.hashchange();
  assert.equal(initCount, 2);
  assert.equal(Object.keys(lifecycleHandlers).length, 2);

  const applyContext = {
    isTornBazaarAddRoute() { return true; },
    resolveCurrentBazaarAddModelByRowKey() { return { rowKey: 'row:180:A', itemId: 180, isTradable: true, sellableQuantity: 1 }; },
    hasExternalBazaarPriceFiller() { return false; },
    validateBazaarGroupSelection() { return { valid: true }; },
    resolveBazaarRecommendedPrice(_itemId, options) { return options.currentPrice === '100000' ? { ok: false, reason: 'price-drop', offers: [] } : { ok: true, proposal: '995', offers: [] }; },
    tornState: { bazaarAdd: { settings: { priceAdjustment: '-1' } } },
    readBazaarAddVisiblePrice() { return '100000'; },
    writeBazaarAddPrice() { throw new Error('price-drop must not write'); },
  };
  vm.createContext(applyContext);
  vm.runInContext(extractFunction('applyResolvedBazaarAddPrice'), applyContext);
  assert.equal(applyContext.applyResolvedBazaarAddPrice('row:180:A', 180, [{ price: 90001 }]).reason, 'price-drop');
  applyContext.resolveCurrentBazaarAddModelByRowKey = () => ({ rowKey: 'row:180:A', itemId: 180, isTradable: true, sellableQuantity: 0 });
  assert.equal(applyContext.applyResolvedBazaarAddPrice('row:180:A', 180, [{ price: 996 }]).reason, 'protected');
  applyContext.isTornBazaarAddRoute = () => false;
  assert.equal(applyContext.applyResolvedBazaarAddPrice('row:180:A', 180, [{ price: 996 }]).reason, 'route-changed');
  assert.match(source, /@match\s+https:\/\/www\.torn\.com\/item\.php\*/);
  assert.match(source, /document\.addEventListener\('auxclick', handleWeav3rNativeNavigation, true\)/);
  assert.match(source, /origin: 'weav3r-native-click'/);
  assert.match(source, /selectionMode: 'manual-exact'/);
  assert.match(source, /searchIntent: 'explicit-item'/);
  assert.match(source, /function initializeSharedHistoryInfrastructure\(/);
  assert.match(source, /function resolveTornHistoryContext\(/);
  assert.match(source, /function filterTransactionsByHistoryContext\(/);
  assert.doesNotMatch(extractFunction('handleWeav3rNativeNavigation'), /preventDefault|window\.open/);

  const historyContext = {
    normalizePositiveInt(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; },
    normalizeBoundedText(value, limit) { return String(value || '').trim().slice(0, limit); },
    state: { historyContext: { kind: 'global' } },
  };
  vm.createContext(historyContext);
  vm.runInContext(`${extractFunction('normalizeHistoryContext')}\n${extractFunction('filterTransactionsByHistoryContext')}`, historyContext);
  const confirmed = [{ id: 'a', itemId: 367, tradeId: 123 }, { id: 'b', itemId: 206, tradeId: 456 }, { id: 'same-name', itemId: 206, itemName: 'Xanax', tradeId: 123 }];
  assert.deepEqual(Array.from(historyContext.filterTransactionsByHistoryContext(confirmed, { kind: 'item', itemId: 367 }), (row) => row.id), ['a']);
  assert.deepEqual(Array.from(historyContext.filterTransactionsByHistoryContext(confirmed, { kind: 'trade', tradeId: 123 }), (row) => row.id), ['a', 'same-name']);
  assert.equal(historyContext.normalizeHistoryContext({ kind: 'item', itemId: 0 }).kind, 'global');

  // Authentic Item Market semantic fixtures and conservative state transitions.
  const itemMarketContext = {
    URL,
    BigInt,
    Math,
    Date,
    location: { origin: 'https://www.torn.com', href: 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=1143' },
    PURCHASE_CONFIRMATION_OBSERVATION_MS: 15000,
    tornState: { itemMarketAttempts: new Map() },
    normalizePositiveInt: offerContext.normalizePositiveInt,
    normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); },
    normalizeMoneyString: ledgerContext.normalizeMoneyString,
    normalizedItemText(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); },
    parseTornItemMarketUrl: offerContext.parseTornItemMarketUrl,
    readPurchaseTransports() { return { records: {} }; },
    normalizeTransactionEventV2: ledgerContext.normalizeTransactionEventV2,
    stopItemMarketResultObserver() {},
    logDebug() {},
  };
  vm.createContext(itemMarketContext);
  vm.runInContext([
    'parseItemMarketItemIdFromImage',
    'parseItemMarketSellerProfile',
    'parseItemMarketConfirmationText',
    'parseItemMarketSuccessText',
    'parseItemMarketFailureText',
    'parseItemMarketOfferStage',
    'findMatchingItemMarketTransport',
    'createItemMarketStage',
    'matchItemMarketConfirmation',
    'cancelItemMarketStage',
    'resolveConfirmedItemMarketPurchase',
    'buildConfirmedItemMarketBuyEvent',
  ].map(extractFunction).join('\n'), itemMarketContext);
  const visibleQuantity = { type: 'text', hidden: false, value: '3', getAttribute(name) { return name === 'aria-hidden' ? null : name === 'data-money' ? '15' : null; } };
  const hiddenQuantity = { type: 'hidden', hidden: false, value: '99', getAttribute(name) { return name === 'data-money' ? '15' : null; } };
  const itemImage = { src: '/images/items/1143/medium.png', getAttribute(name) { return name === 'src' ? this.src : name === 'alt' ? 'Disposable Mask' : null; } };
  const sellerLink = { href: '/profiles.php?XID=4189693', getAttribute(name) { return name === 'href' ? this.href : name === 'aria-label' ? 'View profile of cangcimen' : null; } };
  const offerNodes = [{ textContent: '$358' }, { textContent: '15 available' }];
  const offerRow = { querySelector(selector) { if (selector.startsWith('img')) return itemImage; if (selector.startsWith('a[')) return sellerLink; return null; }, querySelectorAll(selector) { if (selector.startsWith('input')) return [hiddenQuantity, visibleQuantity]; if (selector === 'div,span') return offerNodes; return []; } };
  const buyButton = { getAttribute(name) { return name === 'aria-label' ? 'Buy Disposable Mask?' : null; } };
  const parsedOffer = itemMarketContext.parseItemMarketOfferStage(buyButton, offerRow, 1143);
  assert.deepEqual({ ...parsedOffer }, { itemId: 1143, itemName: 'Disposable Mask', sellerId: 4189693, sellerName: 'cangcimen', displayedUnitPrice: '358', availableQuantity: 15, requestedQuantity: 3 });
  itemMarketContext.readPurchaseTransports = () => ({ records: { matching: { source: 'item-market', itemId: 1143, sellerId: 4189693, sellerName: 'cangcimen', correlationId: 'purchase:matching', displayedUnitPrice: '350', origin: 'weav3r-native-click' } } });
  const transportedStage = itemMarketContext.createItemMarketStage(buyButton, offerRow, 1786399999000);
  assert.equal(transportedStage.transportCorrelationId, 'purchase:matching');
  assert.equal(transportedStage.origin, 'weav3r-native-click');
  assert.equal(transportedStage.displayedUnitPrice, '358');
  assert.equal(transportedStage.transportQuoteUnitPrice, '350');
  itemMarketContext.readPurchaseTransports = () => ({ records: { conflicting: { source: 'item-market', itemId: 1143, sellerId: 999, correlationId: 'purchase:wrong', origin: 'weav3r-native-click' } } });
  const directFallbackStage = itemMarketContext.createItemMarketStage(buyButton, offerRow, 1786399999001);
  assert.equal(directFallbackStage.transportCorrelationId, null);
  assert.equal(directFallbackStage.origin, 'direct-item-market');
  visibleQuantity.value = 'max';
  assert.equal(itemMarketContext.parseItemMarketOfferStage(buyButton, offerRow, 1143).requestedQuantity, null);
  assert.equal(itemMarketContext.parseItemMarketOfferStage(buyButton, offerRow, 999), null);
  assert.deepEqual({ ...itemMarketContext.parseItemMarketConfirmationText('Buy 3x Disposable Mask for $1,305?') }, { quantity: 3, itemName: 'Disposable Mask', totalPrice: '1305' });
  assert.deepEqual({ ...itemMarketContext.parseItemMarketConfirmationText('Buy 3x Credit Card for $900?YesNo') }, { quantity: 3, itemName: 'Credit Card', totalPrice: '900' });
  assert.deepEqual({ ...itemMarketContext.parseItemMarketSuccessText('You bought 1x Disposable Mask from Tortill4 for a total of $444') }, { quantity: 1, itemName: 'Disposable Mask', sellerName: 'Tortill4', totalPrice: '444' });
  assert.deepEqual({ ...itemMarketContext.parseItemMarketFailureText('You do not have enough money to buy this item.') }, { failed: true, reason: 'insufficient-funds' });
  assert.equal(itemMarketContext.parseItemMarketFailureText('Unknown market response'), null);

  const directStage = { attemptId: 'item-market-attempt:direct-1', correlationId: 'item-market-attempt:direct-1', itemId: 1143, itemName: 'Disposable Mask', sellerId: 4189693, sellerName: 'Tortill4', displayedUnitPrice: '358', transportQuoteUnitPrice: null, origin: 'direct-item-market', stagedAt: 1786400000000, expiresAt: 1786400015000, requestedQuantity: 1, state: 'staged', confirmation: null };
  const noStage = { ...directStage, attemptId: 'no-stage' }; itemMarketContext.cancelItemMarketStage(noStage, 'user-no'); assert.equal(noStage.state, 'cancelled');
  const closeStage = { ...directStage, attemptId: 'close-stage' }; itemMarketContext.cancelItemMarketStage(closeStage, 'panel-closed'); assert.equal(closeStage.state, 'cancelled');
  itemMarketContext.tornState.itemMarketAttempts.set(directStage.attemptId, directStage);
  const directConfirmation = itemMarketContext.parseItemMarketConfirmationText('Buy 1x Disposable Mask for $444?');
  assert.equal(itemMarketContext.matchItemMarketConfirmation(directConfirmation, 1786400000100).ok, true);
  assert.equal(itemMarketContext.resolveConfirmedItemMarketPurchase('You bought 1x Disposable Mask from Tortill4 for a total of $444', directStage, 1786400000200).confirmed, false);
  directStage.state = 'yes-clicked'; directStage.confirmation = directConfirmation;
  const directSuccess = itemMarketContext.resolveConfirmedItemMarketPurchase('You bought 1x Disposable Mask from Tortill4 for a total of $444', directStage, 1786400000200);
  assert.equal(directSuccess.confirmed, true);
  const directEvent = itemMarketContext.buildConfirmedItemMarketBuyEvent(directStage, directSuccess);
  assert.equal(directEvent.source, 'item-market');
  assert.equal(directEvent.transactionType, 'buy');
  assert.equal(directEvent.cash.amount, '444');
  assert.equal(directEvent.itemLines[0].unitPrice, '444');
  assert.equal(directEvent.origin, 'direct-item-market');
  const unevenStage = { ...directStage, attemptId: 'item-market-attempt:uneven', confirmation: { quantity: 3, itemName: 'Disposable Mask', totalPrice: '100' } };
  const unevenResult = itemMarketContext.resolveConfirmedItemMarketPurchase('You bought 3x Disposable Mask from Tortill4 for a total of $100', unevenStage, 1786400000201);
  assert.equal(itemMarketContext.buildConfirmedItemMarketBuyEvent(unevenStage, unevenResult).itemLines[0].unitPrice, null);
  const beforeConfirmedItemMarket = ledgerContext.listTransactionEvents().length;
  assert.equal(ledgerContext.recordTransactionEvent(directEvent).ok, true);
  assert.equal(ledgerContext.listTransactionEvents().length, beforeConfirmedItemMarket + 1);
  assert.equal(ledgerContext.recordTransactionEvent(directEvent).duplicate, true);
  assert.equal(ledgerContext.listTransactionEvents().length, beforeConfirmedItemMarket + 1);

  for (const [field, value, reason] of [
    ['itemName', 'Wrong Item', 'item-market-success-item-mismatch'],
    ['sellerName', 'WrongSeller', 'item-market-success-seller-mismatch'],
    ['quantity', 2, 'item-market-success-quantity-mismatch'],
    ['totalPrice', '445', 'item-market-success-total-mismatch'],
  ]) {
    const text = `You bought ${field === 'quantity' ? value : 1}x ${field === 'itemName' ? value : 'Disposable Mask'} from ${field === 'sellerName' ? value : 'Tortill4'} for a total of $${field === 'totalPrice' ? value : '444'}`;
    assert.equal(itemMarketContext.resolveConfirmedItemMarketPurchase(text, directStage, 1786400000300).reason, reason);
  }
  assert.equal(itemMarketContext.resolveConfirmedItemMarketPurchase('You do not have enough money to buy this item.', directStage, 1786400000300).reason, 'insufficient-funds');
  assert.equal(itemMarketContext.resolveConfirmedItemMarketPurchase('Something else happened.', directStage, 1786400000300).reason, 'unsupported-item-market-response');

  const creditImage = { src: '/images/items/1084/medium.png', getAttribute(name) { return name === 'src' ? this.src : name === 'alt' ? 'Credit Card' : null; } };
  const creditSeller = { href: '/profiles.php?XID=4426483', getAttribute(name) { return name === 'href' ? this.href : name === 'aria-label' ? 'View profile of Atlas_Lymb0' : null; } };
  const creditQuantity = { type: 'text', hidden: false, value: '3', getAttribute(name) { return name === 'aria-hidden' ? null : name === 'data-money' ? '99' : null; } };
  const creditHiddenQuantity = { type: 'hidden', hidden: false, value: '99', getAttribute() { return null; } };
  const creditRow = { querySelector(selector) { if (selector.startsWith('img')) return creditImage; if (selector.startsWith('a[')) return creditSeller; return null; }, querySelectorAll(selector) { if (selector.startsWith('input')) return [creditHiddenQuantity, creditQuantity]; if (selector === 'div,span') return [{ textContent: '$300' }, { textContent: '10 available' }]; return []; } };
  const creditButton = { getAttribute(name) { return name === 'aria-label' ? 'Buy Credit Card?' : null; } };
  const creditOffer = itemMarketContext.parseItemMarketOfferStage(creditButton, creditRow, 1084);
  assert.deepEqual({ ...creditOffer }, { itemId: 1084, itemName: 'Credit Card', sellerId: 4426483, sellerName: 'Atlas_Lymb0', displayedUnitPrice: '300', availableQuantity: 10, requestedQuantity: 3 });
  const creditStage = { ...creditOffer, attemptId: 'item-market-attempt:credit-card', correlationId: 'item-market-attempt:credit-card', transportCorrelationId: null, transportQuoteUnitPrice: null, origin: 'direct-item-market', stagedAt: 1786400001000, expiresAt: 1786400016000, state: 'yes-clicked', confirmation: itemMarketContext.parseItemMarketConfirmationText('Buy 3x Credit Card for $900?YesNo') };
  const creditSuccess = itemMarketContext.resolveConfirmedItemMarketPurchase('You bought 3x Credit Card from Atlas_Lymb0 for a total of $900', creditStage, 1786400001100);
  assert.equal(creditSuccess.confirmed, true);
  const creditEvent = itemMarketContext.buildConfirmedItemMarketBuyEvent(creditStage, creditSuccess);
  assert.equal(creditEvent.itemLines[0].itemId, 1084);
  assert.equal(creditEvent.itemLines[0].quantity, 3);
  assert.equal(creditEvent.itemLines[0].unitPrice, '300');
  assert.equal(creditEvent.cash.amount, '900');
  assert.equal(creditEvent.counterparty.id, 4426483);
  assert.equal(creditEvent.counterparty.name, 'Atlas_Lymb0');
  const resultCandidate = { nodeType: 1 }; let itemMarketInspections = 0; const itemMarketObservers = [];
  class ItemMarketMutationObserver { constructor(callback) { this.callback = callback; itemMarketObservers.push(this); } observe(root) { this.root = root; } disconnect() {} }
  const resultObserverContext = { WeakSet, MutationObserver: ItemMarketMutationObserver, PURCHASE_CONFIRMATION_OBSERVATION_MS: 15000, document: { documentElement: { nodeType: 1, isConnected: true }, body: null }, tornState: { itemMarketResultObservers: new Map() }, setTimeout: () => 1, clearTimeout() {}, stopItemMarketResultObserver() {}, collectItemMarketResultCandidates: (node) => node === resultCandidate ? [resultCandidate] : [resultCandidate], inspectItemMarketResultNode() { itemMarketInspections += 1; return { state: 'recorded' }; }, cancelItemMarketStage() {}, sanitizePurchaseDiagnosticElement: () => ({}), logDebug() {} };
  vm.createContext(resultObserverContext); vm.runInContext(extractFunction('startItemMarketResultObserver'), resultObserverContext);
  const observedCreditStage = { attemptId: 'credit-observer', state: 'yes-clicked' };
  assert.equal(resultObserverContext.startItemMarketResultObserver(observedCreditStage), true);
  assert.equal(itemMarketInspections, 1);
  itemMarketObservers[0].callback([{ addedNodes: [resultCandidate] }]);
  assert.equal(itemMarketInspections, 1);

  const weavStage = { ...directStage, attemptId: 'item-market-attempt:weav-2', correlationId: 'purchase:weav-2', origin: 'weav3r-native-click', displayedUnitPrice: '400', transportQuoteUnitPrice: '390', state: 'yes-clicked', confirmation: directConfirmation };
  const weavSuccess = itemMarketContext.resolveConfirmedItemMarketPurchase('You bought 1x Disposable Mask from Tortill4 for a total of $444', weavStage, 1786400000400);
  const weavEvent = itemMarketContext.buildConfirmedItemMarketBuyEvent(weavStage, weavSuccess);
  assert.equal(weavEvent.quote.expectedUnitPrice, '400');
  assert.equal(weavEvent.quote.expectedTotalPrice, '400');
  assert.equal(weavEvent.quote.marketQuoteUnitPrice, '390');
  assert.equal(weavEvent.origin, 'weav3r-native-click');
  assert.equal(ledgerContext.recordTransactionEvent(weavEvent).ok, true);
  assert.equal(ledgerContext.queryTransactionEvents({ source: 'item-market', itemId: 1143 }).length >= 2, true);
  const itemMarketLedger = ledgerContext.readTransactionLedger();
  const itemMarketRows = Object.values(itemMarketLedger.transactions).filter((entry) => entry.source === 'item-market');
  assert.equal(itemMarketRows.length >= 2, true);
  assert.equal(itemMarketRows.every((entry) => entry.type === 'buy' && entry.confirmationMethod === 'item-market-purchase-confirmation'), true);
  assert.match(ledgerContext.serializeTransactionJson(itemMarketLedger), /item-market-purchase-confirmation/);
  assert.match(ledgerContext.serializeTransactionCsv(itemMarketLedger), /item-market/);
  const secondRealStage = { ...directStage, attemptId: 'item-market-attempt:direct-3', correlationId: 'item-market-attempt:direct-3' };
  assert.notEqual(itemMarketContext.buildConfirmedItemMarketBuyEvent(secondRealStage, directSuccess).id, directEvent.id);
  itemMarketContext.tornState.itemMarketAttempts.set('ambiguous', { ...directStage, attemptId: 'ambiguous', state: 'staged' });
  directStage.state = 'staged';
  assert.equal(itemMarketContext.matchItemMarketConfirmation(directConfirmation, 1786400000500).reason, 'ambiguous-confirmation');

  // Transaction Store v2: per-event keys, migration, append-only conflicts, and revision invalidation.
  ledgerStore.clear();
  Object.assign(ledgerContext.transactionStoreCache, { revision: null, events: null });
  ledgerStore.set(ledgerContext.TRANSACTION_LEDGER_KEY, structuredClone({ version: 1, transactions: { sale, futureKrillSale, confirmedBuy } }));
  const migrationOne = ledgerContext.migrateLegacyLedgerV1(1786300000000);
  assert.equal(migrationOne.migration.legacyV1Complete, true);
  assert.equal(ledgerContext.listStoredTransactionEventKeys().length, 3);
  assert.equal(ledgerContext.listTransactionEvents().length, 3);
  const migrationTwo = ledgerContext.migrateLegacyLedgerV1(1786300001000);
  assert.equal(migrationTwo.migration.legacyV1Complete, true);
  assert.equal(ledgerContext.listStoredTransactionEventKeys().length, 3);
  assert.equal(ledgerStore.has(ledgerContext.TRANSACTION_LEDGER_KEY), true);

  const eventA = ledgerContext.legacyTransactionToEvent(sale);
  const eventB = ledgerContext.legacyTransactionToEvent(futureKrillSale);
  ledgerStore.clear();
  Object.assign(ledgerContext.transactionStoreCache, { revision: null, events: null });
  assert.equal(ledgerContext.recordTransactionEvent(eventA).ok, true);
  const revisionAfterA = ledgerStore.get(ledgerContext.TRANSACTION_STORE_REVISION_KEY);
  assert.equal(ledgerContext.recordTransactionEvent(eventB).ok, true);
  assert.notEqual(ledgerStore.get(ledgerContext.TRANSACTION_STORE_REVISION_KEY), revisionAfterA);
  assert.equal(ledgerContext.listStoredTransactionEventKeys().length, 2);
  assert.equal(ledgerContext.recordTransactionEvent(eventA).duplicate, true);
  const changedEventA = structuredClone(eventA); changedEventA.cash.amount = '9999999';
  const eventConflict = ledgerContext.recordTransactionEvent(changedEventA);
  assert.equal(eventConflict.conflict, true);
  assert.equal(ledgerContext.readTransactionEvent(eventA.id).cash.amount, eventA.cash.amount);
  const firstRevision = ledgerStore.get(ledgerContext.TRANSACTION_STORE_REVISION_KEY);
  assert.ok(firstRevision);
  ledgerContext.invalidateTransactionEventCache('test revision');
  assert.equal(ledgerContext.transactionStoreCache.events, null);

  ledgerStore.clear();
  Object.assign(ledgerContext.transactionStoreCache, { revision: null, events: null });
  ledgerStore.set(ledgerContext.TRANSACTION_LEDGER_KEY, structuredClone({ version: 1, transactions: { sale, bad: {}, futureKrillSale } }));
  const rejectedMigration = ledgerContext.migrateLegacyLedgerV1(1786300002000);
  assert.equal(rejectedMigration.migration.legacyV1Complete, true);
  assert.equal(rejectedMigration.migration.rejectedCount, 1);
  assert.deepEqual(Array.from(rejectedMigration.migration.rejectedIds), ['bad']);
  assert.equal(ledgerContext.readTransactionLedgerDiagnostics().ledger.transactions[sale.id].id, sale.id);

  ledgerStore.clear();
  Object.assign(ledgerContext.transactionStoreCache, { revision: null, events: null });
  ledgerStore.set(ledgerContext.TRANSACTION_LEDGER_KEY, structuredClone({ version: 1, transactions: { sale, futureKrillSale, confirmedBuy } }));
  const normalSet = ledgerContext.gmSet;
  let v2Writes = 0;
  ledgerContext.gmSet = (key, value) => { if (String(key).startsWith(ledgerContext.TRANSACTION_EVENT_PREFIX) && ++v2Writes > 1) return; normalSet(key, value); };
  assert.equal(ledgerContext.migrateLegacyLedgerV1(1786300003000).migration.legacyV1Complete, false);
  ledgerContext.gmSet = normalSet;
  assert.equal(ledgerContext.migrateLegacyLedgerV1(1786300004000).migration.legacyV1Complete, true);
  assert.equal(ledgerContext.listStoredTransactionEventKeys().length, 3);

  ledgerStore.clear();
  Object.assign(ledgerContext.transactionStoreCache, { revision: null, events: null });
  ledgerStore.set(ledgerContext.TRANSACTION_LEDGER_KEY, structuredClone({ version: 1, transactions: { sale } }));
  const conflictingLegacyEvent = ledgerContext.legacyTransactionToEvent({ ...sale, totalPrice: '7084115', unitPrice: '1416823' });
  assert.equal(ledgerContext.recordTransactionEvent(conflictingLegacyEvent).ok, true);
  const migrationConflict = ledgerContext.migrateLegacyLedgerV1(1786300005000);
  assert.equal(migrationConflict.migration.legacyV1Complete, false);
  assert.equal(migrationConflict.migration.conflicts.length, 1);
  assert.equal(ledgerContext.readTransactionEvent(conflictingLegacyEvent.id).cash.amount, '7084115');

  const multiLine = ledgerContext.normalizeTransactionEventV2({ schemaVersion: 2, id: 'event:future:multi:1', source: 'trade', transactionType: 'mixed', confirmedAt: 1786300006000, createdAt: 1786300006000, confidence: 'confirmed', confirmation: { method: 'trade-completion' }, cash: { direction: 'in', amount: '900719925474099312345' }, itemLines: [{ lineId: 'future:1', direction: 'out', itemId: 367, itemName: 'Xanax', quantity: 2, totalPrice: null, unitPrice: null }, { lineId: 'future:2', direction: 'in', itemId: 206, itemName: 'Vicodin', quantity: 1, totalPrice: null, unitPrice: null }] });
  assert.equal(multiLine.cash.amount, '900719925474099312345');
  assert.equal(multiLine.itemLines.length, 2);
  assert.equal(multiLine.itemLines.every((line) => line.totalPrice === null && line.unitPrice === null), true);
  assert.equal(ledgerContext.normalizeTransactionEventV2({ ...multiLine, confidence: 'pending' }), null);

  const inventoryContext = { normalizePositiveInt: offerContext.normalizePositiveInt, normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); } };
  vm.createContext(inventoryContext); vm.runInContext(['normalizeInventoryIdentityText', 'parseTornInventoryRow', 'scanTornInventoryList'].map(extractFunction).join('\n'), inventoryContext);
  const makeInventoryRow = ({ itemId, itemName, rowKey, quantity, armoryId = '', group = '', category = '', imageId = itemId, visibleName = itemName, imageAlt = itemName, withTornTools = false }) => {
    const image = { getAttribute(name) { return name === 'src' ? `/images/items/${imageId}/medium.png` : name === 'srcset' ? '' : name === 'alt' ? imageAlt : null; } };
    const title = { textContent: visibleName }; const tt = withTornTools ? { textContent: '$999,999,999' } : null;
    return { dataset: { item: String(itemId), sort: itemName, rowkey: rowKey, qty: String(quantity), armoryid: armoryId, group, category }, matches(selector) { return selector === 'li[data-item][data-rowkey]'; }, querySelector(selector) { if (selector === '.title-wrap .name') return title; if (selector === '.tt-item-price') return tt; return null; }, querySelectorAll(selector) { if (selector.startsWith('img[src')) return [image]; if (selector === 'img[alt]') return [image]; return []; } };
  };
  const angleGrinder = makeInventoryRow({ itemId: 1509, itemName: 'Angle Grinder', rowKey: 'g1509', quantity: 3, category: 'Tool', withTornTools: true });
  const glasses = makeInventoryRow({ itemId: 564, itemName: 'Glasses', rowKey: 'g564', quantity: 1 }); glasses.actionDataId = '19345310927';
  const mp9 = makeInventoryRow({ itemId: 233, itemName: 'BT MP9', rowKey: 'u19452406897', quantity: 1, armoryId: '19452406897', category: 'Secondary' });
  const benelliParent = makeInventoryRow({ itemId: 28, itemName: 'Benelli M4 Super', rowKey: 'g28', quantity: 3, group: 'parent', category: 'Primary' }); benelliParent.actionDataId = '20546536156';
  const benelliChildren = ['20546536156', '20527410662', '20338057002'].map((id) => makeInventoryRow({ itemId: 28, itemName: 'Benelli M4 Super', rowKey: `u${id}`, quantity: 2, armoryId: id, group: 'item', category: 'Primary' }));
  assert.deepEqual({ ...inventoryContext.parseTornInventoryRow(angleGrinder), sourceRow: undefined }, { itemId: 1509, itemName: 'Angle Grinder', category: 'Tool', quantity: 3, rowKey: 'g1509', instanceKey: null, groupKey: null, groupState: 'stack', isGroupParent: false, isGroupChild: false, sourceRow: undefined });
  assert.equal(inventoryContext.parseTornInventoryRow(glasses).instanceKey, null);
  assert.equal(inventoryContext.parseTornInventoryRow(mp9).instanceKey, '19452406897');
  assert.equal(inventoryContext.parseTornInventoryRow(mp9).quantity, 1);
  const parsedParent = inventoryContext.parseTornInventoryRow(benelliParent); assert.equal(parsedParent.groupState, 'closed-parent'); assert.equal(parsedParent.quantity, 3); assert.equal(parsedParent.instanceKey, null);
  assert.equal(benelliChildren.every((row) => inventoryContext.parseTornInventoryRow(row).quantity === 1), true);
  const openContainer = { querySelectorAll: () => [...benelliChildren, mp9] }; const openScan = inventoryContext.scanTornInventoryList(openContainer);
  assert.equal(openScan.groups.length, 1); assert.equal(openScan.groups[0].groupKey, 'g28'); assert.equal(openScan.groups[0].totalQuantity, 3); assert.equal(openScan.groups[0].rowKeys.includes('u19452406897'), false);
  const closedScan = inventoryContext.scanTornInventoryList({ querySelectorAll: () => [benelliParent] }); assert.equal(closedScan.groups[0].totalQuantity, 3);
  assert.equal(inventoryContext.parseTornInventoryRow(makeInventoryRow({ itemId: 1509, itemName: 'Angle Grinder', rowKey: 'g1509', quantity: 3, visibleName: 'Wrong Name' })), null);
  assert.equal(inventoryContext.parseTornInventoryRow(makeInventoryRow({ itemId: 1509, itemName: 'Angle Grinder', rowKey: 'g1509', quantity: 3, imageId: 999 })), null);
  assert.equal(inventoryContext.parseTornInventoryRow({ matches: () => false }), null);
  assert.equal(inventoryContext.parseTornInventoryRow(makeInventoryRow({ itemId: 1509, itemName: 'Angle Grinder', rowKey: 'g1509', quantity: 3, withTornTools: false })).quantity, 3);

  let injectedButton = null; const historyHost = { appendChild(button) { injectedButton = button; } }; const historyRow = { isConnected: true, querySelector(selector) { if (selector.includes('[data-wah-item-history]')) return injectedButton; if (selector === '.title-wrap') return historyHost; return null; } };
  const inventoryHistoryContext = { document: { createElement() { return { dataset: {}, setAttribute(name, value) { this[name] = value; } }; } } }; vm.createContext(inventoryHistoryContext); vm.runInContext(extractFunction('ensureTornInventoryHistoryButton'), inventoryHistoryContext);
  const firstHistoryButton = inventoryHistoryContext.ensureTornInventoryHistoryButton({ itemId: 233, itemName: 'BT MP9', sourceRow: historyRow }); const secondHistoryButton = inventoryHistoryContext.ensureTornInventoryHistoryButton({ itemId: 233, itemName: 'BT MP9', sourceRow: historyRow });
  assert.equal(firstHistoryButton, secondHistoryButton); assert.equal(firstHistoryButton.dataset.wahItemHistory, '233'); assert.equal(firstHistoryButton['aria-label'], 'History: BT MP9');

  const basisContext = {
    normalizePositiveInt: offerContext.normalizePositiveInt,
    normalizeMoneyString: ledgerContext.normalizeMoneyString,
    formatLedgerMoney: ledgerContext.formatLedgerMoney,
  };
  vm.createContext(basisContext); vm.runInContext(['resolveItemLineAcquisitionCost', 'aggregateItemBasisEvents', 'formatItemBasisAverage', 'greatestCommonDivisor', 'makeBigIntRatio', 'subtractBigIntRatios', 'roundBigIntRatio', 'formatBigIntRatioMoney', 'formatInventoryRoi', 'buildItemBasisSummary', 'buildTornInventoryBasisBlocks'].map(extractFunction).join('\n'), basisContext);
  const basisEvent = (id, direction, itemId, quantity, totalPrice = null, unitPrice = null, extra = {}) => ({ schemaVersion: 2, id, confidence: 'confirmed', cash: { direction: direction === 'in' ? 'out' : 'in', amount: totalPrice || '1' }, itemLines: [{ direction, itemId, itemName: `Item ${itemId}`, quantity, totalPrice, unitPrice }], ...extra });
  const creditAggregates = basisContext.aggregateItemBasisEvents([basisEvent('credit-buy', 'in', 1084, 3, '900', '300')]);
  const creditPartial = basisContext.buildItemBasisSummary(1084, 4, creditAggregates);
  assert.equal(creditPartial.confirmedInboundQuantity, 3); assert.equal(creditPartial.confirmedOutboundQuantity, 0); assert.equal(creditPartial.trackedNetQuantity, 3); assert.equal(creditPartial.reconstructionStatus, 'partial'); assert.equal(creditPartial.coveredQuantity, 3); assert.equal(creditPartial.unknownQuantity, 1); assert.equal(creditPartial.knownPurchaseQuantity, 3); assert.equal(creditPartial.knownPurchaseCost, '900'); assert.equal(creditPartial.weightedConfirmedPurchasePrice.amount, '300');
  assert.equal(basisContext.buildItemBasisSummary(1084, 3, creditAggregates).reconstructionStatus, 'full');
  const untracked = basisContext.buildItemBasisSummary(1084, 4, basisContext.aggregateItemBasisEvents([])); assert.equal(untracked.reconstructionStatus, 'untracked'); assert.equal(untracked.knownPurchaseQuantity, 0); assert.equal(untracked.weightedConfirmedPurchasePrice, null);
  const outboundAggregates = basisContext.aggregateItemBasisEvents([basisEvent('buy-five', 'in', 28, 5, '500'), basisEvent('sell-two', 'out', 28, 2, '400')]); const outboundSummary = basisContext.buildItemBasisSummary(28, 3, outboundAggregates); assert.equal(outboundSummary.reconstructionStatus, 'full'); assert.equal(outboundSummary.trackedNetQuantity, 3); assert.equal(outboundSummary.knownPurchaseQuantity, 5); assert.equal(outboundSummary.knownPurchaseCost, '500');
  assert.equal(basisContext.buildItemBasisSummary(28, 3, basisContext.aggregateItemBasisEvents([basisEvent('buy-five-only', 'in', 28, 5, '500')])).reconstructionStatus, 'divergent');
  assert.equal(basisContext.buildItemBasisSummary(28, 3, basisContext.aggregateItemBasisEvents([basisEvent('sell-four-only', 'out', 28, 4, '400')])).reconstructionStatus, 'divergent');
  const unknownPriceEvent = { schemaVersion: 2, confidence: 'confirmed', cash: { direction: 'out', amount: '999' }, itemLines: [{ direction: 'in', itemId: 28, itemName: 'Benelli', quantity: 2, totalPrice: null, unitPrice: null }, { direction: 'in', itemId: 233, itemName: 'BT MP9', quantity: 1, totalPrice: null, unitPrice: null }] }; const unknownSummary = basisContext.buildItemBasisSummary(28, 3, basisContext.aggregateItemBasisEvents([unknownPriceEvent])); assert.equal(unknownSummary.confirmedInboundQuantity, 2); assert.equal(unknownSummary.knownPurchaseQuantity, 0); assert.equal(unknownSummary.knownPurchaseCost, '0');
  const weighted = basisContext.buildItemBasisSummary(28, 5, basisContext.aggregateItemBasisEvents([basisEvent('buy-two', 'in', 28, 2, '200'), basisEvent('buy-three', 'in', 28, 3, '600')])); assert.equal(weighted.knownPurchaseCost, '800'); assert.equal(weighted.weightedConfirmedPurchasePrice.amount, '160');
  const approximate = basisContext.formatItemBasisAverage('100', 3); assert.equal(approximate.exact, false); assert.equal(approximate.display, '≈ $33.33');
  const openBlocks = basisContext.buildTornInventoryBasisBlocks(openScan); assert.equal(openBlocks.length, 2); assert.equal(openBlocks[0].model.itemId, 28); assert.equal(openBlocks[0].currentQuantity, 3); assert.equal(openBlocks[1].model.itemId, 233); assert.equal(openBlocks[1].currentQuantity, 1);
  const closedBlocks = basisContext.buildTornInventoryBasisBlocks(closedScan); assert.equal(closedBlocks.length, 1); assert.equal(closedBlocks[0].currentQuantity, 3); assert.equal(bazaarAddContext.buildInventoryBazaarValuation(recommendedMinusOne, openBlocks[0].currentQuantity).recommendedTotal, bazaarAddContext.buildInventoryBazaarValuation(recommendedMinusOne, closedBlocks[0].currentQuantity).recommendedTotal);
  assert.equal(basisContext.buildItemBasisSummary(233, 1, basisContext.aggregateItemBasisEvents([basisEvent('mp9-buy', 'in', 233, 1, '1000')])).itemId, 233);
  let basisNode = null; const basisHost = { appendChild(node) { basisNode = node; } }; const basisRow = { querySelector(selector) { if (selector.includes('[data-wah-item-basis]')) return basisNode; if (selector === '.title-wrap') return basisHost; return null; } }; const basisRenderContext = { document: { createElement() { return { dataset: {} }; } }, formatLedgerMoney: ledgerContext.formatLedgerMoney, formatBigIntRatioMoney: basisContext.formatBigIntRatioMoney }; vm.createContext(basisRenderContext); vm.runInContext(extractFunction('renderTornInventoryBasis'), basisRenderContext); const renderedBasis = basisRenderContext.renderTornInventoryBasis({ model: { itemId: 1084, sourceRow: basisRow } }, creditPartial); assert.equal(basisRenderContext.renderTornInventoryBasis({ model: { itemId: 1084, sourceRow: basisRow } }, creditPartial), renderedBasis); assert.match(renderedBasis.textContent, /3 \/ 4 getrackt/); assert.match(renderedBasis.title, /Item-ID-basierte/);
  let bazaarNode = null; const valuationHost = { appendChild(node) { bazaarNode = node; } }; const valuationRow = { querySelector(selector) { if (selector.includes('[data-wah-item-bazaar]')) return bazaarNode; if (selector === '.title-wrap') return valuationHost; return null; } }; const valuationRenderContext = { document: { createElement() { return { dataset: {} }; } }, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeMoneyString: ledgerContext.normalizeMoneyString, formatLedgerMoney: ledgerContext.formatLedgerMoney }; vm.createContext(valuationRenderContext); vm.runInContext(`${extractFunction('buildInventoryBazaarValuation')}\n${extractFunction('renderTornInventoryBazaar')}`, valuationRenderContext); const renderedValuation = valuationRenderContext.renderTornInventoryBazaar({ model: { itemId: 1084, sourceRow: valuationRow }, currentQuantity: 4 }, recommendedMinusOne); assert.equal(valuationRenderContext.renderTornInventoryBazaar({ model: { itemId: 1084, sourceRow: valuationRow }, currentQuantity: 4 }, recommendedMinusOne), renderedValuation); assert.match(renderedValuation.textContent, /\$300 \/ Stk\./); assert.match(renderedValuation.textContent, /\$1,200 gesamt/); assert.match(renderedValuation.title, /Kein garantierter Verkaufserlös/); assert.match(renderedBasis.textContent, /3 \/ 4 getrackt/);

  const makeTraderLink = (href, textContent) => ({ href, textContent, getAttribute(name) { return name === 'href' ? href : null; } }); const makeXanaxTraderRow = (index = 0) => { const traderId = 4090889 + index; const traderCell = { textContent: `MenacingG3ko${index ? index : ''}[${traderId}]Active: 9m ago • Trade: 10m ago`, querySelectorAll(selector) { return selector === 'a[href]' ? [] : [{ textContent: 'Active: 9m ago' }, { textContent: 'Trade: 10m ago' }]; } }; const actionLinks = [makeTraderLink(`https://weav3r.dev/pricelist/${traderId}`, 'Price List'), makeTraderLink(`https://www.torn.com/profiles.php?XID=${traderId}`, 'Profile'), makeTraderLink(`https://www.torn.com/trade.php#step=start&userID=${traderId}`, 'Trade Now')]; const actionCell = { textContent: 'Price ListTrade Now', querySelectorAll() { return actionLinks; } }; return { cells: [traderCell, { textContent: '$834,074', querySelectorAll() { return []; } }, { textContent: '+31', querySelectorAll() { return []; } }, actionCell] }; }; const xanaxRows = Array.from({ length: 25 }, (_, index) => makeXanaxTraderRow(index)); const xanaxTable = { tBodies: [{ rows: xanaxRows }], querySelectorAll(selector) { if (selector === 'thead th') return ['Trader', 'Buy Price', 'Rating', 'Actions'].map((textContent) => ({ textContent })); return []; } }; const xanaxParserContext = { URL, Date, Number, TRADE_ACTIVITY_LIMIT_MS: 6 * 60 * 60 * 1000, location: { href: 'https://weav3r.dev/item/206?mode=sell&tab=all&timeframe=7d' }, document: { querySelectorAll(selector) { return selector === 'table' ? [xanaxTable] : []; } }, normalizeMoneyString: ledgerContext.normalizeMoneyString, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); }, applyPersonalRatingToTrader(trader) { return { ...trader, personalRatingState: 'unknown' }; }, logDebug() {} };
  vm.createContext(xanaxParserContext); vm.runInContext(['parseMoney', 'parseRating', 'normalizeHeaderText', 'normalizeComparableHeader', 'getRows', 'getTableInfo', 'headerIndex', 'getCell', 'absoluteUrl', 'getUrlParts', 'extractTraderActivityText', 'parseTraderActivity', 'getTraderLastSeenAt', 'getTraderTradeEligibleUntil', 'getTraderTradeEligibility', 'normalizeTraderActivityFields', 'parseTraderOffers'].map(extractFunction).join('\n'), xanaxParserContext); const xanaxParsed = xanaxParserContext.parseTraderOffers(xanaxParserContext.document, xanaxParserContext.location.href); assert.equal(xanaxParsed.length, 25); assert.equal(xanaxParsed[0].traderId, '4090889'); assert.equal(xanaxParsed[0].traderName, 'MenacingG3ko'); assert.equal(xanaxParsed[0].buyPriceExact, '834074'); assert.equal(xanaxParsed[0].rating, 31); assert.equal(xanaxParsed[0].activityText, 'Active: 9m ago');

  const quoteStorage = new Map(); const personalStates = new Map(); const quoteContext = { Date, BigInt, Math, URL, location: { href: 'https://weav3r.dev/item/367' }, logDebug() {}, TRADER_QUOTES_KEY: 'quotes', TRADER_QUOTE_PRICING_RULE: 'fixed-item-buy-price', TRADER_QUOTE_CONDITION_FINGERPRINT: 'weav3r-trader-table:v1:fixed-item-buy-price', TRADER_CACHE_MS: 30 * 60 * 1000, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeMoneyString: ledgerContext.normalizeMoneyString, normalizeBoundedText(value, length) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length); }, parseRating(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }, gmGet(key, fallback) { return structuredClone(quoteStorage.get(key) ?? fallback); }, mergeCriticalRecord(key, fallback, recordKey, record, normalize) { const latest = normalize(structuredClone(quoteStorage.get(key) ?? fallback)); latest.records[recordKey] = structuredClone(record); quoteStorage.set(key, structuredClone(latest)); return { ok: true, collection: normalize(latest) }; }, applyPersonalRatingToTrader(trader) { return { ...trader, personalRatingState: personalStates.get(trader.traderId) || 'unknown' }; }, isTraderPersonallyAcceptable(trader) { return trader.personalRatingState !== 'negative'; }, getTrustedTraderEligibility(trader, minimum, now) { if (trader.personalRatingState === 'negative' || trader.rating < minimum) return 'ineligible'; if (!trader.lastSeenAt) return 'unknown'; return now - trader.lastSeenAt <= 6 * 60 * 60 * 1000 ? 'eligible' : 'ineligible'; }, formatLedgerMoney: ledgerContext.formatLedgerMoney };
  vm.createContext(quoteContext); vm.runInContext(['normalizeTraderQuoteRecord', 'traderQuoteRejectionReason', 'traderQuoteRecordKey', 'normalizeTraderQuoteCollection', 'readTraderQuotes', 'observeTraderQuote', 'persistObservedTraderQuotes', 'debugStoredTraderQuotes', 'indexLatestTraderQuotes', 'getStoredTraderQuoteEligibility', 'compareCurrentTraderQuotes', 'resolveInventoryTraderQuote', 'buildInventoryTraderValuation', 'formatStoredQuoteAge'].map(extractFunction).join('\n'), quoteContext);
  const quoteNow = 1787270400000; const quoteInput = { traderId: 101, traderName: 'Trader A', itemId: 367, price: '812000', pricingRule: 'fixed-item-buy-price', conditionFingerprint: 'condition:A', observedAt: quoteNow, traderRatingAtObservation: 5, traderActivityTextAtObservation: 'Active now', traderActivityLastSeenAt: quoteNow, source: 'weav3r' };
  const firstQuote = quoteContext.observeTraderQuote(quoteInput, quoteNow); assert.equal(firstQuote.price, '812000'); assert.equal(Object.keys(quoteContext.readTraderQuotes().records).length, 1);
  assert.equal(quoteContext.persistObservedTraderQuotes(999, [{ traderId: 999, traderName: 'Unsafe', buyPriceExact: '1' }], 'https://example.com/item/999', quoteNow), 0);
  assert.equal(quoteContext.persistObservedTraderQuotes(777, [{ traderId: 777, traderName: 'Safe Source', buyPriceExact: '456789', rating: 5, activityText: 'Active now', lastSeenAt: quoteNow }], 'https://weav3r.dev/item/777', quoteNow), 1);
  const repeatedQuote = quoteContext.observeTraderQuote(quoteInput, quoteNow + 1000); assert.equal(repeatedQuote.observationCount, 2); assert.equal(repeatedQuote.lastSeenAt, quoteNow + 1000); assert.equal(Object.keys(quoteContext.readTraderQuotes().records).length, 2);
  quoteContext.observeTraderQuote({ ...quoteInput, price: '805000', observedAt: quoteNow + 2000, traderActivityLastSeenAt: quoteNow + 2000 }, quoteNow + 2000); assert.equal(Object.keys(quoteContext.readTraderQuotes().records).length, 3); let quoteIndex = quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()); assert.equal(quoteIndex.get(367)[0].price, '805000');
  quoteContext.observeTraderQuote({ ...quoteInput, price: '750000', observedAt: quoteNow + 3000, traderActivityLastSeenAt: quoteNow + 3000 }, quoteNow + 3000); quoteIndex = quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()); assert.equal(quoteIndex.get(367)[0].price, '750000');
  quoteContext.observeTraderQuote({ ...quoteInput, traderId: 202, traderName: 'Trader B', price: '800000', observedAt: quoteNow + 4000, traderActivityLastSeenAt: quoteNow + 4000 }, quoteNow + 4000); quoteIndex = quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()); assert.equal(quoteContext.resolveInventoryTraderQuote(367, quoteIndex, 4, quoteNow + 5000).quote.traderName, 'Trader B');
  quoteContext.observeTraderQuote({ ...quoteInput, traderId: 303, traderName: 'Trader C', price: '820000', observedAt: quoteNow + 4500, traderActivityLastSeenAt: quoteNow + 4500 }, quoteNow + 4500); quoteIndex = quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()); assert.equal(quoteContext.resolveInventoryTraderQuote(367, quoteIndex, 4, quoteNow + 5000).quote.traderName, 'Trader C');
  personalStates.set(303, 'negative'); assert.equal(quoteContext.resolveInventoryTraderQuote(367, quoteIndex, 4, quoteNow + 5000).quote.traderName, 'Trader B'); personalStates.delete(303);
  const inactiveQuote = quoteContext.normalizeTraderQuoteRecord({ ...quoteInput, traderId: 404, traderName: 'Inactive', price: '900000', observedAt: quoteNow + 4500, lastSeenAt: quoteNow + 4500, observationCount: 1, traderActivityLastSeenAt: quoteNow - 7 * 60 * 60 * 1000 }); assert.equal(quoteContext.getStoredTraderQuoteEligibility(inactiveQuote, 4, quoteNow + 5000), 'ineligible');
  const lowRatedQuote = quoteContext.normalizeTraderQuoteRecord({ ...quoteInput, traderId: 405, traderName: 'Low Rated', price: '999000', observedAt: quoteNow + 4500, lastSeenAt: quoteNow + 4500, observationCount: 1, traderRatingAtObservation: 2, traderActivityLastSeenAt: quoteNow + 4500 }); assert.equal(quoteContext.getStoredTraderQuoteEligibility(lowRatedQuote, 4, quoteNow + 5000), 'ineligible');
  quoteContext.observeTraderQuote({ ...quoteInput, traderId: 505, traderName: 'Unknown Activity', itemId: 500, price: '123456', observedAt: quoteNow + 4500, traderActivityLastSeenAt: null }, quoteNow + 4500); const unknownEligibility = quoteContext.resolveInventoryTraderQuote(500, quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()), 4, quoteNow + 5000); assert.equal(unknownEligibility.status, 'unverified');
  const oldNow = quoteNow + 180 * 24 * 60 * 60 * 1000; const oldResult = quoteContext.resolveInventoryTraderQuote(367, quoteIndex, 4, oldNow); assert.equal(oldResult.status, 'unverified'); assert.ok(oldResult.quote); assert.match(quoteContext.formatStoredQuoteAge(oldResult.quote.lastSeenAt, oldNow), /Monaten/);
  quoteContext.observeTraderQuote({ ...quoteInput, price: '700000', conditionFingerprint: 'condition:B', observedAt: quoteNow + 6000, traderActivityLastSeenAt: quoteNow + 6000 }, quoteNow + 6000); const conditionHistory = Object.values(quoteContext.readTraderQuotes().records).filter((quote) => quote.traderId === 101); assert.equal(conditionHistory.some((quote) => quote.conditionFingerprint === 'condition:A'), true); assert.equal(conditionHistory.some((quote) => quote.conditionFingerprint === 'condition:B'), true); assert.equal(quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()).get(367).find((quote) => quote.traderId === 101).conditionFingerprint, 'condition:B');
  assert.equal(quoteContext.observeTraderQuote({ ...quoteInput, conditionFingerprint: '' }, quoteNow + 7000), null);
  const traderValue = quoteContext.buildInventoryTraderValuation({ status: 'eligible', quote: { price: '812000' } }, 4); assert.equal(traderValue.totalPrice, '3248000'); assert.equal(quoteContext.buildInventoryTraderValuation({ status: 'eligible', quote: { price: '900719925474099312345' } }, 999999).totalPrice, (900719925474099312345n * 999999n).toString());
  assert.equal(quoteContext.resolveInventoryTraderQuote(999, quoteIndex, 4, quoteNow).status, 'unavailable');
  const xanaxTrader = { ...xanaxParsed[0], lastSeenAt: quoteNow - 9 * 60 * 1000 }; assert.equal(quoteContext.persistObservedTraderQuotes(206, [xanaxTrader], 'https://weav3r.dev/item/206?mode=sell&tab=all&timeframe=7d', quoteNow), 1); const xanaxQuoteIndex = quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()); assert.ok(xanaxQuoteIndex.get(206).length >= 1); assert.ok(quoteContext.debugStoredTraderQuotes(206).count >= 1); const xanaxEligible = quoteContext.resolveInventoryTraderQuote(206, xanaxQuoteIndex, 4, quoteNow + 1000); assert.equal(xanaxEligible.status, 'eligible'); assert.equal(xanaxEligible.quote.traderName, 'MenacingG3ko'); assert.equal(quoteContext.buildInventoryTraderValuation(xanaxEligible, 20).totalPrice, '16681480'); const xanaxUnknown = quoteContext.resolveInventoryTraderQuote(206, xanaxQuoteIndex, 4, quoteNow + 31 * 60 * 1000); assert.equal(xanaxUnknown.status, 'unverified'); assert.equal(xanaxUnknown.quote.traderId, 4090889); const xanaxIneligible = quoteContext.resolveInventoryTraderQuote(206, xanaxQuoteIndex, 40, quoteNow + 1000); assert.equal(xanaxIneligible.status, 'unavailable'); assert.equal(xanaxIneligible.reason, 'all-quotes-ineligible');

  const manualLocation = { href: 'https://weav3r.dev/item/1509', origin: 'https://weav3r.dev' }; let visibleTraders = []; const manualCaptureContext = { URL, Date, JSON, location: manualLocation, document: {}, state: { itemId: '1509', routeGeneration: 1, routeDomReady: true }, normalizePositiveInt: offerContext.normalizePositiveInt, isCurrentItemView(itemId, generation) { return manualCaptureContext.state.routeDomReady && Number(itemId) === Number(manualCaptureContext.state.itemId) && generation === manualCaptureContext.state.routeGeneration; }, logDebug() {}, parseTraderOffers() { return visibleTraders; }, persistObservedTraderQuotes: quoteContext.persistObservedTraderQuotes, debugStoredTraderQuotes(itemId) { return { count: (quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()).get(itemId) || []).length }; } };
  vm.createContext(manualCaptureContext); vm.runInContext(`${extractFunction('resolveWeav3rItemRouteId')}\n${extractFunction('captureVisibleWeav3rTraderQuotes')}`, manualCaptureContext);
  assert.equal(manualCaptureContext.captureVisibleWeav3rTraderQuotes(quoteNow).status, 'waiting'); visibleTraders = [{ traderId: 150, traderName: 'Manual Trader', buyPriceExact: '321000', rating: 5, activityText: 'Active now', lastSeenAt: quoteNow }]; const manualCaptured = manualCaptureContext.captureVisibleWeav3rTraderQuotes(quoteNow); assert.equal(manualCaptured.status, 'persisted'); assert.equal(manualCaptured.itemId, 1509); assert.equal(quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()).get(1509)[0].price, '321000');
  const recordCountAfterManualCapture = Object.keys(quoteContext.readTraderQuotes().records).length; const repeatedManualCapture = manualCaptureContext.captureVisibleWeav3rTraderQuotes(quoteNow + 1); assert.equal(repeatedManualCapture.status, 'persisted'); assert.equal(Object.keys(quoteContext.readTraderQuotes().records).length, recordCountAfterManualCapture); assert.equal(quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()).get(1509)[0].observationCount, 2);
  visibleTraders = [{ ...visibleTraders[0], buyPriceExact: '322000' }]; assert.equal(manualCaptureContext.captureVisibleWeav3rTraderQuotes(quoteNow + 2).status, 'persisted'); assert.equal(Object.keys(quoteContext.readTraderQuotes().records).length, recordCountAfterManualCapture + 1);
  manualLocation.href = 'https://weav3r.dev/item/367'; assert.equal(manualCaptureContext.captureVisibleWeav3rTraderQuotes(quoteNow + 3, '1509', 1).status, 'stale-route'); assert.equal(quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()).get(367)?.some((quote) => quote.traderId === 150) || false, false); manualCaptureContext.state.itemId = '367'; manualCaptureContext.state.routeGeneration += 1; visibleTraders = [{ ...visibleTraders[0], traderId: 151, traderName: 'SPA Trader', buyPriceExact: '444000' }]; const spaCaptured = manualCaptureContext.captureVisibleWeav3rTraderQuotes(quoteNow + 3); assert.equal(spaCaptured.itemId, 367); assert.equal(quoteContext.indexLatestTraderQuotes(quoteContext.readTraderQuotes()).get(367).some((quote) => quote.traderId === 151), true); assert.equal(manualCaptureContext.resolveWeav3rItemRouteId('https://weav3r.dev/not-item/1509'), null); assert.equal(manualCaptureContext.resolveWeav3rItemRouteId('https://example.com/item/1509'), null);

  const bestSaleContext = { BigInt, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeMoneyString: ledgerContext.normalizeMoneyString, buildInventoryBazaarValuation: bazaarAddContext.buildInventoryBazaarValuation, buildInventoryTraderValuation: quoteContext.buildInventoryTraderValuation };
  vm.createContext(bestSaleContext); vm.runInContext(extractFunction('resolveInventoryBestSale'), bestSaleContext);
  const safeBazaar = (price) => ({ status: 'available', recommendedUnitPrice: String(price), marketUnitPrice: String(price), adjustment: '0', fetchedAt: 123 }); const eligibleTrader = (price, name = 'Trader A') => ({ status: 'eligible', quote: { traderId: 101, traderName: name, price: String(price), lastSeenAt: quoteNow } }); const storedTrader = (price) => ({ status: 'unverified', reason: 'current-status-unverified', quote: { traderId: 202, traderName: 'Stored Trader', price: String(price), lastSeenAt: quoteNow - 999 } });
  assert.equal(bestSaleContext.resolveInventoryBestSale(adjustedStored, { status: 'unavailable' }, 20).channel, 'unavailable'); assert.equal(bestSaleContext.resolveInventoryBestSale(safeBazaar(550), eligibleTrader(500), 3).channel, 'bazaar'); assert.equal(bestSaleContext.resolveInventoryBestSale(safeBazaar(500), eligibleTrader(550), 3).channel, 'trader'); assert.equal(bestSaleContext.resolveInventoryBestSale(safeBazaar(500), eligibleTrader(500), 3).channel, 'bazaar');
  assert.equal(bestSaleContext.resolveInventoryBestSale(safeBazaar(500), { status: 'unavailable' }, 3).channel, 'bazaar'); assert.equal(bestSaleContext.resolveInventoryBestSale({ status: 'unavailable' }, eligibleTrader(550), 3).channel, 'trader'); assert.equal(bestSaleContext.resolveInventoryBestSale({ status: 'unavailable' }, storedTrader(900), 3).channel, 'stored-trader'); assert.equal(bestSaleContext.resolveInventoryBestSale(safeBazaar(500), storedTrader(900), 3).channel, 'bazaar');
  assert.equal(bestSaleContext.resolveInventoryBestSale({ status: 'unavailable' }, { status: 'unavailable', quote: { price: '999' } }, 3).channel, 'unavailable'); assert.equal(bestSaleContext.resolveInventoryBestSale({ status: 'unsafe', recommendedUnitPrice: '999' }, { status: 'unavailable' }, 3).channel, 'unavailable'); assert.equal(bestSaleContext.resolveInventoryBestSale(safeBazaar('900719925474099312345'), { status: 'unavailable' }, 999999).totalValue, (900719925474099312345n * 999999n).toString());

  const profitContext = { BigInt, Math, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeMoneyString: ledgerContext.normalizeMoneyString, makeBigIntRatio: basisContext.makeBigIntRatio, subtractBigIntRatios: basisContext.subtractBigIntRatios };
  vm.createContext(profitContext); vm.runInContext(extractFunction('resolveInventoryPotentialProfit'), profitContext);
  const verifiedSale = (unitPrice, channel = 'bazaar') => ({ status: 'available', verification: 'verified', channel, unitPrice: String(unitPrice) }); const resolveProfit = (basisSummary, unitPrice = 350, quantity = basisSummary.currentQuantity) => profitContext.resolveInventoryPotentialProfit({ basisSummary, bestSaleResult: verifiedSale(unitPrice), quantity });
  const partialProfit = resolveProfit(creditPartial); assert.equal(partialProfit.status, 'partial'); assert.equal(partialProfit.coveredQuantity, 3); assert.deepEqual({ ...partialProfit.knownCurrentCostBasis }, { numerator: '900', denominator: '1' }); assert.deepEqual({ ...partialProfit.coveredSaleValue }, { numerator: '1050', denominator: '1' }); assert.deepEqual({ ...partialProfit.potentialProfit }, { numerator: '150', denominator: '1' }); assert.equal(basisContext.formatInventoryRoi(partialProfit.roi), '+16.67 %');
  const creditFull = basisContext.buildItemBasisSummary(1084, 3, creditAggregates); assert.equal(resolveProfit(creditFull).status, 'full'); assert.equal(resolveProfit(untracked).status, 'unavailable'); assert.equal(resolveProfit(basisContext.buildItemBasisSummary(28, 3, basisContext.aggregateItemBasisEvents([basisEvent('divergent', 'in', 28, 5, '500')]))).reason, 'divergent-inventory'); assert.equal(profitContext.resolveInventoryPotentialProfit({ basisSummary: creditFull, bestSaleResult: { status: 'unavailable' }, quantity: 3 }).reason, 'no-verified-best-sale'); assert.equal(profitContext.resolveInventoryPotentialProfit({ basisSummary: creditFull, bestSaleResult: bestSaleContext.resolveInventoryBestSale({ status: 'unavailable' }, storedTrader(500), 3), quantity: 3 }).reason, 'no-verified-best-sale');
  const lossBasis = basisContext.buildItemBasisSummary(28, 1, basisContext.aggregateItemBasisEvents([basisEvent('loss', 'in', 28, 1, '1000')])); const loss = resolveProfit(lossBasis, 900); assert.deepEqual({ ...loss.potentialProfit }, { numerator: '-100', denominator: '1' }); assert.equal(basisContext.formatInventoryRoi(loss.roi), '-10.00 %'); const breakEven = resolveProfit(lossBasis, 1000); assert.equal(breakEven.potentialProfit.numerator, '0'); assert.equal(basisContext.formatInventoryRoi(breakEven.roi), '0.00 %');
  assert.deepEqual({ ...outboundSummary.currentCostBasis }, { numerator: '300', denominator: '1' }); const mixedWac = basisContext.buildItemBasisSummary(28, 3, basisContext.aggregateItemBasisEvents([basisEvent('mixed-a', 'in', 28, 2, '200'), basisEvent('mixed-b', 'in', 28, 3, '600'), basisEvent('mixed-out', 'out', 28, 2, '1')])); assert.deepEqual({ ...mixedWac.currentCostBasis }, { numerator: '480', denominator: '1' }); const fractionalWac = basisContext.buildItemBasisSummary(28, 2, basisContext.aggregateItemBasisEvents([basisEvent('fractional', 'in', 28, 3, '100'), basisEvent('fractional-out', 'out', 28, 1, '1')])); assert.deepEqual({ ...fractionalWac.currentCostBasis }, { numerator: '200', denominator: '3' });
  const hugeBasis = basisContext.buildItemBasisSummary(28, 3, basisContext.aggregateItemBasisEvents([basisEvent('huge', 'in', 28, 5, '900719925474099312345'), basisEvent('huge-out', 'out', 28, 2, '1')])); assert.equal(hugeBasis.currentCostBasis.numerator, (900719925474099312345n * 3n / 5n).toString()); const zeroBasis = basisContext.buildItemBasisSummary(28, 1, basisContext.aggregateItemBasisEvents([basisEvent('free', 'in', 28, 1, '0')])); const zeroProfit = resolveProfit(zeroBasis, 100); assert.equal(zeroProfit.potentialProfit.numerator, '100'); assert.equal(zeroProfit.roi, null);
  assert.equal(resolveProfit(unknownSummary).reason, 'acquisition-cost-not-assignable'); assert.equal(unknownSummary.coveredQuantity, null); const safelyPartialCost = basisContext.buildItemBasisSummary(28, 3, new Map([[28, { confirmedInboundQuantity: 3, confirmedOutboundQuantity: 0, knownPurchaseQuantity: 2, knownPurchaseCost: 200n }]])); const safelyPartialProfit = resolveProfit(safelyPartialCost, 150); assert.equal(safelyPartialProfit.coveredQuantity, 2); assert.deepEqual({ ...safelyPartialProfit.knownCurrentCostBasis }, { numerator: '200', denominator: '1' }); const ambiguousAfterOutbound = basisContext.buildItemBasisSummary(28, 2, new Map([[28, { confirmedInboundQuantity: 3, confirmedOutboundQuantity: 1, knownPurchaseQuantity: 2, knownPurchaseCost: 200n }]])); assert.equal(resolveProfit(ambiguousAfterOutbound).reason, 'acquisition-cost-not-assignable');

  let traderNode = null; const traderHost = { appendChild(node) { traderNode = node; } }; const traderRow = { querySelector(selector) { if (selector.includes('[data-wah-item-trader]')) return traderNode; if (selector === '.title-wrap') return traderHost; return null; } }; const traderRenderContext = { document: { createElement() { return { dataset: {} }; } }, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeMoneyString: ledgerContext.normalizeMoneyString, formatLedgerMoney: ledgerContext.formatLedgerMoney, formatStoredQuoteAge: quoteContext.formatStoredQuoteAge, buildInventoryTraderValuation: quoteContext.buildInventoryTraderValuation, Date }; vm.createContext(traderRenderContext); vm.runInContext(extractFunction('renderTornInventoryTrader'), traderRenderContext); const traderResult = { status: 'eligible', quote: { traderName: 'Trader A', price: '812000', lastSeenAt: quoteNow } }; const renderedTrader = traderRenderContext.renderTornInventoryTrader({ model: { itemId: 367, sourceRow: traderRow }, currentQuantity: 4 }, traderResult, quoteNow + 1000); assert.equal(traderRenderContext.renderTornInventoryTrader({ model: { itemId: 367, sourceRow: traderRow }, currentQuantity: 4 }, traderResult, quoteNow + 1000), renderedTrader); assert.match(renderedTrader.textContent, /\$3,248,000 gesamt/); assert.match(renderedTrader.title, /Item-ID-basierter/);

  let bestSaleNode = null; const bestSaleHost = { appendChild(node) { bestSaleNode = node; } }; const bestSaleRow = { querySelector(selector) { if (selector.includes('[data-wah-item-best-sale]')) return bestSaleNode; if (selector === '.title-wrap') return bestSaleHost; return null; } }; const bestSaleRenderContext = { document: { createElement() { return { dataset: {} }; } }, Date, formatLedgerMoney: ledgerContext.formatLedgerMoney, formatStoredQuoteAge: quoteContext.formatStoredQuoteAge }; vm.createContext(bestSaleRenderContext); vm.runInContext(extractFunction('renderTornInventoryBestSale'), bestSaleRenderContext); const bestSaleResult = bestSaleContext.resolveInventoryBestSale(safeBazaar(515), eligibleTrader(500), 3); const renderedBestSale = bestSaleRenderContext.renderTornInventoryBestSale({ model: { itemId: 367, sourceRow: bestSaleRow } }, bestSaleResult, quoteNow); assert.equal(bestSaleRenderContext.renderTornInventoryBestSale({ model: { itemId: 367, sourceRow: bestSaleRow } }, bestSaleResult, quoteNow), renderedBestSale); assert.equal(renderedBestSale.textContent, 'Best Sale: Bazaar · $515/Stk. · $1,545 gesamt'); assert.match(renderedBestSale.title, /Bruttowert, kein garantierter Erlös/);

  let profitNode = null; const profitHost = { appendChild(node) { profitNode = node; } }; const profitRow = { querySelector(selector) { if (selector.includes('[data-wah-item-profit]')) return profitNode; if (selector === '.title-wrap') return profitHost; return null; } }; const profitRenderContext = { document: { createElement() { return { dataset: {} }; } }, formatBigIntRatioMoney: basisContext.formatBigIntRatioMoney, formatInventoryRoi: basisContext.formatInventoryRoi, inventoryProfitUnavailableReason(reason) { return reason; } }; vm.createContext(profitRenderContext); vm.runInContext(extractFunction('renderTornInventoryProfit'), profitRenderContext); const renderedProfit = profitRenderContext.renderTornInventoryProfit({ model: { itemId: 1084, sourceRow: profitRow } }, partialProfit); assert.equal(profitRenderContext.renderTornInventoryProfit({ model: { itemId: 1084, sourceRow: profitRow } }, partialProfit), renderedProfit); assert.match(renderedProfit.textContent, /Profit \+\$150 auf 3\/4 · ROI \+16\.67 %/); assert.match(renderedProfit.title, /Potentieller Bruttogewinn/);

  const sortContext = { BigInt, Math, INVENTORY_SORT_CRITERIA: ['original', 'name', 'quantity', 'average-acquisition', 'current-basis', 'bazaar-unit', 'bazaar-total', 'trader-unit', 'trader-total', 'best-sale-unit', 'best-sale-total', 'profit', 'roi'], normalizeInventoryIdentityText(value) { return String(value || '').toLowerCase(); }, makeBigIntRatio: basisContext.makeBigIntRatio, state: { inventorySortOriginals: new WeakMap(), inventorySortSettings: { criterion: 'original', direction: 'asc' }, inventorySortInternalRows: new WeakSet() }, setTimeout };
  vm.createContext(sortContext); vm.runInContext(['normalizeInventorySortSettings', 'inventorySortRatio', 'inventorySortMoney', 'buildInventorySortKey', 'compareInventorySortRatios', 'compareInventorySortTieBreakers', 'compareInventorySortRecords', 'sortInventoryBlockRecords', 'inventoryBlockStableIdentity', 'getInventoryOriginalIndex', 'applyInventoryBlockOrder'].map(extractFunction).join('\n'), sortContext);
  const sortRecord = ({ name, itemId, quantity, originalIndex, average = null, basis = null, bazaarUnit = null, traderUnit = null, traderStatus = 'eligible', bestUnit = null, bestVerified = true, profit = null, roi = null, rowKey = `g${itemId}`, groupKey = null, rowKeys = [rowKey] }) => ({ block: { model: { itemName: name, itemId, rowKey, groupKey }, currentQuantity: quantity, rowKeys }, originalIndex, summary: { knownPurchaseQuantity: average ? average.denominator : 0, knownPurchaseCost: average ? average.numerator : '0', currentCostBasis: basis }, bazaarValuation: bazaarUnit == null ? { status: 'unavailable' } : { status: 'available', recommendedUnitPrice: String(bazaarUnit), recommendedTotal: (BigInt(bazaarUnit) * BigInt(quantity)).toString() }, bazaarSortValuation: bazaarUnit == null ? { status: 'unavailable' } : { status: 'available', recommendedUnitPrice: String(bazaarUnit), recommendedTotal: (BigInt(bazaarUnit) * BigInt(quantity)).toString() }, traderValuation: traderUnit == null ? { status: 'unavailable' } : { status: traderStatus, unitPrice: String(traderUnit), totalPrice: (BigInt(traderUnit) * BigInt(quantity)).toString() }, bestSaleResult: bestUnit == null ? { status: 'unavailable' } : { status: 'available', verification: bestVerified ? 'verified' : 'unverified', unitPrice: String(bestUnit), totalValue: (BigInt(bestUnit) * BigInt(quantity)).toString() }, profitResult: profit == null ? { status: 'unavailable' } : { status: 'full', potentialProfit: profit, roi } });
  const alpha = sortRecord({ name: 'Alpha', itemId: 1, quantity: 2, originalIndex: 1, average: { numerator: '200', denominator: '2' }, basis: { numerator: '200', denominator: '1' }, bazaarUnit: 80, traderUnit: 90, bestUnit: 90, profit: { numerator: '-20', denominator: '1' }, roi: { numerator: '-10', denominator: '1' } }); const beta = sortRecord({ name: 'Beta', itemId: 2, quantity: 5, originalIndex: 0, average: { numerator: '750', denominator: '5' }, basis: { numerator: '750', denominator: '1' }, bazaarUnit: 160, traderUnit: 150, bestUnit: 160, profit: { numerator: '50', denominator: '1' }, roi: { numerator: '20', denominator: '3' } }); const missingSort = sortRecord({ name: 'Missing', itemId: 3, quantity: 1, originalIndex: 2 });
  const sortedNames = (criterion, direction, records = [alpha, beta, missingSort]) => sortContext.sortInventoryBlockRecords(records, { criterion, direction }).map((record) => record.block.model.itemName); assert.deepEqual(sortedNames('original', 'desc'), ['Beta', 'Alpha', 'Missing']); assert.deepEqual(sortedNames('name', 'asc'), ['Alpha', 'Beta', 'Missing']); assert.deepEqual(sortedNames('name', 'desc'), ['Missing', 'Beta', 'Alpha']); assert.deepEqual(sortedNames('quantity', 'asc'), ['Missing', 'Alpha', 'Beta']); assert.deepEqual(sortedNames('quantity', 'desc'), ['Beta', 'Alpha', 'Missing']);
  for (const criterion of ['average-acquisition', 'current-basis', 'bazaar-unit', 'bazaar-total', 'trader-unit', 'trader-total', 'best-sale-unit', 'best-sale-total', 'profit', 'roi']) { assert.equal(sortedNames(criterion, 'asc').at(-1), 'Missing'); assert.equal(sortedNames(criterion, 'desc').at(-1), 'Missing'); }
  assert.deepEqual(sortedNames('profit', 'asc'), ['Alpha', 'Beta', 'Missing']); assert.deepEqual(sortedNames('profit', 'desc'), ['Beta', 'Alpha', 'Missing']); const zeroProfitRecord = sortRecord({ name: 'Zero', itemId: 4, quantity: 1, originalIndex: 3, profit: { numerator: '0', denominator: '1' }, roi: { numerator: '0', denominator: '1' } }); assert.deepEqual(sortedNames('profit', 'asc', [beta, missingSort, alpha, zeroProfitRecord]), ['Alpha', 'Zero', 'Beta', 'Missing']);
  const closeRoi = sortRecord({ name: 'Close', itemId: 5, quantity: 1, originalIndex: 4, profit: { numerator: '1', denominator: '1' }, roi: { numerator: '16666', denominator: '1000' } }); const closerRoi = sortRecord({ name: 'Closer', itemId: 6, quantity: 1, originalIndex: 5, profit: { numerator: '1', denominator: '1' }, roi: { numerator: '16667', denominator: '1000' } }); assert.deepEqual(sortedNames('roi', 'asc', [closerRoi, closeRoi]), ['Close', 'Closer']);
  const unverifiedTraderSort = sortRecord({ name: 'Stored', itemId: 7, quantity: 1, originalIndex: 6, traderUnit: 999, traderStatus: 'unverified', bestUnit: 999, bestVerified: false }); assert.equal(sortContext.buildInventorySortKey(unverifiedTraderSort, 'trader-unit'), null); assert.equal(sortContext.buildInventorySortKey(unverifiedTraderSort, 'best-sale-unit'), null); assert.deepEqual({ ...sortContext.normalizeInventorySortSettings({ criterion: 'invalid', direction: 'desc' }) }, { criterion: 'original', direction: 'asc' });
  const storedBazaarSortRecords = Array.from({ length: 150 }, (_value, index) => { const record = sortRecord({ name: `Stored ${index + 1}`, itemId: index + 1000, quantity: 1, originalIndex: index, bazaarUnit: index + 1 }); record.bazaarValuation = { status: 'loading' }; record.bazaarSortValuation = { status: 'sort-available', origin: 'stored', freshness: 'stored-stale', recommendedUnitPrice: String(index + 1), recommendedTotal: String(index + 1) }; return record; }); const storedBazaarSorted = sortContext.sortInventoryBlockRecords([...storedBazaarSortRecords, missingSort], { criterion: 'bazaar-total', direction: 'desc' }); assert.equal(storedBazaarSorted[0].bazaarSortValuation.recommendedTotal, '150'); assert.equal(storedBazaarSorted.at(-1), missingSort);
  const makeSortRow = (rowKey) => ({ dataset: { rowkey: rowKey }, parentElement: null }); const benelliRows = ['u20546536156', 'u20527410662', 'u20338057002'].map(makeSortRow); const mp9Row = makeSortRow('g233'); const sortContainer = { children: [...benelliRows, mp9Row], appendChild(row) { this.children.splice(this.children.indexOf(row), 1); this.children.push(row); return row; } }; sortContainer.children.forEach((row) => { row.parentElement = sortContainer; }); const groupBlock = { model: { itemName: 'Benelli', itemId: 28, rowKey: benelliRows[0].dataset.rowkey, groupKey: 'g28' }, currentQuantity: 3, rowKeys: benelliRows.map((row) => row.dataset.rowkey) }; const mp9Block = { model: { itemName: 'BT MP9', itemId: 233, rowKey: 'g233', groupKey: null }, currentQuantity: 1, rowKeys: ['g233'] }; const groupRecords = [sortRecord({ name: 'Benelli', itemId: 28, quantity: 3, originalIndex: 0, rowKey: groupBlock.model.rowKey, groupKey: 'g28', rowKeys: groupBlock.rowKeys }), sortRecord({ name: 'BT MP9', itemId: 233, quantity: 1, originalIndex: 1, rowKey: 'g233' })]; groupRecords[0].block = groupBlock; groupRecords[1].block = mp9Block; const groupScan = { rows: [...benelliRows, mp9Row].map((row) => ({ rowKey: row.dataset.rowkey, sourceRow: row })) }; sortContext.applyInventoryBlockOrder(sortContainer, groupRecords, groupScan, { criterion: 'name', direction: 'desc' }); assert.deepEqual(sortContainer.children.map((row) => row.dataset.rowkey), ['g233', 'u20546536156', 'u20527410662', 'u20338057002']); sortContext.applyInventoryBlockOrder(sortContainer, groupRecords, groupScan, { criterion: 'original', direction: 'asc' }); assert.deepEqual(sortContainer.children.map((row) => row.dataset.rowkey), ['u20546536156', 'u20527410662', 'u20338057002', 'g233']);
  const originalContainer = {}; const closedGroup = { model: { groupKey: 'g28', rowKey: 'g28', itemId: 28 } }; const openGroup = { model: { groupKey: 'g28', rowKey: 'u20546536156', itemId: 28 } }; assert.equal(sortContext.getInventoryOriginalIndex(originalContainer, closedGroup), sortContext.getInventoryOriginalIndex(originalContainer, openGroup)); assert.equal(sortContext.getInventoryOriginalIndex({}, openGroup), 0);
  let nextTimerId = 1; const sortTimers = new Map(); let stableSortApplications = 0; const stabilityContext = { INVENTORY_SORT_QUIET_MS: 600, INVENTORY_SORT_MAX_BATCH_MS: 3000, normalizeInventorySortSettings: sortContext.normalizeInventorySortSettings, buildInventorySortKey: sortContext.buildInventorySortKey, inventoryBlockStableIdentity: sortContext.inventoryBlockStableIdentity, applyInventoryBlockOrder() { stableSortApplications += 1; }, logDebug() {}, JSON, Array, setTimeout(callback) { const id = nextTimerId++; sortTimers.set(id, callback); return id; }, clearTimeout(id) { sortTimers.delete(id); }, state: { inventorySortSettings: { criterion: 'bazaar-total', direction: 'desc' }, inventorySortLastSignatures: new WeakMap(), inventorySortPending: new Map(), inventorySortQuietTimer: 0, inventorySortMaxTimer: 0, inventorySortInternalRows: new WeakSet() } }; vm.createContext(stabilityContext); vm.runInContext(['inventorySortKeySignature', 'buildInventorySortSnapshotSignature', 'flushInventorySortBatch', 'queueInventoryStableSort', 'isInternalInventorySortMutation'].map(extractFunction).join('\n'), stabilityContext); const stableContainer = {}; const stableScan = { rows: [] }; for (let index = 1; index <= 20; index += 1) { const updated = sortRecord({ name: 'Async', itemId: 50, quantity: 1, originalIndex: 0, bazaarUnit: index }); stabilityContext.queueInventoryStableSort(stableContainer, [updated], stableScan); } assert.equal(stableSortApplications, 0); const quietCallback = sortTimers.get(stabilityContext.state.inventorySortQuietTimer); quietCallback(); assert.equal(stableSortApplications, 1);
  stabilityContext.state.inventorySortSettings = { criterion: 'bazaar-total', direction: 'desc' }; stabilityContext.queueInventoryStableSort(stableContainer, [sortRecord({ name: 'Async', itemId: 50, quantity: 1, originalIndex: 0, bazaarUnit: 100 })], stableScan); const maxCallback = sortTimers.get(stabilityContext.state.inventorySortMaxTimer); maxCallback(); assert.equal(stableSortApplications, 2); const nameContainer = {}; stabilityContext.state.inventorySortSettings = { criterion: 'name', direction: 'asc' }; stabilityContext.queueInventoryStableSort(nameContainer, [sortRecord({ name: 'Stable Name', itemId: 51, quantity: 1, originalIndex: 0, bazaarUnit: 1 })], stableScan); const afterInitialNameSort = stableSortApplications; const irrelevantNameUpdate = stabilityContext.queueInventoryStableSort(nameContainer, [sortRecord({ name: 'Stable Name', itemId: 51, quantity: 1, originalIndex: 0, bazaarUnit: 999 })], stableScan); assert.equal(irrelevantNameUpdate.reason, 'sort-key-unchanged'); assert.equal(stableSortApplications, afterInitialNameSort); stabilityContext.state.inventorySortSettings = { criterion: 'profit', direction: 'desc' }; const profitQueue = stabilityContext.queueInventoryStableSort({}, [sortRecord({ name: 'Profit', itemId: 52, quantity: 1, originalIndex: 0, profit: { numerator: '5', denominator: '1' }, roi: { numerator: '1', denominator: '1' } })], stableScan); assert.equal(profitQueue.applied, 0); stabilityContext.queueInventoryStableSort({}, [sortRecord({ name: 'Manual', itemId: 53, quantity: 1, originalIndex: 0 })], stableScan, { immediate: true, force: true }); assert.ok(stableSortApplications > afterInitialNameSort);
  const internallyMoved = { nodeType: 1 }; stabilityContext.state.inventorySortInternalRows.add(internallyMoved); assert.equal(stabilityContext.isInternalInventorySortMutation({ addedNodes: [internallyMoved], removedNodes: [] }), true); assert.equal(stabilityContext.isInternalInventorySortMutation({ addedNodes: [{ nodeType: 1 }], removedNodes: [] }), false);
  const snapshotStatus = { hidden: true, textContent: '' }; const snapshotResort = { hidden: true }; const snapshotControl = { nextElementSibling: null, querySelector(selector) { return selector.includes('status') ? snapshotStatus : selector.includes('resort') ? snapshotResort : null; } }; const snapshotContext = { BigInt, Math, Object, INVENTORY_SORT_CONTROL_ID: 'weav3r-inventory-sort-control', JSON, Array, Map, normalizeInventorySortSettings: sortContext.normalizeInventorySortSettings, normalizeInventoryIdentityText: sortContext.normalizeInventoryIdentityText, makeBigIntRatio: basisContext.makeBigIntRatio, document: { getElementById() { return snapshotControl; } }, setTimeout(callback) { callback(); return 1; }, logDebug() {}, state: { inventorySortSettings: { criterion: 'bazaar-total', direction: 'desc' }, inventorySortOriginals: new WeakMap(), inventorySortLastSignatures: new WeakMap(), inventorySortSnapshots: new WeakMap(), inventorySortLatest: new WeakMap(), inventorySortDirty: new WeakSet(), inventorySortInternalRows: new WeakSet() } }; vm.createContext(snapshotContext); vm.runInContext(['inventorySortRatio', 'inventorySortMoney', 'buildInventorySortKey', 'compareInventorySortRatios', 'inventoryBlockStableIdentity', 'inventorySortKeySignature', 'buildInventorySortSnapshot', 'compareInventorySnapshotTieBreakers', 'compareInventorySnapshotEntries', 'applyInventorySortSnapshot', 'setInventorySortDirty', 'applyLatestInventorySortSnapshot', 'updateInventorySortSnapshotState'].map(extractFunction).join('\n'), snapshotContext);
  const snapshotRows = [makeSortRow('g1'), makeSortRow('g2')]; const snapshotContainer = { children: snapshotRows.slice(), appendChild(row) { this.children.splice(this.children.indexOf(row), 1); this.children.push(row); return row; } }; snapshotControl.nextElementSibling = snapshotContainer; snapshotRows.forEach((row) => { row.parentElement = snapshotContainer; }); const snapshotScan = { rows: [{ rowKey: 'g1', sourceRow: snapshotRows[0] }, { rowKey: 'g2', sourceRow: snapshotRows[1] }] }; const snapshotRecord = (itemId, price) => sortRecord({ name: `Item ${itemId}`, itemId, quantity: 1, originalIndex: itemId - 1, bazaarUnit: price, rowKey: `g${itemId}` }); let snapshotApplications = 0; const originalSnapshotApply = snapshotContext.applyInventorySortSnapshot; snapshotContext.applyInventorySortSnapshot = (...args) => { snapshotApplications += 1; return originalSnapshotApply(...args); }; const initialSnapshotRecords = [snapshotRecord(1, 10), snapshotRecord(2, 20)]; assert.equal(snapshotContext.updateInventorySortSnapshotState(snapshotContainer, initialSnapshotRecords, snapshotScan).applied, true); assert.equal(snapshotApplications, 1); assert.deepEqual(snapshotContainer.children.map((row) => row.dataset.rowkey), ['g2', 'g1']); for (let update = 0; update < 100; update += 1) snapshotContext.updateInventorySortSnapshotState(snapshotContainer, [snapshotRecord(1, 100 + update), snapshotRecord(2, 20)], snapshotScan); assert.equal(snapshotApplications, 1); assert.equal(snapshotContext.state.inventorySortDirty.has(snapshotContainer), true); assert.equal(snapshotStatus.textContent, 'Preise aktualisiert'); assert.equal(snapshotResort.hidden, false); assert.equal(snapshotContext.applyLatestInventorySortSnapshot(snapshotContainer).applied, true); assert.equal(snapshotApplications, 2); assert.equal(snapshotContext.state.inventorySortDirty.has(snapshotContainer), false); assert.equal(snapshotResort.hidden, true); snapshotContext.state.inventorySortSettings = { criterion: 'bazaar-total', direction: 'asc' }; snapshotContext.applyLatestInventorySortSnapshot(snapshotContainer); assert.equal(snapshotApplications, 3); assert.deepEqual(snapshotContainer.children.map((row) => row.dataset.rowkey), ['g2', 'g1']); const appliedSnapshot = snapshotContext.state.inventorySortSnapshots.get(snapshotContainer); assert.equal(appliedSnapshot.criterion, 'bazaar-total'); assert.equal(appliedSnapshot.direction, 'asc'); assert.equal(Object.isFrozen(appliedSnapshot.entries[0]), true);
  const groupedSnapshot = snapshotContext.buildInventorySortSnapshot(groupRecords, { criterion: 'name', direction: 'desc' }); snapshotContext.applyInventorySortSnapshot(sortContainer, groupedSnapshot, groupScan); assert.deepEqual(sortContainer.children.map((row) => row.dataset.rowkey), ['g233', 'u20546536156', 'u20527410662', 'u20338057002']); const originalGroupSnapshot = snapshotContext.buildInventorySortSnapshot(groupRecords, { criterion: 'original', direction: 'asc' }); snapshotContext.applyInventorySortSnapshot(sortContainer, originalGroupSnapshot, groupScan); assert.deepEqual(sortContainer.children.map((row) => row.dataset.rowkey), ['u20546536156', 'u20527410662', 'u20338057002', 'g233']);
  const makeFullLoadContainer = ({ all = '0', from = '100', queue = 'All', rows = 100 } = {}) => ({ attrs: { 'data-all': all, 'data-from': from, 'data-queue': queue }, rowCount: rows, getAttribute(name) { return this.attrs[name] ?? null; }, querySelectorAll() { return { length: this.rowCount }; } }); const fullLoadTimers = new Map(); let fullLoadTimerId = 1; let activeFullLoadContainer = makeFullLoadContainer({ all: null, from: null, queue: null, rows: 100 }); let loadMoreAvailable = true; let jqueryAvailable = true; let loadTriggerCount = 0; const triggeredLoadButtons = []; let fullLoadButton = { id: 1, isConnected: true }; let fullNow = 1000; const fullLoadContext = { Date: { now() { return fullNow; } }, Number, location: { pathname: '/item.php' }, INVENTORY_FULL_LOAD_RETRY_MS: 500, INVENTORY_FULL_LOAD_PROGRESS_TIMEOUT_MS: 5000, INVENTORY_FULL_LOAD_MAX_ATTEMPTS: 8, INVENTORY_FULL_LOAD_MAX_DURATION_MS: 25000, document: { querySelector(selector) { if (selector === '.items-cont[aria-hidden="false"]') return activeFullLoadContainer; if (selector === '#load-more-items [role="button"]') return loadMoreAvailable ? fullLoadButton : null; return null; } }, window: {}, unsafeWindow: { get jQuery() { return jqueryAvailable ? (button) => { assert.equal(button, fullLoadButton); return { trigger(type) { assert.equal(type, 'click'); loadTriggerCount += 1; triggeredLoadButtons.push(button); } }; } : null; } }, logDebug() {}, scheduleTornInventoryBasisRefresh() {}, resetInventoryBazaarRound() {}, setTimeout(callback) { const id = fullLoadTimerId++; fullLoadTimers.set(id, callback); return id; }, clearTimeout(id) { fullLoadTimers.delete(id); }, state: { inventoryFullLoad: { container: null, generation: 0, status: 'idle', triggerAttempts: 0, readinessRetries: 0, startedAt: 0, awaitingProgress: false, snapshot: null, timer: 0 }, inventoryValuationGeneration: 1, inventoryBazaarPending: new Set() } }; vm.createContext(fullLoadContext); vm.runInContext(['getActiveTornInventoryContainer', 'getTornInventoryLoadState', 'abortTornInventoryFullLoad', 'scheduleTornInventoryFullLoad', 'resetTornInventoryFullLoad', 'getTornPageJQuery', 'ensureFullTornInventoryLoaded', 'isTornInventoryFullLoadPending'].map(extractFunction).join('\n'), fullLoadContext);
  const transientStart = fullLoadContext.ensureFullTornInventoryLoaded(1000); assert.equal(transientStart.status, 'waiting-for-load-state'); assert.equal(fullLoadContext.state.inventoryFullLoad.triggerAttempts, 0); activeFullLoadContainer.attrs = { 'data-all': '0', 'data-from': '100', 'data-queue': 'All' }; const fullLoadStart = fullLoadContext.ensureFullTornInventoryLoaded(1100); assert.equal(fullLoadStart.status, 'awaiting-progress'); assert.equal(fullLoadStart.rowCount, 100); assert.equal(loadTriggerCount, 1); assert.equal(fullLoadContext.isTornInventoryFullLoadPending(activeFullLoadContainer), true); activeFullLoadContainer.rowCount = 154; activeFullLoadContainer.attrs['data-from'] = '154'; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(1200).status, 'ready-to-load'); const continueLoad = fullLoadTimers.get(fullLoadContext.state.inventoryFullLoad.timer); const detachedLoadButton = fullLoadButton; detachedLoadButton.isConnected = false; fullLoadButton = { id: 2, isConnected: true }; fullNow = 1250; continueLoad(); assert.equal(loadTriggerCount, 2); assert.deepEqual(triggeredLoadButtons.map((button) => button.id), [1, 2]); activeFullLoadContainer.attrs['data-all'] = '1'; const completedLoad = fullLoadContext.ensureFullTornInventoryLoaded(1300); assert.equal(completedLoad.status, 'complete'); assert.equal(completedLoad.rowCount, 154); fullLoadContext.ensureFullTornInventoryLoaded(1400); assert.equal(loadTriggerCount, 2); assert.equal(fullLoadContext.isTornInventoryFullLoadPending(activeFullLoadContainer), false);
  const alreadyComplete = makeFullLoadContainer({ all: '1', from: '20', rows: 20 }); activeFullLoadContainer = alreadyComplete; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(1450).status, 'complete'); assert.equal(loadTriggerCount, 2); const waitingControl = makeFullLoadContainer(); activeFullLoadContainer = waitingControl; loadMoreAvailable = false; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(1500).status, 'ready-to-load'); assert.equal(fullLoadContext.state.inventoryFullLoad.triggerAttempts, 0); loadMoreAvailable = true; jqueryAvailable = false; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(1550).reason, 'page-jquery-unavailable'); assert.equal(fullLoadContext.state.inventoryFullLoad.triggerAttempts, 0); jqueryAvailable = true; const retryControl = fullLoadTimers.get(fullLoadContext.state.inventoryFullLoad.timer); fullNow = 1600; retryControl(); assert.equal(loadTriggerCount, 3); assert.equal(fullLoadContext.state.inventoryFullLoad.triggerAttempts, 1); const replacementContainer = makeFullLoadContainer({ all: '1', from: '12', rows: 12 }); activeFullLoadContainer = replacementContainer; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(1650).status, 'complete'); assert.equal(fullLoadContext.state.inventoryFullLoad.container, replacementContainer);
  const permanentlyInvalid = makeFullLoadContainer({ all: null, from: null, queue: null }); activeFullLoadContainer = permanentlyInvalid; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(1700).status, 'waiting-for-load-state'); assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(27001).status, 'terminal-aborted');
  const stalledContainer = makeFullLoadContainer(); activeFullLoadContainer = stalledContainer; fullLoadContext.ensureFullTornInventoryLoaded(2000); for (let retry = 0; retry < 10 && fullLoadContext.state.inventoryFullLoad.status !== 'terminal-aborted'; retry += 1) { const timeout = fullLoadTimers.get(fullLoadContext.state.inventoryFullLoad.timer); fullNow += 5000; timeout(); } assert.equal(fullLoadContext.state.inventoryFullLoad.status, 'terminal-aborted'); assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(fullNow).status, 'terminal-aborted'); activeFullLoadContainer.rowCount = 101; activeFullLoadContainer.attrs['data-from'] = '101'; assert.equal(fullLoadContext.ensureFullTornInventoryLoaded(fullNow + 1).status, 'awaiting-progress'); activeFullLoadContainer = null; assert.notEqual(fullLoadContext.ensureFullTornInventoryLoaded(fullNow + 2).status, 'awaiting-progress');
  const readinessContainer = {}; const readinessTimers = new Map(); let readinessTimerId = 1; let valuationRefreshes = 0; const readinessContext = { Math, Array, INVENTORY_BAZAAR_INITIAL_SETTLE_MS: 600, INVENTORY_BAZAAR_REFRESH_QUIET_MS: 1000, INVENTORY_BAZAAR_REFRESH_BATCH_MIN: 20, state: { inventoryValuationGeneration: 1, inventorySortSettings: { criterion: 'bazaar-total' }, inventoryBazaarPending: new Set(['1:206']), inventoryBazaarRefreshTimer: null, inventoryBazaarRound: { generation: 1, startedAt: 1000, total: 100, settled: 0, settledSinceRefresh: 0, initialSnapshotDone: true } }, isTornInventoryFullLoadPending() { return false; }, scheduleTornInventoryBasisRefresh() { valuationRefreshes += 1; }, setTimeout(callback) { const id = readinessTimerId++; readinessTimers.set(id, callback); return id; }, clearTimeout(id) { readinessTimers.delete(id); } }; vm.createContext(readinessContext); vm.runInContext(['inventorySortDependsOnBazaar', 'canApplyInventorySortSnapshot', 'resetInventoryBazaarRound', 'registerInventoryBazaarRequests', 'scheduleInventoryBazaarResultRefresh'].map(extractFunction).join('\n'), readinessContext); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'name', 1100).allowed, true); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'quantity', 1100).allowed, true); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'average-acquisition', 1100).allowed, true); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'current-basis', 1100).allowed, true); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'trader-total', 1100).allowed, true); assert.deepEqual({ ...readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'bazaar-total', 1100) }, { allowed: true, reason: null }); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'best-sale-total', 1600).allowed, true); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'profit', 1600).allowed, true); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'roi', 1600).allowed, true); assert.equal(readinessContext.state.inventoryBazaarPending.size, 1); readinessContext.isTornInventoryFullLoadPending = () => true; assert.deepEqual({ ...readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'name', 1600) }, { allowed: false, reason: 'full-inventory-load' }); readinessContext.isTornInventoryFullLoadPending = () => false;
  for (let settled = 0; settled < 19; settled += 1) readinessContext.scheduleInventoryBazaarResultRefresh(1); assert.equal(valuationRefreshes, 0); assert.equal(readinessTimers.size, 1); readinessContext.scheduleInventoryBazaarResultRefresh(1); const batchRefresh = readinessTimers.get(readinessContext.state.inventoryBazaarRefreshTimer); batchRefresh(); assert.equal(valuationRefreshes, 1); readinessContext.state.inventoryBazaarPending.clear(); readinessContext.scheduleInventoryBazaarResultRefresh(1); readinessTimers.get(readinessContext.state.inventoryBazaarRefreshTimer)(); assert.equal(valuationRefreshes, 2);
  readinessContext.resetInventoryBazaarRound(1); const hundredPending = Array.from({ length: 100 }, (_value, index) => index + 1); assert.equal(readinessContext.registerInventoryBazaarRequests(hundredPending, 2000).length, 100); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'bazaar-total', 2200).allowed, true); const initialSnapshotTimer = readinessTimers.get(readinessContext.state.inventoryBazaarRefreshTimer); initialSnapshotTimer(); assert.equal(valuationRefreshes, 3); assert.equal(readinessContext.canApplyInventorySortSnapshot(readinessContainer, 'bazaar-total', 2600).allowed, true); assert.equal(readinessContext.state.inventoryBazaarPending.size, 100);

  assert.match(source, /@grant\s+GM_listValues/);
  assert.match(source, /WEAV3R_ARBITRAGE_TX_V2:/);
  assert.match(source, /GM_addValueChangeListener\(TRANSACTION_STORE_REVISION_KEY/);
  assert.match(extractFunction('attachHistoryStorageListeners'), /scheduleTornInventoryBasisRefresh/);
  assert.match(extractFunction('initTornItemInventoryHistory'), /inventoryBazaarResults\.clear\(\);[\s\S]*scheduleTornInventoryBasisRefresh/);
  assert.match(extractFunction('initTornItemInventoryHistory'), /GM_addValueChangeListener\(TRADER_QUOTES_KEY/); assert.match(extractFunction('initTornItemInventoryHistory'), /trader-quote-store-change/); assert.match(extractFunction('initTornItemInventoryHistory'), /scheduleTornInventoryBasisRefresh/);
  assert.match(extractFunction('handleRatingStorageChanged'), /scheduleTornInventoryBasisRefresh/);
  assert.equal((extractFunction('refreshTornInventoryBasis').match(/loadBazaarRecommendedPrice\(/g) || []).length, 1); assert.match(extractFunction('refreshTornInventoryBasis'), /requestedItemIds = new Set/); assert.equal(openBlocks.filter((block) => block.model.itemId === 28).length, 1);
  const profitResolverSource = extractFunction('resolveInventoryPotentialProfit'); assert.doesNotMatch(profitResolverSource, /Number\(|parseFloat|toFixed/); assert.doesNotMatch(profitResolverSource, /fetch|XMLHttpRequest|queueBazaarAddMarketplaceDetail|loadBazaarRecommendedPrice/); assert.match(profitResolverSource, /bestSaleResult\.verification !== 'verified'/); assert.match(profitResolverSource, /potentialProfit = subtractBigIntRatios/); assert.doesNotMatch(profitResolverSource, /potentialProfit.*< 0.*0/);
  const inventoryRefreshSource = extractFunction('refreshTornInventoryBasis'); assert.equal((inventoryRefreshSource.match(/listTransactionEvents\(\)/g) || []).length, 1); for (const renderer of ['renderTornInventoryBasis', 'renderTornInventoryBazaar', 'renderTornInventoryTrader', 'renderTornInventoryBestSale', 'renderTornInventoryProfit']) assert.match(inventoryRefreshSource, new RegExp(`${renderer}\\(`));
  assert.match(inventoryRefreshSource, /indexLatestTraderQuotes\(readTraderQuotes\(\)\)/); assert.equal((inventoryRefreshSource.match(/readBazaarQuotes\(\)/g) || []).length, 1); assert.match(inventoryRefreshSource, /indexBazaarQuotes\(readBazaarQuotes\(\)\)/); assert.match(inventoryRefreshSource, /resolveStoredBazaarSortValuation/); assert.match(inventoryRefreshSource, /prioritizeInventoryBazaarRequests/); assert.doesNotMatch(inventoryRefreshSource, /collectSourceWithIframe|loadBazaarRecommendedPrice\([^)]*trader/);
  assert.match(extractFunction('initWeav3rArbitrageHelper'), /captureVisibleWeav3rTraderQuotes\(\)/); assert.match(extractFunction('attachPageObservers'), /scheduleVisibleTraderQuoteCapture\(\)/); assert.match(extractFunction('handleRouteChange'), /scheduleVisibleTraderQuoteCapture\(\)/); assert.match(extractFunction('captureVisibleWeav3rTraderQuotes'), /parseTraderOffers\(document, location\.href\)/); assert.match(extractFunction('captureVisibleWeav3rTraderQuotes'), /persistObservedTraderQuotes\(itemId, traders, location\.href/);
  assert.match(extractFunction('collectSourceWithIframe'), /parseSourceDocument\(iframeDocument/); assert.match(extractFunction('collectSourceWithIframe'), /saveCachedSourceData\(sourceDefinition\.itemId, sourceDefinition\.sourceType/);
  const inventoryComparatorSource = `${extractFunction('buildInventorySortKey')}\n${extractFunction('compareInventorySortRatios')}\n${extractFunction('compareInventorySortRecords')}`; assert.doesNotMatch(inventoryComparatorSource, /gmGet|gmSet|fetch|XMLHttpRequest|listTransactionEvents|readTraderQuotes|loadCachedItemData|querySelector|textContent|parseFloat|Number\(|toFixed/); assert.match(extractFunction('compareInventorySortRatios'), /BigInt\(left\.numerator\) \* BigInt\(right\.denominator\)/); assert.match(extractFunction('compareInventorySortRecords'), /left\.sortKey == null \? 1 : -1/);
  assert.match(extractFunction('refreshTornInventoryBasis'), /updateInventorySortSnapshotState\(container, sortRecords, scan/); assert.doesNotMatch(extractFunction('refreshTornInventoryBasis'), /queueInventoryStableSort|applyInventoryBlockOrder|applyInventorySortSnapshot/); assert.match(extractFunction('refreshTornInventoryBasis'), /sortRecords\.push\(\{ block, displayQuantity: state\.inventoryBazaarSellFilter \? sellDecision\.sellableQuantity : block\.currentQuantity, sellDecision, summary, bazaarValuation, bazaarSortValuation, traderValuation, bestSaleResult, profitResult/); assert.match(extractFunction('ensureInventorySortControl'), /getElementById\(INVENTORY_SORT_CONTROL_ID\)/); assert.match(extractFunction('ensureInventorySortControl'), /INVENTORY_SORT_SETTINGS_KEY/); assert.match(extractFunction('initTornItemInventoryHistory'), /normalizeInventorySortSettings\(gmGet\(INVENTORY_SORT_SETTINGS_KEY/); assert.doesNotMatch(extractFunction('buildInventorySortKey'), /tt-/i);
  assert.match(extractFunction('parseTraderOffers'), /conflicting-trader-identities/); assert.match(extractFunction('parseTraderOffers'), /trader-rows-parsed/); assert.match(extractFunction('captureVisibleWeav3rTraderQuotes'), /visible-weav3r-route/); assert.match(extractFunction('persistObservedTraderQuotes'), /persistObservedTraderQuotes-called/); assert.match(extractFunction('observeTraderQuote'), /quote-normalized/); assert.match(extractFunction('observeTraderQuote'), /trader-quote-store-write/); assert.match(extractFunction('debugStoredTraderQuotes'), /stored quotes for item/); assert.match(extractFunction('resolveInventoryTraderQuote'), /inventory-trader-resolve-start/); assert.match(extractFunction('getStoredTraderQuoteEligibility'), /trader-eligibility-evaluated/);
  const sortCoordinatorSource = `${extractFunction('buildInventorySortSnapshotSignature')}\n${extractFunction('queueInventoryStableSort')}\n${extractFunction('flushInventorySortBatch')}`; assert.doesNotMatch(sortCoordinatorSource, /fetch|XMLHttpRequest|gmGet|readTraderQuotes|loadCachedItemData/); assert.match(extractFunction('queueInventoryStableSort'), /INVENTORY_SORT_QUIET_MS/); assert.match(extractFunction('queueInventoryStableSort'), /INVENTORY_SORT_MAX_BATCH_MS/); assert.match(extractFunction('queueInventoryStableSort'), /sort-key-unchanged/); assert.match(extractFunction('initTornItemInventoryHistory'), /isInternalInventorySortMutation/); assert.match(extractFunction('initTornItemInventoryHistory'), /remote: Boolean\(remote\)/);
  const immutableSnapshotSource = `${extractFunction('buildInventorySortSnapshot')}\n${extractFunction('compareInventorySnapshotEntries')}\n${extractFunction('applyInventorySortSnapshot')}\n${extractFunction('updateInventorySortSnapshotState')}`; assert.match(immutableSnapshotSource, /Object\.freeze/); assert.doesNotMatch(immutableSnapshotSource, /fetch|XMLHttpRequest|gmGet|gmSet|readBazaarQuotes|readTraderQuotes|loadBazaarRecommendedPrice/); assert.doesNotMatch(extractFunction('scheduleInventoryBazaarResultRefresh'), /applyInventoryBlockOrder|applyInventorySortSnapshot|queueInventoryStableSort/); assert.doesNotMatch(extractFunction('refreshTornInventoryBasis'), /queueInventoryStableSort|applyInventoryBlockOrder|applyInventorySortSnapshot/); assert.match(extractFunction('ensureInventorySortControl'), /data-wah-inventory-resort/); assert.match(extractFunction('ensureInventorySortControl'), /applyLatestInventorySortSnapshot/); assert.match(extractFunction('updateInventorySortSnapshotState'), /setInventorySortDirty\(container, true\)/);
  const fullLoadSource = extractFunction('ensureFullTornInventoryLoaded'); assert.match(fullLoadSource, /#load-more-items \[role="button"\]/); assert.match(fullLoadSource, /jquery\(button\)\.trigger\('click'\)/); assert.doesNotMatch(fullLoadSource, /fetch|XMLHttpRequest|\.click\s*\(|dispatchEvent|scroll/); assert.equal((source.match(/\.trigger\('click'\)/g) || []).length, 1); assert.match(extractFunction('getTornPageJQuery'), /unsafeWindow/); assert.match(source, /@grant\s+unsafeWindow/); assert.match(fullLoadSource, /button\.isConnected !== false/); assert.match(fullLoadSource, /inventory-full-load-enter/); assert.match(fullLoadSource, /inventory-full-load-ready/); assert.match(fullLoadSource, /INVENTORY_FULL_LOAD_MAX_ATTEMPTS/); assert.match(fullLoadSource, /INVENTORY_FULL_LOAD_MAX_DURATION_MS/); assert.doesNotMatch(fullLoadSource, /current\.attempts|load\.attempts/); assert.match(fullLoadSource, /waiting-for-load-state/); assert.match(fullLoadSource, /terminal-aborted/); assert.match(extractFunction('refreshTornInventoryBasis'), /isTornInventoryFullLoadPending/); assert.match(extractFunction('refreshTornInventoryBasis'), /inventoryBazaarPending/); assert.match(extractFunction('refreshTornInventoryBasis'), /canApplyInventorySortSnapshot/); assert.match(extractFunction('refreshTornInventoryBasis'), /registerInventoryBazaarRequests/); assert.match(extractFunction('refreshTornInventoryBasis'), /scheduleInventoryBazaarResultRefresh/); assert.doesNotMatch(extractFunction('canApplyInventorySortSnapshot'), /inventoryBazaarPending/); assert.match(extractFunction('initTornItemInventoryHistory'), /attributeFilter: \['data-all', 'data-from', 'data-queue', 'aria-hidden'\]/); assert.match(extractFunction('initTornItemInventoryHistory'), /inventoryValuationGeneration \+= 1/);
  assert.match(source, /if \(source === 'traders' && parsedKey === 'traders'\) persistObservedTraderQuotes/);
  assert.match(extractFunction('chooseBestEligibleTrustedTrader'), /getTrustedTraderEligibility/);
  assert.doesNotMatch(extractFunction('readTraderQuotes'), /TTL|expires|delete/);
  assert.doesNotMatch(extractFunction('readBazaarQuotes'), /TTL|expires|delete/); assert.match(extractFunction('saveDetailedMarketplaceResponse'), /observeSafeBazaarQuote/); assert.doesNotMatch(extractFunction('resolveInventoryBestSale'), /stored-bazaar|sort-available|readBazaarQuotes/); assert.doesNotMatch(extractFunction('resolveInventoryPotentialProfit'), /stored-bazaar|sort-available|readBazaarQuotes/);
  assert.doesNotMatch(source, /gmSetDurable\(TRANSACTION_LEDGER_KEY/);
  assert.match(source, /@version\s+0\.5\.15/);
  const sellDecisionContext = { normalizePositiveInt: offerContext.normalizePositiveInt, getBazaarSellRule(itemId, rules) { return rules.rules[String(itemId)] || 'sell-all'; }, calculateBazaarSellable: bazaarAddContext.calculateBazaarSellable }; vm.createContext(sellDecisionContext); vm.runInContext(extractFunction('resolveBazaarInventorySellDecision'), sellDecisionContext);
  assert.deepEqual({ ...sellDecisionContext.resolveBazaarInventorySellDecision(206, 5, { rules: { 206: 'keep-one' } }) }, { itemId: 206, inventoryQuantity: 5, sellRule: 'keep-one', sellableQuantity: 4, visible: true });
  assert.equal(sellDecisionContext.resolveBazaarInventorySellDecision(206, 5, { rules: { 206: 'dont-sell' } }).visible, false); assert.equal(sellDecisionContext.resolveBazaarInventorySellDecision(206, 5, { rules: { 206: 'sell-all' } }).sellableQuantity, 5); assert.equal(sellDecisionContext.resolveBazaarInventorySellDecision(206, 1, { rules: { 206: 'keep-one' } }).visible, false);
  const directRouteContext = { URL, location: { origin: 'https://weav3r.dev' }, normalizePositiveInt: offerContext.normalizePositiveInt }; vm.createContext(directRouteContext); vm.runInContext(extractFunction('buildWeav3rItemViewUrl'), directRouteContext); assert.equal(directRouteContext.buildWeav3rItemViewUrl(206, 'bazaar'), 'https://weav3r.dev/item/206?mode=buy&tab=all&timeframe=7d'); assert.equal(directRouteContext.buildWeav3rItemViewUrl(367, 'trade'), 'https://weav3r.dev/item/367?mode=sell&tab=itemmarket&timeframe=7d');
  const routeGuardContext = { location: { href: 'https://weav3r.dev/item/2' }, state: { itemId: '2', routeGeneration: 8, routeDomReady: false }, normalizePositiveInt: offerContext.normalizePositiveInt, resolveWeav3rItemRouteId() { return 2; } }; vm.createContext(routeGuardContext); vm.runInContext(extractFunction('isCurrentItemView'), routeGuardContext); assert.equal(routeGuardContext.isCurrentItemView('2', 8), false); routeGuardContext.state.routeDomReady = true; assert.equal(routeGuardContext.isCurrentItemView('1', 7), false); assert.equal(routeGuardContext.isCurrentItemView('2', 7), false); assert.equal(routeGuardContext.isCurrentItemView('2', 8), true); routeGuardContext.resolveWeav3rItemRouteId = () => 3; assert.equal(routeGuardContext.isCurrentItemView('2', 8), false);
  const sourceTableContext = { Array }; vm.createContext(sourceTableContext); vm.runInContext(`${extractFunction('normalizeHeaderText')}
${extractFunction('isWeav3rItemSourceTable')}
${extractFunction('snapshotWeav3rItemSourceTables')}`, sourceTableContext); const headerTable = (headers) => ({ querySelectorAll(selector) { return selector === 'thead th' ? headers.map((textContent) => ({ textContent })) : []; } }); assert.equal(sourceTableContext.normalizeHeaderText('  Trader \n '), 'trader'); assert.equal(sourceTableContext.normalizeHeaderText(null), ''); assert.equal(sourceTableContext.normalizeHeaderText(undefined), ''); assert.equal(sourceTableContext.isWeav3rItemSourceTable(headerTable(['Trader', 'Buy Price', 'Rating', 'Actions'])), true); assert.equal(sourceTableContext.isWeav3rItemSourceTable(headerTable(['Seller', 'Quantity', 'Price / Total Value', 'Last Checked'])), true); assert.equal(sourceTableContext.isWeav3rItemSourceTable(headerTable([])), false); assert.equal(sourceTableContext.isWeav3rItemSourceTable({}), false); assert.equal(sourceTableContext.isWeav3rItemSourceTable(headerTable(['Trader', 'Buy Price'])), false);
  assert.match(extractFunction('captureVisibleWeav3rTraderQuotes'), /isCurrentItemView\(expectedItemId, expectedGeneration\)/); assert.match(extractFunction('parseCurrentVisiblePage'), /isCurrentItemView\(itemId, generation\)/); assert.match(extractFunction('handleRouteChange'), /activateCurrentItemRoute/); assert.match(extractFunction('loadCachedSourceData'), /isCompatibleSourceEntry\(entry, sourceType, itemId\)/); assert.match(extractFunction('isCompatibleSourceEntry'), /itemBindingVersion === 1/);
  assert.match(extractFunction('ensureInventorySortControl'), /data-wah-inventory-sell-filter/); assert.match(extractFunction('refreshTornInventoryBasis'), /normalizeBazaarSellRules\(gmGet\(BAZAAR_SELL_RULES_KEY/); assert.match(extractFunction('refreshTornInventoryBasis'), /applyInventoryBazaarSellFilter\(container, sortRecords\)/); assert.match(extractFunction('buildInventorySortKey'), /record\.displayQuantity/);
  assert.match(source, /data-wah-item-view=\"bazaar\"/); assert.match(source, /data-wah-item-view=\"trade\"/); assert.match(extractFunction('getSourceDefinitions'), /buildWeav3rItemViewUrl\(itemId, 'trade'\)/);
  // Production-chain inventory smoke: execute refreshTornInventoryBasis with two logical rows and the real filter/link helpers.
  function makeSmokeRow(rowKey, itemId) { const nodes = new Map(); const host = { appendChild(node) { node.parentElement = host; nodes.set(node.dataset?.wahWeav3rLinks !== undefined ? 'links' : node.dataset?.wahBazaarSellQuantity !== undefined ? 'sell' : `node-${nodes.size}`, node); } }; return { dataset: { rowkey: rowKey }, parentElement: null, classList: { values: new Set(), toggle(name, on) { if (on) this.values.add(name); else this.values.delete(name); } }, querySelector(selector) { if (selector === '.title-wrap') return host; if (selector.includes('data-wah-weav3r-links')) return nodes.get('links') || null; if (selector.includes('data-wah-bazaar-sell-quantity')) return nodes.get('sell') || null; return null; }, nodes, itemId }; }
  const integrationRows = [makeSmokeRow('g28', 28), makeSmokeRow('u19452406897:special', 233)]; const integrationContainer = { children: integrationRows, parentElement: {}, isConnected: true }; integrationRows.forEach((row) => { row.parentElement = integrationContainer; }); const integrationModels = integrationRows.map((row) => ({ rowKey: row.dataset.rowkey, itemId: row.itemId, itemName: `Item ${row.itemId}`, sourceRow: row })); const integrationBlocks = integrationModels.map((model) => ({ model, rowKeys: [model.rowKey], currentQuantity: model.itemId === 28 ? 5 : 1 })); const integrationFlags = { basis: 0, bazaar: 0, trader: 0, best: 0, profit: 0, control: 0, snapshot: 0 };
  const integrationDocument = { createElement(tagName) { return { tagName, dataset: {}, className: '', innerHTML: '', textContent: '', parentElement: null }; } }; const integrationState = { inventoryBazaarSellFilter: true, settings: { minimumTraderRating: 4 }, inventoryBazaarResults: new Map(), inventorySortSettings: { criterion: 'original', direction: 'asc' }, inventoryBazaarPending: new Set(), inventoryValuationGeneration: 1 };
  const refreshContext = { location: { pathname: '/item.php' }, document: integrationDocument, state: integrationState, Date, Set, Map, Array, normalizePositiveInt: offerContext.normalizePositiveInt, normalizeBazaarSellRules: bazaarAddContext.normalizeBazaarSellRules, normalizeBazaarAddSettings() { return { priceAdjustment: '-1' }; }, gmGet(key) { return key === 'rules' ? { version: 1, rules: { 28: 'keep-one', 233: 'dont-sell' } } : {}; }, BAZAAR_SELL_RULES_KEY: 'rules', BAZAAR_ADD_UI_SETTINGS_KEY: 'settings', getActiveTornInventoryContainer() { return integrationContainer; }, ensureFullTornInventoryLoaded() {}, isTornInventoryFullLoadPending() { return false; }, isInventorySortContainerActive() { return true; }, listTransactionEvents() { return []; }, aggregateItemBasisEvents() { return new Map(); }, indexLatestTraderQuotes() { return new Map(); }, readTraderQuotes() { return {}; }, indexBazaarQuotes() { return new Map(); }, readBazaarQuotes() { return {}; }, readTraderPersonalRatings() { return { records: {} }; }, scanTornInventoryList() { return { rows: integrationModels }; }, buildTornInventoryBasisBlocks() { return integrationBlocks; }, buildItemBasisSummary() { return {}; }, renderTornInventoryBasis() { integrationFlags.basis += 1; return {}; }, getBazaarAddCachedOffers() { return { fresh: true, offers: [{ price: 10 }] }; }, loadCachedItemData() { return { bazaar: { apiSource: 'test', capturedAt: 1 } }; }, resolveBazaarRecommendedPrice(itemId) { return { status: 'available', itemId, recommendedUnitPrice: '9', marketUnitPrice: '10', adjustment: '-1', offers: [{ price: 10 }] }; }, resolveInventoryTraderQuote() { return { status: 'eligible', quote: { price: '8' } }; }, buildInventoryBazaarValuation() { return { status: 'available', recommendedUnitPrice: '9', recommendedTotal: '45' }; }, resolveStoredBazaarSortValuation() { return { status: 'unavailable' }; }, buildInventoryTraderValuation() { return { status: 'eligible', unitPrice: '8', totalPrice: '40' }; }, resolveInventoryBestSale() { return { status: 'available', verification: 'verified', unitPrice: '9', totalValue: '45' }; }, resolveInventoryPotentialProfit() { return { status: 'unavailable' }; }, renderTornInventoryBazaar() { integrationFlags.bazaar += 1; }, renderTornInventoryTrader() { integrationFlags.trader += 1; }, renderTornInventoryBestSale() { integrationFlags.best += 1; }, renderTornInventoryProfit() { integrationFlags.profit += 1; }, getInventoryOriginalIndex(_container, block) { return integrationBlocks.indexOf(block); }, ensureInventorySortControl() { integrationFlags.control += 1; return {}; }, registerInventoryBazaarRequests() { return []; }, prioritizeInventoryBazaarRequests() { return []; }, canApplyInventorySortSnapshot() { return { allowed: true }; }, updateInventorySortSnapshotState() { integrationFlags.snapshot += 1; }, logDebug() {}, loadBazaarRecommendedPrice() { throw new Error('unexpected request'); }, scheduleInventoryBazaarResultRefresh() {}, escapeAttribute(value) { return String(value); }, buildWeav3rItemViewUrl: directRouteContext.buildWeav3rItemViewUrl, getBazaarSellRule: sellDecisionContext.getBazaarSellRule, calculateBazaarSellable: bazaarAddContext.calculateBazaarSellable };
  vm.createContext(refreshContext); vm.runInContext([extractFunction('resolveBazaarInventorySellDecision'), extractFunction('renderTornInventoryWeav3rLinks'), extractFunction('renderInventoryBazaarSellQuantity'), extractFunction('applyInventoryBazaarSellFilter'), extractFunction('refreshTornInventoryBasis')].join('\n'), refreshContext); assert.doesNotThrow(() => refreshContext.refreshTornInventoryBasis({ querySelectorAll() { return integrationRows; } })); assert.deepEqual(integrationFlags, { basis: 2, bazaar: 2, trader: 2, best: 2, profit: 2, control: 1, snapshot: 1 }); assert.ok(integrationRows[0].nodes.get('links').innerHTML.includes('/item/28?mode=buy&amp;tab=all&amp;timeframe=7d') || integrationRows[0].nodes.get('links').innerHTML.includes('/item/28?mode=buy&tab=all&timeframe=7d')); assert.ok(integrationRows[0].nodes.get('sell')); assert.equal(integrationRows[1].classList.values.has('wah-inventory-sell-filter-hidden'), true); assert.equal(integrationRows[0].classList.values.has('wah-inventory-sell-filter-hidden'), false);
  const filterSource = extractFunction('applyInventoryBazaarSellFilter'); assert.doesNotMatch(filterSource, /querySelector|cssEscape|CSS\.escape/); assert.match(filterSource, /rowsByKey/); assert.equal(source.includes('cssEscape'), false);

  // SPA visible-state regression: execute the real snapshot + route transition chain with Trader A in the DOM.
  const sourceTableA = { isConnected: true, querySelectorAll(selector) { return selector === 'thead th' ? ['Trader', 'Buy Price', 'Rating', 'Actions'].map((textContent) => ({ textContent })) : []; } }; const routeUiDocument = { querySelectorAll(selector) { return selector === 'table' ? [sourceTableA] : []; } }; const routeUiState = { lastUrl: 'https://weav3r.dev/item/1', itemId: '1', routeGeneration: 1, cachedData: { traders: { itemId: 1, traders: [{ traderName: 'Trader A' }] } }, lastResult: { status: 'BUY & SELL', bestTrader: { traderName: 'Trader A' } }, sourceProgress: {}, staleRouteTables: new Set(), routeDomReady: true, recheckTimer: 10, manualTraderCaptureTimer: 11, eligibilityTimer: 12 }; const renderedRouteResults = []; const routeUiContext = { document: routeUiDocument, location: { href: 'https://weav3r.dev/item/2' }, state: routeUiState, Array, Set, normalizePositiveInt: offerContext.normalizePositiveInt, cancelCurrentCollectors() {}, clearTimeout() {}, emptySourceProgress() { return {}; }, emptyCachedData() { return { bazaar: null, itemMarket: null, traders: null }; }, highlightRows() {}, renderStatusCard(result) { renderedRouteResults.push(structuredClone(result)); }, loadCachedItemData(itemId) { return { bazaar: null, itemMarket: null, traders: { itemId: Number(itemId), itemBindingVersion: 1, traders: [{ traderName: `Trader ${itemId}` }] } }; }, scheduleVisibleTraderQuoteCapture() {}, scheduleEvaluation() {}, logDebug() {} }; routeUiContext.getCurrentItemId = () => routeUiContext.location.href.endsWith('/3') ? '3' : '2'; vm.createContext(routeUiContext); vm.runInContext(['normalizeHeaderText', 'isWeav3rItemSourceTable', 'snapshotWeav3rItemSourceTables', 'beginWeav3rItemRouteTransition', 'createRouteLoadingResult', 'invalidateCurrentItemUi', 'activateCurrentItemRoute', 'handleRouteChange'].map(extractFunction).join('\n'), routeUiContext); assert.doesNotThrow(() => routeUiContext.handleRouteChange()); assert.equal(routeUiState.itemId, '2'); assert.equal(routeUiState.lastResult.status, 'LOADING'); assert.equal(routeUiState.lastResult.bestTrader, undefined); assert.equal(renderedRouteResults.at(-1).itemId, 2); assert.equal(routeUiState.cachedData.traders.itemId, 2); assert.equal(routeUiState.staleRouteTables.has(sourceTableA), true); const generationB = routeUiState.routeGeneration; routeUiContext.location.href = 'https://weav3r.dev/item/3'; assert.doesNotThrow(() => routeUiContext.handleRouteChange()); assert.equal(routeUiState.itemId, '3'); assert.equal(routeUiState.lastResult.itemId, 3); assert.ok(routeUiState.routeGeneration > generationB); assert.equal(routeUiState.cachedData.traders.itemId, 3);
  const brokenSnapshotContext = { ...routeUiContext, document: { querySelectorAll() { throw new Error('partial DOM'); } }, state: { ...routeUiState, staleRouteTables: new Set(), routeDomReady: true }, rendered: [] }; brokenSnapshotContext.renderStatusCard = (result) => brokenSnapshotContext.rendered.push(structuredClone(result)); vm.createContext(brokenSnapshotContext); vm.runInContext(['normalizeHeaderText', 'isWeav3rItemSourceTable', 'snapshotWeav3rItemSourceTables', 'beginWeav3rItemRouteTransition', 'createRouteLoadingResult', 'invalidateCurrentItemUi', 'activateCurrentItemRoute'].map(extractFunction).join('\n'), brokenSnapshotContext); assert.doesNotThrow(() => brokenSnapshotContext.activateCurrentItemRoute('9', 'Loading')); assert.equal(brokenSnapshotContext.state.lastResult.status, 'LOADING'); assert.equal(brokenSnapshotContext.state.routeDomReady, false); assert.equal(brokenSnapshotContext.state.routeSnapshotFailed, true);
  const staleRenderContext = { state: { itemId: '3', routeGeneration: 3 }, getCurrentItemId() { return '3'; } }; vm.createContext(staleRenderContext); vm.runInContext(`${extractFunction('isCurrentRoute')}
${extractFunction('isCurrentRouteRender')}`, staleRenderContext); assert.equal(staleRenderContext.isCurrentRouteRender('1', 1), false); assert.equal(staleRenderContext.isCurrentRouteRender('2', 2), false); assert.equal(staleRenderContext.isCurrentRouteRender('3', 3), true);
  assert.match(extractFunction('attachPageObservers'), /originalPushState[\s\S]*handleRouteChange\(\)/); assert.doesNotMatch(extractFunction('attachPageObservers'), /setTimeout\(handleRouteChange/); assert.match(extractFunction('renderComputedResult'), /isCurrentRouteRender\(expectedItemId, expectedGeneration\)/); assert.match(extractFunction('pumpCollectorQueue'), /isCurrentRoute\(job\.definition\.itemId, job\.generation\)/); assert.match(extractFunction('activateCurrentItemRoute'), /invalidateCurrentItemUi[\s\S]*beginWeav3rItemRouteTransition/);
  const lifecycleFunctions = ['isWeav3rItemSourceTable', 'snapshotWeav3rItemSourceTables', 'beginWeav3rItemRouteTransition', 'updateWeav3rItemRouteDomReadiness', 'captureVisibleWeav3rTraderQuotes', 'scheduleVisibleTraderQuoteCapture', 'applyInventoryBazaarSellFilter', 'renderTornInventoryWeav3rLinks', 'buildInventorySortSnapshot', 'observeSafeBazaarQuote', 'observeTraderQuote', 'activateCurrentItemRoute', 'renderComputedResult']; const declaredFunctions = new Set(Array.from(source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g), (match) => match[1])); const allowedCallableGlobals = new Set(['Array', 'String', 'Number', 'BigInt', 'Boolean', 'Date', 'Set', 'Map', 'Object', 'URL', 'RegExp', 'Error', 'Promise', 'Math', 'JSON', 'setTimeout', 'clearTimeout']); const unboundCalls = new Set(); for (const name of lifecycleFunctions) for (const match of extractFunction(name).matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (!declaredFunctions.has(match[1]) && !allowedCallableGlobals.has(match[1]) && !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(match[1])) unboundCalls.add(match[1]); assert.deepEqual([...unboundCalls], []); assert.equal(source.includes('cssEscape'), false); assert.equal(/function\s+normalizeText\s*\(/.test(source), false); assert.match(extractFunction('isWeav3rItemSourceTable'), /normalizeHeaderText/);
  assert.match(extractFunction('handleSharedHistoryClick'), /kind: 'item', itemId: target\.dataset\.wahItemHistory/);
  console.log('focused Torn inventory and Watchlist action smoke tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
