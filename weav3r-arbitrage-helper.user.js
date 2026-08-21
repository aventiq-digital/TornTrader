// ==UserScript==
// @name         Weav3r Arbitrage Helper
// @namespace    local.queenjuliette.weav3r
// @version      0.5.11
// @description  Compares Weav3r purchase prices with trusted trader buy prices.
// @match        https://weav3r.dev/item/*
// @match        https://weav3r.dev/pricelist/*
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/page.php?sid=ItemMarket*
// @match        https://www.torn.com/trade.php*
// @match        https://www.torn.com/item.php*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      weav3r.dev
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  const DEBUG = false;
  const LOG_PREFIX = '[Weav3r Arbitrage]';
  const BAZAAR_CACHE_MS = 60 * 1000;
  const ITEM_MARKET_CACHE_MS = 45 * 1000;
  const TRADER_CACHE_MS = 30 * 60 * 1000;
  const MARKETPLACE_BATCH_CACHE_MS = 60 * 1000;
  const COLLECTOR_TIMEOUT_MS = 14000;
  const API_TIMEOUT_MS = 12000;
  const BAZAAR_ADD_DETAIL_CONCURRENCY = 2;
  const RECHECK_DELAY_MS = 250;
  const MAX_PARALLEL_COLLECTORS = 2;
  const COLLECTOR_START_SPACING_MS = 2000;
  const COLLECTOR_JITTER_MS = 300;
  const COLLECTOR_ROLLING_LIMIT = 20;
  const PILL_DRAG_THRESHOLD_PX = 6;
  const WATCHLIST_LIMIT = 20;
  const CARD_ID = 'weav3r-arbitrage-helper-card';
  const STYLE_ID = 'weav3r-arbitrage-helper-style';
  const HIDDEN_ROW_CLASS = 'weav3r-arbitrage-hidden-row';
  const BEST_ROW_CLASS = 'weav3r-arbitrage-best-row';
  const CHEAPEST_ROW_CLASS = 'weav3r-arbitrage-cheapest-row';
  const SETTINGS_KEY = 'weav3rArbitrage:settings';
  const BAZAAR_HANDOFF_KEY = 'WEAV3R_ARBITRAGE_BAZAAR_HANDOFF';
  const BAZAAR_HANDOFFS_KEY = 'WEAV3R_ARBITRAGE_BAZAAR_HANDOFFS';
  const TRADE_HANDOFF_KEY = 'WEAV3R_ARBITRAGE_TRADE_HANDOFF';
  const TRADE_HANDOFFS_KEY = 'WEAV3R_ARBITRAGE_TRADE_HANDOFFS';
  const TRADE_VERIFICATIONS_KEY = 'WEAV3R_ARBITRAGE_TRADE_VERIFICATIONS';
  const TRANSACTION_LEDGER_KEY = 'WEAV3R_ARBITRAGE_TRANSACTION_LEDGER';
  const TRANSACTION_EVENT_PREFIX = 'WEAV3R_ARBITRAGE_TX_V2:';
  const TRANSACTION_STORE_META_KEY = 'WEAV3R_ARBITRAGE_TX_STORE_META_V2';
  const TRANSACTION_STORE_REVISION_KEY = 'WEAV3R_ARBITRAGE_TX_REVISION_V2';
  const PURCHASE_TRANSPORTS_KEY = 'WEAV3R_ARBITRAGE_PURCHASE_TRANSPORTS';
  const TRADER_PERSONAL_RATINGS_KEY = 'WEAV3R_ARBITRAGE_TRADER_PERSONAL_RATINGS';
  const TRADER_QUOTES_KEY = 'WEAV3R_ARBITRAGE_TRADER_QUOTES_V1';
  const BAZAAR_QUOTES_KEY = 'WEAV3R_ARBITRAGE_BAZAAR_QUOTES_V1';
  const INVENTORY_SORT_SETTINGS_KEY = 'WEAV3R_ARBITRAGE_INVENTORY_SORT_V1';
  const INVENTORY_SORT_CONTROL_ID = 'weav3r-inventory-sort-control';
  const INVENTORY_SORT_QUIET_MS = 600;
  const INVENTORY_SORT_MAX_BATCH_MS = 3000;
  const INVENTORY_FULL_LOAD_PROGRESS_TIMEOUT_MS = 5000;
  const INVENTORY_FULL_LOAD_RETRY_MS = 500;
  const INVENTORY_FULL_LOAD_MAX_ATTEMPTS = 8;
  const INVENTORY_FULL_LOAD_MAX_DURATION_MS = 25000;
  const INVENTORY_BAZAAR_INITIAL_SETTLE_MS = 600;
  const INVENTORY_BAZAAR_REFRESH_QUIET_MS = 1000;
  const INVENTORY_BAZAAR_REFRESH_BATCH_MIN = 20;
  const BAZAAR_QUOTE_RECENT_MS = 24 * 60 * 60 * 1000;
  const TRADER_QUOTE_PRICING_RULE = 'fixed-item-buy-price';
  const TRADER_QUOTE_CONDITION_FINGERPRINT = 'weav3r-trader-table:v1:fixed-item-buy-price';
  const WATCHLIST_KEY = 'weav3rArbitrage:watchlist';
  const MARKETPLACE_BATCH_KEY = 'weav3rArbitrage:marketplaceBatch';
  const COLLAPSED_TOP_KEY = 'weav3rArbitrage:collapsedTop';
  const COLLAPSED_DEFAULT_TOP_RATIO = 0.45;
  const COLLAPSED_MARGIN_PX = 16;
  const DEFAULT_MINIMUM_RELATIVE_PROFIT_PERCENT = 2;
  const BAZAAR_HANDOFF_TTL_MS = 5 * 60 * 1000;
  const TRADE_HANDOFF_TTL_MS = 15 * 60 * 1000;
  const TRADE_ACTIVITY_LIMIT_MS = 6 * 60 * 60 * 1000;
  const TRADE_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
  const TORN_HANDOFF_TIMEOUT_MS = 15000;
  const TRADE_TARGET_DISCOVERY_TIMEOUT_MS = 12000;
  const TRADE_TARGET_DISCOVERY_MAX_STEPS = 30;
  const TRADE_TARGET_DISCOVERY_SETTLE_MS = 250;
  const OFFER_CLICK_FRESHNESS_MS = 15 * 1000;
  const TORN_HANDOFF_STATUS_ID = 'weav3r-arbitrage-torn-status';
  const TORN_HANDOFF_STYLE_ID = 'weav3r-arbitrage-torn-style';
  const TORN_TARGET_HIGHLIGHT_CLASS = 'weav3r-arbitrage-torn-target-item';
  const TRADE_ACTIVE_HANDOFF_SESSION_KEY = 'WEAV3R_ARBITRAGE_ACTIVE_TRADE_HANDOFF_ID';
  const PENDING_PURCHASE_CONTEXTS_SESSION_KEY = 'WEAV3R_ARBITRAGE_TORN_PENDING_PURCHASES';
  const PENDING_PURCHASE_TTL_MS = 30 * 60 * 1000;
  const PURCHASE_CONFIRMATION_OBSERVATION_MS = 15 * 1000;
  const BAZAAR_BUY_STAGE_TTL_MS = 2 * 60 * 1000;
  const PURCHASE_DIAGNOSTIC_EVENT_LIMIT = 20;
  const PURCHASE_TRACKING_PANEL_ID = 'weav3r-arbitrage-purchase-tracking';
  const BAZAAR_SELL_RULES_KEY = 'WEAV3R_ARBITRAGE_BAZAAR_SELL_RULES';
  const BAZAAR_ADD_UI_SETTINGS_KEY = 'WEAV3R_ARBITRAGE_BAZAAR_ADD_UI_SETTINGS';
  const BAZAAR_ADD_MANAGER_ID = 'weav3r-bazaar-add-manager';
  const BAZAAR_ADD_RULES = Object.freeze(['sell-all', 'keep-one', 'dont-sell']);
  const DEFAULT_BAZAAR_ADD_SETTINGS = Object.freeze({ sortField: 'sellableMarketValue', sortDirection: 'desc', hideProtected: false, priceAdjustment: '-1' });
  const TRADE_FILTER_PANEL_ID = 'weav3r-trade-target-filter';
  const TRADE_FILTER_HIDDEN_CLASS = 'weav3r-trade-filter-hidden';
  const TRADE_FILTER_TARGET_CLASS = 'weav3r-trade-target-row';
  const WATCHLIST_BACKDROP_ID = 'weav3r-arbitrage-watchlist-backdrop';
  const WATCHLIST_DIALOG_ID = 'weav3r-arbitrage-watchlist-dialog';
  const WATCHLIST_TITLE_ID = 'weav3r-arbitrage-watchlist-title';
  const WATCHLIST_CONTENT_ID = 'weav3r-arbitrage-watchlist-content';
  const SETTINGS_BACKDROP_ID = 'weav3r-arbitrage-settings-backdrop';
  const SETTINGS_DIALOG_ID = 'weav3r-arbitrage-settings-dialog';
  const SETTINGS_TITLE_ID = 'weav3r-arbitrage-settings-title';
  const SETTINGS_FORM_ID = 'weav3r-arbitrage-settings-form';
  const HISTORY_BACKDROP_ID = 'weav3r-arbitrage-history-backdrop';
  const HISTORY_DIALOG_ID = 'weav3r-arbitrage-history-dialog';
  const HISTORY_TITLE_ID = 'weav3r-arbitrage-history-title';
  const HISTORY_CONTENT_ID = 'weav3r-arbitrage-history-content';
  const HISTORY_LAUNCHER_ID = 'weav3r-arbitrage-history-launcher';
  const HISTORY_SHARED_STYLE_ID = 'weav3r-arbitrage-history-shared-style';
  const DEFAULT_SETTINGS = Object.freeze({ minimumTraderRating: 4, minimumProfitPerItem: 100000, minimumRelativeProfitPercent: DEFAULT_MINIMUM_RELATIVE_PROFIT_PERCENT });

  const state = {
    itemId: null,
    lastUrl: location.href,
    observer: null,
    recheckTimer: 0,
    listenersAttached: false,
    isRendering: false,
    settingsDialogOpen: false,
    settingsError: '',
    watchlistDialogOpen: false,
    activeModalType: null,
    historyDialogOpen: false,
    historyContext: { kind: 'global' },
    sharedHistoryInitialized: false,
    sharedHistoryObserver: null,
    sharedHistoryUrl: '',
    nativeNavigationInitialized: false, manualTraderCaptureTimer: 0,
    historyTab: 'transactions',
    historyTypeFilter: 'all',
    historySourceFilter: 'all',
    historySearch: '',
    historySort: 'newest',
    expandedTransactionIds: new Set(),
    historyLedgerListenerId: null,
    historyRevisionListenerId: null,
    historyTransportListenerId: null, inventoryHistoryObserver: null, inventoryHistoryInitialized: false, inventoryBasisRefreshTimer: null, inventoryBazaarRefreshTimer: null, inventoryBazaarResults: new Map(), inventoryBazaarSettingsListenerId: null, inventoryBazaarQuoteListenerId: null, inventoryTraderQuoteListenerId: null, inventorySettingsListenerId: null, inventorySortSettings: { criterion: 'original', direction: 'asc' }, inventorySortOriginals: new WeakMap(), inventorySortLastSignatures: new WeakMap(), inventorySortPending: new Map(), inventorySortQuietTimer: 0, inventorySortMaxTimer: 0, inventorySortImmediate: false, inventorySortInternalRows: new WeakSet(), inventoryFullLoad: { container: null, generation: 0, status: 'idle', triggerAttempts: 0, readinessRetries: 0, startedAt: 0, awaitingProgress: false, snapshot: null, terminalSnapshot: null, timer: 0 }, inventoryValuationGeneration: 1, inventoryBazaarPending: new Set(), inventoryBazaarRound: { generation: 0, startedAt: 0, total: 0, settled: 0, settledSinceRefresh: 0, initialSnapshotDone: false },
    historyExportSignature: '',
    historyExportUrls: { json: '', csv: '' },
    modalOpeners: { watchlist: null, settings: null, history: null },
    scrollLock: null,
    watchlistMessage: '',
    removeAllConfirmUntil: 0,
    collapsed: false,
    settings: { ...DEFAULT_SETTINGS },
    cachedData: emptyCachedData(),
    itemNames: {},
    lastResult: { status: 'LOADING', messages: ['Waiting for Weav3r tables...'] },
    collapsedTop: null,
    pillDrag: null,
    routeGeneration: 0,
    activeCollectors: new Map(),
    queuedCollectors: [],
    collectorStartTimes: [],
    nextCollectorStartAt: 0,
    collectorPumpTimer: 0,
    sourceProgress: emptySourceProgress(),
    detailedBazaarRequests: new Map(),
    offerRefreshes: new Map(),
    offerRefreshWaiters: new Map(),
    offerCheckingItems: new Set(),
    marketplaceBatchPromise: null,
    marketplaceBatchMemory: null,
    watchlist: [],
    watchlistResults: new Map(),
    rowRescans: new Set(),
    scan: null,
    renderTimer: 0,
    eligibilityTimer: 0,
    ratingChangeListenerId: null,
    lastRenderSignature: '',
    watchlistLayoutDiagnosticSignature: '',
  };

  function getScrollbarWidth() { return Math.max(0, window.innerWidth - document.documentElement.clientWidth); }
  function saveStyleProperties(element, properties) { return properties.reduce((snapshot, property) => { snapshot[property] = element.style[property] || ''; return snapshot; }, {}); }
  function restoreStyleProperties(element, snapshot) { Object.entries(snapshot || {}).forEach(([property, value]) => { element.style[property] = value; }); }
  function lockBackgroundScroll() {
    if (state.scrollLock) { logDebug('Duplicate background scroll lock ignored.'); return; }
    const body = document.body;
    const html = document.documentElement;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollbarWidth = getScrollbarWidth();
    state.scrollLock = { scrollX, scrollY, bodyStyles: saveStyleProperties(body, ['position', 'top', 'left', 'width', 'overflow', 'paddingRight']), htmlStyles: saveStyleProperties(html, ['overflow']), scrollbarWidth };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = state.scrollLock.bodyStyles.paddingRight ? `calc(${state.scrollLock.bodyStyles.paddingRight} + ${scrollbarWidth}px)` : `${scrollbarWidth}px`;
    html.style.overflow = 'hidden';
    logDebug('Background scroll locked.', { scrollX, scrollY, scrollbarWidth });
  }
  function unlockBackgroundScroll() {
    if (!state.scrollLock) { logDebug('Duplicate background scroll unlock ignored.'); return; }
    if (state.activeModalType) { logDebug('Background scroll unlock skipped because another modal remains open.', state.activeModalType); return; }
    const saved = state.scrollLock;
    state.scrollLock = null;
    restoreStyleProperties(document.body, saved.bodyStyles);
    restoreStyleProperties(document.documentElement, saved.htmlStyles);
    window.scrollTo(saved.scrollX, saved.scrollY);
    logDebug('Background scroll unlocked.', { scrollX: saved.scrollX, scrollY: saved.scrollY });
  }
  function getActiveModalType() { return state.activeModalType; }
  function restoreModalOpenerFocus(modalType) { const opener = state.modalOpeners[modalType]; if (opener?.isConnected) { try { opener.focus({ preventScroll: true }); } catch (_) { opener.focus(); } } state.modalOpeners[modalType] = null; }
  function openModal(modalType, openerElement) {
    if (state.activeModalType && state.activeModalType !== modalType) closeModal(state.activeModalType, 'switch', { skipUnlock: true, refocus: false });
    if (!state.scrollLock) lockBackgroundScroll();
    state.activeModalType = modalType;
    state.modalOpeners[modalType] = openerElement || null;
    if (modalType === 'watchlist') state.watchlistDialogOpen = true;
    if (modalType === 'settings') state.settingsDialogOpen = true;
    if (modalType === 'history') state.historyDialogOpen = true;
    logDebug('Active modal changed.', modalType);
  }
  function closeModal(modalType, reason = 'close', options = {}) {
    if (modalType === 'watchlist') { state.watchlistDialogOpen = false; document.getElementById(WATCHLIST_BACKDROP_ID)?.remove(); }
    if (modalType === 'settings') { state.settingsDialogOpen = false; state.settingsError = ''; document.getElementById(SETTINGS_BACKDROP_ID)?.remove(); }
    if (modalType === 'history') { state.historyDialogOpen = false; document.getElementById(HISTORY_BACKDROP_ID)?.remove(); revokeHistoryExportUrls(); }
    if (state.activeModalType === modalType) state.activeModalType = null;
    if (options.refocus !== false) restoreModalOpenerFocus(modalType);
    if (!options.skipUnlock && !state.activeModalType) unlockBackgroundScroll();
    logDebug('Modal closed.', { modalType, reason });
  }
  function closeActiveModal(reason = 'close') { if (state.activeModalType) closeModal(state.activeModalType, reason); }
  function focusElementWithoutScroll(element) { if (!element) return; try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); } }
  function focusInitialModalElement(modalType) {
    requestAnimationFrame(() => {
      if (modalType !== state.activeModalType) return;
      if (modalType === 'watchlist') {
        const dialog = document.getElementById(WATCHLIST_DIALOG_ID);
        const target = dialog?.querySelector(state.scan?.active ? '[data-action="stop-watchlist-scan"]' : state.watchlist.length ? '[data-action="scan-watchlist"]' : '[data-action="close-watchlist-dialog"]') || document.getElementById(WATCHLIST_CONTENT_ID);
        focusElementWithoutScroll(target);
        logDebug('Watchlist modal initial focus set.', target?.id || target?.dataset?.action);
      } else if (modalType === 'settings') {
        focusElementWithoutScroll(document.getElementById('weav3r-arbitrage-min-rating'));
      } else if (modalType === 'history') {
        focusElementWithoutScroll(document.querySelector(`#${HISTORY_DIALOG_ID} [data-history-tab="${state.historyTab}"]`));
      }
    });
  }

  function logDebug(...args) { if (DEBUG) console.debug(LOG_PREFIX, ...args); }
  function logWarn(...args) { console.warn(LOG_PREFIX, ...args); }
  function logError(...args) { console.error(LOG_PREFIX, ...args); }
  function gmGet(key, fallback) { try { return GM_getValue(key, fallback); } catch (error) { logWarn('Could not read storage.', error); return fallback; } }
  function gmSet(key, value) { try { GM_setValue(key, value); } catch (error) { logWarn('Could not write storage.', error); } }
  function gmDelete(key) { try { GM_deleteValue(key); } catch (error) { logWarn('Could not delete storage.', error); } }
  function gmSetDurable(key, value, verifyFn = (stored) => JSON.stringify(stored) === JSON.stringify(value)) { try { GM_setValue(key, value); const stored = GM_getValue(key, null); if (!verifyFn(stored)) return { ok: false, reason: 'read-back-mismatch' }; return { ok: true }; } catch (error) { logWarn('Durable write failed.', { key, error }); return { ok: false, reason: 'storage-error', error }; } }
  function mergeCriticalRecord(key, fallback, recordKey, record, normalizeCollection, attempts = 3) { for (let attempt = 0; attempt < attempts; attempt += 1) { const latest = normalizeCollection(gmGet(key, fallback)); const unrelated = Object.keys(latest.records).filter((id) => id !== recordKey); const next = { ...latest, records: { ...latest.records, [recordKey]: record } }; const result = gmSetDurable(key, next, (stored) => { const normalized = normalizeCollection(stored); return Boolean(normalized.records[recordKey]) && unrelated.every((id) => normalized.records[id]); }); if (result.ok) return { ok: true, collection: normalizeCollection(gmGet(key, fallback)), attempts: attempt + 1 }; } return { ok: false, reason: 'critical-write-failed' }; }
  function emptyCachedData() { return { bazaar: null, itemMarket: null, traders: null }; }
  function emptySourceProgress() { return { bazaar: 'pending', itemMarket: 'pending', traders: 'pending' }; }
  function getCurrentItemId() { const match = location.pathname.match(/^\/item\/(\d+)(?:\/|$)/); return match ? match[1] : null; }

  function getSourceCacheDuration(sourceType) {
    if (sourceType === 'bazaar') return BAZAAR_CACHE_MS;
    if (sourceType === 'itemMarket') return ITEM_MARKET_CACHE_MS;
    if (sourceType === 'traders') return TRADER_CACHE_MS;
    if (sourceType === 'marketplaceBatch') return MARKETPLACE_BATCH_CACHE_MS;
    return 0;
  }

  function parseMoney(text) {
    if (text == null) return null;
    const normalized = String(text).replace(/\s+/g, '').toLowerCase();
    const match = normalized.match(/\$?(-?\d+(?:[,.]\d+)*)([km])?/i);
    if (!match) return null;
    let numberText = match[1];
    const suffix = match[2];
    if (suffix) numberText = numberText.replace(/,/g, '.'); else numberText = numberText.replace(/,/g, '');
    const value = Number.parseFloat(numberText);
    if (!Number.isFinite(value)) return null;
    return Math.round(value * (suffix === 'm' ? 1000000 : suffix === 'k' ? 1000 : 1));
  }
  function parseRating(text) { const match = String(text ?? '').replace(/\s+/g, ' ').trim().match(/[+-]?\d+/); return match ? Number.parseInt(match[0], 10) : null; }
  function parsePercentage(text) {
    const normalized = String(text ?? '').trim().replace(/%$/, '').replace(',', '.');
    if (!normalized) return null;
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  function normalizeHeaderText(text) { return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function normalizeComparableHeader(text) { return normalizeHeaderText(text).replace(/\s*\/\s*/g, ' / '); }
  function getRows(table) { const bodyRows = Array.from(table.tBodies || []).flatMap((body) => Array.from(body.rows || [])); return bodyRows.length ? bodyRows : Array.from(table.querySelectorAll('tr')).filter((row) => !row.querySelector('th')); }
  function getTableInfo(table) { const headerCells = Array.from(table.querySelectorAll('thead th')); const fallback = headerCells.length ? headerCells : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td')); return { table, headers: fallback.map((cell) => normalizeComparableHeader(cell.textContent)) }; }
  function headerIndex(headers, expected) { const target = normalizeComparableHeader(expected); return headers.findIndex((header) => header === target || header.includes(target)); }
  function findTableByHeaders(requiredHeaders, rootDocument = document) { return Array.from(rootDocument.querySelectorAll('table')).map(getTableInfo).find((info) => requiredHeaders.every((header) => headerIndex(info.headers, header) !== -1)) || null; }
  function getCell(row, index) { return index >= 0 ? row.cells[index] || null : null; }
  function parseQuantity(text) { const match = String(text || '').replace(/,/g, '').match(/\d+/); return match ? Number.parseInt(match[0], 10) : null; }
  function absoluteUrl(url, baseUrl = location.href) { try { return new URL(url, baseUrl).href; } catch (_) { return null; } }
  function getUrlParts(href, baseUrl) { try { const url = new URL(href, baseUrl); return `${url.pathname}${url.search}${url.hash}`; } catch (_) { return ''; } }

  function parseBazaarOffers(itemId, rootDocument = document, baseUrl = location.href) {
    const info = findTableByHeaders(['Seller', 'Quantity', 'Price / Total Value', 'Last Checked'], rootDocument);
    if (!info) return [];
    const indexes = { seller: headerIndex(info.headers, 'Seller'), quantity: headerIndex(info.headers, 'Quantity'), price: headerIndex(info.headers, 'Price / Total Value') };
    return getRows(info.table).map((row) => {
      const sellerCell = getCell(row, indexes.seller);
      const priceCell = getCell(row, indexes.price);
      const link = sellerCell ? sellerCell.querySelector('a[href*="torn.com/bazaar.php"], a[href*="bazaar.php"]') : null;
      let linkPrice = null;
      if (link) { try { linkPrice = parseMoney(new URL(link.href, baseUrl).searchParams.get('price')); } catch (_) { linkPrice = null; } }
      const price = linkPrice || parseMoney(priceCell ? priceCell.textContent : '');
      if (!price || price <= 0) return null;
      return { source: 'Bazaar', sourceType: 'bazaar', price, sellerName: sellerCell ? sellerCell.textContent.trim() : '', sellerUrl: link ? absoluteUrl(link.getAttribute('href') || link.href, baseUrl) : null, quantity: parseQuantity((getCell(row, indexes.quantity) || {}).textContent), capturedAt: Date.now(), row };
    }).filter(Boolean);
  }

  function parseItemMarketOffers(rootDocument = document, itemId = null, baseUrl = location.href) {
    const info = findTableByHeaders(['#', 'Price', 'Quantity', 'Total Value', 'vs Avg'], rootDocument);
    if (!info) return [];
    const priceIndex = headerIndex(info.headers, 'Price');
    const quantityIndex = headerIndex(info.headers, 'Quantity');
    return getRows(info.table).map((row) => {
      const price = parseMoney((getCell(row, priceIndex) || {}).textContent);
      if (!price || price <= 0) return null;
      const offerLink = Array.from(row.querySelectorAll('a[href]')).map((link) => absoluteUrl(link.getAttribute('href') || link.href, baseUrl)).find((href) => normalizeConcreteMarketUrl('item-market', href, itemId));
      return { source: 'Item Market', sourceType: 'itemMarket', price, offerUrl: offerLink || null, quantity: parseQuantity((getCell(row, quantityIndex) || {}).textContent), capturedAt: Date.now(), row };
    }).filter(Boolean);
  }

  function extractTraderActivityText(traderCell) {
    if (!traderCell) return null;
    const candidates = Array.from(traderCell.querySelectorAll('div, p, span, small')).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
    const activeLine = candidates.find((text) => /^Active:/i.test(text));
    const text = activeLine || (traderCell.textContent.replace(/\s+/g, ' ').trim().match(/Active:\s*[^•]+/i) || [null])[0];
    return text ? text.split('•')[0].trim() : null;
  }

  function parseTraderActivity(activityText) {
    const text = String(activityText || '').replace(/^Active:\s*/i, 'Active ').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    if (/^(online|active now|just now|active just now)$/i.test(text)) return { ageMs: 0, normalizedText: text };
    const match = text.match(/^Active\s+(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\s+ago$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isInteger(amount) || amount < 0) return null;
    const unit = match[2].toLowerCase();
    const multiplier = /^s|sec/.test(unit) ? 1000 : /^m|min/.test(unit) ? 60 * 1000 : /^h|hr/.test(unit) ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return { ageMs: amount * multiplier, normalizedText: text };
  }
  function getTraderLastSeenAt(activityText, capturedAt) { const parsed = parseTraderActivity(activityText); const reference = Number(capturedAt); return parsed && Number.isFinite(reference) ? reference - parsed.ageMs : null; }
  function getTraderTradeEligibleUntil(trader) { const lastSeenAt = Number(trader?.lastSeenAt); return Number.isFinite(lastSeenAt) && lastSeenAt > 0 ? lastSeenAt + TRADE_ACTIVITY_LIMIT_MS : null; }
  function getTraderTradeEligibility(trader, now = Date.now()) { const lastSeenAt = Number(trader?.lastSeenAt); if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return 'unknown'; return now - lastSeenAt <= TRADE_ACTIVITY_LIMIT_MS ? 'eligible' : 'inactive'; }
  function isTraderTradeEligible(trader, now = Date.now()) { return getTraderTradeEligibility(trader, now) === 'eligible'; }
  function formatTraderTradeEligibility(trader, now = Date.now()) { const status = getTraderTradeEligibility(trader, now); if (status === 'eligible') return `Trade available · ${trader.activityText || 'recently active'}`; if (status === 'inactive') return `Unavailable for new Trade · ${trader.activityText || 'inactive'}`; return 'Trade availability unknown'; }
  function getTraderTradeEligibilityReason(trader, now = Date.now()) { const status = getTraderTradeEligibility(trader, now); if (status === 'eligible') return 'Trade available'; if (status === 'inactive') return 'Trader must have been online within the past 6 hours'; return 'Trader activity unknown'; }
  function normalizeTraderActivityFields(trader, capturedAt = trader?.capturedAt || Date.now()) { const activityText = normalizeBoundedText(trader?.activityText, 120); const lastSeenAt = getTraderLastSeenAt(activityText, capturedAt); const tradeEligibleUntil = getTraderTradeEligibleUntil({ lastSeenAt }); return applyPersonalRatingToTrader({ ...trader, activityText, activityCapturedAt: Number(capturedAt), lastSeenAt, tradeEligibleUntil, tradeEligibility: getTraderTradeEligibility({ lastSeenAt }) }); }
  function getTrustedTraderEligibility(trader, minimumTraderRating, now = Date.now()) { if (!trader || trader.rating < minimumTraderRating || !isTraderPersonallyAcceptable(trader)) return 'ineligible'; const activity = getTraderTradeEligibility(trader, now); return activity === 'eligible' ? 'eligible' : activity === 'inactive' ? 'ineligible' : 'unknown'; }
  function chooseBestEligibleTrustedTrader(traders, minimumTraderRating, now = Date.now()) { return traders.filter((trader) => { const accepted = getTrustedTraderEligibility(trader, minimumTraderRating, now) === 'eligible'; if (!accepted && trader.personalRatingState === 'negative') logDebug('Trader excluded from actionable selection.', trader.traderId); return accepted; }).reduce((best, trader) => !best || trader.buyPrice > best.buyPrice || (trader.buyPrice === best.buyPrice && trader.rating > best.rating) ? trader : best, null); }
  function getBestTrustedQuote(traders, minimumTraderRating) { return traders.filter((trader) => trader.rating >= minimumTraderRating).reduce((best, trader) => !best || trader.buyPrice > best.buyPrice || (trader.buyPrice === best.buyPrice && trader.rating > best.rating) ? trader : best, null); }
  function getNearestEligibilityExpiryFromTraders(traders, now = Date.now()) { return traders.map((trader) => Number(trader.tradeEligibleUntil)).filter((time) => Number.isFinite(time) && time > now).sort((a, b) => a - b)[0] || null; }

  function parseTraderOffers(rootDocument = document, baseUrl = location.href) {
    const tableInfos = Array.from(rootDocument.querySelectorAll('table')).map(getTableInfo); const info = tableInfos.find((candidate) => ['Trader', 'Buy Price', 'Rating', 'Actions'].every((header) => headerIndex(candidate.headers, header) !== -1));
    if (!info) { logDebug('trader-table-detected', { tableCount: tableInfos.length, headers: tableInfos.map((candidate) => candidate.headers) }); return []; }
    logDebug('trader-table-detected', { tableCount: tableInfos.length, headers: info.headers }); const indexes = { trader: headerIndex(info.headers, 'Trader'), buyPrice: headerIndex(info.headers, 'Buy Price'), rating: headerIndex(info.headers, 'Rating'), actions: headerIndex(info.headers, 'Actions') }; const rows = getRows(info.table); let rejected = 0;
    const parsed = rows.map((row) => {
      const traderCell = getCell(row, indexes.trader);
      const actionCell = getCell(row, indexes.actions);
      const traderLinks = Array.from(traderCell ? traderCell.querySelectorAll('a[href]') : []);
      const actionLinks = Array.from(actionCell ? actionCell.querySelectorAll('a[href]') : []); const allLinks = [...traderLinks, ...actionLinks];
      const priceListLink = allLinks.find((a) => /\/pricelist\/\d+(?:$|[?#/])/i.test(getUrlParts(a.getAttribute('href') || a.href, baseUrl)));
      const profileLink = allLinks.find((a) => /profiles\.php\?XID=\d+/i.test(absoluteUrl(a.getAttribute('href') || a.href, baseUrl) || ''));
      const buyPriceText = (getCell(row, indexes.buyPrice) || {}).textContent; const buyPriceExact = normalizeMoneyString(String(buyPriceText || '').replace(/[$,\s]/g, '')); const buyPrice = parseMoney(buyPriceText);
      const rating = parseRating((getCell(row, indexes.rating) || {}).textContent);
      const actionPriceListLink = actionLinks.find((a) => /price|list/i.test(a.textContent + a.href));
      const tradeNowLink = actionLinks.find((a) => /trade|now/i.test(a.textContent + a.href));
      const nameFallbackLink = traderLinks.find((a) => !/profiles\.php\?XID=\d+/i.test(a.href));
      const secureIds = new Set(); for (const link of allLinks) { const href = absoluteUrl(link.getAttribute('href') || link.href, baseUrl) || ''; const priceListId = href.match(/\/pricelist\/(\d+)(?:$|[?#/])/i)?.[1]; const profileId = href.match(/[?&]XID=(\d+)/i)?.[1]; const tradeId = href.match(/(?:[?#&])userID=(\d+)/i)?.[1]; for (const id of [priceListId, profileId, tradeId]) if (normalizePositiveInt(id)) secureIds.add(String(normalizePositiveInt(id))); }
      const traderText = normalizeBoundedText(traderCell?.textContent, 240); const traderNameLink = traderLinks.find((link) => /profiles\.php\?XID=\d+|\/pricelist\/\d+/i.test(absoluteUrl(link.getAttribute('href') || link.href, baseUrl) || '')) || nameFallbackLink; const traderName = normalizeBoundedText(String(traderNameLink?.textContent || traderText.split(/Active:/i)[0]).replace(/\s*\[\d+\]\s*$/, ''), 100); let reason = null; if (secureIds.size > 1) reason = 'conflicting-trader-identities'; else if (!secureIds.size) reason = 'missing-secure-trader-identity'; else if (!traderName) reason = 'missing-trader-name'; else if (!buyPriceExact || !buyPrice || buyPrice <= 0) reason = 'invalid-buy-price'; else if (rating == null) reason = 'invalid-rating'; if (reason) { rejected += 1; logDebug('trader-row-rejected', { traderCandidate: traderName || traderText.slice(0, 100), reason }); return null; }
      const capturedAt = Date.now();
      return normalizeTraderActivityFields({ traderName, traderId: Array.from(secureIds)[0], buyPrice, buyPriceExact, rating, priceListUrl: absoluteUrl((priceListLink || actionPriceListLink || {}).getAttribute?.('href') || (priceListLink || actionPriceListLink || {}).href, baseUrl), tradeNowUrl: absoluteUrl((tradeNowLink || {}).getAttribute?.('href') || (tradeNowLink || {}).href, baseUrl), activityText: extractTraderActivityText(traderCell), capturedAt, row }, capturedAt);
    }).filter(Boolean); logDebug('trader-rows-parsed', { rawRowCount: rows.length, validRowCount: parsed.length, rejectedRowCount: rejected }); return parsed;
  }

  function normalizeTraderQuoteRecord(raw) {
    const traderId = normalizePositiveInt(raw?.traderId); const itemId = normalizePositiveInt(raw?.itemId); const price = normalizeMoneyString(raw?.price); const traderName = normalizeBoundedText(raw?.traderName, 100); const pricingRule = normalizeBoundedText(raw?.pricingRule, 80); const conditionFingerprint = normalizeBoundedText(raw?.conditionFingerprint, 160); const observedAt = Number(raw?.observedAt); const lastSeenAt = Number(raw?.lastSeenAt); const observationCount = normalizePositiveInt(raw?.observationCount);
    if (!traderId || !itemId || !price || BigInt(price) <= 0n || !traderName || !pricingRule || !conditionFingerprint || !Number.isFinite(observedAt) || observedAt <= 0 || !Number.isFinite(lastSeenAt) || lastSeenAt < observedAt || !observationCount || raw?.source !== 'weav3r') return null;
    const rating = parseRating(raw.traderRatingAtObservation); const activityLastSeenAt = Number(raw.traderActivityLastSeenAt); return { version: 1, traderId, traderName, itemId, price, pricingRule, conditionFingerprint, observedAt, lastSeenAt, observationCount, source: 'weav3r', traderRatingAtObservation: rating, traderActivityTextAtObservation: normalizeBoundedText(raw.traderActivityTextAtObservation, 120), traderActivityLastSeenAt: Number.isFinite(activityLastSeenAt) && activityLastSeenAt > 0 ? activityLastSeenAt : null };
  }
  function traderQuoteRejectionReason(raw) { if (!normalizePositiveInt(raw?.traderId)) return 'invalid-trader-id'; if (!normalizePositiveInt(raw?.itemId)) return 'invalid-item-id'; if (!normalizeMoneyString(raw?.price)) return 'invalid-price'; if (!normalizeBoundedText(raw?.traderName, 100)) return 'missing-trader-name'; if (!normalizeBoundedText(raw?.pricingRule, 80)) return 'missing-pricing-rule'; if (!normalizeBoundedText(raw?.conditionFingerprint, 160)) return 'missing-condition-fingerprint'; if (raw?.source !== 'weav3r') return 'invalid-source'; return 'invalid-schema-fields'; }
  function traderQuoteRecordKey(record) { return `q:${record.traderId}:${record.itemId}:${record.conditionFingerprint}:${record.price}`; }
  function normalizeTraderQuoteCollection(raw) { const records = {}; if (raw?.version === 1 && raw.records && typeof raw.records === 'object') Object.values(raw.records).forEach((value) => { const record = normalizeTraderQuoteRecord(value); if (record) records[traderQuoteRecordKey(record)] = record; }); return { version: 1, records }; }
  function readTraderQuotes() { return normalizeTraderQuoteCollection(gmGet(TRADER_QUOTES_KEY, { version: 1, records: {} })); }
  function observeTraderQuote(raw, now = Date.now()) {
    const candidateInput = { ...raw, version: 1, observedAt: Number(raw?.observedAt) || now, lastSeenAt: now, observationCount: 1, source: 'weav3r' }; const candidate = normalizeTraderQuoteRecord(candidateInput); if (!candidate) { logDebug('quote-rejected', { traderId: raw?.traderId || null, itemId: raw?.itemId || null, reason: traderQuoteRejectionReason(candidateInput) }); return null; } logDebug('quote-normalized', { traderId: candidate.traderId, traderName: candidate.traderName, itemId: candidate.itemId, price: candidate.price, conditionFingerprint: candidate.conditionFingerprint, source: candidate.source }); const key = traderQuoteRecordKey(candidate); const collection = readTraderQuotes(); const existing = collection.records[key]; const record = existing ? normalizeTraderQuoteRecord({ ...existing, traderName: candidate.traderName, lastSeenAt: Math.max(existing.lastSeenAt, now), observationCount: existing.observationCount + 1, traderRatingAtObservation: candidate.traderRatingAtObservation, traderActivityTextAtObservation: candidate.traderActivityTextAtObservation, traderActivityLastSeenAt: candidate.traderActivityLastSeenAt }) : candidate; const result = mergeCriticalRecord(TRADER_QUOTES_KEY, { version: 1, records: {} }, key, record, normalizeTraderQuoteCollection); if (!result.ok) { logDebug('quote-rejected', { traderId: candidate.traderId, itemId: candidate.itemId, reason: 'durable-store-write-failed' }); return null; } const stored = result.collection.records[key]; logDebug(existing ? 'quote-deduplicated' : 'quote-persisted', existing ? { itemId: stored.itemId, traderId: stored.traderId, lastSeenAt: stored.lastSeenAt, observationCount: stored.observationCount } : { quoteKey: key, itemId: stored.itemId, traderId: stored.traderId, price: stored.price }); logDebug('trader-quote-store-write', { totalRecordCount: Object.keys(result.collection.records).length, itemRecordCount: Object.values(result.collection.records).filter((entry) => entry.itemId === stored.itemId).length, itemId: stored.itemId }); return stored;
  }
  function persistObservedTraderQuotes(itemId, traders, sourceUrl, observedAt = Date.now()) {
    logDebug('persistObservedTraderQuotes-called', { itemId, quoteCandidateCount: traders?.length || 0 }); let parsedUrl; try { parsedUrl = new URL(sourceUrl, location.href); } catch (_) { logDebug('quote-rejected', { itemId, reason: 'invalid-source-url' }); return 0; } if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'weav3r.dev') { logDebug('quote-rejected', { itemId, reason: 'untrusted-source-url' }); return 0; } let saved = 0;
    for (const trader of traders || []) { const record = observeTraderQuote({ traderId: trader.traderId, traderName: trader.traderName, itemId, price: trader.buyPriceExact, pricingRule: TRADER_QUOTE_PRICING_RULE, conditionFingerprint: TRADER_QUOTE_CONDITION_FINGERPRINT, observedAt, traderRatingAtObservation: trader.rating, traderActivityTextAtObservation: trader.activityText, traderActivityLastSeenAt: trader.lastSeenAt }, observedAt); if (record) saved += 1; }
    if (saved) logDebug('persistent Trader quotes observed.', { itemId, saved }); return saved;
  }
  function debugStoredTraderQuotes(itemId) { const normalizedItemId = normalizePositiveInt(itemId); const quotes = Object.values(readTraderQuotes().records).filter((quote) => quote.itemId === normalizedItemId).sort((left, right) => right.lastSeenAt - left.lastSeenAt); const result = { itemId: normalizedItemId, count: quotes.length, traderIds: [...new Set(quotes.map((quote) => quote.traderId))], quotes: quotes.map((quote) => ({ traderId: quote.traderId, price: quote.price, observedAt: quote.observedAt, lastSeenAt: quote.lastSeenAt, conditionFingerprint: quote.conditionFingerprint, source: quote.source })) }; logDebug(`stored quotes for item ${normalizedItemId}`, result); return result; }
  function normalizeBazaarQuoteRecord(raw) { const itemId = normalizePositiveInt(raw?.itemId); const marketPrice = normalizeMoneyString(raw?.marketPrice); const offers = normalizeBazaarPriceOffers(raw?.offers).slice(0, 4); const observedAt = Number(raw?.observedAt); const lastSeenAt = Number(raw?.lastSeenAt); const observationCount = normalizePositiveInt(raw?.observationCount); const source = normalizeBoundedText(raw?.source, 80); if (!itemId || !marketPrice || BigInt(marketPrice) <= 0n || !offers.length || offers[0].price !== marketPrice || !Number.isFinite(observedAt) || observedAt <= 0 || !Number.isFinite(lastSeenAt) || lastSeenAt < observedAt || !observationCount || source !== 'marketplaceDetail') return null; return { version: 1, itemId, marketPrice, offers, observedAt, lastSeenAt, observationCount, source, safety: 'safe' }; }
  function normalizeBazaarQuoteCollection(raw) { const records = {}; if (raw?.version === 1 && raw.records && typeof raw.records === 'object') Object.values(raw.records).forEach((value) => { const record = normalizeBazaarQuoteRecord(value); if (record) records[String(record.itemId)] = record; }); return { version: 1, records }; }
  function readBazaarQuotes() { return normalizeBazaarQuoteCollection(gmGet(BAZAAR_QUOTES_KEY, { version: 1, records: {} })); }
  function indexBazaarQuotes(collection = readBazaarQuotes()) { return new Map(Object.values(collection.records || {}).map((record) => [record.itemId, record])); }
  function observeSafeBazaarQuote(result, now = Date.now()) { if (result?.status !== 'available' || result?.source !== 'marketplaceDetail') { logDebug('bazaar-quote-rejected', { itemId: result?.itemId || null, reason: result?.status === 'unsafe' ? 'unsafe-observation' : 'not-safe-marketplace-result' }); return null; } const candidate = normalizeBazaarQuoteRecord({ itemId: result.itemId, marketPrice: result.marketUnitPrice, offers: result.offers, observedAt: now, lastSeenAt: now, observationCount: 1, source: result.source }); if (!candidate) { logDebug('bazaar-quote-rejected', { itemId: result?.itemId || null, reason: 'invalid-observation' }); return null; } const collection = readBazaarQuotes(); const existing = collection.records[String(candidate.itemId)]; const samePrice = existing?.marketPrice === candidate.marketPrice; const record = normalizeBazaarQuoteRecord({ ...candidate, observedAt: samePrice ? existing.observedAt : now, lastSeenAt: now, observationCount: samePrice ? existing.observationCount + 1 : 1 }); collection.records[String(candidate.itemId)] = record; const write = gmSetDurable(BAZAAR_QUOTES_KEY, collection, (stored) => normalizeBazaarQuoteCollection(stored).records[String(candidate.itemId)]?.lastSeenAt === now); if (!write.ok) return null; logDebug(samePrice ? 'bazaar-quote-deduplicated' : 'bazaar-quote-persisted', { itemId: record.itemId, marketPrice: record.marketPrice, observationCount: record.observationCount, lastSeenAt: record.lastSeenAt }); return record; }
  function resolveStoredBazaarSortValuation(quote, currentQuantity, adjustment, now = Date.now()) { const record = normalizeBazaarQuoteRecord(quote); const quantity = normalizePositiveInt(currentQuantity); if (!record || !quantity) return { status: 'unavailable', origin: 'stored', freshness: 'unavailable', recommendedUnitPrice: null, recommendedTotal: null }; const resolved = resolveBazaarRecommendedPrice(record.itemId, { offers: record.offers, adjustment, source: record.source, fetchedAt: record.lastSeenAt }); if (resolved.status !== 'available') return { ...resolved, status: 'unavailable', origin: 'stored', freshness: 'unavailable', quantity, recommendedUnitPrice: null, recommendedTotal: null }; return { ...buildInventoryBazaarValuation(resolved, quantity), status: 'sort-available', origin: 'stored', freshness: now - record.lastSeenAt <= BAZAAR_QUOTE_RECENT_MS ? 'stored-recent' : 'stored-stale', observedAt: record.observedAt, lastSeenAt: record.lastSeenAt }; }
  function resolveWeav3rItemRouteId(rawUrl = location.href) { let parsed; try { parsed = new URL(rawUrl, location.href); } catch (_) { return null; } if (parsed.protocol !== 'https:' || parsed.hostname !== 'weav3r.dev') return null; const match = parsed.pathname.match(/^\/item\/(\d+)(?:\/|$)/); return match ? normalizePositiveInt(match[1]) : null; }
  function captureVisibleWeav3rTraderQuotes(now = Date.now()) {
    const itemId = resolveWeav3rItemRouteId(location.href); logDebug('visible-weav3r-route', { href: location.href, itemId }); if (!itemId) return { status: 'ignored', itemId: null, parsed: 0, saved: 0 }; const traders = parseTraderOffers(document, location.href); if (!traders.length) return { status: 'waiting', itemId, parsed: 0, saved: 0 }; const saved = persistObservedTraderQuotes(itemId, traders, location.href, now); const stored = debugStoredTraderQuotes(itemId); return { status: saved ? 'persisted' : 'rejected', itemId, parsed: traders.length, saved, stored: stored.count };
  }
  function scheduleVisibleTraderQuoteCapture() { clearTimeout(state.manualTraderCaptureTimer); state.manualTraderCaptureTimer = setTimeout(() => { state.manualTraderCaptureTimer = 0; captureVisibleWeav3rTraderQuotes(); }, RECHECK_DELAY_MS); }

  function filterTraderRows(traders, minimumTraderRating) { traders.forEach((trader) => { if (trader.row) { trader.row.classList.toggle(HIDDEN_ROW_CLASS, trader.rating < minimumTraderRating); trader.row.classList.remove(BEST_ROW_CLASS); } }); }
  function parseTornItemMarketUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'www.torn.com' || url.pathname !== '/page.php' || url.searchParams.get('sid') !== 'ItemMarket') return null;
      const hash = url.hash.replace(/^#/, '');
      const separator = hash.indexOf('&');
      const route = separator === -1 ? hash : hash.slice(0, separator);
      if (route !== '/market/view=search') return null;
      const hashParams = new URLSearchParams(separator === -1 ? '' : hash.slice(separator + 1));
      const rawItemId = hashParams.get('itemID');
      if (!rawItemId || !/^\d+$/.test(rawItemId)) return null;
      const itemId = normalizePositiveInt(rawItemId);
      return itemId ? { itemId, url: url.href } : null;
    } catch (_) { return null; }
  }
  function buildTornItemMarketUrl(itemId) { const id = normalizePositiveInt(itemId); return id ? `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${id}` : ''; }
  function normalizeConcreteMarketUrl(source, href, itemId) {
    try {
      if (source === 'item-market') { const parsed = parseTornItemMarketUrl(href); return parsed?.itemId === normalizePositiveInt(itemId) ? parsed.url : ''; }
      const url = new URL(href);
      return source === 'bazaar' && url.protocol === 'https:' && url.hostname === 'www.torn.com' && url.pathname === '/bazaar.php' ? url.href : '';
    } catch (_) { return ''; }
  }
  function normalizeConcreteOffer(offer, itemId, sourceCapturedAt = null) {
    const source = offer?.sourceType === 'bazaar' ? 'bazaar' : offer?.sourceType === 'itemMarket' ? 'item-market' : null;
    const unitPrice = Number(offer?.price);
    const normalizedItemId = normalizePositiveInt(itemId);
    const url = source ? normalizeConcreteMarketUrl(source, source === 'bazaar' ? offer.sellerUrl : offer.offerUrl, normalizedItemId) : '';
    if (!source || !normalizedItemId || !Number.isSafeInteger(unitPrice) || unitPrice <= 0 || !url) return null;
    const normalized = { source, itemId: normalizedItemId, unitPrice, url, observedAt: Number(offer.capturedAt) || Number(sourceCapturedAt) || 0 };
    const sellerId = normalizePositiveInt(offer.sellerId);
    const quantity = normalizePositiveInt(offer.quantity);
    if (sellerId) normalized.sellerId = sellerId;
    if (quantity) normalized.quantity = quantity;
    if (offer.offerId != null && normalizeBoundedText(offer.offerId, 100)) normalized.offerId = normalizeBoundedText(offer.offerId, 100);
    return normalized;
  }
  function resolveCheapestConcreteOffer(result) {
    const itemId = normalizePositiveInt(result?.itemId);
    const candidates = (result?.bazaarOffers || []).map((offer) => normalizeConcreteOffer(offer, itemId, result.bazaarCapturedAt)).concat((result?.itemMarketOffers || []).map((offer) => normalizeConcreteOffer(offer, itemId, result.itemMarketCapturedAt))).filter(Boolean);
    candidates.forEach((offer) => logDebug(`${offer.source === 'bazaar' ? 'Bazaar' : 'Item Market'} offer candidate.`, offer));
    const selected = candidates.sort((a, b) => a.unitPrice !== b.unitPrice ? (BigInt(a.unitPrice) < BigInt(b.unitPrice) ? -1 : 1) : b.observedAt - a.observedAt || a.source.localeCompare(b.source) || a.url.localeCompare(b.url))[0] || null;
    logDebug(selected ? 'selected concrete offer.' : 'no current concrete offer.', selected);
    return selected;
  }
  function resolveCurrentMarketOfferCandidates(itemId, result = null) {
    const id = normalizePositiveInt(itemId);
    if (!id) return [];
    const data = loadCachedItemData(id);
    const candidates = [];
    const add = (offer) => {
      if (!offer || offer.itemId !== id || !Number.isSafeInteger(Number(offer.unitPrice)) || Number(offer.unitPrice) <= 0) return;
      const key = `${offer.source}:${offer.unitPrice}:${offer.url || ''}`;
      if (!candidates.some((candidate) => candidate.key === key)) candidates.push({ ...offer, key });
    };
    (data.bazaar?.offers || []).forEach((offer) => add(normalizeConcreteOffer(offer, id, data.bazaar.capturedAt) || { source: 'bazaar', itemId: id, unitPrice: Number(offer.price), url: '', observedAt: Number(offer.capturedAt) || Number(data.bazaar.capturedAt) || 0 }));
    (data.itemMarket?.offers || []).forEach((offer) => add(normalizeConcreteOffer({ ...offer, offerUrl: offer.offerUrl || buildTornItemMarketUrl(id) }, id, data.itemMarket.capturedAt)));
    add(result?.concreteOffer);
    return candidates.sort((a, b) => a.unitPrice !== b.unitPrice ? (BigInt(a.unitPrice) < BigInt(b.unitPrice) ? -1 : 1) : b.observedAt - a.observedAt || Number(Boolean(b.url)) - Number(Boolean(a.url)) || a.source.localeCompare(b.source) || a.url.localeCompare(b.url));
  }
  function resolveCurrentMarketOffer(itemId, result = null) { const candidate = resolveCurrentMarketOfferCandidates(itemId, result)[0] || null; return candidate ? (({ key, ...offer }) => offer)(candidate) : null; }
  function concreteOfferAsPurchase(offer) { return offer ? { source: offer.source === 'bazaar' ? 'Bazaar' : 'Item Market', sourceType: offer.source === 'bazaar' ? 'bazaar' : 'itemMarket', price: offer.unitPrice, sellerId: offer.sellerId || null, sellerUrl: offer.url, offerUrl: offer.url, quantity: offer.quantity || null, capturedAt: offer.observedAt } : null; }
  function getLowestPurchaseOffer(bazaarOffers, itemMarketOffers) { return bazaarOffers.concat(itemMarketOffers).reduce((best, offer) => (!best || offer.price < best.price ? offer : best), null); }
  function getBestTrustedTrader(traders, minimumTraderRating) { return chooseBestEligibleTrustedTrader(traders, minimumTraderRating); }

  function getFreshSourceData(data, sourceType) { const entry = data[sourceType]; return isSourceCacheFresh(entry, sourceType) ? entry : null; }
  function calculateArbitrage(data, settings, options = {}) {
    const sourceStatus = ['bazaar', 'itemMarket', 'traders'].map((source) => {
      const entry = data[source];
      if (!isCompatibleSourceEntry(entry, source)) return { source, state: 'missing' };
      return { source, state: isSourceCacheFresh(entry, source) ? 'fresh' : 'stale' };
    });
    const stale = sourceStatus.filter((item) => item.state === 'stale');
    const missing = sourceStatus.filter((item) => item.state === 'missing');
    const freshBazaar = getFreshSourceData(data, 'bazaar');
    const freshItemMarket = getFreshSourceData(data, 'itemMarket');
    const freshTraders = getFreshSourceData(data, 'traders');
    const bazaarOffers = isCompatibleSourceEntry(data.bazaar, 'bazaar') ? data.bazaar.offers : [];
    const itemMarketOffers = isCompatibleSourceEntry(data.itemMarket, 'itemMarket') ? data.itemMarket.offers : [];
    const traders = freshTraders ? freshTraders.traders.map((trader) => normalizeTraderActivityFields(trader, trader.activityCapturedAt || trader.capturedAt || freshTraders.capturedAt)) : [];
    const concreteOffer = resolveCheapestConcreteOffer({ itemId: data.bazaar?.itemId || data.itemMarket?.itemId, bazaarOffers, itemMarketOffers, bazaarCapturedAt: data.bazaar?.capturedAt, itemMarketCapturedAt: data.itemMarket?.capturedAt });
    const lowestPurchase = concreteOfferAsPurchase(concreteOffer) || getLowestPurchaseOffer(bazaarOffers, itemMarketOffers);
    const trustedTrader = getBestTrustedQuote(traders, settings.minimumTraderRating);
    const activeTrustedTrader = traders.filter((trader) => trader.rating >= settings.minimumTraderRating && isTraderTradeEligible(trader)).reduce((best, trader) => !best || trader.buyPrice > best.buyPrice || (trader.buyPrice === best.buyPrice && trader.rating > best.rating) ? trader : best, null);
    const bestTrader = chooseBestEligibleTrustedTrader(traders, settings.minimumTraderRating);
    const messages = [];
    if (missing.length) messages.push(`Missing: ${missing.map((item) => prettySourceName(item.source)).join(', ')}`);
    if (stale.length) messages.push(`Stale: ${stale.map((item) => prettySourceName(item.source)).join(', ')}`);
    if (options.failedSources?.length) messages.push(`Failed to auto-load: ${options.failedSources.map(prettySourceName).join(', ')}`);
    if ((bazaarOffers.length && !itemMarketOffers.length) || (!bazaarOffers.length && itemMarketOffers.length)) messages.push('Only one purchase source available');
    if (options.checking && (missing.length || stale.length)) return { status: 'CHECKING PRICES...', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, messages: messages.concat(options.progressMessages || []), sourceStatus };
    if (!lowestPurchase) return { status: 'DATA MISSING', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, messages, sourceStatus };
    if (!freshTraders) return { status: stale.some((item) => item.source === 'traders') ? 'DATA STALE' : 'DATA MISSING', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, messages, sourceStatus };
    if (!trustedTrader) return { status: 'NO TRUSTED TRADER', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, messages, sourceStatus };
    if (!activeTrustedTrader) { messages.push(getTraderTradeEligibilityReason(trustedTrader)); return { status: 'NO ELIGIBLE TRADER', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, messages, sourceStatus }; }
    if (!bestTrader) { messages.push('All otherwise eligible Traders were excluded because you rated them negatively.'); return { status: 'NO ACCEPTABLE TRADER', lowestPurchase, concreteOffer, bestTrader, referenceTrader: activeTrustedTrader, messages, sourceStatus }; }
    const usedStale = stale.filter((item) => item.source === 'traders' || (lowestPurchase.sourceType && item.source === lowestPurchase.sourceType));
    if (usedStale.length) return { status: 'DATA STALE', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, messages, sourceStatus };
    const profitPerItem = bestTrader.buyPrice - lowestPurchase.price;
    const profitPercentage = calculateProfitPercentage(profitPerItem, lowestPurchase.price);
    const absoluteMet = profitPerItem >= settings.minimumProfitPerItem;
    const relativeMet = profitPercentage != null && profitPercentage >= settings.minimumRelativeProfitPercent;
    if (!absoluteMet && !relativeMet) messages.push('Both targets not met');
    else if (!absoluteMet) messages.push('Absolute target not met');
    else if (!relativeMet) messages.push('Relative target not met');
    return { status: absoluteMet && relativeMet ? 'BUY & SELL' : 'NOT WORTH IT', lowestPurchase, concreteOffer, bestTrader, referenceTrader: trustedTrader, profitPerItem, profitPercentage, absoluteMet, relativeMet, messages, sourceStatus };
  }

  function storageKey(itemId, source) { return `weav3rArbitrage:item:${itemId}:${source}`; }
  function isCompatibleSourceEntry(entry, sourceType) { if (!entry || typeof entry !== 'object' || !Number.isFinite(Number(entry.capturedAt))) return false; if (sourceType === 'traders') return Array.isArray(entry.traders); return Array.isArray(entry.offers); }
  function isSourceCacheFresh(sourceData, sourceType) { return isCompatibleSourceEntry(sourceData, sourceType) && Date.now() - Number(sourceData.capturedAt) <= getSourceCacheDuration(sourceType); }
  function loadCachedSourceData(itemId, sourceType) { const entry = gmGet(storageKey(itemId, sourceType), null); return isCompatibleSourceEntry(entry, sourceType) ? entry : null; }
  function loadCachedItemData(itemId) { if (!itemId) return emptyCachedData(); return { bazaar: loadCachedSourceData(itemId, 'bazaar'), itemMarket: loadCachedSourceData(itemId, 'itemMarket'), traders: loadCachedSourceData(itemId, 'traders') }; }
  function stripRows(value) { return JSON.parse(JSON.stringify(value, (key, val) => key === 'row' ? undefined : val)); }
  function saveCachedSourceData(itemId, source, parsedKey, parsedData, sourceUrl = location.href, extra = {}) { if (!itemId || !parsedData?.length) return null; const entry = { itemId: Number(itemId), [parsedKey]: stripRows(parsedData), capturedAt: Date.now(), sourceUrl, ...extra }; gmSet(storageKey(itemId, source), entry); if (source === 'traders' && parsedKey === 'traders') persistObservedTraderQuotes(itemId, entry.traders, sourceUrl, entry.capturedAt); return entry; }
  function prettySourceName(source) { return ({ bazaar: 'Bazaar', itemMarket: 'Item Market', traders: 'Traders', marketplaceBatch: 'Marketplace API' })[source] || source; }
  function formatMoney(value, signed = false) { if (value == null || !Number.isFinite(Number(value))) return '—'; const amount = Math.round(Number(value)); const prefix = amount < 0 ? '-$' : signed && amount > 0 ? '+$' : '$'; return `${prefix}${Math.abs(amount).toLocaleString('en-US')}`; }
  function calculateProfitPercentage(profitPerItem, lowestPurchasePrice) { if (!Number.isFinite(Number(profitPerItem)) || !Number.isFinite(Number(lowestPurchasePrice)) || Number(lowestPurchasePrice) <= 0) return null; return (Number(profitPerItem) / Number(lowestPurchasePrice)) * 100; }
  function formatProfitPercentage(value) { if (value == null || !Number.isFinite(Number(value))) return '—'; const amount = Number(value); const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''; return `${sign}${Math.abs(amount).toFixed(2)}%`; }
  function isMeaningfulCalculatedProfit(result) { return result && Number.isFinite(Number(result.profitPerItem)) && Number.isFinite(Number(result.profitPercentage)); }
  function formatProfitPair(result) { return isMeaningfulCalculatedProfit(result) ? `${formatMoney(result.profitPerItem, true)} · ${formatProfitPercentage(result.profitPercentage)}` : '—'; }
  function formatAge(entry) { if (!entry) return 'not loaded'; const seconds = Math.max(0, Math.round((Date.now() - Number(entry.capturedAt)) / 1000)); return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`; }
  function getSourceAgeState(entry, sourceType) {
    if (!entry) return 'stale';
    const age = Date.now() - Number(entry.capturedAt);
    const duration = getSourceCacheDuration(sourceType);
    if (age >= duration) return 'stale';
    if (age >= duration * 0.75) return 'warning';
    return 'fresh';
  }
  function renderSourceAges(data) {
    return ['bazaar', 'itemMarket', 'traders'].map((sourceType) => {
      const entry = data[sourceType];
      return `<span class="wah-age-${getSourceAgeState(entry, sourceType)}">${prettySourceName(sourceType)} ${formatAge(entry)}</span>`;
    }).join('');
  }

  const emptyTradeProgress = () => ({ descriptionAppliedAt: null, descriptionSkippedAt: null, initiateButtonEnabledAt: null, tradeIdCapturedAt: null, addStepEnteredAt: null, itemFilterAppliedAt: null, itemFilterDismissedAt: null, itemNotFoundAt: null, completedAt: null, itemFilterMode: 'target-only' });
  const tornState = { observer: null, timeoutId: 0, routeGeneration: 0, notificationTimer: 0, inventoryObserver: null, inventoryRouteKey: '', inventoryDiscoveryController: null, filterButton: null, managedInitiate: null, verificationObserver: null, verificationBootstrapObserver: null, verificationRouteKey: '', verificationRenderTimer: 0, verificationStorageListenerId: null, tradeListenersAttached: false, pricelistObserver: null, pricelistRetryTimers: [], purchaseObservers: new Map(), purchaseBindings: new Map(), bazaarMenuPreStages: new WeakMap(), bazaarStages: new Map(), bazaarStageByItem: new WeakMap(), bazaarRoot: null, bazaarRootListener: null, bazaarBootstrapObserver: null, purchaseListenersAttached: false, purchaseContextId: '', itemMarketAttempts: new Map(), itemMarketResultObservers: new Map(), itemMarketRoot: null, itemMarketClickListener: null, itemMarketObserver: null, itemMarketLifecycleAttached: false, itemMarketRouteKey: '', bazaarAdd: { observer: null, lifecycleObserver: null, lifecycleListenersAttached: false, root: null, timer: 0, statusTimer: 0, stylesAdded: false, listenersAttached: false, rows: [], rowFeedback: new Map(), runtimeRowKeys: new WeakMap(), nextRuntimeRowKey: 1, groups: [], priceRequests: new Map(), fillRequests: new Map(), bulkPriceOperation: null, priceRequestQueue: [], activePriceRequests: 0, settings: { ...DEFAULT_BAZAAR_ADD_SETTINGS }, rules: { version: 1, rules: {} } } };
  function nowMs() { return Date.now(); }
  function makeHandoffId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
  function normalizePositiveInt(value) { const number = Number.parseInt(value, 10); return Number.isInteger(number) && number > 0 ? number : null; }
  function normalizeNonNegativeInt(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? Math.round(number) : null; }
  function normalizeBoundedText(value, maxLength) { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text ? text.slice(0, maxLength) : ''; }
  function normalizeMoneyString(value, allowZero = false) {
    const text = typeof value === 'bigint' ? value.toString() : String(value ?? '').trim();
    if (!/^(?:0|[1-9]\d*)$/.test(text)) return null;
    try { const amount = BigInt(text); return amount > 0n || (allowZero && amount === 0n) ? amount.toString() : null; } catch (_) { return null; }
  }
  function getConfirmedTransactionId(transaction) {
    if (transaction?.type === 'sell' && transaction?.source === 'trade' && normalizePositiveInt(transaction.tradeId) && normalizePositiveInt(transaction.itemId)) return `sell:trade:${normalizePositiveInt(transaction.tradeId)}:item:${normalizePositiveInt(transaction.itemId)}`;
    return normalizeBoundedText(transaction?.id, 180) || null;
  }
  function normalizeConfirmedTransaction(raw) {
    if (!raw || typeof raw !== 'object' || raw.confidence !== 'confirmed' || !['trade-completion', 'bazaar-purchase-confirmation', 'item-market-purchase-confirmation'].includes(raw.confirmationMethod)) return null;
    const type = ['buy', 'sell'].includes(raw.type) ? raw.type : null;
    const source = ['bazaar', 'item-market', 'trade'].includes(raw.source) ? raw.source : null;
    const itemId = normalizePositiveInt(raw.itemId);
    const itemName = normalizeBoundedText(raw.itemName, 150);
    const quantity = normalizePositiveInt(raw.quantity);
    const totalPrice = normalizeMoneyString(raw.totalPrice);
    const confirmedAt = Number(raw.confirmedAt);
    const id = getConfirmedTransactionId(raw);
    if (!id || !type || !source || !itemId || !itemName || !quantity || !totalPrice || !Number.isFinite(confirmedAt) || confirmedAt <= 0) return null;
    const total = BigInt(totalPrice);
    const computedUnit = total % BigInt(quantity) === 0n ? (total / BigInt(quantity)).toString() : null;
    const suppliedUnit = raw.unitPrice == null ? null : normalizeMoneyString(raw.unitPrice);
    if (suppliedUnit != null && suppliedUnit !== computedUnit) return null;
    const origin = ['watchlist', 'item-page', 'direct-bazaar', 'direct-item-market', 'trader-trade', 'weav3r-native-click', 'unknown'].includes(raw.origin) ? raw.origin : null;
    const transaction = { id, schemaVersion: 1, type, itemId, itemName, quantity, unitPrice: computedUnit, totalPrice, source, confirmedAt, confirmationMethod: raw.confirmationMethod, confidence: 'confirmed', createdAt: Number(raw.createdAt) > 0 ? Number(raw.createdAt) : confirmedAt };
    const counterpartyId = normalizePositiveInt(raw.counterpartyId);
    const counterpartyName = normalizeBoundedText(raw.counterpartyName, 100);
    const tradeId = normalizePositiveInt(raw.tradeId);
    const expectedUnitPrice = normalizeMoneyString(raw.expectedUnitPrice);
    const expectedTotalPrice = normalizeMoneyString(raw.expectedTotalPrice);
    const correlationId = normalizeBoundedText(raw.correlationId, 120);
    const marketQuoteUnitPrice = normalizeMoneyString(raw.marketQuoteUnitPrice);
    if (counterpartyId) transaction.counterpartyId = counterpartyId;
    if (origin) transaction.origin = origin;
    if (counterpartyName) transaction.counterpartyName = counterpartyName;
    if (tradeId) transaction.tradeId = tradeId;
    if (expectedUnitPrice) transaction.expectedUnitPrice = expectedUnitPrice;
    if (expectedTotalPrice) transaction.expectedTotalPrice = expectedTotalPrice;
    if (marketQuoteUnitPrice) transaction.marketQuoteUnitPrice = marketQuoteUnitPrice;
    if (correlationId) transaction.correlationId = correlationId;
    return transaction;
  }
  function normalizeTransactionLedger(raw) { const transactions = {}; if (raw?.version === 1 && raw.transactions && typeof raw.transactions === 'object') Object.values(raw.transactions).forEach((value) => { const transaction = normalizeConfirmedTransaction(value); if (transaction) transactions[transaction.id] = transaction; }); return { version: 1, transactions }; }
  function diagnoseTransactionLedger(raw) { const values = raw?.version === 1 && raw.transactions && typeof raw.transactions === 'object' ? Object.values(raw.transactions) : []; const transactions = values.map(normalizeConfirmedTransaction).filter(Boolean); return { ledger: { version: 1, transactions: Object.fromEntries(transactions.map((transaction) => [transaction.id, transaction])) }, rawCount: values.length, validCount: transactions.length, rejectedCount: values.length - transactions.length }; }
  const transactionStoreCache = { revision: null, events: null, recordCount: 0, rejectedCount: 0 };
  function transactionEventStorageKey(id) { const value = normalizeBoundedText(id, 240); return value && /^[A-Za-z0-9:_-]+$/.test(value) ? `${TRANSACTION_EVENT_PREFIX}${encodeURIComponent(value)}` : ''; }
  function transactionEventIdFromStorageKey(key) { if (!String(key).startsWith(TRANSACTION_EVENT_PREFIX)) return ''; try { return decodeURIComponent(String(key).slice(TRANSACTION_EVENT_PREFIX.length)); } catch (_) { return ''; } }
  function listStoredTransactionEventKeys() { return (typeof GM_listValues === 'function' ? GM_listValues() : []).filter((key) => String(key).startsWith(TRANSACTION_EVENT_PREFIX)); }
  function normalizeTransactionEventV2(raw) {
    if (!raw || raw.schemaVersion !== 2 || raw.confidence !== 'confirmed') return null;
    const id = normalizeBoundedText(raw.id, 240); const source = ['bazaar', 'item-market', 'trade'].includes(raw.source) ? raw.source : null; const transactionType = ['buy', 'sell', 'mixed'].includes(raw.transactionType) ? raw.transactionType : null; const confirmedAt = Number(raw.confirmedAt); const createdAt = Number(raw.createdAt); const confirmationMethod = normalizeBoundedText(raw.confirmation?.method, 100); const cashAmount = normalizeMoneyString(raw.cash?.amount); const cashDirection = ['in', 'out'].includes(raw.cash?.direction) ? raw.cash.direction : null;
    if (!id || !transactionEventStorageKey(id) || !source || !transactionType || !Number.isFinite(confirmedAt) || confirmedAt <= 0 || !Number.isFinite(createdAt) || createdAt <= 0 || !confirmationMethod || !cashAmount || !cashDirection || !Array.isArray(raw.itemLines) || !raw.itemLines.length) return null;
    const itemLines = raw.itemLines.map((line, index) => { const itemId = normalizePositiveInt(line?.itemId); const itemName = normalizeBoundedText(line?.itemName, 150); const quantity = normalizePositiveInt(line?.quantity); const direction = ['in', 'out'].includes(line?.direction) ? line.direction : null; const totalPrice = line?.totalPrice == null ? null : normalizeMoneyString(line.totalPrice); const unitPrice = line?.unitPrice == null ? null : normalizeMoneyString(line.unitPrice); const lineId = normalizeBoundedText(line?.lineId, 240) || `${id}:line:${index + 1}`; return itemId && itemName && quantity && direction && (!line.totalPrice || totalPrice) && (!line.unitPrice || unitPrice) ? { lineId, direction, itemId, itemName, quantity, totalPrice, unitPrice } : null; });
    if (itemLines.some((line) => !line) || (transactionType === 'buy' && (cashDirection !== 'out' || itemLines.some((line) => line.direction !== 'in'))) || (transactionType === 'sell' && (cashDirection !== 'in' || itemLines.some((line) => line.direction !== 'out')))) return null;
    const event = { schemaVersion: 2, id, source, transactionType, confirmedAt, createdAt, confidence: 'confirmed', confirmation: { method: confirmationMethod }, cash: { direction: cashDirection, amount: cashAmount }, itemLines };
    const origin = normalizeBoundedText(raw.origin, 80); const correlationId = normalizeBoundedText(raw.correlationId, 140); const tradeId = normalizePositiveInt(raw.tradeId); if (origin) event.origin = origin; if (correlationId) event.correlationId = correlationId; if (tradeId) event.tradeId = tradeId;
    const counterpartyId = normalizePositiveInt(raw.counterparty?.id); const counterpartyName = normalizeBoundedText(raw.counterparty?.name, 120); if (counterpartyId || counterpartyName) event.counterparty = { id: counterpartyId, name: counterpartyName };
    const quote = {}; for (const field of ['expectedUnitPrice', 'expectedTotalPrice', 'marketQuoteUnitPrice']) { const value = raw.quote?.[field] == null ? null : normalizeMoneyString(raw.quote[field]); if (value) quote[field] = value; } if (Object.keys(quote).length) event.quote = quote;
    const legacyId = normalizeBoundedText(raw.legacy?.transactionId, 240); if (legacyId) event.legacy = { transactionId: legacyId, schemaVersion: 1 };
    return event;
  }
  function legacyTransactionToEvent(raw) { const transaction = normalizeConfirmedTransaction(raw); if (!transaction) return null; const unitPrice = transaction.unitPrice || (BigInt(transaction.totalPrice) % BigInt(transaction.quantity) === 0n ? (BigInt(transaction.totalPrice) / BigInt(transaction.quantity)).toString() : null); return normalizeTransactionEventV2({ schemaVersion: 2, id: `event:${transaction.id}`, source: transaction.source, transactionType: transaction.type, confirmedAt: transaction.confirmedAt, createdAt: transaction.createdAt, confidence: 'confirmed', confirmation: { method: transaction.confirmationMethod }, origin: transaction.origin, correlationId: transaction.correlationId, tradeId: transaction.tradeId, counterparty: { id: transaction.counterpartyId, name: transaction.counterpartyName }, cash: { direction: transaction.type === 'buy' ? 'out' : 'in', amount: transaction.totalPrice }, itemLines: [{ lineId: `event:${transaction.id}:line:1`, direction: transaction.type === 'buy' ? 'in' : 'out', itemId: transaction.itemId, itemName: transaction.itemName, quantity: transaction.quantity, totalPrice: transaction.totalPrice, unitPrice }], quote: { expectedUnitPrice: transaction.expectedUnitPrice, expectedTotalPrice: transaction.expectedTotalPrice, marketQuoteUnitPrice: transaction.marketQuoteUnitPrice }, legacy: { transactionId: transaction.id, schemaVersion: 1 } }); }
  function transactionEventsMateriallyEqual(left, right) { const stable = (value) => { const normalized = normalizeTransactionEventV2(value); if (!normalized) return null; const { confirmedAt, createdAt, ...material } = normalized; return material; }; return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
  function invalidateTransactionEventCache(reason = '') { transactionStoreCache.revision = null; transactionStoreCache.events = null; transactionStoreCache.recordCount = 0; transactionStoreCache.rejectedCount = 0; logDebug('transaction repository cache invalidated.', reason); }
  function signalTransactionStoreRevision() { const revision = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`; gmSet(TRANSACTION_STORE_REVISION_KEY, revision); transactionStoreCache.revision = revision; logDebug('transaction store revision signalled.', revision); return revision; }
  function readTransactionEvent(eventId) { const key = transactionEventStorageKey(eventId); return key ? normalizeTransactionEventV2(gmGet(key, null)) : null; }
  function recordTransactionEvent(raw, suppliedOptions = null) { const options = suppliedOptions || {}; const event = normalizeTransactionEventV2(raw); if (!event) return { ok: false, reason: 'invalid-transaction-event', event: null }; const key = transactionEventStorageKey(event.id); const existingRaw = gmGet(key, null); if (existingRaw != null) { const existing = normalizeTransactionEventV2(existingRaw); if (existing && transactionEventsMateriallyEqual(existing, event)) { logDebug('duplicate transaction event.', event.id); return { ok: true, duplicate: true, event: existing }; } logDebug('transaction event conflict.', event.id); return { ok: false, conflict: true, reason: 'transaction-event-conflict', event: existing }; } gmSet(key, event); const readback = normalizeTransactionEventV2(gmGet(key, null)); if (!readback || !transactionEventsMateriallyEqual(readback, event)) return { ok: false, reason: 'transaction-event-write-failed', event: null }; invalidateTransactionEventCache('local write'); if (!options.suppressRevision) signalTransactionStoreRevision(); logDebug('v2 transaction event persisted.', event.id); return { ok: true, duplicate: false, event: readback }; }
  function listTransactionEvents() { const revision = String(gmGet(TRANSACTION_STORE_REVISION_KEY, '')); if (transactionStoreCache.events && transactionStoreCache.revision === revision) { logDebug('transaction repository cache hit.'); return transactionStoreCache.events.slice(); } logDebug('transaction repository cache miss.'); const keys = listStoredTransactionEventKeys(); const normalized = keys.map((key) => normalizeTransactionEventV2(gmGet(key, null))); const events = normalized.filter(Boolean); transactionStoreCache.revision = revision; transactionStoreCache.events = events; transactionStoreCache.recordCount = keys.length; transactionStoreCache.rejectedCount = normalized.length - events.length; return events.slice(); }
  function queryTransactionEvents(suppliedOptions = null) { const options = suppliedOptions || {}; const itemId = normalizePositiveInt(options.itemId); const tradeId = normalizePositiveInt(options.tradeId); return listTransactionEvents().filter((event) => (!options.source || event.source === options.source) && (!options.transactionType || event.transactionType === options.transactionType) && (!itemId || event.itemLines.some((line) => line.itemId === itemId)) && (!tradeId || event.tradeId === tradeId)); }
  function projectTransactionEvent(event) { const normalized = normalizeTransactionEventV2(event); if (!normalized) return []; return normalized.itemLines.map((line, index) => normalizeConfirmedTransaction({ id: normalized.legacy?.transactionId && normalized.itemLines.length === 1 ? normalized.legacy.transactionId : `${normalized.id}:line:${index + 1}`, type: line.direction === 'in' ? 'buy' : 'sell', source: normalized.source, itemId: line.itemId, itemName: line.itemName, quantity: line.quantity, unitPrice: line.unitPrice, totalPrice: line.totalPrice || (normalized.itemLines.length === 1 ? normalized.cash.amount : null), counterpartyId: normalized.counterparty?.id, counterpartyName: normalized.counterparty?.name, tradeId: normalized.tradeId, origin: normalized.origin, expectedUnitPrice: normalized.quote?.expectedUnitPrice, expectedTotalPrice: normalized.quote?.expectedTotalPrice, marketQuoteUnitPrice: normalized.quote?.marketQuoteUnitPrice, correlationId: normalized.correlationId, confirmationMethod: normalized.confirmation.method, confidence: 'confirmed', confirmedAt: normalized.confirmedAt, createdAt: normalized.createdAt })).filter(Boolean); }
  function projectTransactionEvents(events) { const rows = events.flatMap(projectTransactionEvent); logDebug('History projection count.', rows.length); return rows; }
  function legacyLedgerSignature(raw) { const diagnosed = diagnoseTransactionLedger(raw); const canonical = Object.values(diagnosed.ledger.transactions).sort((a, b) => a.id.localeCompare(b.id)).map((entry) => JSON.stringify(entry)).join('|'); let hash = 2166136261; for (let index = 0; index < canonical.length; index += 1) { hash ^= canonical.charCodeAt(index); hash = Math.imul(hash, 16777619) >>> 0; } return `${diagnosed.rawCount}:${diagnosed.validCount}:${hash.toString(16)}`; }
  function migrateLegacyLedgerV1(now = Date.now()) { const raw = gmGet(TRANSACTION_LEDGER_KEY, { version: 1, transactions: {} }); const diagnostics = diagnoseTransactionLedger(raw); const rawEntries = raw?.version === 1 && raw.transactions && typeof raw.transactions === 'object' ? Object.entries(raw.transactions) : []; const rejectedIds = rawEntries.filter(([, value]) => !normalizeConfirmedTransaction(value)).map(([id]) => String(id)); let migrated = 0; const conflicts = []; logDebug('v1 migration started.', { valid: diagnostics.validCount, rejected: rejectedIds.length }); for (const transaction of Object.values(diagnostics.ledger.transactions)) { const event = legacyTransactionToEvent(transaction); const result = event ? recordTransactionEvent(event, { suppressRevision: true }) : { ok: false }; if (result.ok) migrated += 1; else if (result.conflict) conflicts.push(event?.id || transaction.id); } const complete = migrated === diagnostics.validCount && conflicts.length === 0; const meta = { version: 2, migration: { legacyV1Complete: complete, completedAt: complete ? now : null, lastMigrationAt: now, sourceCount: diagnostics.rawCount, sourceSignature: legacyLedgerSignature(raw), migratedCount: migrated, rejectedCount: rejectedIds.length, rejectedIds, conflicts } }; gmSet(TRANSACTION_STORE_META_KEY, meta); invalidateTransactionEventCache('legacy migration'); if (migrated) signalTransactionStoreRevision(); logDebug('v1 migration ended.', meta.migration); return meta; }
  function ensureTransactionStoreReady() { const meta = gmGet(TRANSACTION_STORE_META_KEY, null); const legacyRaw = gmGet(TRANSACTION_LEDGER_KEY, { version: 1, transactions: {} }); if (!meta?.migration?.legacyV1Complete || meta.migration.sourceSignature !== legacyLedgerSignature(legacyRaw)) return migrateLegacyLedgerV1(); return meta; }
  function getTransactionStoreDiagnostics() { const valid = listTransactionEvents(); const legacy = diagnoseTransactionLedger(gmGet(TRANSACTION_LEDGER_KEY, { version: 1, transactions: {} })); const meta = gmGet(TRANSACTION_STORE_META_KEY, { migration: {} }); return { storeVersion: 2, v2RecordCount: transactionStoreCache.recordCount, validV2RecordCount: valid.length, rejectedV2RecordCount: transactionStoreCache.rejectedCount, legacyRawCount: legacy.rawCount, legacyValidCount: legacy.validCount, migrationComplete: meta.migration?.legacyV1Complete === true, migratedLegacyCount: Number(meta.migration?.migratedCount) || 0, migrationConflicts: meta.migration?.conflicts || [], migrationRejected: meta.migration?.rejectedIds || [], lastMigrationAt: Number(meta.migration?.lastMigrationAt) || null }; }
  function readTransactionLedgerDiagnostics() { ensureTransactionStoreReady(); const storeDiagnostics = getTransactionStoreDiagnostics(); const projected = projectTransactionEvents(listTransactionEvents()); const transactions = Object.fromEntries(projected.map((transaction) => [transaction.id, transaction])); const legacy = diagnoseTransactionLedger(gmGet(TRANSACTION_LEDGER_KEY, { version: 1, transactions: {} })); const conflicts = new Set(storeDiagnostics.migrationConflicts.map((id) => String(id).replace(/^event:/, ''))); Object.values(legacy.ledger.transactions).forEach((transaction) => { if (!transactions[transaction.id] || conflicts.has(transaction.id)) transactions[transaction.id] = transaction; }); return { ledger: { version: 1, transactions }, rawCount: storeDiagnostics.v2RecordCount, validCount: Object.keys(transactions).length, rejectedCount: storeDiagnostics.rejectedV2RecordCount + storeDiagnostics.migrationRejected.length, storeDiagnostics }; }
  function readTransactionLedger() { return readTransactionLedgerDiagnostics().ledger; }
  function formatLedgerMoney(value, signed = false) { if (value == null) return '—'; try { const amount = BigInt(value); const sign = amount < 0n ? '-' : signed && amount > 0n ? '+' : ''; const digits = (amount < 0n ? -amount : amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return `${sign}$${digits}`; } catch (_) { return '—'; } }
  function getTransactionDifference(transaction) { if (!transaction?.expectedTotalPrice) return null; try { return BigInt(transaction.totalPrice) - BigInt(transaction.expectedTotalPrice); } catch (_) { return null; } }
  function transactionSourceLabel(source) { return ({ bazaar: 'Bazaar', 'item-market': 'Item Market', trade: 'Trade' })[source] || '—'; }
  function transactionOriginLabel(origin) { return ({ watchlist: 'Watchlist', 'item-page': 'Item page', 'direct-bazaar': 'Direct Bazaar', 'direct-item-market': 'Direct Item Market', 'trader-trade': 'Trader Trade', 'weav3r-native-click': 'Native Weav3r click', unknown: 'Unknown' })[origin] || '—'; }
  function transactionConfirmationLabel(method) { return ({ 'trade-completion': 'Torn Trade completion', 'bazaar-purchase-confirmation': 'Bazaar purchase confirmation', 'item-market-purchase-confirmation': 'Item Market purchase confirmation' })[method] || method || '—'; }
  function normalizeHistorySearch(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function normalizeHistoryContext(raw) { const kind = raw?.kind; if (kind === 'item') { const itemId = normalizePositiveInt(raw.itemId); return itemId ? { kind, itemId, itemName: normalizeBoundedText(raw.itemName, 150) } : { kind: 'global' }; } if (kind === 'trade') { const tradeId = normalizePositiveInt(raw.tradeId); return tradeId ? { kind, tradeId } : { kind: 'global' }; } return { kind: 'global' }; }
  function filterTransactionsByHistoryContext(transactions, context = state.historyContext) { const normalized = normalizeHistoryContext(context); if (normalized.kind === 'item') return transactions.filter((entry) => entry.itemId === normalized.itemId); if (normalized.kind === 'trade') return transactions.filter((entry) => entry.tradeId === normalized.tradeId); return transactions.slice(); }
  function historyContextTitle(context = state.historyContext) { const normalized = normalizeHistoryContext(context); if (normalized.kind === 'item') return `History · ${normalized.itemName || 'Item'} [${normalized.itemId}]`; if (normalized.kind === 'trade') return `History · Trade #${normalized.tradeId}`; return 'Arbitrage History'; }
  function filterAndSortTransactions(transactions, suppliedOptions) { const options = suppliedOptions || {}; const type = options.type || 'all'; const source = options.source || 'all'; const search = normalizeHistorySearch(options.search); const rows = transactions.filter((transaction) => (type === 'all' || transaction.type === type) && (source === 'all' || transaction.source === source) && (!search || normalizeHistorySearch([transaction.itemName, transaction.itemId, transaction.counterpartyName, transaction.counterpartyId, transaction.tradeId].filter((value) => value != null).join(' ')).includes(search))); rows.sort((left, right) => options.sort === 'oldest' ? left.confirmedAt - right.confirmedAt || left.id.localeCompare(right.id) : right.confirmedAt - left.confirmedAt || left.id.localeCompare(right.id)); return rows; }
  function summarizeTransactions(transactions) { return transactions.reduce((summary, transaction) => { summary.confirmed += 1; summary[transaction.type === 'buy' ? 'buys' : 'sells'] += 1; return summary; }, { confirmed: 0, buys: 0, sells: 0 }); }
  function getExportTransactions(ledger) { return Object.values(ledger?.transactions || {}).map(normalizeConfirmedTransaction).filter(Boolean).sort((left, right) => left.confirmedAt - right.confirmedAt || left.id.localeCompare(right.id)); }
  function serializeTransactionJson(ledger, exportedAt = new Date().toISOString()) { return JSON.stringify({ exportedAt, schemaVersion: 1, transactions: getExportTransactions(ledger) }, null, 2); }
  const TRANSACTION_CSV_COLUMNS = Object.freeze(['id', 'type', 'confirmedAt', 'itemId', 'itemName', 'quantity', 'unitPrice', 'totalPrice', 'source', 'origin', 'counterpartyId', 'counterpartyName', 'tradeId', 'expectedUnitPrice', 'expectedTotalPrice', 'confirmationMethod', 'correlationId', 'marketQuoteUnitPrice']);
  function escapeCsvField(value) { if (value == null) return ''; const text = String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  function serializeTransactionCsv(ledger) { const rows = getExportTransactions(ledger); return [TRANSACTION_CSV_COLUMNS.join(','), ...rows.map((transaction) => TRANSACTION_CSV_COLUMNS.map((column) => escapeCsvField(transaction[column])).join(','))].join('\r\n'); }
  function getHistoryExportDate(date = new Date()) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }
  function revokeHistoryExportUrls() { Object.values(state.historyExportUrls).forEach((url) => { if (url) URL.revokeObjectURL(url); }); state.historyExportUrls = { json: '', csv: '' }; state.historyExportSignature = ''; }
  function getHistoryExportUrls(ledger) { const json = serializeTransactionJson(ledger); const csv = serializeTransactionCsv(ledger); const signature = `${json}\n${csv}`; if (signature === state.historyExportSignature && state.historyExportUrls.json && state.historyExportUrls.csv) return state.historyExportUrls; revokeHistoryExportUrls(); state.historyExportUrls = { json: URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' })), csv: URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })) }; state.historyExportSignature = signature; return state.historyExportUrls; }
  function transactionsMateriallyEqual(left, right) { const omitTimes = (value) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !['confirmedAt', 'createdAt'].includes(key))); return JSON.stringify(omitTimes(left)) === JSON.stringify(omitTimes(right)); }
  function recordConfirmedTransaction(raw) {
    const transaction = normalizeConfirmedTransaction(raw);
    if (!transaction) { logDebug('invalid confirmed transaction rejected.'); return { ok: false, reason: 'invalid-confirmed-transaction', transaction: null }; }
    const event = legacyTransactionToEvent(transaction); const result = recordTransactionEvent(event); if (!result.ok) return { ...result, reason: result.conflict ? 'transaction-conflict' : result.reason === 'transaction-event-write-failed' ? 'transaction-ledger-write-failed' : result.reason, transaction: result.event ? projectTransactionEvent(result.event)[0] : null }; return { ok: true, duplicate: result.duplicate, transaction };
  }
  function buildConfirmedTradeSale(record, completionEvidence, confirmedAt = Date.now()) {
    const tradeId = normalizePositiveInt(completionEvidence?.tradeId);
    if (completionEvidence?.confirmationMethod !== 'trade-completion' || completionEvidence?.evidenceText !== 'Trade was accepted and is now complete!' || !record || tradeId !== normalizePositiveInt(record.tradeId) || !record.snapshotAt || record.simpleItemForMoneyTrade !== true || !normalizePositiveInt(record.quantity) || !normalizeMoneyString(record.offeredTotal)) return null;
    return normalizeConfirmedTransaction({ type: 'sell', source: 'trade', itemId: record.itemId, itemName: record.itemName, quantity: record.quantity, totalPrice: record.offeredTotal, counterpartyId: record.traderId, counterpartyName: record.traderName, tradeId, origin: 'trader-trade', expectedUnitPrice: record.unitSellPrice, expectedTotalPrice: record.expectedTotal, confirmedAt, confirmationMethod: 'trade-completion', confidence: 'confirmed', correlationId: record.handoffId || record.verificationId, createdAt: confirmedAt });
  }
  function recordConfirmedTradeSale(record, completionEvidence, confirmedAt = Date.now()) { const transaction = buildConfirmedTradeSale(record, completionEvidence, confirmedAt); if (!transaction) { logDebug(record?.simpleItemForMoneyTrade === false ? 'Completed Trade not recorded as simple SELL because additional Trade assets were present.' : 'Trade completion evidence or snapshot missing; SELL not recorded.', completionEvidence?.tradeId || null); return { ok: false, reason: record?.simpleItemForMoneyTrade === false ? 'mixed-trade-not-supported' : 'invalid-trade-completion-evidence', transaction: null }; } const result = recordConfirmedTransaction(transaction); logDebug(result.duplicate ? 'SELL transaction already exists.' : 'SELL transaction stored.', { tradeId: completionEvidence.tradeId, itemId: transaction.itemId, quantity: transaction.quantity, expectedTotal: transaction.expectedTotalPrice, actualTotal: transaction.totalPrice }); return result; }
  function sanitizePurchaseDiagnosticElement(element) { if (!element || element.nodeType !== 1) return null; const safeText = normalizeBoundedText(element.textContent, 300); const parent = element.parentElement; const diagnostic = { tag: String(element.tagName || '').toLowerCase() }; const add = (key, value, limit = 120) => { const normalized = normalizeBoundedText(value, limit); if (normalized) diagnostic[key] = normalized; }; add('id', element.id, 100); const classes = Array.from(element.classList || []).map((value) => normalizeBoundedText(value, 80)).filter(Boolean).slice(0, 8); if (classes.length) diagnostic.classes = classes; add('type', element.getAttribute?.('type')); add('name', element.getAttribute?.('name')); add('role', element.getAttribute?.('role')); add('ariaLabel', element.getAttribute?.('aria-label')); add('ariaLive', element.getAttribute?.('aria-live')); add('dataTestId', element.getAttribute?.('data-testid')); if (safeText) diagnostic.text = safeText; if (parent) diagnostic.parentFingerprint = [String(parent.tagName || '').toLowerCase(), normalizeBoundedText(parent.id, 80), normalizeBoundedText(parent.getAttribute?.('role'), 40), normalizeBoundedText(parent.getAttribute?.('data-testid'), 80)].filter(Boolean).join('#').slice(0, 180); return diagnostic; }
  function normalizePurchaseFingerprint(raw) { if (!raw || typeof raw !== 'object') return null; const output = {}; for (const key of ['tag', 'id', 'type', 'name', 'role', 'ariaLabel', 'ariaLive', 'dataTestId', 'text', 'parentFingerprint']) { const value = normalizeBoundedText(raw[key], key === 'text' ? 300 : 180); if (value) output[key] = value; } const classes = Array.isArray(raw.classes) ? raw.classes.map((value) => normalizeBoundedText(value, 80)).filter(Boolean).slice(0, 8) : []; if (classes.length) output.classes = classes; return Object.keys(output).length ? output : null; }
  function appendPurchaseDiagnosticEvent(attempt, event) { const normalized = { type: normalizeBoundedText(event?.type, 60), observedAt: Number(event?.observedAt) || Date.now(), summary: event?.summary && typeof event.summary === 'object' ? JSON.parse(JSON.stringify(event.summary)) : normalizeBoundedText(event?.summary, 300) }; if (!normalized.type) return attempt; const events = Array.isArray(attempt?.diagnosticEvents) ? attempt.diagnosticEvents.slice() : []; const previous = events.at(-1); if (previous && previous.type === normalized.type && JSON.stringify(previous.summary) === JSON.stringify(normalized.summary)) return attempt; events.push(normalized); return { ...attempt, diagnosticEvents: events.slice(-PURCHASE_DIAGNOSTIC_EVENT_LIMIT), diagnosticRevision: (normalizePositiveInt(attempt?.diagnosticRevision) || 0) + 1 }; }
  function normalizePurchaseAttempt(raw) { if (!raw || typeof raw !== 'object') return null; const attemptId = normalizeBoundedText(raw.attemptId, 140); const correlationId = normalizeBoundedText(raw.correlationId, 120); const state = ['interaction-observed', 'purchase-submitted', 'awaiting-confirmation', 'confirmed', 'failed', 'timed-out'].includes(raw.attemptState) ? raw.attemptState : null; const startedAt = Number(raw.attemptStartedAt); const updatedAt = Number(raw.attemptUpdatedAt); if (!attemptId || !correlationId || !state || !Number.isFinite(startedAt) || !Number.isFinite(updatedAt)) return null; const attempt = { attemptId, correlationId, attemptState: state, attemptStartedAt: startedAt, attemptUpdatedAt: updatedAt, route: normalizeBoundedText(raw.route, 400), interactionMethod: ['button', 'form', 'unknown'].includes(raw.interactionMethod) ? raw.interactionMethod : 'unknown', diagnosticRevision: normalizePositiveInt(raw.diagnosticRevision) || 1, diagnosticEvents: [] }; const quantity = normalizePositiveInt(raw.observedQuantity); const unit = normalizeMoneyString(raw.observedUnitPrice); const total = normalizeMoneyString(raw.observedTotalPrice); const calculated = normalizeMoneyString(raw.calculatedAttemptTotal); if (quantity) attempt.observedQuantity = quantity; if (unit) attempt.observedUnitPrice = unit; if (total) attempt.observedTotalPrice = total; if (calculated) attempt.calculatedAttemptTotal = calculated; const sellerId = normalizePositiveInt(raw.observedSellerId); const sellerName = normalizeBoundedText(raw.observedSellerName, 100); if (sellerId) attempt.observedSellerId = sellerId; if (sellerName) attempt.observedSellerName = sellerName; const itemId = normalizePositiveInt(raw.itemId); const itemName = normalizeBoundedText(raw.itemName, 150); if (itemId) attempt.itemId = itemId; if (itemName) attempt.itemName = itemName; if (raw.manualConfirmationAction === 'yes') attempt.manualConfirmationAction = 'yes'; if (raw.interactionEvidence && typeof raw.interactionEvidence === 'object') { const controlFingerprint = normalizePurchaseFingerprint(raw.interactionEvidence.controlFingerprint); const dialogFingerprint = normalizePurchaseFingerprint(raw.interactionEvidence.dialogFingerprint); attempt.interactionEvidence = {}; if (controlFingerprint) attempt.interactionEvidence.controlFingerprint = controlFingerprint; if (dialogFingerprint) attempt.interactionEvidence.dialogFingerprint = dialogFingerprint; } if (Number.isFinite(Number(raw.confirmationObservationStartedAt))) attempt.confirmationObservationStartedAt = Number(raw.confirmationObservationStartedAt); if (Number.isFinite(Number(raw.confirmationObservationExpiresAt))) attempt.confirmationObservationExpiresAt = Number(raw.confirmationObservationExpiresAt); if (['unconfirmed', 'confirmed'].includes(raw.lastConfirmationResult)) attempt.lastConfirmationResult = raw.lastConfirmationResult; if (['pending', 'recorded', 'write-failed', 'conflict'].includes(raw.persistenceState)) attempt.persistenceState = raw.persistenceState; const transactionCandidate = typeof normalizeConfirmedTransaction === 'function' ? normalizeConfirmedTransaction(raw.transactionCandidate) : null; if (transactionCandidate?.id === `buy:bazaar:${attemptId}`) attempt.transactionCandidate = transactionCandidate; const reason = normalizeBoundedText(raw.lastConfirmationReason, 120); if (reason) attempt.lastConfirmationReason = reason; if (raw.confirmationEvidence && typeof raw.confirmationEvidence === 'object') { const evidence = raw.confirmationEvidence; const evidenceQuantity = normalizePositiveInt(evidence.quantity); const evidenceTotal = normalizeMoneyString(evidence.totalPrice); const evidenceItem = normalizeBoundedText(evidence.itemName, 150); const evidenceSeller = normalizeBoundedText(evidence.sellerName, 100); const evidenceAt = Number(evidence.confirmedAt); if (evidenceQuantity && evidenceTotal && evidenceItem && evidenceSeller && Number.isFinite(evidenceAt)) attempt.confirmationEvidence = { itemName: evidenceItem, quantity: evidenceQuantity, sellerName: evidenceSeller, totalPrice: evidenceTotal, evidenceText: normalizeBoundedText(evidence.evidenceText, 500), confirmedAt: evidenceAt }; } (Array.isArray(raw.diagnosticEvents) ? raw.diagnosticEvents : []).forEach((event) => { attempt.diagnosticEvents = appendPurchaseDiagnosticEvent(attempt, event).diagnosticEvents; }); return attempt; }
  function createPurchaseAttempt(context, suppliedInput, now = Date.now()) { const input = suppliedInput || {}; if (!context?.correlationId) return null; const attemptId = `purchase-attempt:${now.toString(36)}:${Math.random().toString(36).slice(2, 10)}`; const quantity = normalizePositiveInt(input.observedQuantity); const unit = normalizeMoneyString(input.observedUnitPrice); const total = normalizeMoneyString(input.observedTotalPrice); let attempt = normalizePurchaseAttempt({ attemptId, correlationId: context.correlationId, attemptState: 'interaction-observed', attemptStartedAt: now, attemptUpdatedAt: now, route: input.route, interactionMethod: input.interactionMethod, observedQuantity: quantity, observedUnitPrice: unit, observedTotalPrice: total, calculatedAttemptTotal: !total && quantity && unit ? (BigInt(unit) * BigInt(quantity)).toString() : null, observedSellerId: input.observedSellerId, observedSellerName: input.observedSellerName, itemId: input.itemId || context.itemId, itemName: input.itemName || context.itemName, manualConfirmationAction: input.manualConfirmationAction, interactionEvidence: input.interactionEvidence, diagnosticRevision: 1 }); attempt = appendPurchaseDiagnosticEvent(attempt, { type: 'interaction-observed', observedAt: now, summary: { method: attempt.interactionMethod } }); return attempt; }
  function serializePurchaseDiagnostics(context, adapterResult = null) { const attempt = context?.attempts?.[context.activeAttemptId] || null; return JSON.stringify({ diagnosticType: 'Weav3r Purchase Diagnostic', source: context?.source || null, route: attempt?.route || null, item: context ? { itemId: context.itemId, itemName: context.itemName } : null, origin: context?.origin || null, correlationId: context?.correlationId || null, transportCreatedAt: context?.startedAt || null, claimedAt: context?.claimedAt || null, attempt: attempt ? { attemptId: attempt.attemptId, state: attempt.attemptState, startedAt: attempt.attemptStartedAt, observedQuantity: attempt.observedQuantity || null, observedUnitPrice: attempt.observedUnitPrice || null, observedTotalPrice: attempt.observedTotalPrice || null, calculatedAttemptTotal: attempt.calculatedAttemptTotal || null, interactionEvidence: attempt.interactionEvidence || null, diagnosticEvents: attempt.diagnosticEvents || [], confirmationEvidence: attempt.confirmationEvidence || null, persistenceState: attempt.persistenceState || null } : null, confirmationAdapter: adapterResult || (context?.source === 'bazaar' ? resolveConfirmedBazaarPurchase() : resolveConfirmedItemMarketPurchase()) }, null, 2); }
  function normalizePendingPurchaseContext(raw, now = Date.now()) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
    const correlationId = normalizeBoundedText(raw.correlationId, 120);
    const source = ['bazaar', 'item-market'].includes(raw.source) ? raw.source : null;
    const itemId = normalizePositiveInt(raw.itemId);
    const itemName = normalizeBoundedText(raw.itemName, 150);
    const origin = ['watchlist', 'item-page', 'direct-bazaar', 'direct-item-market', 'weav3r-native-click'].includes(raw.origin) ? raw.origin : null;
    const startedAt = Number(raw.startedAt);
    const updatedAt = Number(raw.updatedAt);
    const expiresAt = Number(raw.expiresAt);
    if (!correlationId || !source || !itemId || !itemName || !origin || !Number.isFinite(startedAt) || !Number.isFinite(updatedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
    const context = { version: 1, correlationId, source, itemId, itemName, origin, startedAt, updatedAt, expiresAt, attemptState: 'not-started', attempts: {} };
    const sellerId = normalizePositiveInt(raw.sellerId);
    const sellerName = normalizeBoundedText(raw.sellerName, 100);
    const displayedUnitPrice = normalizeMoneyString(raw.displayedUnitPrice);
    const intendedQuantity = normalizePositiveInt(raw.intendedQuantity);
    const offerId = normalizeBoundedText(raw.offerId, 100);
    if (sellerId) context.sellerId = sellerId;
    if (sellerName) context.sellerName = sellerName;
    if (displayedUnitPrice) context.displayedUnitPrice = displayedUnitPrice;
    if (intendedQuantity) context.intendedQuantity = intendedQuantity;
    if (offerId) context.offerId = offerId;
    const claimedAt = Number(raw.claimedAt); if (Number.isFinite(claimedAt) && claimedAt > 0) context.claimedAt = claimedAt;
    Object.values(raw.attempts || {}).forEach((value) => { const attempt = normalizePurchaseAttempt(value); if (attempt && attempt.correlationId === correlationId) context.attempts[attempt.attemptId] = attempt; });
    const activeAttemptId = normalizeBoundedText(raw.activeAttemptId, 140); if (activeAttemptId && context.attempts[activeAttemptId]) { context.activeAttemptId = activeAttemptId; context.attemptState = context.attempts[activeAttemptId].attemptState; }
    return context;
  }
  function readPendingPurchaseContexts(now = Date.now()) { let raw = null; try { raw = JSON.parse(sessionStorage.getItem(PENDING_PURCHASE_CONTEXTS_SESSION_KEY) || 'null'); } catch (_) { raw = null; } const pending = {}; if (raw?.version === 1 && raw.pending && typeof raw.pending === 'object') Object.values(raw.pending).forEach((value) => { const context = normalizePendingPurchaseContext(value, now); if (context) pending[context.correlationId] = context; else if (value?.correlationId) logDebug('pending context expired.', normalizeBoundedText(value.correlationId, 120)); }); return { version: 1, pending }; }
  function writePendingPurchaseContexts(collection) { try { sessionStorage.setItem(PENDING_PURCHASE_CONTEXTS_SESSION_KEY, JSON.stringify({ version: 1, pending: collection?.pending || {} })); return true; } catch (error) { logWarn('Could not write pending purchase contexts.', error); return false; } }
  function prunePendingPurchaseContexts(now = Date.now()) { const collection = readPendingPurchaseContexts(now); writePendingPurchaseContexts(collection); return collection; }
  function createPendingPurchaseContext(input, now = Date.now()) {
    const correlationId = normalizeBoundedText(input?.correlationId, 120) || `purchase:${now.toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
    const context = normalizePendingPurchaseContext({ ...input, version: 1, correlationId, startedAt: Number(input?.startedAt) || now, updatedAt: now, expiresAt: now + PENDING_PURCHASE_TTL_MS }, now - 1);
    if (!context) return { ok: false, reason: 'invalid-pending-context', context: null };
    const collection = readPendingPurchaseContexts(now);
    collection.pending[correlationId] = context;
    if (!writePendingPurchaseContexts(collection)) return { ok: false, reason: 'pending-storage-failed', context: null };
    logDebug('Pending purchase created.', { correlationId, origin: context.origin, source: context.source, itemId: context.itemId, itemName: context.itemName, displayedUnitPrice: context.displayedUnitPrice || null, intendedQuantity: context.intendedQuantity || null });
    return { ok: true, context };
  }
  function deletePendingPurchaseContext(correlationId) { const id = normalizeBoundedText(correlationId, 120); if (!id) return false; const collection = readPendingPurchaseContexts(); if (!collection.pending[id]) return false; delete collection.pending[id]; return writePendingPurchaseContexts(collection); }
  function getBazaarItemImages(itemContainer) { return Array.from(itemContainer?.querySelectorAll?.('[data-testid="img-container"] img, img[src*="/images/items/"], img[srcset*="/images/items/"]') || []); }
  function parseBazaarItemImageId(itemContainer) { const ids = new Set(getBazaarItemImages(itemContainer).flatMap((image) => [image.getAttribute('src'), image.getAttribute('srcset')]).filter(Boolean).flatMap((value) => Array.from(String(value).matchAll(/\/images\/items\/(\d+)\//g), (match) => normalizePositiveInt(match[1])).filter(Boolean))); return ids.size === 1 ? Array.from(ids)[0] : null; }
  function resolveBazaarItemIdentity(itemContainer) { if (!itemContainer?.matches?.('[data-testid="item"]')) return null; const itemId = parseBazaarItemImageId(itemContainer); const nameNode = itemContainer.querySelector('[data-testid="buy-menu"] [data-testid="buy-item-name"]') || itemContainer.querySelector('[data-testid="item-description"] [data-testid="description"] [data-testid="name"]') || itemContainer.querySelector('[data-testid="name"]'); const itemName = normalizeBoundedText(nameNode?.textContent, 150); const imageNames = new Set(getBazaarItemImages(itemContainer).map((image) => normalizeBoundedText(image.getAttribute('alt'), 150)).filter(Boolean).map(normalizedItemText)); if (!itemId || !itemName || (imageNames.size && (imageNames.size !== 1 || !imageNames.has(normalizedItemText(itemName))))) return null; return { itemId, itemName }; }
  function captureBazaarMenuPreStage(itemContainer, now = Date.now()) { const identity = resolveBazaarItemIdentity(itemContainer); if (!identity) return null; const preStage = { preStageId: `bazaar-menu:${now.toString(36)}:${Math.random().toString(36).slice(2, 9)}`, itemId: identity.itemId, itemName: identity.itemName, createdAt: now, expiresAt: now + BAZAAR_BUY_STAGE_TTL_MS }; tornState.bazaarMenuPreStages.set(itemContainer, preStage); logDebug('Bazaar activate-buy-button identity pre-staged.', { itemId: preStage.itemId, itemName: preStage.itemName, preStageId: preStage.preStageId }); return preStage; }
  function parseNativeBazaarMoney(text) { const normalized = String(text || '').replace(/\u00a0/g, ' ').trim(); const match = normalized.match(/^\$\s*([1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/); return match ? normalizeMoneyString(match[1].replace(/,/g, '')) : null; }
  function resolveStrongBazaarSellerId(context, currentUrl = location.href) { const ids = new Set(); const contextId = normalizePositiveInt(context?.sellerId); if (contextId) ids.add(contextId); try { const routeId = normalizePositiveInt(new URL(currentUrl).searchParams.get('userId')); if (routeId) ids.add(routeId); } catch (_) { return { sellerId: null, conflict: true }; } return ids.size > 1 ? { sellerId: null, conflict: true } : { sellerId: ids.size ? Array.from(ids)[0] : null, conflict: false }; }
  function parseBazaarBuyStage(itemContainer, context, now = Date.now(), suppliedPreStage = null) { const preStage = suppliedPreStage && suppliedPreStage.expiresAt >= now ? suppliedPreStage : null; const identity = preStage ? { itemId: normalizePositiveInt(preStage.itemId), itemName: normalizeBoundedText(preStage.itemName, 150) } : resolveBazaarItemIdentity(itemContainer); const menu = itemContainer?.querySelector?.('[data-testid="buy-menu"]'); if (!identity?.itemId || !identity.itemName || !menu) return { stage: null, reason: 'bazaar-buy-menu-identity-missing' }; if (context?.itemId && identity.itemId !== context.itemId) return { stage: null, reason: 'bazaar-stage-item-mismatch' }; const itemName = normalizeBoundedText(menu.querySelector('[data-testid="buy-item-name"]')?.textContent, 150); if (!itemName || normalizedItemText(itemName) !== normalizedItemText(identity.itemName)) return { stage: null, reason: 'bazaar-stage-name-mismatch' }; const observedUnitPrice = parseNativeBazaarMoney(menu.querySelector('[data-testid="buy-item-price"]')?.textContent); const observedQuantity = normalizePositiveInt(menu.querySelector('[data-testid="buy-amount-field"] input[data-testid="number-input"]')?.value); const seller = resolveStrongBazaarSellerId(context); if (seller.conflict) return { stage: null, reason: 'bazaar-seller-id-conflict' }; const stageId = `bazaar-stage:${now.toString(36)}:${Math.random().toString(36).slice(2, 9)}`; return { stage: { stageId, preStageId: preStage?.preStageId || null, correlationId: context?.correlationId || null, itemId: identity.itemId, itemName, observedUnitPrice, observedQuantity, calculatedAttemptTotal: observedUnitPrice && observedQuantity ? (BigInt(observedUnitPrice) * BigInt(observedQuantity)).toString() : null, sellerId: seller.sellerId, sellerName: normalizeBoundedText(context?.sellerName, 100) || null, buyButtonObservedAt: now, itemContainerFingerprint: sanitizePurchaseDiagnosticElement(itemContainer) }, reason: '' }; }
  function parseConfirmedBazaarSuccess(successNode) { if (!successNode?.matches?.('[data-testid="success-message"][aria-label="Success"]')) return null; const labelledBy = normalizeBoundedText(successNode.getAttribute('aria-labelledby'), 150); if (!labelledBy) return null; const description = successNode.ownerDocument?.getElementById?.(labelledBy); if (!description || !successNode.contains(description) || description.getAttribute('data-testid') !== 'description') return null; const evidenceText = normalizeBoundedText(String(description.textContent || '').replace(/\u00a0/g, ' '), 500); const match = evidenceText.match(/^You bought ([1-9]\d*) x (.+?) from (.+?)(?:'s|’s) bazaar for a total of \$([1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/i); if (!match) return null; const quantity = normalizePositiveInt(match[1]); const itemName = normalizeBoundedText(match[2], 150); const sellerName = normalizeBoundedText(match[3], 100); const totalPrice = normalizeMoneyString(match[4].replace(/,/g, '')); const labelledItemMatch = labelledBy.match(/^bought-msg-(\d+)-\d+$/); const labelledItemId = labelledItemMatch ? normalizePositiveInt(labelledItemMatch[1]) : null; if (!quantity || !itemName || !sellerName || !totalPrice) return null; const result = { quantity, itemName, sellerName, totalPrice, evidenceText }; if (labelledItemId) result.labelledItemId = labelledItemId; return result; }
  function findMatchingBazaarPurchaseAttempts(parsed, now = Date.now()) { if (!parsed) return []; return Object.values(readPendingPurchaseContexts(now).pending).flatMap((candidateContext) => { if (candidateContext.source !== 'bazaar') return []; const candidate = candidateContext.attempts?.[candidateContext.activeAttemptId]; if (!candidate || !['purchase-submitted', 'awaiting-confirmation'].includes(candidate.attemptState) || !candidate.confirmationObservationExpiresAt || candidate.confirmationObservationExpiresAt < now || !normalizePositiveInt(candidate.itemId) || normalizedItemText(candidate.itemName) !== normalizedItemText(parsed.itemName) || (parsed.labelledItemId && normalizePositiveInt(candidate.itemId) !== parsed.labelledItemId) || normalizePositiveInt(candidate.observedQuantity) !== parsed.quantity) return []; if (candidate.observedSellerName && normalizedItemText(candidate.observedSellerName) !== normalizedItemText(parsed.sellerName)) return []; const authoritativeTotal = normalizeMoneyString(candidate.observedTotalPrice); if (authoritativeTotal && authoritativeTotal !== parsed.totalPrice) return []; return [{ context: candidateContext, attempt: candidate }]; }); }
  function resolveConfirmedBazaarPurchase(successNode, context, attempt, observationRoot, now = Date.now()) { if (context?.source !== 'bazaar') return { confirmed: false, reason: 'bazaar-source-mismatch' }; if (!attempt || attempt.correlationId !== context.correlationId || context.activeAttemptId !== attempt.attemptId) return { confirmed: false, reason: 'bazaar-attempt-mismatch' }; if (!['purchase-submitted', 'awaiting-confirmation'].includes(attempt.attemptState)) return { confirmed: false, reason: 'bazaar-purchase-not-submitted' }; if (!attempt.confirmationObservationExpiresAt || now > attempt.confirmationObservationExpiresAt) return { confirmed: false, reason: 'bazaar-confirmation-window-expired' }; if (!observationRoot?.contains?.(successNode)) return { confirmed: false, reason: 'bazaar-success-outside-observation-root' }; const parsed = parseConfirmedBazaarSuccess(successNode); if (!parsed) return { confirmed: false, reason: 'bazaar-success-structure-invalid' }; const itemId = normalizePositiveInt(attempt.itemId); if (!itemId || normalizedItemText(parsed.itemName) !== normalizedItemText(attempt.itemName)) return { confirmed: false, reason: 'bazaar-success-item-mismatch' }; if (parsed.labelledItemId && parsed.labelledItemId !== itemId) return { confirmed: false, reason: 'bazaar-success-labelled-item-mismatch' }; if (attempt.observedSellerName && normalizedItemText(parsed.sellerName) !== normalizedItemText(attempt.observedSellerName)) return { confirmed: false, reason: 'bazaar-success-seller-mismatch' }; const expectedQuantity = normalizePositiveInt(attempt.observedQuantity); if (!expectedQuantity || parsed.quantity !== expectedQuantity) return { confirmed: false, reason: 'bazaar-success-quantity-mismatch' }; const authoritativeTotal = normalizeMoneyString(attempt.observedTotalPrice); if (authoritativeTotal && parsed.totalPrice !== authoritativeTotal) return { confirmed: false, reason: 'bazaar-success-total-mismatch' }; const matches = findMatchingBazaarPurchaseAttempts(parsed, now); if (matches.length !== 1 || matches[0].context.correlationId !== context.correlationId || matches[0].attempt.attemptId !== attempt.attemptId) return { confirmed: false, reason: matches.length > 1 ? 'bazaar-success-attempt-ambiguous' : 'bazaar-success-attempt-unmatched' }; return { confirmed: true, itemId, itemName: parsed.itemName, quantity: parsed.quantity, totalPrice: parsed.totalPrice, sellerId: normalizePositiveInt(attempt.observedSellerId), sellerName: parsed.sellerName, confirmationMethod: 'bazaar-purchase-confirmation', evidenceText: parsed.evidenceText, evidenceFingerprint: sanitizePurchaseDiagnosticElement(successNode), confirmedAt: now }; }
  function parseItemMarketItemIdFromImage(source) { const match = String(source || '').match(/\/images\/items\/(\d+)\//); return match ? normalizePositiveInt(match[1]) : null; }
  function parseItemMarketSellerProfile(href, ariaLabel = '') { let sellerId = null; try { const url = new URL(href, location.origin); if (url.pathname === '/profiles.php') sellerId = normalizePositiveInt(url.searchParams.get('XID')); } catch (_) { sellerId = null; } const nameMatch = String(ariaLabel || '').match(/^View profile of (.+)$/i); const sellerName = normalizeBoundedText(nameMatch?.[1], 100); return sellerId && sellerName ? { sellerId, sellerName } : null; }
  function parseItemMarketConfirmationText(text) { const match = normalizeBoundedText(text, 500).match(/(?:^|\s)Buy\s+(\d+)x\s+(.+?)\s+for\s+\$([\d,]+)\?/i); const quantity = match ? normalizePositiveInt(match[1]) : null; const itemName = match ? normalizeBoundedText(match[2], 150) : ''; const totalPrice = match ? normalizeMoneyString(match[3].replace(/,/g, '')) : null; return quantity && itemName && totalPrice ? { quantity, itemName, totalPrice } : null; }
  function parseItemMarketSuccessText(text) { const match = normalizeBoundedText(text, 600).match(/^You bought\s+(\d+)x\s+(.+?)\s+from\s+(.+?)\s+for a total of\s+\$([\d,]+)$/i); const quantity = match ? normalizePositiveInt(match[1]) : null; const itemName = match ? normalizeBoundedText(match[2], 150) : ''; const sellerName = match ? normalizeBoundedText(match[3], 100) : ''; const totalPrice = match ? normalizeMoneyString(match[4].replace(/,/g, '')) : null; return quantity && itemName && sellerName && totalPrice ? { quantity, itemName, sellerName, totalPrice } : null; }
  function parseItemMarketFailureText(text) { return normalizeBoundedText(text, 300) === 'You do not have enough money to buy this item.' ? { failed: true, reason: 'insufficient-funds' } : null; }
  function findItemMarketOfferRow(control) { let node = control?.parentElement || null; for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) { if (node.querySelector?.('img[src*="/images/items/"]') && node.querySelector?.('a[href*="/profiles.php?XID="]') && node.querySelector?.('button[aria-label^="Buy "]')) return node; } return null; }
  function parseItemMarketOfferStage(control, row = findItemMarketOfferRow(control), routeItemId = parseTornItemMarketUrl(location.href)?.itemId) {
    if (!control || !row) return null; const image = row.querySelector('img[src*="/images/items/"]'); const itemId = parseItemMarketItemIdFromImage(image?.getAttribute('src') || image?.src); const itemName = normalizeBoundedText(image?.getAttribute('alt'), 150); const buyMatch = String(control.getAttribute?.('aria-label') || '').match(/^Buy (.+)\?$/i); if (!itemId || !itemName || !buyMatch || normalizedItemText(buyMatch[1]) !== normalizedItemText(itemName) || (routeItemId && routeItemId !== itemId)) return null;
    const sellerLink = row.querySelector('a[href*="/profiles.php?XID="]'); const seller = parseItemMarketSellerProfile(sellerLink?.getAttribute('href') || sellerLink?.href, sellerLink?.getAttribute('aria-label')); if (!seller) return null;
    const quantityInputs = Array.from(row.querySelectorAll('input[data-testid="legacy-money-input"]')).filter((input) => input.type !== 'hidden' && !input.hidden && input.getAttribute('aria-hidden') !== 'true'); const quantityText = quantityInputs.length === 1 ? String(quantityInputs[0].value || '').trim() : ''; const requestedQuantity = /^\d+$/.test(quantityText) ? normalizePositiveInt(quantityText) : null;
    const availableMatches = Array.from(row.querySelectorAll('div,span')).map((node) => normalizeBoundedText(node.textContent, 100).match(/^(\d+)\s+available$/i)).filter(Boolean); const availableQuantity = availableMatches.length === 1 ? normalizePositiveInt(availableMatches[0][1]) : null;
    const dollarValues = Array.from(row.querySelectorAll('div,span')).flatMap((node) => Array.from(String(node.textContent || '').matchAll(/\$\s*([\d,]+)/g), (match) => normalizeMoneyString(match[1].replace(/,/g, '')))).filter(Boolean); const uniquePrices = Array.from(new Set(dollarValues)); const displayedUnitPrice = uniquePrices.length === 1 ? uniquePrices[0] : null;
    return { itemId, itemName, sellerId: seller.sellerId, sellerName: seller.sellerName, displayedUnitPrice, availableQuantity, requestedQuantity };
  }
  function findMatchingItemMarketTransport(stage) { const matches = Object.values(readPurchaseTransports().records).filter((record) => record.source === 'item-market' && record.itemId === stage.itemId && (!record.sellerId || record.sellerId === stage.sellerId) && (!record.sellerName || normalizedItemText(record.sellerName) === normalizedItemText(stage.sellerName))); return matches.length === 1 ? matches[0] : null; }
  function createItemMarketStage(control, row, now = Date.now()) { const parsed = parseItemMarketOfferStage(control, row); if (!parsed) return null; const transport = findMatchingItemMarketTransport(parsed); const attemptId = `item-market-attempt:${now.toString(36)}:${Math.random().toString(36).slice(2, 10)}`; const stage = { ...parsed, attemptId, correlationId: transport?.correlationId || attemptId, transportCorrelationId: transport?.correlationId || null, transportQuoteUnitPrice: transport?.displayedUnitPrice || null, origin: transport?.origin || 'direct-item-market', stagedAt: now, expiresAt: now + PURCHASE_CONFIRMATION_OBSERVATION_MS, routeItemId: parseTornItemMarketUrl(location.href)?.itemId || null, state: 'staged', confirmation: null }; tornState.itemMarketAttempts.set(attemptId, stage); logDebug('Item Market offer staged.', { attemptId, itemId: stage.itemId, sellerId: stage.sellerId, requestedQuantity: stage.requestedQuantity }); return stage; }
  function matchItemMarketConfirmation(confirmation, now = Date.now()) { if (!confirmation) return { ok: false, reason: 'invalid-confirmation' }; const routeItemId = parseTornItemMarketUrl(location.href)?.itemId || null; const matches = Array.from(tornState.itemMarketAttempts.values()).filter((stage) => stage.state === 'staged' && stage.expiresAt >= now && (!routeItemId || routeItemId === stage.itemId) && normalizedItemText(stage.itemName) === normalizedItemText(confirmation.itemName) && (!stage.requestedQuantity || stage.requestedQuantity === confirmation.quantity)); return matches.length === 1 ? { ok: true, stage: matches[0] } : { ok: false, reason: matches.length ? 'ambiguous-confirmation' : 'confirmation-stage-mismatch' }; }
  function resolveConfirmedItemMarketPurchase(node, stage, now = Date.now()) { if (!stage || stage.state !== 'yes-clicked' || stage.expiresAt < now) return { confirmed: false, reason: 'item-market-attempt-not-awaiting-success' }; const text = normalizeBoundedText(node?.textContent ?? node, 600); const failure = parseItemMarketFailureText(text); if (failure) return { confirmed: false, ...failure }; const success = parseItemMarketSuccessText(text); if (!success) return { confirmed: false, reason: 'unsupported-item-market-response' }; if (!stage.confirmation || normalizedItemText(success.itemName) !== normalizedItemText(stage.itemName)) return { confirmed: false, reason: 'item-market-success-item-mismatch' }; if (normalizedItemText(success.sellerName) !== normalizedItemText(stage.sellerName)) return { confirmed: false, reason: 'item-market-success-seller-mismatch' }; if (success.quantity !== stage.confirmation.quantity) return { confirmed: false, reason: 'item-market-success-quantity-mismatch' }; if (success.totalPrice !== stage.confirmation.totalPrice) return { confirmed: false, reason: 'item-market-success-total-mismatch' }; return { confirmed: true, ...success, itemId: stage.itemId, sellerId: stage.sellerId, confirmedAt: now, confirmationMethod: 'item-market-purchase-confirmation' }; }
  function buildConfirmedItemMarketBuyEvent(stage, confirmation) { if (!confirmation?.confirmed || !stage?.attemptId) return null; const total = BigInt(confirmation.totalPrice); const quantity = BigInt(confirmation.quantity); const unitPrice = total % quantity === 0n ? (total / quantity).toString() : null; const expectedUnitPrice = stage.displayedUnitPrice; const expectedTotalPrice = expectedUnitPrice ? (BigInt(expectedUnitPrice) * quantity).toString() : null; return normalizeTransactionEventV2({ schemaVersion: 2, id: `event:item-market:${stage.attemptId}`, source: 'item-market', transactionType: 'buy', confirmedAt: confirmation.confirmedAt, createdAt: stage.stagedAt, confidence: 'confirmed', confirmation: { method: 'item-market-purchase-confirmation' }, origin: stage.origin, correlationId: stage.correlationId, counterparty: { id: stage.sellerId, name: stage.sellerName }, cash: { direction: 'out', amount: confirmation.totalPrice }, itemLines: [{ lineId: `event:item-market:${stage.attemptId}:line:1`, direction: 'in', itemId: stage.itemId, itemName: stage.itemName, quantity: confirmation.quantity, totalPrice: confirmation.totalPrice, unitPrice }], quote: { expectedUnitPrice, expectedTotalPrice, marketQuoteUnitPrice: stage.transportQuoteUnitPrice } }); }
  function stopItemMarketResultObserver(attemptId, reason = 'stopped') { const active = tornState.itemMarketResultObservers.get(attemptId); if (!active) return; active.observer.disconnect(); clearTimeout(active.timeoutId); tornState.itemMarketResultObservers.delete(attemptId); logDebug('Item Market result observer stopped.', { attemptId, reason }); }
  function cleanupRecordedItemMarketPurchase(stage) { stopItemMarketResultObserver(stage.attemptId, 'recorded'); if (stage.transportCorrelationId) { if (!deletePurchaseTransportById(stage.transportCorrelationId)) return false; const pendingRemoved = deletePendingPurchaseContext(stage.transportCorrelationId) || !readPendingPurchaseContexts().pending[stage.transportCorrelationId]; if (!pendingRemoved) return false; } tornState.itemMarketAttempts.delete(stage.attemptId); renderTornPurchaseTracking(null); logDebug('Item Market pending cleanup completed.', { attemptId: stage.attemptId }); return true; }
  function recordConfirmedItemMarketPurchase(stage, confirmation) { const event = buildConfirmedItemMarketBuyEvent(stage, confirmation); if (!event) return { ok: false, reason: 'invalid-item-market-buy-event' }; const result = recordTransactionEvent(event); if (result.ok) { stage.state = 'recorded'; cleanupRecordedItemMarketPurchase(stage); showTornStatus(result.duplicate ? 'Weav3r: Item Market purchase already recorded.' : 'Weav3r: Item Market purchase confirmed and recorded.'); } return result; }
  function createBazaarPurchaseObserver() { const root = document.getElementById('bazaarRoot'); const result = root ? { supported: true, reason: '', root } : { supported: false, reason: 'bazaar-root-required', root: null }; if (root) initializeBazaarPurchaseAdapter(root); logDebug('Bazaar purchase adapter activated.', { supported: result.supported, reason: result.reason }); return result; }
  function findItemMarketConfirmationContainer(control) { let node = control?.parentElement || null; for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) { if (parseItemMarketConfirmationText(node.textContent)) return node; } return null; }
  function cancelItemMarketStage(stage, reason) { if (!stage || !['staged', 'confirmation', 'yes-clicked'].includes(stage.state)) return; stage.state = reason === 'insufficient-funds' ? 'failed' : 'cancelled'; stage.reason = reason; stopItemMarketResultObserver(stage.attemptId, reason); logDebug('Item Market attempt ended without transaction.', { attemptId: stage.attemptId, reason }); }
  function inspectItemMarketResultNode(node, now = Date.now()) { const text = normalizeBoundedText(node?.textContent, 600); if (!text) return null; const success = parseItemMarketSuccessText(text); const failure = parseItemMarketFailureText(text); if (!success && !failure) return null; const routeItemId = parseTornItemMarketUrl(location.href)?.itemId || null; const candidates = Array.from(tornState.itemMarketAttempts.values()).filter((stage) => stage.state === 'yes-clicked' && stage.expiresAt >= now && (!routeItemId || routeItemId === stage.itemId)); if (failure) { if (candidates.length === 1) { cancelItemMarketStage(candidates[0], failure.reason); return { state: 'failed', reason: failure.reason, stage: candidates[0] }; } return { state: 'unsupported', reason: 'ambiguous-item-market-failure' }; } const matches = candidates.map((stage) => ({ stage, result: resolveConfirmedItemMarketPurchase(text, stage, now) })).filter((entry) => entry.result.confirmed); if (matches.length !== 1) return { state: 'unsupported', reason: matches.length ? 'ambiguous-item-market-success' : 'item-market-success-mismatch' }; const stored = recordConfirmedItemMarketPurchase(matches[0].stage, matches[0].result); return { state: stored.ok ? 'recorded' : 'failed', reason: stored.reason || null, stage: matches[0].stage, result: matches[0].result, stored };
  }
  function collectItemMarketResultCandidates(node) { if (!node || node.nodeType !== 1) return []; const candidates = [node, ...Array.from(node.querySelectorAll?.('div,span,p,[role="alert"],[aria-live]') || [])]; return Array.from(new Set(candidates)).filter((candidate) => parseItemMarketSuccessText(candidate.textContent) || parseItemMarketFailureText(candidate.textContent)); }
  function startItemMarketResultObserver(stage) {
    if (!stage?.attemptId || stage.state !== 'yes-clicked') return false; stopItemMarketResultObserver(stage.attemptId, 'restarted'); const root = document.documentElement || document.body; if (!root) return false; const seen = new WeakSet(); let processing = false;
    const inspect = (node, scanType) => { for (const candidate of collectItemMarketResultCandidates(node)) { if (seen.has(candidate) || processing) continue; seen.add(candidate); logDebug('Item Market success candidate.', { attemptId: stage.attemptId, scanType }); const result = inspectItemMarketResultNode(candidate); logDebug(result?.state === 'recorded' ? 'Item Market success matched.' : 'Item Market success mismatch.', { attemptId: stage.attemptId, state: result?.state || null, reason: result?.reason || null }); if (result?.state === 'recorded') { processing = true; return; } } };
    const observer = new MutationObserver((mutations) => { for (const mutation of mutations) for (const node of mutation.addedNodes || []) inspect(node, 'mutation'); }); observer.observe(root, { childList: true, subtree: true }); const timeoutId = setTimeout(() => { if (stage.state === 'yes-clicked') cancelItemMarketStage(stage, 'timeout'); stopItemMarketResultObserver(stage.attemptId, 'timeout'); logDebug('Item Market result timeout.', { attemptId: stage.attemptId }); }, PURCHASE_CONFIRMATION_OBSERVATION_MS + 25); tornState.itemMarketResultObservers.set(stage.attemptId, { observer, timeoutId }); logDebug('Item Market result observer started.', { attemptId: stage.attemptId, root: sanitizePurchaseDiagnosticElement(root), isConnected: Boolean(root.isConnected) }); inspect(root, 'initial'); return true;
  }
  function handleItemMarketClick(event) {
    const target = event.target.closest?.('button'); if (!target || !tornState.itemMarketRoot?.contains(target)) return;
    const buyLabel = target.getAttribute('aria-label') || ''; if (/^Buy .+\?$/i.test(buyLabel)) { logDebug('item-market-offer-click.', buyLabel); createItemMarketStage(target, findItemMarketOfferRow(target)); return; }
    const label = normalizeBoundedText(target.textContent, 30).toLowerCase(); const close = target.getAttribute('aria-label') === 'Close panel'; if (!['yes', 'no'].includes(label) && !close) return; const panel = findItemMarketConfirmationContainer(target); const confirmation = parseItemMarketConfirmationText(panel?.textContent); const matched = matchItemMarketConfirmation(confirmation); if (!matched.ok) { logDebug('Item Market confirmation mismatch.', matched.reason); return; } const stage = matched.stage;
    if (label === 'no' || close) { cancelItemMarketStage(stage, label === 'no' ? 'user-no' : 'panel-closed'); return; }
    stage.state = 'yes-clicked'; stage.confirmation = confirmation; stage.yesClickedAt = Date.now(); stage.expiresAt = stage.yesClickedAt + PURCHASE_CONFIRMATION_OBSERVATION_MS; logDebug('Item Market confirmation Yes observed.', { attemptId: stage.attemptId, confirmation }); startItemMarketResultObserver(stage);
  }
  function createItemMarketPurchaseObserver() { const root = document.documentElement || document.body; if (!root) return { supported: false, reason: 'item-market-root-not-found', control: null, observationRoot: null }; return { supported: true, reason: null, control: document, observationRoot: root, interactionMethod: 'delegated-click' }; }
  function invalidateItemMarketAttemptsForRoute() { const routeItemId = parseTornItemMarketUrl(location.href)?.itemId || null; tornState.itemMarketAttempts.forEach((stage) => { if (!routeItemId || stage.itemId !== routeItemId) cancelItemMarketStage(stage, 'route-changed'); }); tornState.itemMarketRouteKey = location.href; }
  function initializeItemMarketPurchaseAdapter() {
    const adapter = createItemMarketPurchaseObserver(); if (!adapter.supported) return false; const root = adapter.observationRoot;
    if (tornState.itemMarketRoot !== root) { if (tornState.itemMarketRoot && tornState.itemMarketClickListener) document.removeEventListener('click', tornState.itemMarketClickListener, true); tornState.itemMarketObserver?.disconnect(); tornState.itemMarketRoot = root; tornState.itemMarketClickListener = handleItemMarketClick; document.addEventListener('click', handleItemMarketClick, true); }
    if (!tornState.itemMarketLifecycleAttached) { tornState.itemMarketLifecycleAttached = true; window.addEventListener('hashchange', invalidateItemMarketAttemptsForRoute); window.addEventListener('popstate', invalidateItemMarketAttemptsForRoute); window.addEventListener('pagehide', () => tornState.itemMarketAttempts.forEach((stage) => cancelItemMarketStage(stage, 'pagehide')), { once: true }); }
    invalidateItemMarketAttemptsForRoute(); logDebug('Item Market purchase adapter activated.'); return true;
  }
  function getBazaarContextForItem(itemId) { const contexts = Object.values(readPendingPurchaseContexts().pending).filter((context) => context.source === 'bazaar' && context.itemId === itemId); const associated = contexts.find((context) => context.correlationId === tornState.purchaseContextId); return associated || (contexts.length === 1 ? contexts[0] : null); }
  function createDirectBazaarContext(stage, now = Date.now()) { const created = createPendingPurchaseContext({ source: 'bazaar', itemId: stage.itemId, itemName: stage.itemName, sellerId: stage.sellerId, sellerName: stage.sellerName, origin: 'direct-bazaar' }, now); if (!created.ok) return null; created.context.claimedAt = now; const collection = readPendingPurchaseContexts(now); collection.pending[created.context.correlationId] = created.context; if (!writePendingPurchaseContexts(collection)) return null; logDebug('Direct Bazaar correlation created.', { correlationId: created.context.correlationId, itemId: stage.itemId }); return created.context; }
  function getBazaarObservationRoot(itemContainer) { return itemContainer?.ownerDocument?.getElementById?.('bazaarRoot') || document.getElementById('bazaarRoot') || itemContainer?.closest?.('[data-testid="row-items"]') || itemContainer?.closest?.('[data-testid="bazaar-items-row"]') || document.body || null; }
  function getCurrentBazaarResultRoot(preferredRoot) { const bazaarRoot = document.getElementById('bazaarRoot'); if (bazaarRoot?.isConnected) return bazaarRoot; if (preferredRoot?.isConnected) return preferredRoot; return document.body?.isConnected ? document.body : document.documentElement; }
  function collectBazaarSuccessCandidates(node) { if (!node || node.nodeType !== 1) return []; const selector = '[data-testid="success-message"][aria-label="Success"]'; const candidates = []; if (node.matches?.(selector)) candidates.push(node); candidates.push(...Array.from(node.querySelectorAll?.(selector) || [])); return Array.from(new Set(candidates)); }
  function persistBazaarConfirmationEvidence(context, attempt, confirmation) { attempt.attemptState = 'confirmed'; attempt.confirmationEvidence = { itemName: confirmation.itemName, quantity: confirmation.quantity, sellerName: confirmation.sellerName, totalPrice: confirmation.totalPrice, evidenceText: confirmation.evidenceText, confirmedAt: confirmation.confirmedAt }; attempt.lastConfirmationResult = 'confirmed'; attempt.lastConfirmationReason = 'exact-bazaar-success'; attempt.attemptUpdatedAt = Date.now(); updatePendingPurchaseAttempt(context.correlationId, attempt); logDebug('Bazaar success parsed.', { confirmedQuantity: confirmation.quantity, confirmedTotal: confirmation.totalPrice, confirmedSeller: confirmation.sellerName }); }
  function startBazaarSuccessObserver(context, attempt, observationRoot) {
    if (!context || !attempt) return false; stopPurchaseConfirmationObserver(context.correlationId, 'superseded'); const now = Date.now(); attempt.attemptState = attempt.manualConfirmationAction === 'yes' ? 'awaiting-confirmation' : 'purchase-submitted'; attempt.confirmationObservationStartedAt = now; attempt.confirmationObservationExpiresAt = now + PURCHASE_CONFIRMATION_OBSERVATION_MS; updatePendingPurchaseAttempt(context.correlationId, attempt);
    const seen = new WeakSet(); let activeRoot = null; let observer = null; let processing = false; let stopped = false;
    const inspect = (node, scanType = 'mutation') => { for (const successNode of collectBazaarSuccessCandidates(node)) { if (seen.has(successNode) || processing || stopped) continue; seen.add(successNode); logDebug('Bazaar success candidate found.', { scanType }); const latest = readPendingPurchaseContexts().pending[context.correlationId]; const current = latest?.attempts?.[attempt.attemptId]; if (!current) { logDebug('Bazaar success rejected.', 'bazaar-attempt-missing'); continue; } const result = resolveConfirmedBazaarPurchase(successNode, latest, current, activeRoot); logDebug(result.confirmed ? 'Bazaar success parsed and correlated.' : 'Bazaar success rejected.', result.confirmed ? { attemptId: current.attemptId } : result.reason); if (!result.confirmed) continue; processing = true; showTornStatus('Weav3r: Bazaar purchase confirmed by Torn.'); persistBazaarConfirmationEvidence(latest, current, result); const write = handleConfirmedBazaarPurchase(latest, current, result); logDebug('Bazaar v2 event persistence result.', { ok: write.ok, duplicate: Boolean(write.duplicate), conflict: Boolean(write.conflict) }); if (!write.ok) processing = false; } };
    const bind = (reason) => { if (stopped) return false; const nextRoot = getCurrentBazaarResultRoot(observationRoot); if (!nextRoot) return false; observer?.disconnect(); activeRoot = nextRoot; observer = new MutationObserver((mutations) => mutations.forEach((mutation) => Array.from(mutation.addedNodes || []).forEach((node) => inspect(node, 'mutation')))); observer.observe(activeRoot, { childList: true, subtree: true }); logDebug(reason === 'start' ? 'Bazaar result observer started.' : 'Bazaar result observer rebound/fallback.', { root: sanitizePurchaseDiagnosticElement(activeRoot), isConnected: Boolean(activeRoot.isConnected), reason }); logDebug('Bazaar initial success scan.', { reason }); inspect(activeRoot, 'initial'); return true; };
    const lifecycleRoot = document.documentElement || document.body; const lifecycleObserver = new MutationObserver(() => { if (activeRoot?.isConnected) return; logDebug('Bazaar observer root disconnected.', sanitizePurchaseDiagnosticElement(activeRoot)); bind('root-disconnected'); });
    const timeoutId = setTimeout(() => { const latest = readPendingPurchaseContexts().pending[context.correlationId]; const current = latest?.attempts?.[attempt.attemptId]; if (current && !current.confirmationEvidence) { current.attemptState = 'timed-out'; current.attemptUpdatedAt = Date.now(); const timedOut = appendPurchaseDiagnosticEvent(current, { type: 'observer-timeout', observedAt: Date.now(), summary: 'No exact Bazaar success evidence.' }); updatePendingPurchaseAttempt(context.correlationId, timedOut); } logDebug('Bazaar result observation timeout.', { correlationId: context.correlationId, attemptId: attempt.attemptId }); stopPurchaseConfirmationObserver(context.correlationId, 'timeout'); }, PURCHASE_CONFIRMATION_OBSERVATION_MS); tornState.purchaseObservers.set(context.correlationId, { get observer() { return observer; }, lifecycleObserver, timeoutId, attemptId: attempt.attemptId, stop() { stopped = true; observer?.disconnect(); lifecycleObserver.disconnect(); } });
    if (!bind('start')) { stopPurchaseConfirmationObserver(context.correlationId, 'root-missing'); return false; } if (lifecycleRoot) lifecycleObserver.observe(lifecycleRoot, { childList: true, subtree: true }); return true;
  }
  function buildConfirmedBazaarBuy(context, attempt, confirmation) { if (!context || !attempt || !confirmation?.confirmed || attempt.correlationId !== context.correlationId || confirmation.itemId !== attempt.itemId) return null; return normalizeConfirmedTransaction({ id: `buy:bazaar:${attempt.attemptId}`, type: 'buy', source: 'bazaar', itemId: confirmation.itemId, itemName: confirmation.itemName, quantity: confirmation.quantity, totalPrice: confirmation.totalPrice, counterpartyId: confirmation.sellerId, counterpartyName: confirmation.sellerName, origin: context.origin, expectedUnitPrice: attempt.observedUnitPrice, expectedTotalPrice: attempt.calculatedAttemptTotal, marketQuoteUnitPrice: context.displayedUnitPrice, confirmationMethod: 'bazaar-purchase-confirmation', confidence: 'confirmed', correlationId: context.correlationId, confirmedAt: confirmation.confirmedAt, createdAt: confirmation.confirmedAt }); }
  function deletePurchaseTransportById(correlationId) { const collection = readPurchaseTransports(); if (!collection.records[correlationId]) return true; delete collection.records[correlationId]; return gmSetDurable(PURCHASE_TRANSPORTS_KEY, collection, (stored) => !normalizePurchaseTransportsCollection(stored).records[correlationId]).ok; }
  function cleanupRecordedBazaarPurchase(context, attempt) { stopPurchaseConfirmationObserver(context.correlationId, 'recorded'); const transportRemoved = deletePurchaseTransportById(context.correlationId) || !readPurchaseTransports().records[context.correlationId]; const handoffRemoved = deleteBazaarHandoffById(context.correlationId) || !readBazaarHandoffs().records[context.correlationId]; if (!transportRemoved || !handoffRemoved) return false; const pendingRemoved = deletePendingPurchaseContext(context.correlationId); if (!pendingRemoved) return false; tornState.bazaarStages.forEach((stage, stageId) => { if (stage.correlationId === context.correlationId) tornState.bazaarStages.delete(stageId); }); renderTornPurchaseTracking(null); logDebug('Bazaar pending purchase cleanup completed.', { correlationId: context.correlationId, attemptId: attempt.attemptId }); return true; }
  function handleConfirmedBazaarPurchase(context, attempt, confirmation) { const latest = readPendingPurchaseContexts().pending[context.correlationId] || context; const current = latest.attempts?.[attempt.attemptId] || attempt; const transaction = buildConfirmedBazaarBuy(latest, current, confirmation); if (!transaction) return { ok: false, reason: 'invalid-bazaar-buy-transaction' }; current.persistenceState = 'pending'; current.transactionCandidate = transaction; updatePendingPurchaseAttempt(latest.correlationId, current); const result = recordConfirmedTransaction(transaction); if (result.ok) { current.persistenceState = 'recorded'; updatePendingPurchaseAttempt(latest.correlationId, current); cleanupRecordedBazaarPurchase(latest, current); showTornStatus(result.duplicate ? 'Weav3r: Bazaar purchase already recorded.' : 'Weav3r: Bazaar purchase confirmed and recorded.'); logDebug(result.duplicate ? 'Bazaar BUY duplicate ignored.' : 'Bazaar BUY transaction stored.', transaction.id); return result; } current.persistenceState = result.conflict ? 'conflict' : 'write-failed'; updatePendingPurchaseAttempt(latest.correlationId, current); showTornStatus(result.conflict ? 'Weav3r: Bazaar purchase confirmation conflicts with an existing transaction record.' : 'Weav3r: Bazaar purchase confirmed, but transaction history could not be saved.'); logDebug(result.conflict ? 'Bazaar BUY conflict.' : 'Bazaar BUY confirmed but storage failed.', { transactionId: transaction.id, reason: result.reason }); return result; }
  function retryConfirmedBazaarPurchase(context) { const attempt = context?.attempts?.[context.activeAttemptId]; const evidence = attempt?.confirmationEvidence; if (!attempt || !evidence) return null; if (attempt.persistenceState === 'recorded') { cleanupRecordedBazaarPurchase(context, attempt); return { ok: true, duplicate: true }; } return handleConfirmedBazaarPurchase(context, attempt, { confirmed: true, itemId: attempt.itemId, itemName: evidence.itemName, quantity: evidence.quantity, totalPrice: evidence.totalPrice, sellerId: attempt.observedSellerId, sellerName: evidence.sellerName, confirmationMethod: 'bazaar-purchase-confirmation', evidenceText: evidence.evidenceText, confirmedAt: evidence.confirmedAt }); }
  function captureBazaarBuyStage(itemContainer) { const preStage = tornState.bazaarMenuPreStages.get(itemContainer); const fallbackIdentity = preStage ? null : resolveBazaarItemIdentity(itemContainer); const itemId = normalizePositiveInt(preStage?.itemId || fallbackIdentity?.itemId); if (!itemId) return null; let context = getBazaarContextForItem(itemId); const parsed = parseBazaarBuyStage(itemContainer, context, Date.now(), preStage); if (!parsed.stage) { tornState.bazaarMenuPreStages.delete(itemContainer); logDebug('Bazaar buy stage rejected.', parsed.reason); return null; } tornState.bazaarMenuPreStages.delete(itemContainer); if (!context) { context = createDirectBazaarContext(parsed.stage); if (!context) return null; parsed.stage.correlationId = context.correlationId; } if (context.itemId !== parsed.stage.itemId) return null; const priorStageId = tornState.bazaarStageByItem.get(itemContainer); if (priorStageId) tornState.bazaarStages.delete(priorStageId); tornState.bazaarStages.set(parsed.stage.stageId, parsed.stage); tornState.bazaarStageByItem.set(itemContainer, parsed.stage.stageId); logDebug('Bazaar buy menu detected; purchase snapshot staged.', { stageId: parsed.stage.stageId, correlationId: parsed.stage.correlationId, observedQuantity: parsed.stage.observedQuantity, observedUnitPrice: parsed.stage.observedUnitPrice }); return parsed.stage; }
  function submitBazaarPurchaseStage(itemContainer, target, stage) {
    if (!stage || Date.now() - stage.buyButtonObservedAt > BAZAAR_BUY_STAGE_TTL_MS || !stage.observedQuantity || !stage.observedUnitPrice) return null;
    const context = readPendingPurchaseContexts().pending[stage.correlationId];
    if (!context || context.itemId !== stage.itemId || normalizedItemText(context.itemName) !== normalizedItemText(stage.itemName)) { logDebug('Bazaar native buy-button rejected.', 'staged-context-mismatch'); return null; }
    const observationRoot = getBazaarObservationRoot(itemContainer); if (!observationRoot) { logDebug('Bazaar native buy-button rejected.', 'bazaar-observation-root-missing'); return null; }
    const attempt = createPurchaseAttempt(context, { itemId: stage.itemId, itemName: stage.itemName, observedQuantity: stage.observedQuantity, observedUnitPrice: stage.observedUnitPrice, observedSellerId: stage.sellerId, observedSellerName: stage.sellerName, interactionMethod: 'button', route: `${location.pathname}${location.search}${location.hash}`, interactionEvidence: { controlFingerprint: sanitizePurchaseDiagnosticElement(target), dialogFingerprint: sanitizePurchaseDiagnosticElement(target.closest('[data-testid="buy-menu"]')) } });
    if (!attempt) return null; attempt.attemptState = 'purchase-submitted'; updatePendingPurchaseAttempt(context.correlationId, attempt); logDebug('Bazaar native buy-button clicked; purchase-submitted.', { attemptId: attempt.attemptId, correlationId: context.correlationId, quantity: attempt.observedQuantity, expectedUnitPrice: attempt.observedUnitPrice, expectedTotalPrice: attempt.calculatedAttemptTotal }); startBazaarSuccessObserver(context, attempt, observationRoot); renderTornPurchaseTracking(readPendingPurchaseContexts().pending[context.correlationId]); return attempt;
  }
  function handleBazaarRootClick(event) {
    const target = event.target?.closest?.('button'); if (!target) return;
    if (target.matches('button[data-testid="activate-buy-button"]')) { const itemContainer = target.closest('[data-testid="item"]'); if (itemContainer) captureBazaarMenuPreStage(itemContainer); logDebug('Bazaar activate-buy-button detected; menu identity only, no purchase attempt created.'); return; }
    const itemContainer = target.closest('[data-testid="item"]'); if (!itemContainer) return;
    if (target.matches('button[aria-label="Close panel"]')) { tornState.bazaarMenuPreStages.delete(itemContainer); const stageId = tornState.bazaarStageByItem.get(itemContainer); if (stageId) tornState.bazaarStages.delete(stageId); tornState.bazaarStageByItem.delete(itemContainer); logDebug('Bazaar buy menu closed; pre-stage discarded.'); return; }
    if (target.matches('button[data-testid="buy-button"]') && target.closest('[data-testid="buy-menu"]')) { const stage = captureBazaarBuyStage(itemContainer); if (stage) submitBazaarPurchaseStage(itemContainer, target, stage); return; }
    const controls = target.closest('[data-testid="buy-confirmation-controls"]'); if (!controls) return;
    const stageId = tornState.bazaarStageByItem.get(itemContainer); const stage = stageId ? tornState.bazaarStages.get(stageId) : null;
    if (target.matches('button[aria-label="No"]')) { if (stage) tornState.bazaarStages.delete(stage.stageId); tornState.bazaarStageByItem.delete(itemContainer); logDebug('Bazaar confirmation No observed; stage discarded.'); return; }
    if (!target.matches('button[aria-label="Yes"]') || !stage) return;
    const context = readPendingPurchaseContexts().pending[stage.correlationId]; const attempt = context?.attempts?.[context.activeAttemptId];
    if (attempt?.attemptState === 'purchase-submitted') { attempt.manualConfirmationAction = 'yes'; attempt.attemptState = 'awaiting-confirmation'; attempt.attemptUpdatedAt = Date.now(); updatePendingPurchaseAttempt(context.correlationId, attempt); logDebug('Optional Bazaar Yes detected for active purchase-submitted attempt.', { attemptId: attempt.attemptId }); return; }
    logDebug('Bazaar Yes ignored because no active purchase-submitted attempt exists.');
  }
  function ensureBazaarPurchaseAdapter() { const root = document.getElementById('bazaarRoot'); if (root) { initializeBazaarPurchaseAdapter(root); return; } if (tornState.bazaarBootstrapObserver || !document.body) return; tornState.bazaarBootstrapObserver = new MutationObserver(() => { const candidate = document.getElementById('bazaarRoot'); if (!candidate) return; tornState.bazaarBootstrapObserver.disconnect(); tornState.bazaarBootstrapObserver = null; initializeBazaarPurchaseAdapter(candidate); }); tornState.bazaarBootstrapObserver.observe(document.body, { childList: true, subtree: true }); setTimeout(() => { tornState.bazaarBootstrapObserver?.disconnect(); tornState.bazaarBootstrapObserver = null; }, TORN_HANDOFF_TIMEOUT_MS); }
  function initializeBazaarPurchaseAdapter(root) { if (!root || tornState.bazaarRoot === root) return; if (tornState.bazaarRoot && tornState.bazaarRootListener) tornState.bazaarRoot.removeEventListener('click', tornState.bazaarRootListener, true); tornState.bazaarRoot = root; tornState.bazaarRootListener = handleBazaarRootClick; root.addEventListener('click', handleBazaarRootClick, true); logDebug('Bazaar purchase adapter activated.'); }
  function updatePendingPurchaseAttempt(correlationId, attempt) { const collection = readPendingPurchaseContexts(); const context = collection.pending[correlationId]; if (!context || attempt?.correlationId !== correlationId) return null; context.attempts = { ...(context.attempts || {}), [attempt.attemptId]: normalizePurchaseAttempt(attempt) }; context.activeAttemptId = attempt.attemptId; context.attemptState = attempt.attemptState; context.updatedAt = Date.now(); collection.pending[correlationId] = context; if (!writePendingPurchaseContexts(collection)) return null; updatePurchaseTransportDiagnostic(correlationId, { lastKnownState: ['purchase-submitted', 'awaiting-confirmation'].includes(attempt.attemptState) ? attempt.attemptState : 'interaction-observed', purchaseInteractionObservedAt: attempt.attemptStartedAt, lastDiagnosticAt: Date.now() }); return context; }
  function stopPurchaseConfirmationObserver(correlationId, reason = 'stopped') { const active = tornState.purchaseObservers.get(correlationId); if (!active) return; active.stop?.(); active.observer?.disconnect(); active.lifecycleObserver?.disconnect(); clearTimeout(active.timeoutId); tornState.purchaseObservers.delete(correlationId); logDebug('Purchase confirmation observer stopped.', { correlationId, reason }); }
  function startPurchaseConfirmationObserver(context, attempt, root) { if (!root || !context || !attempt) return false; stopPurchaseConfirmationObserver(context.correlationId, 'superseded'); const expiresAt = Date.now() + PURCHASE_CONFIRMATION_OBSERVATION_MS; attempt.attemptState = 'awaiting-confirmation'; attempt.confirmationObservationStartedAt = Date.now(); attempt.confirmationObservationExpiresAt = expiresAt; updatePendingPurchaseAttempt(context.correlationId, attempt); const observer = new MutationObserver((mutations) => { const candidate = mutations.flatMap((mutation) => Array.from(mutation.addedNodes || [])).find((node) => node?.nodeType === 1 && (node.matches?.('[role="alert"],[aria-live]') || node.querySelector?.('[role="alert"],[aria-live]'))); if (!candidate) return; const element = candidate.matches?.('[role="alert"],[aria-live]') ? candidate : candidate.querySelector('[role="alert"],[aria-live]'); const summary = sanitizePurchaseDiagnosticElement(element); const latest = readPendingPurchaseContexts().pending[context.correlationId]; const current = latest?.attempts?.[attempt.attemptId]; if (!current || !summary) return; const adapter = context.source === 'bazaar' ? resolveConfirmedBazaarPurchase(element, current) : resolveConfirmedItemMarketPurchase(element, current); let updated = appendPurchaseDiagnosticEvent(current, { type: 'candidate-alert', observedAt: Date.now(), summary }); updated = appendPurchaseDiagnosticEvent(updated, { type: 'confirmation-adapter-unconfirmed', observedAt: Date.now(), summary: { confirmed: adapter.confirmed, reason: adapter.reason } }); updatePendingPurchaseAttempt(context.correlationId, updated); renderTornPurchaseTracking(latest); logDebug('Candidate purchase response observed.', { eventType: 'candidate-alert', summary }); }); observer.observe(root, { childList: true, subtree: true }); const timeoutId = setTimeout(() => { const latest = readPendingPurchaseContexts().pending[context.correlationId]; const current = latest?.attempts?.[attempt.attemptId]; if (current) { let updated = appendPurchaseDiagnosticEvent(current, { type: 'observer-timeout', observedAt: Date.now(), summary: 'No exact supported success evidence.' }); updated.lastConfirmationResult = 'unconfirmed'; updated.lastConfirmationReason = 'no-supported-success-evidence'; updatePendingPurchaseAttempt(context.correlationId, updated); renderTornPurchaseTracking(latest); } stopPurchaseConfirmationObserver(context.correlationId, 'timeout'); logDebug('Purchase attempt remains unconfirmed.', context.correlationId); }, PURCHASE_CONFIRMATION_OBSERVATION_MS); tornState.purchaseObservers.set(context.correlationId, { observer, timeoutId, attemptId: attempt.attemptId }); logDebug('Purchase confirmation observer started.', { correlationId: context.correlationId, observationRootFingerprint: sanitizePurchaseDiagnosticElement(root), expiresAt }); return true; }
  function observeNativePurchaseInteraction(context, adapter, input = {}) { if (!context || !adapter?.supported || !adapter.control || !adapter.observationRoot) return null; const existing = tornState.purchaseBindings.get(context.correlationId); if (existing?.control === adapter.control) return existing; if (existing) existing.control.removeEventListener(existing.eventType, existing.handler, true); const handler = () => { const snapshot = typeof adapter.readSnapshot === 'function' ? adapter.readSnapshot() : input; let attempt = createPurchaseAttempt(context, { ...snapshot, route: `${location.pathname}${location.search}${location.hash}`, interactionMethod: adapter.interactionMethod || 'button', interactionEvidence: { controlFingerprint: sanitizePurchaseDiagnosticElement(adapter.control), dialogFingerprint: sanitizePurchaseDiagnosticElement(adapter.observationRoot) } }); if (!attempt) return; updatePendingPurchaseAttempt(context.correlationId, attempt); logDebug('User-generated purchase interaction observed.', { attemptId: attempt.attemptId, correlationId: context.correlationId, quantity: attempt.observedQuantity || null, observedUnitPrice: attempt.observedUnitPrice || null, observedTotalPrice: attempt.observedTotalPrice || null }); startPurchaseConfirmationObserver(context, attempt, adapter.observationRoot); renderTornPurchaseTracking(readPendingPurchaseContexts().pending[context.correlationId]); }; const eventType = adapter.interactionMethod === 'form' ? 'submit' : 'click'; adapter.control.addEventListener(eventType, handler, true); const binding = { control: adapter.control, handler, eventType }; tornState.purchaseBindings.set(context.correlationId, binding); return binding; }
  function purchaseTrackingStatus(context) { const attempt = context?.attempts?.[context.activeAttemptId]; if (attempt?.persistenceState === 'write-failed') return 'Bazaar purchase confirmed, but transaction history could not be saved'; if (attempt?.persistenceState === 'conflict') return 'Bazaar purchase confirmation conflicts with existing history'; if (attempt?.confirmationEvidence) return 'Bazaar purchase confirmed by Torn'; if (['purchase-submitted', 'awaiting-confirmation'].includes(attempt?.attemptState)) return 'Awaiting exact Torn confirmation'; if (attempt?.attemptState === 'timed-out') return 'No exact Torn confirmation observed'; if (attempt) return 'Purchase interaction observed'; return 'Destination claimed'; }
  function renderTornPurchaseTracking(context) { addTornHandoffStyles(); let panel = document.getElementById(PURCHASE_TRACKING_PANEL_ID); if (!context) { panel?.remove(); return; } if (!panel) { panel = document.createElement('section'); panel.id = PURCHASE_TRACKING_PANEL_ID; panel.setAttribute('role', 'status'); document.body.appendChild(panel); } panel.innerHTML = `<strong>Weav3r purchase tracking</strong><span>${escapeHtml(context.itemName)} [${context.itemId}] · ${escapeHtml(transactionSourceLabel(context.source))}</span><small>Correlation: ${escapeHtml(context.correlationId)}</small><span>Status: ${escapeHtml(purchaseTrackingStatus(context))}</span><button type="button" data-wah-copy-purchase-diagnostics="${escapeAttribute(context.correlationId)}">Copy diagnostics</button><textarea hidden readonly aria-label="Purchase diagnostics"></textarea>`; }
  async function copyPurchaseDiagnostics(correlationId, button) { const context = readPendingPurchaseContexts().pending[correlationId]; if (!context) return; const payload = serializePurchaseDiagnostics(context); try { await navigator.clipboard.writeText(payload); button.textContent = 'Copied'; } catch (_) { const textarea = button.parentElement?.querySelector('textarea'); if (textarea) { textarea.hidden = false; textarea.value = payload; textarea.focus(); textarea.select(); } } }
  function initializeClaimedPurchaseObservation(context) { if (!context) return; const retry = context.source === 'bazaar' ? retryConfirmedBazaarPurchase(context) : null; if (retry?.ok) return; tornState.purchaseContextId = context.correlationId; renderTornPurchaseTracking(context); if (context.source === 'item-market') initializeItemMarketPurchaseAdapter(); else { const adapter = createBazaarPurchaseObserver(context); observeNativePurchaseInteraction(context, adapter); } logDebug('Purchase destination claimed.', { source: context.source, itemId: context.itemId, correlationId: context.correlationId }); if (!tornState.purchaseListenersAttached) { document.addEventListener('click', (event) => { const button = event.target.closest?.('[data-wah-copy-purchase-diagnostics]'); if (button) copyPurchaseDiagnostics(button.dataset.wahCopyPurchaseDiagnostics, button); }); const reevaluate = () => initTornMarketPurchaseInfrastructure(context.source); window.addEventListener('hashchange', reevaluate); window.addEventListener('popstate', reevaluate); window.addEventListener('beforeunload', () => { tornState.purchaseObservers.forEach((_value, id) => stopPurchaseConfirmationObserver(id, 'unload')); tornState.purchaseBindings.forEach((binding) => binding.control.removeEventListener(binding.eventType, binding.handler, true)); tornState.purchaseBindings.clear(); tornState.bazaarBootstrapObserver?.disconnect(); tornState.bazaarMenuPreStages = new WeakMap(); tornState.itemMarketObserver?.disconnect(); if (tornState.itemMarketRoot && tornState.itemMarketClickListener) document.removeEventListener('click', tornState.itemMarketClickListener, true); tornState.itemMarketResultObservers.forEach((_value, attemptId) => stopItemMarketResultObserver(attemptId, 'unload')); if (tornState.bazaarRoot && tornState.bazaarRootListener) tornState.bazaarRoot.removeEventListener('click', tornState.bazaarRootListener, true); revokeHistoryExportUrls(); }, { once: true }); tornState.purchaseListenersAttached = true; } }
  function inspectPendingPurchaseConfirmation(source, context) { const adapter = source === 'bazaar' ? resolveConfirmedBazaarPurchase : resolveConfirmedItemMarketPurchase; const result = adapter(); logDebug('confirmation adapter invoked.', { source, correlationId: context?.correlationId || null, confirmed: result.confirmed, reason: result.reason, route: `${location.pathname}${location.search}${location.hash}`, pendingContextAge: context ? Date.now() - context.startedAt : null }); if (!result.confirmed) logDebug('Purchase remains unconfirmed; no ledger entry created.'); return result; }
  function initTornMarketPurchaseInfrastructure(source) { const collection = prunePendingPurchaseContexts(); if (source === 'bazaar') { ensureBazaarPurchaseAdapter(); createBazaarPurchaseObserver(); } else initializeItemMarketPurchaseAdapter(); const routeItemId = source === 'item-market' ? parseTornItemMarketUrl(location.href)?.itemId : null; const claimed = source === 'item-market' && routeItemId ? claimPurchaseTransportForTorn(source, '', routeItemId) : null; const candidates = Object.values(readPendingPurchaseContexts().pending).filter((context) => context.source === source && (!routeItemId || context.itemId === routeItemId)); const context = claimed || (candidates.length === 1 ? candidates[0] : null); if (context) initializeClaimedPurchaseObservation(context); else { renderTornPurchaseTracking(null); if (source === 'bazaar') tornState.bazaarMenuPreStages = new WeakMap(); tornState.purchaseObservers.forEach((_value, id) => stopPurchaseConfirmationObserver(id, 'route-mismatch')); tornState.purchaseBindings.forEach((binding) => binding.control.removeEventListener(binding.eventType, binding.handler, true)); tornState.purchaseBindings.clear(); } logDebug(source === 'item-market' ? 'Item Market purchase adapter reconciled.' : 'Purchase confirmation observation reconciled.', { source, route: `${location.pathname}${location.search}${location.hash}`, candidateContexts: candidates.length }); }
  function normalizePurchaseTransport(raw, now = Date.now()) { if (!raw || raw.version !== 1) return null; const correlationId = normalizeBoundedText(raw.correlationId, 120); const source = ['bazaar', 'item-market'].includes(raw.source) ? raw.source : null; const itemId = normalizePositiveInt(raw.itemId); const itemName = normalizeBoundedText(raw.itemName, 150); const origin = ['watchlist', 'item-page', 'weav3r-native-click'].includes(raw.origin) ? raw.origin : null; const createdAt = Number(raw.createdAt); const expiresAt = Number(raw.expiresAt); const expectedDestination = source ? normalizeConcreteMarketUrl(source, raw.expectedDestination, itemId) : ''; if (!correlationId || !source || !itemId || !itemName || !origin || !expectedDestination || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= now) return null; const record = { version: 1, correlationId, source, itemId, itemName, origin, expectedDestination, createdAt, expiresAt }; const price = normalizeMoneyString(raw.displayedUnitPrice); const sellerId = normalizePositiveInt(raw.sellerId); const sellerName = normalizeBoundedText(raw.sellerName, 100); const offerId = normalizeBoundedText(raw.offerId, 100); if (price) record.displayedUnitPrice = price; if (sellerId) record.sellerId = sellerId; if (sellerName) record.sellerName = sellerName; if (offerId) record.offerId = offerId; const intendedQuantity = normalizePositiveInt(raw.intendedQuantity); if (intendedQuantity) record.intendedQuantity = intendedQuantity; const stateValue = ['destination-claimed', 'interaction-observed', 'awaiting-confirmation'].includes(raw.lastKnownState) ? raw.lastKnownState : null; if (stateValue) record.lastKnownState = stateValue; for (const field of ['claimedAt', 'purchaseInteractionObservedAt', 'lastDiagnosticAt']) { const value = Number(raw[field]); if (Number.isFinite(value) && value > 0) record[field] = value; } return record; }
  function normalizePurchaseTransportsCollection(raw) { const records = {}; Object.values(raw?.records || {}).forEach((value) => { const record = normalizePurchaseTransport(value); if (record) records[record.correlationId] = record; }); return { version: 1, records }; }
  function readPurchaseTransports() { return normalizePurchaseTransportsCollection(gmGet(PURCHASE_TRANSPORTS_KEY, { version: 1, records: {} })); }
  function updatePurchaseTransportDiagnostic(correlationId, fields) { const current = readPurchaseTransports().records[correlationId]; if (!current) return { ok: false, reason: 'purchase-transport-missing' }; const record = normalizePurchaseTransport({ ...current, ...fields }, Date.now() - 1); if (!record) return { ok: false, reason: 'invalid-purchase-transport-diagnostic' }; return mergeCriticalRecord(PURCHASE_TRANSPORTS_KEY, { version: 1, records: {} }, correlationId, record, normalizePurchaseTransportsCollection); }
  function createPurchaseTransport(input, now = Date.now()) { const correlationId = normalizeBoundedText(input?.correlationId, 120) || `purchase:${now.toString(36)}:${Math.random().toString(36).slice(2, 10)}`; const record = normalizePurchaseTransport({ ...input, version: 1, correlationId, createdAt: now, expiresAt: now + PENDING_PURCHASE_TTL_MS }, now - 1); if (!record) return { ok: false, reason: 'invalid-purchase-transport', record: null }; const result = mergeCriticalRecord(PURCHASE_TRANSPORTS_KEY, { version: 1, records: {} }, correlationId, record, normalizePurchaseTransportsCollection); if (!result.ok) return { ok: false, reason: 'purchase-transport-write-failed', record: null }; logDebug('Purchase transport created.', { correlationId, source: record.source, itemId: record.itemId, origin: record.origin }); return { ok: true, record: result.collection.records[correlationId] }; }
  function claimPurchaseTransportForTorn(source, correlationId = '', routeItemId = null) { const transports = readPurchaseTransports(); let candidates = Object.values(transports.records).filter((record) => record.source === source); if (correlationId) candidates = candidates.filter((record) => record.correlationId === correlationId); if (routeItemId) candidates = candidates.filter((record) => record.itemId === normalizePositiveInt(routeItemId)); if (candidates.length !== 1) { logDebug('transport rejected due to route mismatch.', { source, candidates: candidates.length }); return null; } const transport = candidates[0]; const collection = readPendingPurchaseContexts(); const previous = collection.pending[transport.correlationId]; collection.pending[transport.correlationId] = normalizePendingPurchaseContext({ ...transport, ...previous, startedAt: previous?.startedAt || transport.createdAt, updatedAt: Date.now(), claimedAt: previous?.claimedAt || Date.now() }, Date.now() - 1); if (!collection.pending[transport.correlationId] || !writePendingPurchaseContexts(collection)) return null; updatePurchaseTransportDiagnostic(transport.correlationId, { lastKnownState: 'destination-claimed', claimedAt: collection.pending[transport.correlationId].claimedAt, lastDiagnosticAt: Date.now() }); logDebug('transport claimed by Torn tab.', { correlationId: transport.correlationId, source, itemId: transport.itemId }); return collection.pending[transport.correlationId]; }
  function isHandoffExpired(handoff) { return !handoff || !Number.isFinite(Number(handoff.expiresAt)) || Number(handoff.expiresAt) <= Date.now(); }
  function normalizePersonalRatingState(stateValue) { return ['positive', 'negative', 'not-rated', 'unknown'].includes(stateValue) ? stateValue : 'unknown'; }
  function normalizePersonalRatingRecord(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
    const traderId = normalizePositiveInt(raw.traderId);
    const stateValue = normalizePersonalRatingState(raw.state);
    const observedAt = Number(raw.observedAt);
    if (!traderId || stateValue === 'unknown' || !Number.isFinite(observedAt) || observedAt <= 0) return null;
    return { version: 1, traderId, traderName: normalizeBoundedText(raw.traderName, 100), state: stateValue, observedAt, source: normalizeBoundedText(raw.source, 60) || 'unknown' };
  }
  function readTraderPersonalRatings() { const raw = gmGet(TRADER_PERSONAL_RATINGS_KEY, { version: 1, records: {} }); const records = {}; Object.values(raw?.records || {}).forEach((value) => { const record = normalizePersonalRatingRecord(value); if (record) records[String(record.traderId)] = record; }); const output = { version: 1, records }; if (JSON.stringify(raw) !== JSON.stringify(output)) gmSet(TRADER_PERSONAL_RATINGS_KEY, output); return output; }
  function writeTraderPersonalRatings(collection) { gmSet(TRADER_PERSONAL_RATINGS_KEY, { version: 1, records: collection.records || {} }); }
  function mergeTraderPersonalRating(observation) {
    const record = normalizePersonalRatingRecord({ version: 1, ...observation });
    if (!record) return null;
    const collection = readTraderPersonalRatings();
    const previous = collection.records[String(record.traderId)];
    if (previous && previous.observedAt > record.observedAt) return previous;
    collection.records[String(record.traderId)] = record;
    writeTraderPersonalRatings(collection);
    return record;
  }
  function getTraderPersonalRatingRecord(traderId) { return readTraderPersonalRatings().records[String(normalizePositiveInt(traderId))] || null; }
  function applyPersonalRatingToTrader(trader) {
    const record = getTraderPersonalRatingRecord(trader?.traderId);
    const previousState = normalizePersonalRatingState(trader?.personalRatingState);
    const previousObservedAt = Number(trader?.personalRatingObservedAt) || null;
    const useRecord = record && (!previousObservedAt || record.observedAt >= previousObservedAt || previousState === 'unknown');
    const stateValue = useRecord ? record.state : previousState;
    if (stateValue === 'negative') logDebug('cached negative applied to Trader.', trader?.traderId);
    return { ...trader, personalRatingState: stateValue, personalRatingObservedAt: useRecord ? record.observedAt : previousObservedAt, personalRatingSource: useRecord ? record.source : trader?.personalRatingSource || null };
  }
  function formatPersonalRatingState(stateValue) { return stateValue === 'positive' ? 'Rated positively by you' : stateValue === 'negative' ? 'Excluded · rated negatively by you' : stateValue === 'not-rated' ? 'Not yet rated by you' : 'Your rating status is unknown'; }
  function isTraderPersonallyAcceptable(trader) { return trader?.personalRatingState !== 'negative'; }
  function normalizeTradeProgress(progress = {}) { return { ...emptyTradeProgress(), descriptionAppliedAt: Number(progress.descriptionAppliedAt) || null, descriptionSkippedAt: Number(progress.descriptionSkippedAt) || null, initiateButtonEnabledAt: Number(progress.initiateButtonEnabledAt) || null, tradeIdCapturedAt: Number(progress.tradeIdCapturedAt) || null, addStepEnteredAt: Number(progress.addStepEnteredAt) || null, itemFilterAppliedAt: Number(progress.itemFilterAppliedAt) || null, itemFilterDismissedAt: Number(progress.itemFilterDismissedAt) || null, itemNotFoundAt: Number(progress.itemNotFoundAt) || null, completedAt: Number(progress.completedAt) || null, itemFilterMode: progress.itemFilterMode === 'all' ? 'all' : 'target-only' }; }
  function normalizeHandoff(raw, type) {
    if (!raw || typeof raw !== 'object' || ![1, 2].includes(raw.version) || isHandoffExpired(raw)) return null;
    const itemId = normalizePositiveInt(raw.itemId);
    const itemName = normalizeBoundedText(raw.itemName, 150);
    const createdAt = Number(raw.createdAt);
    const expiresAt = Number(raw.expiresAt);
    if (!itemId || !itemName || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null;
    if (type === 'bazaar') {
      const purchasePrice = normalizeNonNegativeInt(raw.purchasePrice);
      if (raw.action !== 'open-cheapest-offer' || purchasePrice == null) return null;
      return { version: 1, handoffId: normalizeBoundedText(raw.handoffId, 80) || makeHandoffId(), action: raw.action, itemId, itemName, purchasePrice, sellerId: normalizePositiveInt(raw.sellerId), targetUrl: normalizeBoundedText(raw.targetUrl, 500), correlationId: normalizeBoundedText(raw.correlationId, 120), sellerName: normalizeBoundedText(raw.sellerName, 100), offerQuantity: normalizePositiveInt(raw.offerQuantity), origin: normalizeBoundedText(raw.origin, 60), selectionMode: raw.selectionMode === 'manual-exact' ? 'manual-exact' : null, searchIntent: raw.searchIntent === 'explicit-item' ? 'explicit-item' : null, createdAt, expiresAt };
    }
    if (type === 'trade') {
      const traderId = normalizePositiveInt(raw.traderId);
      const unitSellPrice = normalizeNonNegativeInt(raw.unitSellPrice);
      if (raw.action !== 'trade-now' || !traderId || unitSellPrice == null) return null;
      const traderLastSeenAt = Number(raw.traderLastSeenAt);
      const traderTradeEligibleUntil = Number(raw.traderTradeEligibleUntil);
      return { version: 2, handoffId: normalizeBoundedText(raw.handoffId, 80) || makeHandoffId(), action: raw.action, itemId, itemName, traderId, traderName: normalizeBoundedText(raw.traderName, 100), traderRating: parseRating(raw.traderRating), unitSellPrice, targetUrl: normalizeBoundedText(raw.targetUrl, 500), tradeId: normalizePositiveInt(raw.tradeId), traderActivityText: normalizeBoundedText(raw.traderActivityText, 120), traderLastSeenAt: Number.isFinite(traderLastSeenAt) && traderLastSeenAt > 0 ? traderLastSeenAt : null, traderTradeEligibleUntil: Number.isFinite(traderTradeEligibleUntil) && traderTradeEligibleUntil > 0 ? traderTradeEligibleUntil : null, traderPricelistUrl: normalizeBoundedText(raw.traderPricelistUrl, 500), personalRatingStateAtHandoff: normalizePersonalRatingState(raw.personalRatingStateAtHandoff), personalRatingObservedAt: Number(raw.personalRatingObservedAt) || null, origin: normalizeBoundedText(raw.origin, 60), selectionMode: raw.selectionMode === 'manual-exact' ? 'manual-exact' : null, createdAt, expiresAt, progress: normalizeTradeProgress(raw.progress) };
    }
    return null;
  }
  function normalizeBazaarHandoffsCollection(raw) { const records = {}; Object.values(raw?.records || {}).forEach((value) => { const handoff = normalizeHandoff(value, 'bazaar'); if (handoff) records[handoff.correlationId || handoff.handoffId] = handoff; }); return { version: 2, records }; }
  function readBazaarHandoffs() { return normalizeBazaarHandoffsCollection(gmGet(BAZAAR_HANDOFFS_KEY, { version: 2, records: {} })); }
  function writeBazaarHandoff(handoff) { const normalized = normalizeHandoff(handoff, 'bazaar'); const key = normalized?.correlationId || normalized?.handoffId; if (!normalized || !key) return null; const result = mergeCriticalRecord(BAZAAR_HANDOFFS_KEY, { version: 2, records: {} }, key, normalized, normalizeBazaarHandoffsCollection); return result.ok ? result.collection.records[key] : null; }
  function deleteBazaarHandoffById(key) { const collection = readBazaarHandoffs(); if (!collection.records[key]) return false; delete collection.records[key]; const result = gmSetDurable(BAZAAR_HANDOFFS_KEY, collection, (stored) => !normalizeBazaarHandoffsCollection(stored).records[key]); return result.ok; }
  function migrateLegacyBazaarHandoff() { const legacy = normalizeHandoff(gmGet(BAZAAR_HANDOFF_KEY, null), 'bazaar'); if (!legacy) { gmDelete(BAZAAR_HANDOFF_KEY); return; } const stored = writeBazaarHandoff(legacy); if (stored) gmDelete(BAZAAR_HANDOFF_KEY); }
  function findMatchingBazaarHandoff() { migrateLegacyBazaarHandoff(); const matches = Object.entries(readBazaarHandoffs().records).filter(([, handoff]) => validateBazaarTarget(handoff)); return matches.length === 1 ? { key: matches[0][0], handoff: matches[0][1] } : null; }
  function clearBazaarHandoff() { /* legacy singleton is migrated; collection records are deleted exactly */ }
  function normalizeTradeHandoffsCollection(raw) { const records = {}; Object.values(raw?.records || {}).forEach((value) => { const handoff = normalizeHandoff(value, 'trade'); if (handoff) records[handoff.handoffId] = handoff; }); return { version: 2, records }; }
  function readTradeHandoffs() { const collection = normalizeTradeHandoffsCollection(gmGet(TRADE_HANDOFFS_KEY, { version: 2, records: {} })); logDebug('Trade handoff collection loaded.', { count: Object.keys(collection.records).length }); return collection; }
  function writeTradeHandoffs(collection) { const normalized = normalizeTradeHandoffsCollection(collection); const result = gmSetDurable(TRADE_HANDOFFS_KEY, normalized, (stored) => Object.keys(normalized.records).every((id) => normalizeTradeHandoffsCollection(stored).records[id])); return result.ok ? normalizeTradeHandoffsCollection(gmGet(TRADE_HANDOFFS_KEY, { version: 2, records: {} })) : null; }
  function getTradeHandoffById(handoffId) { const id = normalizeBoundedText(handoffId, 80); return id ? readTradeHandoffs().records[id] || null : null; }
  function upsertTradeHandoff(handoff) { const normalized = normalizeHandoff(handoff, 'trade'); if (!normalized) return null; const result = mergeCriticalRecord(TRADE_HANDOFFS_KEY, { version: 2, records: {} }, normalized.handoffId, normalized, normalizeTradeHandoffsCollection); if (!result.ok) return null; logDebug('Trade handoff stored.', normalized.handoffId); return result.collection.records[normalized.handoffId]; }
  function deleteTradeHandoffById(handoffId) { const id = normalizeBoundedText(handoffId, 80); if (!id) return false; const collection = readTradeHandoffs(); if (!collection.records[id]) return false; delete collection.records[id]; writeTradeHandoffs(collection); logDebug('pending handoff removed; unrelated handoffs preserved.', id); return !getTradeHandoffById(id); }
  function migrateLegacyTradeHandoff() { const legacyRaw = gmGet(TRADE_HANDOFF_KEY, null); if (!legacyRaw) return; const legacy = normalizeHandoff(legacyRaw, 'trade'); if (!legacy) { gmDelete(TRADE_HANDOFF_KEY); return; } const stored = upsertTradeHandoff(legacy); if (stored?.handoffId === legacy.handoffId) gmDelete(TRADE_HANDOFF_KEY); }
  function getAssociatedTradeHandoff() { const id = getActiveTradeAssociation(); return id ? getTradeHandoffById(id) : null; }
  function readTradeHandoff() { return getAssociatedTradeHandoff(); }
  function writeTradeHandoff(handoff) { return upsertTradeHandoff(handoff); }
  function clearTradeHandoff(handoffId = getActiveTradeAssociation()) { return deleteTradeHandoffById(handoffId); }
  function pruneExpiredHandoffs() { migrateLegacyBazaarHandoff(); gmSetDurable(BAZAAR_HANDOFFS_KEY, readBazaarHandoffs()); migrateLegacyTradeHandoff(); writeTradeHandoffs(readTradeHandoffs()); if (getActiveTradeAssociation() && !getAssociatedTradeHandoff()) clearActiveTradeAssociation(getActiveTradeAssociation()); }
  function createBazaarHandoffFromResult(result, itemIdOverride = state.itemId, itemNameOverride = '') {
    const purchase = result?.lowestPurchase;
    const handoffItemId = normalizePositiveInt(itemIdOverride);
    if (!purchase?.sellerUrl || !purchase.price || !handoffItemId) return null;
    let sellerId = null;
    try { sellerId = normalizePositiveInt(new URL(purchase.sellerUrl).searchParams.get('userId')); } catch (_) { sellerId = null; }
    const itemName = normalizeBoundedText(itemNameOverride, 150) || getCurrentItemName();
    if (!itemName) return null;
    const createdAt = Date.now();
    return { version: 1, handoffId: makeHandoffId(), action: 'open-cheapest-offer', itemId: handoffItemId, itemName, purchasePrice: Math.round(purchase.price), sellerId, targetUrl: purchase.sellerUrl, createdAt, expiresAt: createdAt + BAZAAR_HANDOFF_TTL_MS };
  }
  function createBazaarHandoffFromConcreteOffer(offer, itemName = '', correlationId = '') {
    if (offer?.source !== 'bazaar') return null;
    const itemId = normalizePositiveInt(offer.itemId);
    const targetUrl = normalizeConcreteMarketUrl('bazaar', offer.url, itemId);
    const purchasePrice = normalizeNonNegativeInt(offer.unitPrice);
    const name = normalizeBoundedText(itemName, 150);
    if (!itemId || !targetUrl || !name || purchasePrice == null) return null;
    const createdAt = Date.now();
    return { version: 1, handoffId: makeHandoffId(), action: 'open-cheapest-offer', itemId, itemName: name, purchasePrice, sellerId: normalizePositiveInt(offer.sellerId), targetUrl, correlationId: normalizeBoundedText(correlationId, 120), createdAt, expiresAt: createdAt + BAZAAR_HANDOFF_TTL_MS };
  }
  function createTradeHandoffFromResult(result, itemIdOverride = state.itemId, itemNameOverride = '') {
    const trader = result?.bestTrader;
    const handoffItemId = normalizePositiveInt(itemIdOverride);
    if (!trader?.tradeNowUrl || !trader.traderId || !trader.buyPrice || !handoffItemId) return null;
    const itemName = normalizeBoundedText(itemNameOverride, 150) || getCurrentItemName();
    if (!itemName) return null;
    const createdAt = Date.now();
    const handoffId = makeHandoffId(); const targetUrl = new URL(trader.tradeNowUrl); const hash = new URLSearchParams(targetUrl.hash.replace(/^#/, '')); hash.set('wahHandoffId', handoffId); targetUrl.hash = hash.toString();
    return { version: 2, handoffId, action: 'trade-now', itemId: handoffItemId, itemName, traderId: normalizePositiveInt(trader.traderId), traderName: normalizeBoundedText(trader.traderName, 100), traderRating: trader.rating, unitSellPrice: Math.round(trader.buyPrice), targetUrl: targetUrl.href, tradeId: null, traderActivityText: normalizeBoundedText(trader.activityText, 120), traderLastSeenAt: Number(trader.lastSeenAt) || null, traderTradeEligibleUntil: Number(trader.tradeEligibleUntil) || null, traderPricelistUrl: normalizeBoundedText(trader.priceListUrl, 500), personalRatingStateAtHandoff: trader.personalRatingState || 'unknown', personalRatingObservedAt: Number(trader.personalRatingObservedAt) || null, createdAt, expiresAt: createdAt + TRADE_HANDOFF_TTL_MS, progress: emptyTradeProgress() };
  }
  function parseTradeHash(hash = location.hash) { const params = new URLSearchParams(String(hash || '').replace(/^#/, '')); const rawStep = normalizeBoundedText(params.get('step'), 20).toLowerCase(); const step = ['start', 'view', 'add'].includes(rawStep) ? rawStep : null; const traderId = normalizePositiveInt(params.get('userID') || params.get('userId')); const tradeId = normalizePositiveInt(params.get('ID') || params.get('id')); const handoffId = normalizeBoundedText(params.get('wahHandoffId'), 80); return { step, traderId, tradeId, userID: traderId, handoffId }; }
  function formatTradeDescription(handoff) { return `${normalizeBoundedText(handoff.itemName, 150)} for ${formatMoney(handoff.unitSellPrice)} each`.replace(/\s+/g, ' ').trim().slice(0, 250); }
  function dispatchTextInputEvent(input, type, value) { try { input.dispatchEvent(new InputEvent(type, { bubbles: true, cancelable: type === 'beforeinput', inputType: 'insertText', data: value })); } catch (_) { input.dispatchEvent(new Event(type, { bubbles: true, cancelable: type === 'beforeinput' })); } }
  function setControlledInputValue(input, value, options = {}) {
    if (!input || typeof value !== 'string') return false;
    if (options.focusFirst) { try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); } }
    if (options.beforeInput) dispatchTextInputEvent(input, 'beforeinput', value);
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(input, value); else input.value = value;
    dispatchTextInputEvent(input, 'input', value);
    if (options.change) input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === value;
  }
  function addTornHandoffStyles() {
    if (document.getElementById(TORN_HANDOFF_STYLE_ID)) return;
    GM_addStyle(`#${TORN_HANDOFF_STATUS_ID}{position:fixed;right:16px;bottom:16px;z-index:2147482600;max-width:min(360px,calc(100vw - 32px));background:#111827;color:#f8fafc;border:1px solid rgba(255,255,255,.18);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.35);padding:10px 12px;font:13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.` + TORN_TARGET_HIGHLIGHT_CLASS + `{outline:3px solid #38bdf8!important;outline-offset:2px;box-shadow:0 0 0 6px rgba(56,189,248,.25)!important;position:relative}.` + TORN_TARGET_HIGHLIGHT_CLASS + `::before{content:"Weav3r target item";position:absolute;top:-24px;left:0;background:#0369a1;color:white;border-radius:999px;padding:3px 8px;font:12px system-ui,sans-serif;z-index:2}.` + TRADE_FILTER_HIDDEN_CLASS + `{display:none!important}.` + TRADE_FILTER_TARGET_CLASS + `{position:relative;outline:2px solid rgba(56,189,248,.9)!important;outline-offset:-2px;box-shadow:0 0 0 4px rgba(56,189,248,.18)!important}#${TRADE_FILTER_PANEL_ID}{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 10px;padding:10px 12px;border:1px solid rgba(56,189,248,.45);border-radius:10px;background:rgba(8,47,73,.12);color:inherit;font:13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#${TRADE_FILTER_PANEL_ID} .weav3r-trade-target-filter__controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}#${TRADE_FILTER_PANEL_ID} button{appearance:none;border:1px solid rgba(56,189,248,.6);background:#075985;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:700}#${TRADE_FILTER_PANEL_ID} button:hover{background:#0369a1}#weav3r-trade-payment-verification{display:grid;gap:6px;margin:8px 0 12px;padding:12px;border:1px solid rgba(56,189,248,.45);border-radius:10px;background:rgba(15,23,42,.12);font:13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#weav3r-trade-payment-verification strong{font-size:14px}@media(max-width:560px){#${TRADE_FILTER_PANEL_ID}{align-items:flex-start;flex-direction:column}#${TRADE_FILTER_PANEL_ID} .weav3r-trade-target-filter__controls{width:100%}#${TRADE_FILTER_PANEL_ID} button{flex:1 1 auto}}`);
    GM_addStyle(`#${PURCHASE_TRACKING_PANEL_ID}{position:fixed;left:16px;bottom:16px;z-index:2147482500;max-width:min(390px,calc(100vw - 32px));display:grid;gap:7px;padding:12px;border:1px solid rgba(56,189,248,.5);border-radius:12px;background:#111827;color:#f8fafc;box-shadow:0 14px 40px rgba(0,0,0,.35);font:13px system-ui,sans-serif}#${PURCHASE_TRACKING_PANEL_ID} small{overflow-wrap:anywhere;color:#cbd5e1}#${PURCHASE_TRACKING_PANEL_ID} button{justify-self:start;border:0;border-radius:8px;padding:7px 10px;background:#0369a1;color:white;font-weight:700;cursor:pointer}#${PURCHASE_TRACKING_PANEL_ID} textarea{width:100%;min-height:150px;background:#020617;color:#f8fafc}`);
    const style = Array.from(document.querySelectorAll('style')).find((el) => el.textContent.includes(`#${TORN_HANDOFF_STATUS_ID}`));
    if (style) style.id = TORN_HANDOFF_STYLE_ID;
  }
  function showTornStatus(message) { if (!message) return; addTornHandoffStyles(); let node = document.getElementById(TORN_HANDOFF_STATUS_ID); if (!node) { node = document.createElement('div'); node.id = TORN_HANDOFF_STATUS_ID; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); node.addEventListener('click', () => node.remove()); document.body.appendChild(node); } node.textContent = message; clearTimeout(tornState.notificationTimer); tornState.notificationTimer = setTimeout(() => node.remove(), 5500); }
  function disconnectTornObserver() { if (tornState.observer) tornState.observer.disconnect(); tornState.observer = null; clearTimeout(tornState.timeoutId); tornState.timeoutId = 0; logDebug('Torn observer disconnected.'); }
  function waitForTornElement(resolveElement, onFound, timeoutMs = TORN_HANDOFF_TIMEOUT_MS) {
    disconnectTornObserver();
    const generation = ++tornState.routeGeneration;
    const check = () => { if (generation !== tornState.routeGeneration) return; const element = resolveElement(); if (element) { disconnectTornObserver(); onFound(element); } };
    check();
    if (generation !== tornState.routeGeneration || !document.documentElement) return;
    tornState.observer = new MutationObserver(check);
    tornState.observer.observe(document.documentElement, { childList: true, subtree: true });
    tornState.timeoutId = setTimeout(() => { if (generation === tornState.routeGeneration) { disconnectTornObserver(); onFound(null); } }, timeoutMs);
    logDebug('Torn observer started.');
  }
  function findBazaarSearchInput() { return document.querySelector('[data-testid="search"] input[data-testid="autocomplete-input"], input[data-testid="autocomplete-input"][aria-label*="Search" i], [data-testid="search"] input[placeholder*="search" i]'); }
  function validateBazaarTarget(handoff) {
    const params = new URLSearchParams(location.search);
    const urlSeller = normalizePositiveInt(params.get('userId'));
    const urlItem = normalizePositiveInt(params.get('itemId'));
    const urlPrice = normalizeNonNegativeInt(params.get('price'));
    if (urlSeller && handoff.sellerId && urlSeller !== handoff.sellerId) return false;
    if (urlItem && urlItem !== handoff.itemId) return false;
    if (urlPrice != null && urlPrice !== handoff.purchasePrice) return false;
    return true;
  }
  function isTornBazaarAddRoute(pathname = location.pathname, hash = location.hash) { return pathname === '/bazaar.php' && /^#\/add(?:[/?&]|$)/.test(String(hash || '')); }
  function normalizeBazaarSellRules(raw) {
    const rules = {};
    if (raw?.version === 1 && raw.rules && typeof raw.rules === 'object' && !Array.isArray(raw.rules)) Object.entries(raw.rules).forEach(([itemId, rule]) => { const id = normalizePositiveInt(itemId); if (id && BAZAAR_ADD_RULES.includes(rule)) rules[String(id)] = rule; });
    return { version: 1, rules };
  }
  function normalizeBazaarAddSettings(raw) {
    const fields = ['name', 'quantity', 'marketValueEach', 'totalMarketValue', 'sellableMarketValue'];
    return { sortField: fields.includes(raw?.sortField) ? raw.sortField : DEFAULT_BAZAAR_ADD_SETTINGS.sortField, sortDirection: raw?.sortDirection === 'asc' ? 'asc' : 'desc', hideProtected: raw?.hideProtected === true, priceAdjustment: /^[+-]?\d+$/.test(String(raw?.priceAdjustment ?? '')) ? String(raw.priceAdjustment) : DEFAULT_BAZAAR_ADD_SETTINGS.priceAdjustment };
  }
  function getBazaarSellRule(itemId, collection = tornState.bazaarAdd.rules) { const id = normalizePositiveInt(itemId); return id && BAZAAR_ADD_RULES.includes(collection?.rules?.[String(id)]) ? collection.rules[String(id)] : 'sell-all'; }
  function setBazaarSellRule(itemId, rule) { const id = normalizePositiveInt(itemId); if (!id || !BAZAAR_ADD_RULES.includes(rule)) return false; const latest = normalizeBazaarSellRules(gmGet(BAZAAR_SELL_RULES_KEY, null)); latest.rules[String(id)] = rule; gmSet(BAZAAR_SELL_RULES_KEY, latest); tornState.bazaarAdd.rules = latest; return true; }
  function normalizeBazaarAddName(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
  function parseBazaarAddCurrencyValues(value) { return Array.from(String(value || '').matchAll(/\$\s*([\d,]+)/g), (match) => normalizeMoneyString(match[1].replace(/,/g, ''))); }
  function calculateBazaarSellable(quantity, marketValueEach, sellRule, tradable = true) {
    const qty = normalizePositiveInt(quantity);
    const sellableQuantity = !qty || !tradable ? 0 : sellRule === 'dont-sell' ? 0 : sellRule === 'keep-one' ? Math.max(qty - 1, 0) : qty;
    const each = normalizeMoneyString(marketValueEach);
    return { sellableQuantity, sellableMarketValue: each ? (BigInt(each) * BigInt(sellableQuantity)).toString() : null };
  }
  function parseBazaarAddMarketValue(row, quantity) {
    const container = row?.querySelector?.('[title="Market value"]'); const values = parseBazaarAddCurrencyValues(container?.textContent);
    const marketValueEach = values[0] || null; if (!marketValueEach || !normalizePositiveInt(quantity)) return { marketValueEach, totalMarketValue: null, displayedTotalMarketValue: values[1] || null };
    const totalMarketValue = (BigInt(marketValueEach) * BigInt(quantity)).toString(); const displayedTotalMarketValue = container?.querySelector?.('.tt-item-quantity') ? values[1] || null : null;
    if (displayedTotalMarketValue && displayedTotalMarketValue !== totalMarketValue) logDebug('Bazaar Market Value total mismatch', { displayedTotalMarketValue, totalMarketValue });
    return { marketValueEach, totalMarketValue, displayedTotalMarketValue };
  }
  function resolveBazaarAddItemIdentity(row) {
    const ids = new Set(Array.from(row?.querySelectorAll?.('img[src],img[srcset]') || []).flatMap((img) => [extractTornItemIdFromImageSource(img.getAttribute('src')), ...String(img.getAttribute('srcset') || '').split(',').map(extractTornItemIdFromImageSource)]).filter(Boolean));
    const textName = normalizeBazaarAddName(row?.querySelector?.('.name-wrap .t-overflow')?.textContent); const imageNames = Array.from(row?.querySelectorAll?.('img[alt]') || []).map((img) => normalizeBazaarAddName(img.alt)).filter(Boolean); const imageName = imageNames.length === 1 ? imageNames[0] : '';
    const itemName = textName || imageName; const nameConflict = Boolean(textName && imageName && textName.toLocaleLowerCase() !== imageName.toLocaleLowerCase());
    return { itemId: ids.size === 1 ? [...ids][0] : null, itemName, resolved: ids.size === 1 && Boolean(itemName) && !nameConflict, nameConflict };
  }
  function bazaarAddDomIdentityValues(row) {
    const nodes = [row, ...Array.from(row?.querySelectorAll?.('[id],[name],[value],[data-item],[data-id],[data-uid],[data-instance]') || [])];
    return nodes.flatMap((node) => Array.from(node?.attributes || []).filter((attribute) => /^(?:id|name|value|data-)/.test(attribute.name) && !attribute.name.startsWith('data-weav3r')).map((attribute) => attribute.value)).filter(Boolean);
  }
  function resolveBazaarAddRowIdentity(row, itemId, originalIndex = 0, parentGroupKey = null) {
    const values = bazaarAddDomIdentityValues(row); const instanceMatch = values.map((value) => String(value).match(/(?:^|[^\d])(\d+-\d{4,})(?:[^\d]|$)/)).find(Boolean); const instanceKey = instanceMatch?.[1] || null;
    const roleValue = row?.getAttribute?.('data-group'); const groupRole = roleValue === 'child' ? 'child' : roleValue === 'parent' ? 'parent' : 'standalone'; const stableValues = [row?.id, ...Array.from(row?.attributes || []).filter((attribute) => attribute.name.startsWith('data-') && !['data-group', 'data-weav3r-bazaar-row-key'].includes(attribute.name)).map((attribute) => attribute.value), ...Array.from(row?.querySelectorAll?.('[id]') || []).map((node) => node.id)]; const stableToken = stableValues.map((value) => String(value || '').trim()).find((value) => value && !/^(?:parent|child)$/i.test(value));
    let runtimeKey = null; if (!instanceKey && !stableToken) { runtimeKey = tornState.bazaarAdd.runtimeRowKeys.get(row); if (!runtimeKey) { runtimeKey = `runtime-${tornState.bazaarAdd.nextRuntimeRowKey++}`; tornState.bazaarAdd.runtimeRowKeys.set(row, runtimeKey); } }
    const rowKey = instanceKey ? `instance:${instanceKey}` : `row:${itemId || 'unknown'}:${stableToken ? `${stableToken}:${groupRole}:${originalIndex}` : `${groupRole}-${originalIndex}-${runtimeKey}`}`; const groupKey = groupRole === 'child' ? parentGroupKey : groupRole === 'parent' ? `group:${instanceKey || stableToken || rowKey}` : `standalone:${rowKey}`;
    logDebug('Bazaar Add row identity resolved.', { rowKey, instanceKey, groupKey, groupRole, itemId }); return { rowKey, instanceKey, groupKey, groupRole };
  }
  function domSafeBazaarRowKey(rowKey) { return String(rowKey || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120); }
  function parseBazaarAddQuantity(row) { const text = normalizeBazaarAddName(row?.querySelector?.('.item-amount.qty')?.textContent); return /^\d+$/.test(text) ? normalizePositiveInt(text) : null; }
  function buildBazaarAddRowModel(row, originalIndex = 0, rules = tornState.bazaarAdd.rules, parentGroupKey = null) {
    const identity = resolveBazaarAddItemIdentity(row); const rowIdentity = resolveBazaarAddRowIdentity(row, identity.itemId, originalIndex, parentGroupKey); const amount = row?.querySelector?.('.amount input[name="amount"]'); const selectableMode = amount?.type === 'checkbox' ? 'checkbox' : amount ? 'quantity' : 'none'; const parsedQuantity = parseBazaarAddQuantity(row); const quantity = parsedQuantity || (rowIdentity.groupRole === 'child' && selectableMode === 'checkbox' ? 1 : null); const market = parseBazaarAddMarketValue(row, quantity); const isDisabled = Boolean(row?.matches?.('.disabled') || row?.querySelector?.('input:disabled') || /\buntradable\b/i.test(row?.textContent || '')); const sellRule = getBazaarSellRule(identity.itemId, rules); const isTradable = identity.resolved && Boolean(quantity) && !isDisabled; const sellable = calculateBazaarSellable(quantity, market.marketValueEach, sellRule, isTradable);
    return { element: row, originalIndex, ...identity, ...rowIdentity, quantity, ...market, sellRule, ...sellable, selectableMode, isDisabled, isTradable };
  }
  function buildBazaarAddGroups(panel, rules = tornState.bazaarAdd.rules) {
    const elements = Array.from(panel?.querySelectorAll?.(':scope > li[data-group="parent"],:scope > li[data-group="child"]') || []); const rows = []; const groups = []; let current = null;
    elements.forEach((element, index) => { const role = element.getAttribute?.('data-group'); if (role !== 'child') { const model = buildBazaarAddRowModel(element, index, rules); current = { groupKey: model.groupKey, parentRowKey: model.rowKey, childRowKeys: [], itemId: model.itemId, rows: [model], parent: model, expanded: false }; groups.push(current); rows.push(model); return; } const model = buildBazaarAddRowModel(element, index, rules, current?.groupKey || null); if (!current || current.itemId !== model.itemId) { model.groupRole = 'standalone'; model.groupKey = `standalone:${model.rowKey}`; current = { groupKey: model.groupKey, parentRowKey: model.rowKey, childRowKeys: [], itemId: model.itemId, rows: [model], parent: model, expanded: false }; groups.push(current); } else { current.childRowKeys.push(model.rowKey); current.rows.push(model); current.expanded = true; } rows.push(model); });
    groups.forEach((group) => { const parentQuantity = normalizePositiveInt(group.parent.quantity); group.totalQuantity = parentQuantity || group.rows.reduce((sum, row) => sum + (normalizePositiveInt(row.quantity) || 0), 0); group.isUniqueGroup = group.childRowKeys.length > 0 || (group.parent.selectableMode === 'checkbox' && group.totalQuantity > 1); const state = calculateBazaarSellable(group.totalQuantity, group.parent.marketValueEach, group.parent.sellRule, group.parent.isTradable); group.sellableQuantity = state.sellableQuantity; group.sellableMarketValue = state.sellableMarketValue; group.sortModel = { ...group.parent, quantity: group.totalQuantity, totalMarketValue: group.parent.marketValueEach ? (BigInt(group.parent.marketValueEach) * BigInt(group.totalQuantity)).toString() : null, sellableQuantity: group.sellableQuantity, sellableMarketValue: group.sellableMarketValue }; group.rows.forEach((row) => { row.group = group; if (row.groupRole === 'child') { row.sellableQuantity = row.sellRule === 'dont-sell' || !row.isTradable ? 0 : row.quantity; row.sellableMarketValue = row.marketValueEach ? (BigInt(row.marketValueEach) * BigInt(row.sellableQuantity)).toString() : null; } }); logDebug('Bazaar Add group constructed.', { groupKey: group.groupKey, itemId: group.itemId, childRows: group.childRowKeys.length, totalQuantity: group.totalQuantity, expanded: group.expanded }); });
    return { rows, groups };
  }
  function getBazaarAddGroupForRow(model) { return model?.group || tornState.bazaarAdd.groups.find((group) => group.groupKey === model?.groupKey) || null; }
  function findBazaarAddModelByRowKey(rowKey) { return tornState.bazaarAdd.rows.find((row) => row.rowKey === rowKey) || null; }
  function resolveCurrentBazaarAddModelByRowKey(rowKey) { const panel = getVisibleBazaarAddPanel(); if (!rowKey || !panel) return null; const built = buildBazaarAddGroups(panel); const model = built.rows.find((row) => row.rowKey === rowKey) || null; logDebug('Bazaar Add async row re-resolution.', { rowKey, found: Boolean(model), itemId: model?.itemId }); return model; }
  function getBazaarAddGroupSelection(group) { const selectable = group?.rows.filter((row) => row.groupRole === 'child' && row.selectableMode === 'checkbox') || []; const selected = selectable.filter((row) => Boolean(row.element.querySelector('.amount input[name="amount"]')?.checked)); return { selectedCount: selected.length, selectedRows: selected, totalQuantity: group?.totalQuantity || 0, maximum: group?.sellableQuantity || 0 }; }
  function validateBazaarGroupSelection(model, includeRow = false) { const group = getBazaarAddGroupForRow(model); if (!group?.isUniqueGroup) return { valid: true }; if (!group.expanded) return { valid: false, reason: 'group-closed', maximum: group.sellableQuantity, total: group.totalQuantity }; if (model.sellRule === 'dont-sell') return { valid: false, reason: 'protected' }; const selection = getBazaarAddGroupSelection(group); const added = includeRow && model.groupRole === 'child' && !selection.selectedRows.some((row) => row.rowKey === model.rowKey) ? 1 : 0; const valid = selection.selectedCount + added <= selection.maximum; const result = { valid, reason: valid ? null : 'group-rule-exceeded', maximum: selection.maximum, total: selection.totalQuantity, selectedCount: selection.selectedCount + added }; logDebug('Bazaar Add group selection validated.', { rowKey: model.rowKey, ...result }); return result; }
  function compareBigIntStrings(left, right) { const a = BigInt(left || '0'); const b = BigInt(right || '0'); return a < b ? -1 : a > b ? 1 : 0; }
  function compareNullableMoneyStrings(left, right, direction) { if (left === null && right === null) return 0; if (left === null) return 1; if (right === null) return -1; return compareBigIntStrings(left, right) * direction; }
  function bazaarSellableSortGroup(model) { if (!model.isTradable || !model.resolved) return 3; if (model.sellableQuantity > 0) return 0; return model.sellRule === 'keep-one' ? 1 : 2; }
  function compareBazaarAddModels(a, b, settings) {
    const direction = settings.sortDirection === 'asc' ? 1 : -1; const field = settings.sortField;
    if (field === 'sellableMarketValue') { const group = bazaarSellableSortGroup(a) - bazaarSellableSortGroup(b); if (group) return group; }
    const moneyField = !['name', 'quantity'].includes(field); let result = moneyField ? compareNullableMoneyStrings(a[field], b[field], direction) : field === 'name' ? a.itemName.localeCompare(b.itemName) : (a.quantity || 0) - (b.quantity || 0);
    if (result) return moneyField ? result : result * direction; result = a.itemName.localeCompare(b.itemName); if (result) return result; result = (a.itemId || Number.MAX_SAFE_INTEGER) - (b.itemId || Number.MAX_SAFE_INTEGER); return result || a.originalIndex - b.originalIndex;
  }
  function shouldHideBazaarAddRow(model, hideProtected) { return Boolean(hideProtected && model.isTradable && model.sellableQuantity === 0); }
  function summarizeBazaarAddRows(rows) {
    const sellable = rows.filter((row) => row.isTradable && row.sellableQuantity > 0); const known = sellable.filter((row) => row.sellableMarketValue !== null);
    return { positions: sellable.length, quantity: sellable.reduce((sum, row) => sum + row.sellableQuantity, 0), knownValue: known.reduce((sum, row) => sum + BigInt(row.sellableMarketValue), 0n).toString(), hasUnknownValue: known.length !== sellable.length };
  }
  function getBazaarSelectionPlan(model) {
    if (!model?.resolved) return { action: 'skip', reason: 'unresolved' }; if (!model.isTradable || model.isDisabled) return { action: 'clear', reason: 'disabled' }; if (model.sellRule === 'dont-sell' || model.sellableQuantity <= 0) return { action: 'clear', reason: 'protected' };
    const group = getBazaarAddGroupForRow(model); if (group?.isUniqueGroup && !group.expanded) return { action: 'skip', reason: 'group-closed' }; if (group?.isUniqueGroup && model.groupRole === 'parent') return { action: 'skip', reason: 'group-parent' };
    if (model.selectableMode === 'quantity') return { action: 'quantity', value: String(model.sellableQuantity) }; if (model.selectableMode === 'checkbox' && model.sellRule === 'keep-one' && !group?.isUniqueGroup && model.quantity > 1) return { action: 'skip', reason: 'partial-aggregate' }; if (model.selectableMode === 'checkbox' && model.sellRule === 'keep-one' && group?.isUniqueGroup) return { action: 'skip', reason: 'manual-keep-one' }; if (model.selectableMode === 'checkbox') return { action: 'checkbox', checked: true }; return { action: 'skip', reason: 'unresolved' };
  }
  function setControlledCheckboxValue(input, checked) {
    if (!input || input.type !== 'checkbox' || input.disabled) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set; if (!setter) return false; setter.call(input, Boolean(checked)); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }
  function applyBazaarSelectionPlan(model, plan = getBazaarSelectionPlan(model)) {
    const input = model?.element?.querySelector?.('.amount input[name="amount"]'); if (!input) return false;
    if (input.type === 'checkbox') return setControlledCheckboxValue(input, plan.action === 'checkbox' && plan.checked === true);
    return setControlledInputValue(input, plan.action === 'quantity' ? plan.value : '', { change: true });
  }
  function bulkPrepareBazaarAddSelection() {
    const counts = { prepared: 0, protected: 0, partial: 0, unresolved: 0 };
    tornState.bazaarAdd.rows.forEach((model) => { const plan = getBazaarSelectionPlan(model); if (['unresolved', 'disabled'].includes(plan.reason)) counts.unresolved += 1; else if (plan.reason === 'protected') counts.protected += 1; else if (['group-closed', 'group-parent', 'manual-keep-one'].includes(plan.reason)) counts.partial += 1; else { counts.prepared += 1; applyBazaarSelectionPlan(model, plan); } const note = model.element.querySelector('[data-weav3r-bazaar-selection-note]'); if (note) { const group = getBazaarAddGroupForRow(model); note.textContent = plan.reason === 'group-closed' ? 'Gruppe zuerst öffnen' : plan.reason === 'manual-keep-one' ? `1 behalten: Instanzen manuell auswählen (max. ${group.sellableQuantity} von ${group.totalQuantity})` : ''; } }); return counts;
  }
  function resetBazaarAddSelection() { tornState.bazaarAdd.rows.forEach((model) => { const input = model.element.querySelector('.amount input[name="amount"]'); if (!input) return; if (input.type === 'checkbox') setControlledCheckboxValue(input, false); else setControlledInputValue(input, '', { change: true }); }); }
  function normalizeBazaarPriceOffers(rawOffers) { return (Array.isArray(rawOffers) ? rawOffers : []).map((offer) => { const price = normalizeMoneyString(offer?.price); const quantity = normalizePositiveInt(offer?.quantity); return price && BigInt(price) > 0n ? { price, quantity } : null; }).filter(Boolean).sort((a, b) => compareBigIntStrings(a.price, b.price)); }
  function calculateAdjustedBazaarPrice(price, adjustment) { const base = normalizeMoneyString(price); if (!base || !/^[+-]?\d+$/.test(String(adjustment))) return null; const result = BigInt(base) + BigInt(adjustment); return result > 0n ? result.toString() : null; }
  function evaluateBazaarAutoPrice(offers, adjustment = '-1', currentPrice = null) {
    const normalized = normalizeBazaarPriceOffers(offers); if (!normalized.length) return { ok: false, reason: 'unavailable', offers: normalized };
    const proposal = calculateAdjustedBazaarPrice(normalized[0].price, adjustment); if (!proposal) return { ok: false, reason: 'invalid-adjustment', offers: normalized };
    const following = normalized.slice(1, 4); if (BigInt(normalized[0].price) >= 10000n && following.length >= 2) { const sum = following.reduce((total, offer) => total + BigInt(offer.price), 0n); if (BigInt(normalized[0].price) * 100n * BigInt(following.length) < sum * 70n) return { ok: false, reason: 'anomaly', proposal, offers: normalized }; }
    const current = normalizeMoneyString(currentPrice); if (current && BigInt(current) > 0n && BigInt(proposal) * 100n < BigInt(current) * 93n) return { ok: false, reason: 'price-drop', proposal, offers: normalized };
    return { ok: true, proposal, offers: normalized };
  }
  function resolveBazaarRecommendedPrice(itemId, suppliedOptions = null) {
    const options = suppliedOptions || {};
    const id = normalizePositiveInt(itemId); const adjustment = /^[+-]?\d+$/.test(String(options.adjustment ?? '')) ? String(options.adjustment) : null; if (!id || adjustment == null) return { status: 'unavailable', itemId: id, marketUnitPrice: null, adjustment, recommendedUnitPrice: null, source: options.source || null, fetchedAt: options.fetchedAt || null, reason: 'invalid-input', ok: false, offers: [] };
    const evaluated = evaluateBazaarAutoPrice(options.offers, adjustment, options.currentPrice); const marketUnitPrice = evaluated.offers[0]?.price || null; const status = evaluated.ok ? 'available' : ['anomaly', 'price-drop'].includes(evaluated.reason) ? 'unsafe' : 'unavailable';
    return { ...evaluated, status, itemId: id, marketUnitPrice, adjustment, recommendedUnitPrice: evaluated.ok ? evaluated.proposal : null, source: options.source || 'marketplaceDetail', fetchedAt: Number(options.fetchedAt) || null };
  }
  function getBazaarAddCachedOffers(itemId) { const data = loadCachedItemData(itemId); const offers = normalizeBazaarPriceOffers(data.bazaar?.offers); return { offers, fresh: offers.length > 0 && data.bazaar?.apiSource === 'marketplaceDetail' && isSourceCacheFresh(data.bazaar, 'bazaar') }; }
  async function loadBazaarRecommendedPrice(itemId, suppliedOptions = null) {
    const options = suppliedOptions || {}; const id = normalizePositiveInt(itemId); const adjustment = String(options.adjustment ?? normalizeBazaarAddSettings(gmGet(BAZAAR_ADD_UI_SETTINGS_KEY, null)).priceAdjustment); if (!id) return resolveBazaarRecommendedPrice(itemId, { adjustment, offers: [], source: null });
    const cached = getBazaarAddCachedOffers(id); if (cached.fresh) { const data = loadCachedItemData(id).bazaar; return resolveBazaarRecommendedPrice(id, { adjustment, offers: cached.offers, source: data?.apiSource, fetchedAt: data?.capturedAt }); }
    try { const entry = await queueBazaarAddMarketplaceDetail(id); return resolveBazaarRecommendedPrice(id, { adjustment, offers: entry.offers, source: entry.apiSource, fetchedAt: entry.capturedAt }); } catch (error) { const reason = error?.code === 'no-listings' ? 'no-listings' : ['malformed-response', 'cache-write-failed'].includes(error?.code) ? error.code : 'request-failed'; return { ...resolveBazaarRecommendedPrice(id, { adjustment, offers: [], source: 'marketplaceDetail' }), status: 'error', reason }; }
  }
  function getBazaarAddPriceInputs(model) { return Array.from(model?.element?.querySelectorAll?.('input.input-money') || []).filter((input) => input.type === 'hidden' ? input.name === 'price' : input.type === 'text'); }
  function normalizeBazaarAddPriceControlValue(value) { return normalizeMoneyString(String(value ?? '').replace(/[$,\s]/g, '')); }
  function readBazaarAddVisiblePrice(model) { const input = getBazaarAddPriceInputs(model).find((entry) => entry.type === 'text'); return normalizeBazaarAddPriceControlValue(input?.value); }
  function writeBazaarAddPrice(model, price) {
    const value = normalizeMoneyString(price); if (!value || BigInt(value) <= 0n || !model?.rowKey) return false; const inputs = getBazaarAddPriceInputs(model); if (!inputs.length) return false; inputs.forEach((input) => setControlledInputValue(input, value, { change: true })); const current = resolveCurrentBazaarAddModelByRowKey(model.rowKey); return Boolean(current && readBazaarAddVisiblePrice(current) === value);
  }
  function hasExternalBazaarPriceFiller() { return Array.from(document.querySelectorAll('.torn-bazaar-fill-qty-price')).some((node) => !node.closest('[data-weav3r-bazaar-row-tools]')); }
  function getBazaarRowDisplayState(model, externalConflict = false) {
    if (!model?.isTradable) return { mode: 'unavailable', metadata: 'Von Torn nicht verkaufbar', fillDisabled: true };
    if (model.sellRule === 'dont-sell') return { mode: 'protected', metadata: 'Geschützt', fillDisabled: true };
    if (model.sellRule === 'keep-one') return { mode: 'keep-one', metadata: `${model.sellableQuantity} verkaufbar · ${formatMoney(model.sellableMarketValue)}`, fillDisabled: model.sellableQuantity <= 0 || externalConflict };
    return { mode: 'sell-all', metadata: '', fillDisabled: externalConflict };
  }
  function getBazaarFillMessage(result) { return result?.state === 'loading' ? 'Bazaar-Preise werden geladen …' : result?.reason === 'no-listings' ? 'Keine Bazaar-Angebote gefunden' : ['request-failed', 'malformed-response', 'cache-write-failed'].includes(result?.reason) ? 'Bazaar-Preise konnten nicht geladen werden' : result?.reason === 'anomaly' ? 'Verdächtig niedriger Bazaar-Preis' : result?.reason === 'price-drop' ? 'Neuer Preis >7 % unter aktuellem Preis' : result?.reason === 'protected' ? 'Geschützt' : result?.reason === 'group-closed' ? 'Gruppe zuerst öffnen' : result?.reason === 'group-rule-exceeded' ? `Auswahl überschreitet Verkaufsregel: maximal ${result.maximum} von ${result.total}` : result?.reason === 'partial-aggregate' ? 'Teilmenge hier nicht sicher auswählbar' : result?.reason === 'external-conflict' ? 'Externer Price Filler erkannt' : result?.ok ? `Preis ${formatMoney(result.proposal)} vorbereitet` : 'Preis konnte nicht gesetzt werden'; }
  function renderBazaarPriceContext(model, result) { if (!model) return; const feedback = { state: result.state || (result.ok ? 'success' : ['anomaly', 'price-drop'].includes(result.reason) ? 'warning' : 'error'), message: getBazaarFillMessage(result), offers: (result.offers || []).slice(0, 8) }; tornState.bazaarAdd.rowFeedback.set(model.rowKey, feedback); renderBazaarAddRowTools(model); }
  function prepareBazaarAddRowForFill(model) { if (!model?.isTradable || model.sellableQuantity <= 0) return { ok: false, reason: 'protected' }; const groupValidation = validateBazaarGroupSelection(model, true); if (!groupValidation.valid) return { ok: false, ...groupValidation }; const plan = getBazaarSelectionPlan(model); if (['group-closed', 'group-parent'].includes(plan.reason)) return { ok: false, reason: plan.reason }; if (plan.reason === 'manual-keep-one') return { ok: applyBazaarSelectionPlan(model, { action: 'checkbox', checked: true }), reason: null }; return { ok: applyBazaarSelectionPlan(model, plan), reason: plan.reason || null }; }
  function applyResolvedBazaarAddPrice(rowKey, itemId, offers) { if (!isTornBazaarAddRoute()) return { ok: false, reason: 'route-changed' }; const model = resolveCurrentBazaarAddModelByRowKey(rowKey); if (!model || model.itemId !== itemId) return { ok: false, reason: model ? 'row-changed' : 'row-missing' }; if (hasExternalBazaarPriceFiller()) return { ok: false, reason: 'external-conflict', model }; const groupValidation = validateBazaarGroupSelection(model); if (!groupValidation.valid) return { ok: false, ...groupValidation, model }; if (!model.isTradable || model.sellableQuantity <= 0) return { ok: false, reason: 'protected', model }; const result = resolveBazaarRecommendedPrice(itemId, { offers, adjustment: tornState.bazaarAdd.settings.priceAdjustment, currentPrice: readBazaarAddVisiblePrice(model) }); if (result.ok) result.ok = writeBazaarAddPrice(model, result.proposal); return { ...result, model }; }
  function handleBazaarAddFill(rowKey) {
    const initial = resolveCurrentBazaarAddModelByRowKey(rowKey); if (!initial) return Promise.resolve({ ok: false, reason: 'row-missing' }); const { itemId } = initial; const active = tornState.bazaarAdd.fillRequests.get(rowKey); if (active) return active; const prepared = prepareBazaarAddRowForFill(initial); if (!prepared.ok) { renderBazaarPriceContext(initial, prepared); return Promise.resolve(prepared); } const cached = getBazaarAddCachedOffers(itemId); logDebug('Bazaar Add row-specific fill started.', { rowKey, itemId });
    if (cached.fresh) { const result = applyResolvedBazaarAddPrice(rowKey, itemId, cached.offers); if (result.model) renderBazaarPriceContext(result.model, result); return Promise.resolve(result); }
    renderBazaarPriceContext(initial, { state: 'loading', offers: [] }); const promise = queueBazaarAddMarketplaceDetail(itemId).then((entry) => { const result = applyResolvedBazaarAddPrice(rowKey, itemId, normalizeBazaarPriceOffers(entry.offers)); if (result.model) renderBazaarPriceContext(result.model, result); return result; }).catch((error) => { const reason = error?.code === 'no-listings' ? 'no-listings' : ['malformed-response', 'cache-write-failed'].includes(error?.code) ? error.code : 'request-failed'; const current = isTornBazaarAddRoute() ? resolveCurrentBazaarAddModelByRowKey(rowKey) : null; if (current) renderBazaarPriceContext(current, { ok: false, reason, offers: [] }); return { ok: false, reason }; }).finally(() => { tornState.bazaarAdd.fillRequests.delete(rowKey); if (!isTornBazaarAddRoute()) tornState.bazaarAdd.rowFeedback.delete(rowKey); logDebug('Bazaar Add row-specific fill ended.', { rowKey, itemId }); }); tornState.bazaarAdd.fillRequests.set(rowKey, promise); return promise;
  }
  function readBazaarAddNativeSelection(model) {
    const maximumSellableQuantity = Math.max(0, Number(model?.sellableQuantity) || 0); const input = model?.element?.querySelector?.('.amount input[name="amount"]'); if (!input) return { selected: false, valid: false, selectedQuantity: 0, maximumSellableQuantity, reason: 'selection-control-missing' };
    const checkbox = input.type === 'checkbox'; const raw = checkbox ? '' : String(input.value || '').trim(); const numericRaw = /^\d+$/.test(raw); const selected = checkbox ? Boolean(input.checked) : raw !== '' && !(numericRaw && BigInt(raw) === 0n); if (!selected) return { selected: false, valid: false, selectedQuantity: 0, maximumSellableQuantity, reason: 'not-selected' };
    const selectedQuantity = checkbox ? Number(model.quantity) || 1 : /^\d+$/.test(raw) ? Number(raw) : 0; if (!model.resolved || !model.isTradable || model.isDisabled || !getBazaarAddPriceInputs(model).length) return { selected: true, valid: false, selectedQuantity, maximumSellableQuantity, reason: 'ineligible' }; if (model.sellRule === 'dont-sell') return { selected: true, valid: false, selectedQuantity, maximumSellableQuantity, reason: 'protected' }; if (!Number.isSafeInteger(selectedQuantity) || selectedQuantity <= 0) return { selected: true, valid: false, selectedQuantity: 0, maximumSellableQuantity, reason: 'invalid-selection' };
    const group = getBazaarAddGroupForRow(model); if (checkbox && model.sellRule === 'keep-one' && !group?.isUniqueGroup && model.quantity > 1) return { selected: true, valid: false, selectedQuantity, maximumSellableQuantity, reason: 'partial-aggregate' }; const groupValidation = validateBazaarGroupSelection(model); if (!groupValidation.valid) return { selected: true, valid: false, selectedQuantity, maximumSellableQuantity: groupValidation.maximum ?? maximumSellableQuantity, ...groupValidation }; if (selectedQuantity > maximumSellableQuantity && !getBazaarAddGroupForRow(model)?.isUniqueGroup) return { selected: true, valid: false, selectedQuantity, maximumSellableQuantity, reason: 'rule-exceeded' }; return { selected: true, valid: true, selectedQuantity, maximumSellableQuantity, reason: null };
  }
  function getBazaarBulkSelectionMessage(reason, result) { result = result || {}; return reason === 'group-rule-exceeded' ? `Auswahl überschreitet Verkaufsregel: maximal ${result.maximum} von ${result.total}` : reason === 'rule-exceeded' ? 'Auswahl überschreitet Verkaufsregel' : reason === 'protected' ? 'Durch Verkaufsregel geschützt' : reason === 'group-closed' ? 'Gruppe zuerst öffnen' : reason === 'manual-keep-one' ? '1 behalten: Instanzen manuell auswählen' : 'Ungültige Auswahlmenge'; }
  function setBazaarBulkRowResult(model, result) { if (!model) return; if (result.reason && ['rule-exceeded', 'group-rule-exceeded', 'protected', 'group-closed', 'manual-keep-one', 'invalid-selection', 'ineligible'].includes(result.reason)) { tornState.bazaarAdd.rowFeedback.set(model.rowKey, { state: 'error', message: getBazaarBulkSelectionMessage(result.reason, result), offers: [] }); renderBazaarAddRowTools(model); } else renderBazaarPriceContext(model, result); }
  function applySelectedBazaarAddPrice(rowKey, itemId, offers, panel) { if (!isTornBazaarAddRoute() || getVisibleBazaarAddPanel() !== panel) return { ok: false, reason: 'panel-changed' }; const model = resolveCurrentBazaarAddModelByRowKey(rowKey); if (!model || model.itemId !== itemId) return { ok: false, reason: model ? 'row-changed' : 'row-missing' }; if (hasExternalBazaarPriceFiller()) return { ok: false, reason: 'external-conflict', model }; const selection = readBazaarAddNativeSelection(model); if (!selection.valid) return { ok: false, reason: selection.reason, ...selection, model }; const result = resolveBazaarRecommendedPrice(itemId, { offers, adjustment: tornState.bazaarAdd.settings.priceAdjustment, currentPrice: readBazaarAddVisiblePrice(model) }); if (result.ok) result.ok = writeBazaarAddPrice(model, result.proposal); return { ...result, model }; }
  async function resolveSelectedBazaarAddPrice(target, panel, operation) { const { rowKey, itemId } = target; if (operation.cancelled || !isTornBazaarAddRoute() || getVisibleBazaarAddPanel() !== panel || hasExternalBazaarPriceFiller()) return { ok: false, reason: 'panel-changed' }; const current = resolveCurrentBazaarAddModelByRowKey(rowKey); if (!current || current.itemId !== itemId) return { ok: false, reason: current ? 'row-changed' : 'row-missing' }; const selection = readBazaarAddNativeSelection(current); if (!selection.valid) return { ok: false, reason: selection.reason, ...selection, model: current }; const cached = getBazaarAddCachedOffers(itemId); let offers = cached.offers; if (!cached.fresh) { renderBazaarPriceContext(current, { state: 'loading', offers: [] }); try { const entry = await queueBazaarAddMarketplaceDetail(itemId); offers = normalizeBazaarPriceOffers(entry.offers); } catch (error) { const reason = error?.code === 'no-listings' ? 'no-listings' : ['malformed-response', 'cache-write-failed'].includes(error?.code) ? error.code : 'request-failed'; return { ok: false, reason, model: resolveCurrentBazaarAddModelByRowKey(rowKey) }; } } if (operation.cancelled || hasExternalBazaarPriceFiller()) return { ok: false, reason: 'external-conflict' }; return applySelectedBazaarAddPrice(rowKey, itemId, offers, panel); }
  function classifyBazaarBulkPriceResult(result) { if (result?.ok) return 'prepared'; if (['anomaly', 'price-drop'].includes(result?.reason)) return 'guarded'; if (['request-failed', 'malformed-response', 'cache-write-failed', 'no-listings'].includes(result?.reason)) return 'failed'; return 'skipped'; }
  function renderBazaarBulkPriceProgress(operation) { const button = document.querySelector(`#${BAZAAR_ADD_MANAGER_ID} [data-weav3r-bazaar-fill-selected]`); const status = document.querySelector(`#${BAZAAR_ADD_MANAGER_ID} [data-weav3r-bazaar-status]`); if (button) { button.disabled = Boolean(operation) || hasExternalBazaarPriceFiller(); button.textContent = operation ? `Preise … ${operation.completed}/${operation.total}` : 'Preise füllen'; } if (status && operation) { clearTimeout(tornState.bazaarAdd.statusTimer); status.hidden = false; status.textContent = `Preise werden gefüllt: ${operation.completed}/${operation.total}`; } }
  async function handleBazaarAddBulkPriceFill() {
    if (tornState.bazaarAdd.bulkPriceOperation || hasExternalBazaarPriceFiller() || !isTornBazaarAddRoute()) return null; const panel = getVisibleBazaarAddPanel(); if (!panel) return null; const built = buildBazaarAddGroups(panel); const selected = built.rows.filter((model) => !(model.group?.isUniqueGroup && model.groupRole === 'parent')).map((model) => ({ model, selection: readBazaarAddNativeSelection(model) })).filter(({ selection }) => selection.selected); const targets = []; selected.forEach(({ model, selection }) => { if (selection.valid) targets.push({ rowKey: model.rowKey, itemId: model.itemId }); else setBazaarBulkRowResult(model, selection); }); if (!targets.length) { showBazaarManagerStatus('Keine ausgewählten verkaufbaren Positionen'); return { prepared: 0, guarded: 0, skipped: selected.length, failed: 0 }; }
    const operation = { panel, rows: targets, next: 0, completed: 0, total: targets.length, cancelled: false, counts: { prepared: 0, guarded: 0, skipped: selected.length - targets.length, failed: 0 } }; tornState.bazaarAdd.bulkPriceOperation = operation; renderBazaarBulkPriceProgress(operation);
    const worker = async () => { while (!operation.cancelled && operation.next < operation.rows.length) { if (!isTornBazaarAddRoute() || getVisibleBazaarAddPanel() !== panel || hasExternalBazaarPriceFiller()) { operation.cancelled = true; break; } const target = operation.rows[operation.next++]; let result; try { result = await resolveSelectedBazaarAddPrice(target, panel, operation); } catch (error) { result = { ok: false, reason: 'request-failed', model: resolveCurrentBazaarAddModelByRowKey(target.rowKey) }; } const classification = classifyBazaarBulkPriceResult(result); operation.counts[classification] += 1; operation.completed += 1; if (result.model) setBazaarBulkRowResult(result.model, result); renderBazaarBulkPriceProgress(operation); } }; await Promise.all([worker(), worker()]); if (operation.cancelled) operation.counts.skipped += operation.total - operation.completed; tornState.bazaarAdd.bulkPriceOperation = null; renderBazaarBulkPriceProgress(null); const parts = [`${operation.counts.prepared} Preise vorbereitet`]; if (operation.counts.guarded) parts.push(`${operation.counts.guarded} geprüft, nicht gesetzt`); if (operation.counts.skipped) parts.push(`${operation.counts.skipped} übersprungen`); if (operation.counts.failed) parts.push(`${operation.counts.failed} Fehler`); showBazaarManagerStatus(parts.join(' · ')); return operation.counts;
  }
  function getVisibleBazaarAddPanel() { return Array.from(document.querySelectorAll('ul.items-cont')).find((panel) => panel.offsetParent !== null && !panel.hidden) || null; }
  function renderBazaarAddRowTools(model) {
    let tools = model.element.querySelector('[data-weav3r-bazaar-row-tools]'); if (!tools) { tools = document.createElement('div'); tools.dataset.weav3rBazaarRowTools = '1'; model.element.appendChild(tools); } const externalConflict = hasExternalBazaarPriceFiller(); const display = getBazaarRowDisplayState(model, externalConflict); const feedback = tornState.bazaarAdd.rowFeedback.get(model.rowKey); const statusId = `weav3r-bazaar-row-status-${domSafeBazaarRowKey(model.rowKey)}`; const group = getBazaarAddGroupForRow(model); const groupNote = group?.isUniqueGroup && model.sellRule === 'keep-one' ? (group.expanded ? `1 behalten: Instanzen manuell auswählen (max. ${group.sellableQuantity} von ${group.totalQuantity})` : '1 behalten: Gruppe zuerst öffnen') : group?.isUniqueGroup && !group.expanded ? 'Gruppe zuerst öffnen' : ''; tools.className = `weav3r-bazaar-row-tools weav3r-bazaar-row-tools--${display.mode}`;
    if (!model.isTradable) tools.innerHTML = `<small class="weav3r-bazaar-row-tools__meta">${display.metadata}</small>`; else { const loading = feedback?.state === 'loading'; const disabled = display.fillDisabled || loading || (group?.isUniqueGroup && model.groupRole === 'parent'); const offers = (feedback?.offers || []).map((offer) => `<button type="button" class="weav3r-bazaar-row-tools__price" data-weav3r-bazaar-price-choice="${offer.price}" data-weav3r-bazaar-row-key="${escapeAttribute(model.rowKey)}">${offer.quantity ? `${offer.quantity} × ` : ''}${formatMoney(offer.price)}</button>`).join(''); tools.innerHTML = `<label class="weav3r-bazaar-row-tools__rule"><span>Regel</span><select aria-label="Verkaufsregel für ${escapeAttribute(model.itemName)}" data-weav3r-bazaar-rule="${model.itemId}"><option value="sell-all">Alles verkaufen</option><option value="keep-one">1 behalten</option><option value="dont-sell">Nicht verkaufen</option></select></label><button type="button" class="weav3r-bazaar-row-tools__fill" data-weav3r-bazaar-fill="1" data-weav3r-bazaar-row-key="${escapeAttribute(model.rowKey)}" aria-label="Menge und Preis für ${escapeAttribute(model.itemName)} füllen" ${feedback?.message ? `aria-describedby="${statusId}"` : ''} ${disabled ? 'disabled' : ''}>${loading ? 'Lädt …' : 'Füllen'}</button>${display.metadata ? `<small class="weav3r-bazaar-row-tools__meta">${display.metadata}</small>` : ''}<small id="${statusId}" class="weav3r-bazaar-row-tools__status${['warning', 'error'].includes(feedback?.state) ? ' weav3r-bazaar-row-tools__status--warning' : ''}" ${feedback?.message ? 'role="status"' : 'hidden'}>${escapeHtml(feedback?.message || '')}</small>${offers ? `<div class="weav3r-bazaar-row-tools__prices"><strong>Bazaar:</strong>${offers}</div>` : ''}<small data-weav3r-bazaar-selection-note>${escapeHtml(groupNote)}</small>`; tools.querySelector('select').value = model.sellRule; } model.element.dataset.weav3rSellRule = model.sellRule; model.element.dataset.weav3rBazaarRowKey = model.rowKey; model.element.hidden = shouldHideBazaarAddRow(model, tornState.bazaarAdd.settings.hideProtected);
  }
  function showBazaarManagerStatus(message) { const status = document.querySelector(`#${BAZAAR_ADD_MANAGER_ID} [data-weav3r-bazaar-status]`); if (!status) return; clearTimeout(tornState.bazaarAdd.statusTimer); status.textContent = message; status.hidden = !message; if (message) tornState.bazaarAdd.statusTimer = setTimeout(() => { status.textContent = ''; status.hidden = true; }, 6000); }
  function ensureBazaarAddToolbar(panel) {
    let toolbar = document.getElementById(BAZAAR_ADD_MANAGER_ID); if (toolbar) return toolbar;
    toolbar = document.createElement('section'); toolbar.id = BAZAAR_ADD_MANAGER_ID; toolbar.className = 'weav3r-bazaar-manager'; toolbar.dataset.weav3rBazaarManager = '1'; toolbar.innerHTML = `<div class="weav3r-bazaar-manager__row weav3r-bazaar-manager__row--primary"><strong class="weav3r-bazaar-manager__title">Bazaar-Verkaufsmanager</strong><div class="weav3r-bazaar-manager__group"><span>Sortieren:</span><div class="weav3r-bazaar-manager__sort"><label class="weav3r-visually-hidden" for="weav3r-bazaar-sort">Sortierfeld</label><select id="weav3r-bazaar-sort" data-weav3r-bazaar-sort><option value="name">Name</option><option value="quantity">Menge</option><option value="marketValueEach">Marktwert / Stück</option><option value="totalMarketValue">Gesamtmarktwert</option><option value="sellableMarketValue">Verkaufbarer Marktwert</option></select><button type="button" data-weav3r-bazaar-direction></button></div></div><div class="weav3r-bazaar-manager__actions"><button type="button" class="weav3r-bazaar-control--primary" data-weav3r-bazaar-select-all title="Alle gemäß Verkaufsregeln verkaufbaren Gegenstände auswählen" aria-label="Alle gemäß Verkaufsregeln verkaufbaren Gegenstände auswählen">Verkaufbare auswählen</button><button type="button" data-weav3r-bazaar-fill-selected title="Preise für ausgewählte verkaufbare Positionen füllen" aria-label="Preise für ausgewählte verkaufbare Positionen füllen">Preise füllen</button><button type="button" data-weav3r-bazaar-reset title="Aktuelle Mengenauswahl leeren" aria-label="Aktuelle Mengenauswahl leeren">Auswahl leeren</button></div></div><div class="weav3r-bazaar-manager__row weav3r-bazaar-manager__row--secondary"><label class="weav3r-bazaar-manager__check"><input type="checkbox" data-weav3r-bazaar-hide> Geschützte ausblenden</label><label class="weav3r-bazaar-manager__adjustment">Preis-Anpassung: <input type="text" inputmode="numeric" size="5" data-weav3r-bazaar-adjustment aria-label="Signierte Preis-Anpassung in Dollar"></label><span class="weav3r-bazaar-manager__summary" data-weav3r-bazaar-summary></span><span class="weav3r-bazaar-manager__warning" data-weav3r-bazaar-warning></span></div><div class="weav3r-bazaar-manager__status" data-weav3r-bazaar-status aria-live="polite" hidden></div><div class="weav3r-bazaar-manager__price-context" data-weav3r-bazaar-price-context hidden></div>`;
    panel.parentElement?.insertBefore(toolbar, panel); return toolbar;
  }
  function renderBazaarAddManager() {
    if (!isTornBazaarAddRoute()) return teardownBazaarAddManager(); const panel = getVisibleBazaarAddPanel(); if (!panel) return; const toolbar = ensureBazaarAddToolbar(panel); const built = buildBazaarAddGroups(panel); const sortedGroups = [...built.groups].sort((a, b) => compareBazaarAddModels(a.sortModel, b.sortModel, tornState.bazaarAdd.settings)); let order = 0; sortedGroups.forEach((group) => group.rows.forEach((model) => { renderBazaarAddRowTools(model); model.element.style.order = String(order++); })); panel.style.display = 'flex'; panel.style.flexDirection = 'column'; tornState.bazaarAdd.rows = built.rows; tornState.bazaarAdd.groups = built.groups; logDebug('Bazaar Add groups sorted.', { groups: sortedGroups.map((group) => group.groupKey) });
    const summaryRows = built.groups.map((group) => ({ isTradable: group.parent.isTradable, sellableQuantity: group.sellableQuantity, sellableMarketValue: group.sellableMarketValue })); const summary = summarizeBazaarAddRows(summaryRows); const valuation = summary.hasUnknownValue ? (summary.knownValue === '0' ? 'Marktwert teilweise unbekannt' : `${formatMoney(summary.knownValue)}+ · Marktwert teilweise unbekannt`) : formatMoney(summary.knownValue); toolbar.querySelector('[data-weav3r-bazaar-summary]').textContent = `Verkaufbar: ${summary.positions} Positionen · ${summary.quantity} Stück · ${valuation}`; toolbar.querySelector('[data-weav3r-bazaar-sort]').value = tornState.bazaarAdd.settings.sortField; const direction = toolbar.querySelector('[data-weav3r-bazaar-direction]'); const descending = tornState.bazaarAdd.settings.sortDirection === 'desc'; direction.textContent = descending ? '↓' : '↑'; direction.setAttribute('aria-label', `Sortierrichtung: ${descending ? 'absteigend' : 'aufsteigend'}`); direction.title = direction.getAttribute('aria-label'); toolbar.querySelector('[data-weav3r-bazaar-hide]').checked = tornState.bazaarAdd.settings.hideProtected; toolbar.querySelector('[data-weav3r-bazaar-adjustment]').value = tornState.bazaarAdd.settings.priceAdjustment; const external = hasExternalBazaarPriceFiller(); toolbar.querySelector('[data-weav3r-bazaar-warning]').textContent = external ? 'Externer Price Filler erkannt – integriertes Füllen deaktiviert.' : ''; const bulkButton = toolbar.querySelector('[data-weav3r-bazaar-fill-selected]'); if (external) bulkButton.disabled = true; if (tornState.bazaarAdd.bulkPriceOperation) renderBazaarBulkPriceProgress(tornState.bazaarAdd.bulkPriceOperation);
  }
  function scheduleBazaarAddRender() { clearTimeout(tornState.bazaarAdd.timer); tornState.bazaarAdd.timer = setTimeout(renderBazaarAddManager, 120); }
  function teardownBazaarAddManager() { clearTimeout(tornState.bazaarAdd.timer); if (tornState.bazaarAdd.bulkPriceOperation) tornState.bazaarAdd.bulkPriceOperation.cancelled = true; tornState.bazaarAdd.observer?.disconnect(); tornState.bazaarAdd.observer = null; tornState.bazaarAdd.root = null; tornState.bazaarAdd.rows = []; tornState.bazaarAdd.groups = []; document.getElementById(BAZAAR_ADD_MANAGER_ID)?.remove(); document.querySelectorAll('[data-weav3r-bazaar-row-tools]').forEach((node) => node.remove()); document.querySelectorAll('ul.items-cont > li').forEach((row) => { row.style.order = ''; row.hidden = false; }); }
  function initBazaarAddManager() {
    if (!isTornBazaarAddRoute()) return teardownBazaarAddManager(); tornState.bazaarAdd.rules = normalizeBazaarSellRules(gmGet(BAZAAR_SELL_RULES_KEY, null)); tornState.bazaarAdd.settings = normalizeBazaarAddSettings(gmGet(BAZAAR_ADD_UI_SETTINGS_KEY, null));
    if (!tornState.bazaarAdd.listenersAttached) { tornState.bazaarAdd.listenersAttached = true; document.addEventListener('change', (event) => { const rule = event.target.closest?.('[data-weav3r-bazaar-rule]'); if (rule) { setBazaarSellRule(rule.dataset.weav3rBazaarRule, rule.value); tornState.bazaarAdd.rows.filter((row) => row.itemId === normalizePositiveInt(rule.dataset.weav3rBazaarRule)).forEach((row) => tornState.bazaarAdd.rowFeedback.delete(row.rowKey)); scheduleBazaarAddRender(); return; } const toolbar = event.target.closest?.(`#${BAZAAR_ADD_MANAGER_ID}`); if (!toolbar) return; if (event.target.matches('[data-weav3r-bazaar-sort]')) tornState.bazaarAdd.settings.sortField = event.target.value; if (event.target.matches('[data-weav3r-bazaar-hide]')) tornState.bazaarAdd.settings.hideProtected = event.target.checked; if (event.target.matches('[data-weav3r-bazaar-adjustment]') && /^[+-]?\d+$/.test(event.target.value.trim())) tornState.bazaarAdd.settings.priceAdjustment = event.target.value.trim(); gmSet(BAZAAR_ADD_UI_SETTINGS_KEY, tornState.bazaarAdd.settings); scheduleBazaarAddRender(); }); document.addEventListener('click', (event) => { const target = event.target.closest?.('button'); if (!target) return; if (target.matches('[data-weav3r-bazaar-direction]')) { tornState.bazaarAdd.settings.sortDirection = tornState.bazaarAdd.settings.sortDirection === 'desc' ? 'asc' : 'desc'; gmSet(BAZAAR_ADD_UI_SETTINGS_KEY, tornState.bazaarAdd.settings); scheduleBazaarAddRender(); return; } if (target.matches('[data-weav3r-bazaar-select-all]')) { const result = bulkPrepareBazaarAddSelection(); showBazaarManagerStatus(`${result.prepared} Positionen vorbereitet · ${result.protected} geschützt · ${result.partial + result.unresolved} übersprungen`); } if (target.matches('[data-weav3r-bazaar-fill-selected]')) void handleBazaarAddBulkPriceFill(); if (target.matches('[data-weav3r-bazaar-reset]')) { resetBazaarAddSelection(); showBazaarManagerStatus('Auswahl geleert'); } if (target.matches('[data-weav3r-bazaar-fill]')) void handleBazaarAddFill(target.dataset.weav3rBazaarRowKey); if (target.matches('[data-weav3r-bazaar-price-choice]')) { const model = findBazaarAddModelByRowKey(target.dataset.weav3rBazaarRowKey); const price = calculateAdjustedBazaarPrice(target.dataset.weav3rBazaarPriceChoice, tornState.bazaarAdd.settings.priceAdjustment); if (model && price && writeBazaarAddPrice(model, price)) { tornState.bazaarAdd.rowFeedback.set(model.rowKey, { state: 'success', message: `Preis ${formatMoney(price)} manuell übernommen`, offers: [] }); renderBazaarAddRowTools(model); } } }); }
    const root = document.querySelector('#bazaarRoot') || document.querySelector('main'); if (root && tornState.bazaarAdd.root !== root) { tornState.bazaarAdd.observer?.disconnect(); tornState.bazaarAdd.root = root; tornState.bazaarAdd.observer = new MutationObserver((mutations) => { if (mutations.some((mutation) => !mutation.target.closest?.('[data-weav3r-bazaar-manager],[data-weav3r-bazaar-row-tools]'))) scheduleBazaarAddRender(); }); tornState.bazaarAdd.observer.observe(root, { childList: true, subtree: true, characterData: true }); }
    if (!tornState.bazaarAdd.stylesAdded) { tornState.bazaarAdd.stylesAdded = true; GM_addStyle(`.weav3r-bazaar-manager{--wba-surface:var(--default-bg-panel-color,#252b31);--wba-control:var(--input-background-color,#30373e);--wba-control-hover:var(--input-hover-background-color,#39424a);--wba-border:var(--default-border-color,#56616b);--wba-text:var(--default-color,#e5e7eb);--wba-muted:var(--default-color-dimmed,#aeb7c0);--wba-accent:var(--link-color,#4f91c7);display:grid;gap:8px;margin:10px 0;padding:10px 12px;border:1px solid var(--wba-border);border-radius:6px;background:var(--wba-surface);color:var(--wba-text);font:12px Arial,sans-serif}.weav3r-bazaar-manager__row{display:flex;align-items:center;gap:10px 14px;min-width:0}.weav3r-bazaar-manager__row--primary{flex-wrap:wrap}.weav3r-bazaar-manager__row--secondary{flex-wrap:wrap;color:var(--wba-muted)}.weav3r-bazaar-manager__title{font-size:13px;white-space:nowrap}.weav3r-bazaar-manager__group,.weav3r-bazaar-manager__actions,.weav3r-bazaar-manager__sort,.weav3r-bazaar-manager__check,.weav3r-bazaar-manager__adjustment{display:flex;align-items:center;gap:6px}.weav3r-bazaar-manager__actions{gap:7px}.weav3r-bazaar-manager button,.weav3r-bazaar-manager select,.weav3r-bazaar-manager input[type="text"]{box-sizing:border-box;height:30px;border:1px solid var(--wba-border);border-radius:5px;background:var(--wba-control);color:var(--wba-text);font:inherit}.weav3r-bazaar-manager button{padding:0 10px;cursor:pointer}.weav3r-bazaar-manager select{max-width:220px;padding:0 26px 0 8px}.weav3r-bazaar-manager input[type="text"]{width:62px;padding:0 7px;text-align:right}.weav3r-bazaar-manager [data-weav3r-bazaar-direction]{width:32px;padding:0;font-size:15px;font-weight:700}.weav3r-bazaar-manager button:hover:not(:disabled),.weav3r-bazaar-manager select:hover,.weav3r-bazaar-manager input[type="text"]:hover{background:var(--wba-control-hover)}.weav3r-bazaar-manager .weav3r-bazaar-control--primary{border-color:var(--wba-accent);background:var(--wba-accent);color:#fff;font-weight:700}.weav3r-bazaar-manager button:focus-visible,.weav3r-bazaar-manager select:focus-visible,.weav3r-bazaar-manager input:focus-visible{outline:2px solid var(--wba-accent);outline-offset:2px}.weav3r-bazaar-manager button:disabled{cursor:not-allowed;opacity:.5}.weav3r-bazaar-manager__summary{margin-left:auto;font-size:11px;color:var(--wba-muted);white-space:nowrap}.weav3r-bazaar-manager__warning{flex-basis:100%;color:var(--error-color,#e09a67);font-weight:700}.weav3r-bazaar-manager__status{font-size:11px;color:var(--wba-muted)}.weav3r-bazaar-manager__status[hidden],.weav3r-bazaar-manager__price-context[hidden]{display:none}.weav3r-bazaar-row-tools{--wba-control:var(--input-background-color,#30373e);--wba-control-hover:var(--input-hover-background-color,#39424a);--wba-border:var(--default-border-color,#56616b);--wba-text:var(--default-color,#e5e7eb);--wba-muted:var(--default-color-dimmed,#aeb7c0);--wba-accent:var(--link-color,#4f91c7);display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;min-width:0;max-width:100%;min-height:28px;padding:2px 8px;color:var(--wba-text);font:11px Arial,sans-serif}.weav3r-bazaar-row-tools__rule{display:flex;align-items:center;gap:5px}.weav3r-bazaar-row-tools select,.weav3r-bazaar-row-tools button{box-sizing:border-box;height:28px;border:1px solid var(--wba-border);border-radius:5px;background:var(--wba-control);color:var(--wba-text);font:inherit}.weav3r-bazaar-row-tools select{padding:0 24px 0 7px}.weav3r-bazaar-row-tools button{padding:0 9px;cursor:pointer}.weav3r-bazaar-row-tools button:hover:not(:disabled),.weav3r-bazaar-row-tools select:hover{background:var(--wba-control-hover)}.weav3r-bazaar-row-tools button:focus-visible,.weav3r-bazaar-row-tools select:focus-visible{outline:2px solid var(--wba-accent);outline-offset:1px}.weav3r-bazaar-row-tools button:disabled{cursor:not-allowed;opacity:.48}.weav3r-bazaar-row-tools__fill{font-weight:700}.weav3r-bazaar-row-tools__meta{color:var(--wba-muted);white-space:nowrap}.weav3r-bazaar-row-tools--keep-one .weav3r-bazaar-row-tools__meta{color:var(--wba-accent)}.weav3r-bazaar-row-tools--protected{opacity:.78}.weav3r-bazaar-row-tools--protected .weav3r-bazaar-row-tools__meta{font-weight:700}.weav3r-bazaar-row-tools__status{color:var(--wba-muted)}.weav3r-bazaar-row-tools__status--warning{color:var(--error-color,#e09a67)}.weav3r-bazaar-row-tools__prices{display:flex;align-items:center;flex-wrap:wrap;gap:5px;flex:1 1 100%;min-width:0;max-width:100%;box-sizing:border-box;padding-left:40px}.weav3r-bazaar-row-tools__price{flex:0 0 auto;max-width:100%;height:26px!important;padding:0 7px!important}.weav3r-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}@media(max-width:760px){.weav3r-bazaar-manager__row{align-items:flex-start}.weav3r-bazaar-manager__title{flex-basis:100%}.weav3r-bazaar-manager__summary{flex-basis:100%;margin-left:0}.weav3r-bazaar-manager__actions{flex-wrap:wrap}.weav3r-bazaar-row-tools{flex-wrap:wrap}.weav3r-bazaar-row-tools__prices{padding-left:0}}@media(prefers-color-scheme:light){.weav3r-bazaar-manager,.weav3r-bazaar-row-tools{--wba-surface:var(--default-bg-panel-color,#f1f3f5);--wba-control:var(--input-background-color,#fff);--wba-control-hover:var(--input-hover-background-color,#e8edf1);--wba-border:var(--default-border-color,#9aa4ad);--wba-text:var(--default-color,#26313a);--wba-muted:var(--default-color-dimmed,#5d6871)}}`); } scheduleBazaarAddRender();
  }
  function reconcileBazaarAddLifecycle() { if (isTornBazaarAddRoute()) initBazaarAddManager(); else teardownBazaarAddManager(); }
  function initBazaarAddLifecycle() {
    if (!tornState.bazaarAdd.lifecycleListenersAttached) { tornState.bazaarAdd.lifecycleListenersAttached = true; window.addEventListener('hashchange', reconcileBazaarAddLifecycle); window.addEventListener('popstate', reconcileBazaarAddLifecycle); }
    if (!tornState.bazaarAdd.lifecycleObserver && document.documentElement) { tornState.bazaarAdd.lifecycleObserver = new MutationObserver(() => { const onAddRoute = isTornBazaarAddRoute(); const managerPresent = Boolean(document.getElementById(BAZAAR_ADD_MANAGER_ID)); if ((onAddRoute && (!managerPresent || !tornState.bazaarAdd.root)) || (!onAddRoute && (managerPresent || tornState.bazaarAdd.root))) reconcileBazaarAddLifecycle(); }); tornState.bazaarAdd.lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true }); }
    reconcileBazaarAddLifecycle();
  }
  function initTornBazaarHandoff() {
    pruneExpiredHandoffs();
    initTornMarketPurchaseInfrastructure('bazaar');
    initBazaarAddLifecycle();
    const matched = findMatchingBazaarHandoff(); const handoff = matched?.handoff;
    if (!handoff) return;
    const claimed = claimPurchaseTransportForTorn('bazaar', handoff.correlationId, handoff.itemId);
    if (claimed) initializeClaimedPurchaseObservation(claimed);
    waitForTornElement(findBazaarSearchInput, (input) => {
      if (!input) { showTornStatus('Weav3r: Bazaar search field was not found.'); return; }
      const currentSearch = String(input.value || '').trim(); const sameItem = normalizedItemText(currentSearch) === normalizedItemText(handoff.itemName); const explicit = handoff.searchIntent === 'explicit-item';
      if (currentSearch && (sameItem || !explicit)) { showTornStatus('Weav3r: Existing Bazaar search preserved.'); return; }
      if (setControlledInputValue(input, handoff.itemName, { focusFirst: true, beforeInput: true, change: true })) { showTornStatus(`Weav3r: Bazaar search filled with “${handoff.itemName}”.`); logDebug('Bazaar search field filled.'); }
    });
  }
  function getActiveTradeAssociation() { try { return sessionStorage.getItem(TRADE_ACTIVE_HANDOFF_SESSION_KEY) || ''; } catch (_) { return ''; } }
  function setActiveTradeAssociation(handoffId) { try { sessionStorage.setItem(TRADE_ACTIVE_HANDOFF_SESSION_KEY, handoffId); logDebug('Matching Trade tab associated with handoffId.', handoffId); } catch (_) { /* ignore */ } }
  function clearActiveTradeAssociation(handoffId = '') { try { if (!handoffId || sessionStorage.getItem(TRADE_ACTIVE_HANDOFF_SESSION_KEY) === handoffId) sessionStorage.removeItem(TRADE_ACTIVE_HANDOFF_SESSION_KEY); } catch (_) { /* ignore */ } }
  function shouldAssociateTradeTab(handoff, route) { return !!(handoff && route.step === 'start' && route.traderId && route.traderId === handoff.traderId); }
  function isAssociatedTradeTab(handoff, route) { if (!handoff) return false; if (getActiveTradeAssociation() === handoff.handoffId) return true; return !!(handoff.tradeId && route.tradeId && handoff.tradeId === route.tradeId); }
  function validateTradeTarget(handoff, route = parseTradeHash()) { if (route.step === 'start') return !route.traderId || route.traderId === handoff.traderId; if (route.tradeId && handoff.tradeId) return route.tradeId === handoff.tradeId; return true; }
  function isTradeHandoffActivityEligible(handoff, now = Date.now()) { return Number.isFinite(Number(handoff?.traderLastSeenAt)) && Number.isFinite(Number(handoff?.traderTradeEligibleUntil)) && Math.abs(Number(handoff.traderTradeEligibleUntil) - (Number(handoff.traderLastSeenAt) + TRADE_ACTIVITY_LIMIT_MS)) <= 1000 && now <= Number(handoff.traderTradeEligibleUntil); }
  function findTradeDescriptionField() {
    const root = document.querySelector('#trade-container') || document;
    const selectors = ['textarea[data-testid*="description" i], input[data-testid*="description" i]', 'textarea[name*="description" i], input[name*="description" i]', 'textarea[id*="description" i], input[id*="description" i]', 'textarea[placeholder*="description" i], input[placeholder*="description" i]', 'textarea[aria-label*="description" i], input[aria-label*="description" i]'];
    for (const selector of selectors) { const field = Array.from(root.querySelectorAll(selector)).find(isUsableTextField); if (field) return field; }
    const labels = Array.from(root.querySelectorAll('label')).filter((label) => /^(trade\s+description|description)$/i.test(label.textContent.replace(/\s+/g, ' ').trim()));
    for (const label of labels) { const target = label.getAttribute('for') ? document.getElementById(label.getAttribute('for')) : label.closest('div,section,form')?.querySelector('textarea,input[type="text"],input:not([type])'); if (isUsableTextField(target)) return target; }
    return null;
  }
  function isUsableTextField(field) { return field && !field.disabled && !field.hidden && field.offsetParent !== null && /^(INPUT|TEXTAREA)$/.test(field.tagName) && !/search|chat|message|forum/i.test(`${field.name || ''} ${field.id || ''} ${field.getAttribute('aria-label') || ''}`); }
  function findInitiateTradeButton() { return document.querySelector('#trade-container input.torn-btn[type="submit"][value="INITIATE TRADE"]'); }
  function shouldEnableInitiateFallback({ route, handoff, field, expectedDescription, wasEmpty, button }) { return !!(route.step === 'start' && handoff && !isHandoffExpired(handoff) && route.traderId === handoff.traderId && getActiveTradeAssociation() === handoff.handoffId && wasEmpty && field?.value === expectedDescription && button && button.disabled); }
  function shouldDisableManagedInitiateButton(field) { return !String(field?.value || '').trim(); }
  function cleanupInitiateFallback() {
    const managed = tornState.managedInitiate;
    if (!managed) return;
    if (managed.field && managed.listener) managed.field.removeEventListener('input', managed.listener);
    if (managed.observer) managed.observer.disconnect();
    clearTimeout(managed.timeoutId);
    tornState.managedInitiate = null;
    logDebug('initiate-button safety listener removed.');
  }
  function manageInitiateSafety(field, button, route, handoff, expectedDescription) {
    cleanupInitiateFallback();
    const listener = () => { const latestRoute = parseTradeHash(); if (latestRoute.step !== 'start' || latestRoute.traderId !== route.traderId || getActiveTradeAssociation() !== handoff.handoffId) return cleanupInitiateFallback(); if (shouldDisableManagedInitiateButton(field)) { const currentButton = findInitiateTradeButton() || tornState.managedInitiate?.button || button; currentButton.disabled = true; currentButton.setAttribute('disabled', ''); } };
    field.addEventListener('input', listener);
    const managed = { field, button, listener, routeKey: `${route.step}:${route.traderId}`, handoffId: handoff.handoffId, expectedDescription, reapplyCount: 0, observer: null, timeoutId: 0 };
    const reapply = () => { const latestRoute = parseTradeHash(); if (latestRoute.step !== 'start' || latestRoute.traderId !== route.traderId || field.value !== expectedDescription || getActiveTradeAssociation() !== handoff.handoffId || managed.reapplyCount >= 3) return; const nextButton = findInitiateTradeButton(); if (nextButton?.disabled) { nextButton.disabled = false; nextButton.removeAttribute('disabled'); managed.button = nextButton; managed.reapplyCount += 1; logDebug('initiate-button fallback reapplied after Torn rerender.'); } };
    managed.observer = new MutationObserver(reapply);
    const tradeContainer = document.querySelector('#trade-container');
    if (tradeContainer) managed.observer.observe(tradeContainer, { childList: true, subtree: true });
    managed.timeoutId = setTimeout(() => { if (managed.observer) managed.observer.disconnect(); managed.observer = null; }, 3000);
    tornState.managedInitiate = managed;
  }
  function maybeEnableInitiateFallback(handoff, route, field, expectedDescription, wasEmpty) {
    requestAnimationFrame(() => setTimeout(() => {
      const latest = readTradeHandoff();
      if (!latest || latest.handoffId !== handoff.handoffId) return;
      const button = findInitiateTradeButton();
      if (!button) return;
      if (!button.disabled) { showTornStatus('Weav3r: Trade description filled.'); logDebug('Torn enabled INITIATE TRADE itself.'); return; }
      if (!shouldEnableInitiateFallback({ route, handoff: latest, field, expectedDescription, wasEmpty, button })) return;
      button.disabled = false;
      button.removeAttribute('disabled');
      latest.progress.initiateButtonEnabledAt = Date.now();
      writeTradeHandoff(latest);
      manageInitiateSafety(field, button, route, latest, expectedDescription);
      showTornStatus('Weav3r: Trade description filled. Review it and initiate the trade manually.');
      logDebug('userscript enabled INITIATE TRADE fallback.');
    }, 80));
  }
  function normalizedItemText(text) { return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function extractTornItemIdFromImageSource(source) { const match = String(source || '').match(/\/images\/items\/(\d+)\//); return match ? normalizePositiveInt(match[1]) : null; }
  function getInventoryContainer() { return document.querySelector('#inventory-container'); }
  function collectTradeInventoryRows(inventory) {
    if (!inventory) return [];
    return Array.from(inventory.querySelectorAll('.items-cont > li[data-group="parent"], .items-cont > li[data-group="child"]'));
  }
  function getInventoryRows() { return collectTradeInventoryRows(getInventoryContainer()); }
  function getInventoryRowItemIds(row) {
    const ids = new Set();
    row.querySelectorAll('img').forEach((img) => {
      [img.getAttribute('src'), img.currentSrc, img.src].forEach((source) => { const id = extractTornItemIdFromImageSource(source); if (id) ids.add(id); });
      String(img.getAttribute('srcset') || '').split(',').forEach((part) => { const id = extractTornItemIdFromImageSource(part.trim().split(/\s+/)[0]); if (id) ids.add(id); });
    });
    return Array.from(ids);
  }
  function getInventoryRowName(row) { return normalizeBoundedText(row.querySelector('.name-wrap.bold .t-overflow')?.textContent || row.querySelector('img[alt]')?.getAttribute('alt') || '', 150); }
  function rowHasTradeItemId(row, itemId) { return getInventoryRowItemIds(row).includes(normalizePositiveInt(itemId)); }
  function getVerifiedTargetRows(handoff) {
    const expectedName = normalizedItemText(handoff.itemName);
    return getInventoryRows().filter((row) => {
      if (!getInventoryRowItemIds(row).includes(handoff.itemId)) return false;
      const rowName = getInventoryRowName(row);
      if (rowName && normalizedItemText(rowName) !== expectedName) { logDebug('Target Item ID row had mismatched name.', { rowName, expected: handoff.itemName }); return false; }
      return true;
    });
  }
  function getTradeIdFromBackLink() { const link = document.querySelector('a.back-to[href*="trade.php#step=view"][href*="ID="]'); if (!link) return null; try { return parseTradeHash(new URL(link.getAttribute('href'), location.href).hash).tradeId; } catch (_) { const hash = String(link.getAttribute('href') || '').split('#')[1] || ''; return parseTradeHash(`#${hash}`).tradeId; } }
  function getTradeFilterMode(handoff) { return handoff?.progress?.itemFilterMode === 'all' ? 'all' : 'target-only'; }
  function formatTargetFilterLabel(itemName, count) { return count > 1 ? `Showing Weav3r target: ${itemName} · ${count} instances` : `Showing Weav3r target: ${itemName}`; }
  function shouldCaptureTradeId(handoff, route) { return !!(handoff && route.tradeId && isAssociatedTradeTab(handoff, route) && (!handoff.tradeId || handoff.tradeId === route.tradeId)); }
  function shouldCompleteTradeHandoff(handoff, route) { return !!(handoff && route.step === 'view' && route.tradeId && handoff.tradeId === route.tradeId && handoff.progress.addStepEnteredAt); }
  function clearTradeItemFilterUi() {
    tornState.inventoryDiscoveryController?.abort();
    tornState.inventoryDiscoveryController = null;
    if (tornState.inventoryObserver) tornState.inventoryObserver.disconnect();
    tornState.inventoryObserver = null;
    tornState.inventoryRouteKey = '';
    if (tornState.filterButton) tornState.filterButton.onclick = null;
    tornState.filterButton = null;
    document.getElementById(TRADE_FILTER_PANEL_ID)?.remove();
    getInventoryRows().forEach((row) => row.classList.remove(TRADE_FILTER_HIDDEN_CLASS, TRADE_FILTER_TARGET_CLASS));
    logDebug('filter UI cleaned up.');
  }
  function getTradeRowQuantityControl(row) {
    const controls = Array.from(row.querySelectorAll('input[name="amount"], input[type="number"], input[inputmode="numeric"], input[name*="quantity" i], input[aria-label*="quantity" i]')).filter((input, index, all) => all.indexOf(input) === index && input.type !== 'checkbox');
    if (controls.length !== 1) return null;
    const input = controls[0];
    const parseAvailable = (value, pattern = /^\s*([\d,]+)\s*$/) => {
      const match = String(value || '').match(pattern);
      if (!match) return null;
      const digits = match.slice(1).find(Boolean);
      if (!digits) return null;
      const normalized = digits.replace(/[\s,]/g, '');
      if (!/^\d+$/.test(normalized)) return null;
      const quantity = Number(normalized);
      return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
    };
    const amountNode = row.querySelector('.item-amount.qty');
    const amountQuantity = amountNode && !amountNode.matches('.tt-item-price,.tt-item-quantity,.tt-total-value,.tt-log-value') ? parseAvailable(amountNode.textContent) : null;
    if (amountQuantity) { logDebug('quantity source selected: .item-amount.qty.', amountQuantity); return !input.disabled && !input.readOnly ? { input, available: amountQuantity, source: 'item-amount' } : null; }
    const quantityLabel = Array.from(row.querySelectorAll('.name-wrap *:not(.tt-item-price):not(.tt-item-quantity):not(.tt-total-value):not(.tt-log-value)')).find((node) => /^\s*(?:x\s*[\d,]+|[\d,]+\s*x)\s*$/i.test(node.textContent || ''));
    const labelQuantity = quantityLabel ? parseAvailable(quantityLabel.textContent, /^\s*(?:x\s*([\d,]+)|([\d,]+)\s*x)\s*$/i) || parseAvailable((quantityLabel.textContent.match(/[\d,]+/) || [''])[0]) : null;
    if (labelQuantity) { logDebug('quantity source selected: isolated name-wrap label.', labelQuantity); return !input.disabled && !input.readOnly ? { input, available: labelQuantity, source: 'name-wrap-label' } : null; }
    const candidates = [input.getAttribute('max'), input.dataset.max, input.dataset.available, row.dataset.available, row.dataset.quantity];
    const available = candidates.map((value) => parseAvailable(value)).find(Boolean) || null;
    if (available) logDebug('quantity source selected: explicit maximum/data attribute.', available);
    return available && !input.disabled && !input.readOnly ? { input, available, source: 'attribute' } : null;
  }
  function useAllTradeTargetQuantity(handoffId) {
    const handoff = readTradeHandoff();
    if (!handoff || handoff.handoffId !== handoffId) return;
    const controls = getVerifiedTargetRows(handoff).map(getTradeRowQuantityControl).filter(Boolean);
    if (!controls.length) { showTornStatus('Weav3r: An available target quantity could not be read safely.'); return; }
    const updated = controls.filter(({ input, available }) => input.isConnected && setControlledInputValue(input, String(available), { change: true })).length;
    showTornStatus(updated ? `Weav3r: Quantity set to all available target items (${controls.reduce((sum, entry) => sum + entry.available, 0)}). Review and add manually.` : 'Weav3r: The quantity field could not be updated.');
    logDebug('manual Use All quantity helper used.', { controls: updated });
  }
  function renderTradeFilterPanel(handoff, count, mode, notFound = false, searching = false) {
    addTornHandoffStyles();
    let panel = document.getElementById(TRADE_FILTER_PANEL_ID);
    if (!panel) { panel = document.createElement('div'); panel.id = TRADE_FILTER_PANEL_ID; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite'); const anchor = document.querySelector('#inventory-stat-container') || getInventoryContainer(); if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor); else document.body.appendChild(panel); }
    panel.textContent = '';
    const text = document.createElement('div');
    text.className = 'weav3r-trade-target-filter__text';
    const quantityControls = !searching && !notFound ? getVerifiedTargetRows(handoff).map(getTradeRowQuantityControl).filter(Boolean) : [];
    const available = quantityControls.reduce((sum, entry) => sum + entry.available, 0);
    text.textContent = searching ? `Searching loaded inventory for ${handoff.itemName} · Item ${handoff.itemId}…` : notFound ? `Weav3r target item was not found after checking the available inventory. ${handoff.itemName} · Item ${handoff.itemId}` : `${formatTargetFilterLabel(handoff.itemName, count)}${available ? ` · Available: ${available}` : ''}`;
    const controls = document.createElement('div');
    controls.className = 'weav3r-trade-target-filter__controls';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = mode === 'all' ? 'Show Target Item Only' : 'Show All Items';
    button.addEventListener('click', () => toggleTradeFilterMode(handoff.handoffId));
    if (!searching) controls.append(button);
    if (quantityControls.length) {
      const useAll = document.createElement('button');
      useAll.type = 'button';
      useAll.textContent = `Use All ${available}`;
      useAll.title = 'Fill the target quantity with all available items; you still select and add the item manually.';
      useAll.addEventListener('click', () => useAllTradeTargetQuantity(handoff.handoffId));
      controls.prepend(useAll);
    }
    panel.append(text, controls);
    tornState.filterButton = button;
  }
  function findTradeInventoryScrollRoot(inventory) {
    for (let element = inventory; element && element !== document.body; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2) return element;
    }
    return null;
  }
  function waitForInventoryGrowth(inventory, signal, timeoutMs = TRADE_TARGET_DISCOVERY_SETTLE_MS) {
    return new Promise((resolve) => {
      if (signal?.aborted) { resolve(false); return; }
      let settled = false;
      const finish = (changed) => { if (settled) return; settled = true; observer.disconnect(); clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(changed); };
      const abort = () => finish(false);
      const observer = new MutationObserver(() => finish(true));
      observer.observe(inventory, { childList: true, subtree: true });
      const timer = setTimeout(() => finish(false), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  async function findTradeTargetWithProgressiveScroll({ inventory, targetItemId, signal, isContextCurrent = () => true }) {
    if (!inventory || !normalizePositiveInt(targetItemId)) return [];
    const scrollRoot = findTradeInventoryScrollRoot(inventory);
    const initialScrollTop = scrollRoot ? scrollRoot.scrollTop : window.scrollY;
    const deadline = Date.now() + TRADE_TARGET_DISCOVERY_TIMEOUT_MS;
    let unchangedAtEnd = 0;
    let previousSignature = '';
    let found = false;
    try {
      for (let step = 0; step < TRADE_TARGET_DISCOVERY_MAX_STEPS && Date.now() < deadline && !signal?.aborted; step += 1) {
        const rows = collectTradeInventoryRows(inventory);
        const targets = rows.filter((row) => rowHasTradeItemId(row, targetItemId));
        if (targets.length) { found = true; return targets; }
        const signature = `${rows.length}:${scrollRoot?.scrollHeight || document.documentElement.scrollHeight}`;
        const atEnd = scrollRoot ? scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 2 : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        unchangedAtEnd = atEnd && signature === previousSignature ? unchangedAtEnd + 1 : 0;
        if (unchangedAtEnd >= 2) break;
        previousSignature = signature;
        if (scrollRoot) scrollRoot.scrollTo({ top: Math.min(scrollRoot.scrollHeight, scrollRoot.scrollTop + Math.max(240, Math.floor(scrollRoot.clientHeight * 0.8))), behavior: 'auto' });
        else rows.at(-1)?.scrollIntoView({ block: 'end', behavior: 'auto' });
        await waitForInventoryGrowth(inventory, signal);
      }
      const targets = collectTradeInventoryRows(inventory).filter((row) => rowHasTradeItemId(row, targetItemId));
      found = targets.length > 0;
      return targets;
    } finally {
      if (!found && isContextCurrent()) {
        if (scrollRoot) scrollRoot.scrollTo({ top: initialScrollTop, behavior: 'auto' });
        else window.scrollTo({ top: initialScrollTop, behavior: 'auto' });
        logDebug('inventory scroll restored after unsuccessful target discovery.');
      }
    }
  }
  function applyTradeItemFilter(handoff, scrollTarget = false) {
    const latest = readTradeHandoff() || handoff;
    const rows = getInventoryRows();
    const targets = getVerifiedTargetRows(latest);
    const mode = getTradeFilterMode(latest);
    if (!targets.length) {
      rows.forEach((row) => row.classList.remove(TRADE_FILTER_HIDDEN_CLASS, TRADE_FILTER_TARGET_CLASS));
      renderTradeFilterPanel(latest, 0, 'all', true);
      latest.progress.itemNotFoundAt = latest.progress.itemNotFoundAt || Date.now();
      writeTradeHandoff(latest);
      showTornStatus(`Weav3r: “${latest.itemName}” was not found in your inventory.`);
      logDebug('target item not found.');
      return false;
    }
    rows.forEach((row) => { const isTarget = targets.includes(row); row.classList.toggle(TRADE_FILTER_TARGET_CLASS, isTarget); row.classList.toggle(TRADE_FILTER_HIDDEN_CLASS, mode === 'target-only' && !isTarget); });
    renderTradeFilterPanel(latest, targets.length, mode, false);
    if (mode === 'target-only' && scrollTarget) { const currentTarget = getVerifiedTargetRows(latest)[0]; currentTarget?.scrollIntoView({ behavior: 'auto', block: 'center' }); logDebug('target retained after successful discovery.'); }
    if (mode === 'target-only') latest.progress.itemFilterAppliedAt = latest.progress.itemFilterAppliedAt || Date.now();
    writeTradeHandoff(latest);
    showTornStatus(targets.length > 1 ? `Weav3r: Showing ${targets.length} matching “${latest.itemName}” instances.` : `Weav3r: Showing only “${latest.itemName}”. Select it manually.`);
    logDebug('target-only filter applied.', { count: targets.length, mode });
    return true;
  }
  function toggleTradeFilterMode(handoffId) {
    const handoff = readTradeHandoff();
    if (!handoff || handoff.handoffId !== handoffId) return;
    const current = getTradeFilterMode(handoff);
    if (current === 'target-only') { handoff.progress.itemFilterMode = 'all'; handoff.progress.itemFilterDismissedAt = Date.now(); writeTradeHandoff(handoff); getInventoryRows().forEach((row) => row.classList.remove(TRADE_FILTER_HIDDEN_CLASS)); renderTradeFilterPanel(handoff, getVerifiedTargetRows(handoff).length, 'all', false); showTornStatus('Weav3r: All inventory items are visible.'); logDebug('all-items mode selected by user.'); return; }
    handoff.progress.itemFilterMode = 'target-only'; writeTradeHandoff(handoff); applyTradeItemFilter(handoff, true); logDebug('target-only mode restored by user.');
  }
  function setupInventoryObserver(handoff, route) {
    const container = getInventoryContainer();
    if (!container) return;
    const routeKey = `${handoff.handoffId}:${route.tradeId}`;
    if (tornState.inventoryObserver && tornState.inventoryRouteKey === routeKey) return;
    if (tornState.inventoryObserver) tornState.inventoryObserver.disconnect();
    tornState.inventoryRouteKey = routeKey;
    let pending = false;
    tornState.inventoryObserver = new MutationObserver(() => { if (pending) return; pending = true; setTimeout(() => { pending = false; const latest = readTradeHandoff(); const latestRoute = parseTradeHash(); if (!latest || latest.handoffId !== handoff.handoffId || latestRoute.step !== 'add' || latestRoute.tradeId !== route.tradeId) return clearTradeItemFilterUi(); applyTradeItemFilter(latest, false); logDebug('inventory rerender handled.'); }, 80); });
    tornState.inventoryObserver.observe(container, { childList: true, subtree: true });
  }
  function isSupportedAddInventoryReady() { const container = getInventoryContainer(); return !!(container && container.querySelector('ul.items-cont') && collectTradeInventoryRows(container).length); }
  function captureTradeIdIfNeeded(handoff, route) {
    if (!shouldCaptureTradeId(handoff, route)) return handoff;
    if (!handoff.tradeId) { handoff.tradeId = route.tradeId; handoff.progress.tradeIdCapturedAt = Date.now(); handoff = writeTradeHandoff(handoff) || handoff; promoteHandoffToVerification(handoff); logDebug('Trade ID bound before route rejection; Verification promoted immediately.', { handoffId: handoff.handoffId, tradeId: route.tradeId }); }
    return handoff;
  }
  function normalizeTradeVerificationRecord(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
    const tradeId = normalizePositiveInt(raw.tradeId);
    const traderId = normalizePositiveInt(raw.traderId);
    const itemId = normalizePositiveInt(raw.itemId);
    const unitSellPrice = normalizeNonNegativeInt(raw.unitSellPrice ?? raw.expectedUnitPrice);
    const expiresAt = Number(raw.expiresAt);
    if (!tradeId || !traderId || !itemId || unitSellPrice == null || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return { version: 1, verificationId: normalizeBoundedText(raw.verificationId, 80) || makeHandoffId(), handoffId: normalizeBoundedText(raw.handoffId, 80), tradeId, traderId, traderName: normalizeBoundedText(raw.traderName, 100), itemId, itemName: normalizeBoundedText(raw.itemName, 150), unitSellPrice, expectedUnitPrice: unitSellPrice, recordSource: normalizeBoundedText(raw.recordSource, 60) || 'unknown', recoveredAt: Number(raw.recoveredAt) || null, recoveryEvidence: raw.recoveryEvidence && typeof raw.recoveryEvidence === 'object' ? { itemSource: normalizeBoundedText(raw.recoveryEvidence.itemSource, 40), unitPriceSource: normalizeBoundedText(raw.recoveryEvidence.unitPriceSource, 40), traderSource: normalizeBoundedText(raw.recoveryEvidence.traderSource, 40) } : null, createdAt: Number(raw.createdAt) || Date.now(), expiresAt, quantity: normalizeNonNegativeInt(raw.quantity), expectedTotal: raw.expectedTotal == null ? null : String(raw.expectedTotal), offeredTotal: raw.offeredTotal == null ? null : String(raw.offeredTotal), difference: raw.difference == null ? null : String(raw.difference), paymentState: normalizeBoundedText(raw.paymentState, 40) || null, simpleItemForMoneyTrade: raw.simpleItemForMoneyTrade === true, ownAdditionalItems: normalizeNonNegativeInt(raw.ownAdditionalItems) || 0, ownMoney: raw.ownMoney == null ? null : String(raw.ownMoney), ownProperties: normalizeNonNegativeInt(raw.ownProperties) || 0, counterpartyAdditionalItems: normalizeNonNegativeInt(raw.counterpartyAdditionalItems) || 0, counterpartyProperties: normalizeNonNegativeInt(raw.counterpartyProperties) || 0, otherPartyAccepted: Boolean(raw.otherPartyAccepted), snapshotState: normalizeBoundedText(raw.snapshotState, 60) || null, snapshotAt: Number(raw.snapshotAt) || null, finalSnapshotAt: Number(raw.finalSnapshotAt) || null, finalSnapshotSource: normalizeBoundedText(raw.finalSnapshotSource, 40) || null, completionState: normalizeBoundedText(raw.completionState, 40) || null, completedAt: Number(raw.completedAt) || null, lastObservedQuantity: normalizeNonNegativeInt(raw.lastObservedQuantity), lastExpectedTotal: raw.lastExpectedTotal == null ? null : String(raw.lastExpectedTotal), lastObservedTraderMoney: raw.lastObservedTraderMoney == null ? null : String(raw.lastObservedTraderMoney), lastTraderAccepted: Boolean(raw.lastTraderAccepted), lastComparisonStatus: normalizeBoundedText(raw.lastComparisonStatus, 40) || null, lastSnapshotKey: normalizeBoundedText(raw.lastSnapshotKey, 500), updatedAt: Number(raw.updatedAt) || null, traderPricelistUrl: normalizeBoundedText(raw.traderPricelistUrl, 500), ownPlayerId: normalizePositiveInt(raw.ownPlayerId), ratingPromptShownAt: Number(raw.ratingPromptShownAt) || null, ratingPageOpenedAt: Number(raw.ratingPageOpenedAt) || null, ratingPromptDismissedAt: Number(raw.ratingPromptDismissedAt) || null };
  }
  function normalizeTradeVerificationsCollection(raw) { const output = { version: 1, records: {} }; Object.entries(raw?.records || {}).forEach(([key, value]) => { const record = normalizeTradeVerificationRecord(value); if (record) output.records[String(record.tradeId)] = record; else logDebug('verification record expired or deleted.', key); }); return output; }
  function readTradeVerifications() { return normalizeTradeVerificationsCollection(gmGet(TRADE_VERIFICATIONS_KEY, { version: 1, records: {} })); }
  function writeTradeVerifications(collection, replace = false) { const latest = replace ? { version: 1, records: {} } : readTradeVerifications(); return gmSetDurable(TRADE_VERIFICATIONS_KEY, { version: 1, records: { ...latest.records, ...(collection.records || {}) } }, (stored) => Object.keys(latest.records).every((id) => normalizeTradeVerificationsCollection(stored).records[id])); }
  function upsertTradeVerification(record) { const collection = readTradeVerifications(); const key = String(record.tradeId); const existing = collection.records[key]; if (existing && (existing.traderId !== record.traderId || existing.itemId !== record.itemId)) return null; const normalized = normalizeTradeVerificationRecord({ ...existing, ...record, version: 1, verificationId: existing?.verificationId || makeHandoffId() }); if (!normalized) return null; const result = mergeCriticalRecord(TRADE_VERIFICATIONS_KEY, { version: 1, records: {} }, key, normalized, normalizeTradeVerificationsCollection); if (!result.ok) return null; logDebug('verification record created.', key); return result.collection.records[key]; }
  function deleteTradeVerification(tradeId) { const collection = readTradeVerifications(); delete collection.records[String(tradeId)]; writeTradeVerifications(collection, true); }
  function pruneTradeVerifications() { writeTradeVerifications(readTradeVerifications(), true); }
  function getTradeVerificationRecordForId(tradeId, collection = readTradeVerifications()) { const id = normalizePositiveInt(tradeId); return id ? collection?.records?.[String(id)] || null : null; }
  function promoteHandoffToVerification(handoff) { if (!handoff?.tradeId) return null; const now = Date.now(); return upsertTradeVerification({ version: 1, handoffId: handoff.handoffId, tradeId: handoff.tradeId, traderId: handoff.traderId, traderName: handoff.traderName, itemId: handoff.itemId, itemName: handoff.itemName, unitSellPrice: handoff.unitSellPrice, traderPricelistUrl: handoff.traderPricelistUrl, recordSource: 'handoff-promotion', createdAt: now, expiresAt: now + TRADE_VERIFICATION_TTL_MS }); }
  function parseTornMoney(text) { const clean = String(text || '').replace(/\s+/g, ' ').trim(); if (/^No money in trade$/i.test(clean)) return 0n; const match = clean.match(/\$([0-9][0-9,]*)\s+in trade/i); if (!match) return null; return BigInt(match[1].replace(/,/g, '')); }
  function formatTornMoneyBigInt(value, signed = false) { if (value == null) return '—'; const amount = BigInt(value); const negative = amount < 0n; const abs = (negative ? -amount : amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return `${signed && !negative ? '+' : negative ? '-' : ''}$${abs}`; }
  function getCleanTradeLineText(element) { const clone = element.cloneNode(true); clone.querySelectorAll('.tt-item-value,.tt-log-value,.tt-total-value,.tt-item-quantity').forEach((node) => node.remove()); return clone.textContent.replace(/\s+/g, ' ').trim(); }
  function escapeRegExp(text) { return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function parseTargetItemQuantity(lineText, itemName) { const name = escapeRegExp(itemName); const text = String(lineText || '').replace(/\s+/g, ' ').trim(); let match = text.match(new RegExp(`^${name}(?:\\s+x(\\d+))?$`, 'i')); if (match) return normalizePositiveInt(match[1] || '1'); match = text.match(new RegExp(`^(\\d+)x\\s+${name}$`, 'i')); return match ? normalizePositiveInt(match[1]) : null; }
  function getOwnTradeLines() { return Array.from(document.querySelectorAll('#trade-container .trade-cont > .user.left ul.cont .name.left')); }
  function getCounterpartyTradeLines() { return Array.from(document.querySelectorAll('#trade-container .trade-cont > .user.right ul.cont .name.left')); }
  function parseRemoveTradeItemLink(link) {
    try {
      const route = parseTradeHash(new URL(link.getAttribute('href') || link.href, location.href).hash);
      const params = new URLSearchParams(new URL(link.getAttribute('href') || link.href, location.href).hash.replace(/^#/, ''));
      const itemId = normalizePositiveInt(params.get('itemID') || params.get('itemId'));
      const quantityMatch = String(link.getAttribute('aria-label') || '').match(/\bx\s*([\d,]+)\s+from trade\.?$/i);
      const quantity = quantityMatch ? normalizePositiveInt(quantityMatch[1].replace(/,/g, '')) : null;
      return itemId && quantity ? { itemId, quantity, tradeId: route.tradeId } : null;
    } catch (_) { return null; }
  }
  function parseTradeRecoveryComment(text) { const match = normalizeBoundedText(text, 300).match(/^(.+?)\s+for\s+\$([1-9][\d,]*)\s+each$/i); if (!match) return null; const unitSellPrice = normalizePositiveInt(match[2].replace(/,/g, '')); const itemName = normalizeBoundedText(match[1], 150); return itemName && unitSellPrice ? { itemName, unitSellPrice } : null; }
  function recoverTradeVerificationFromEvidence(evidence, now = Date.now()) {
    const tradeId = normalizePositiveInt(evidence?.tradeId); const items = Array.isArray(evidence?.items) ? evidence.items : []; const comments = Array.isArray(evidence?.comments) ? evidence.comments : []; const counterparties = Array.isArray(evidence?.counterparties) ? evidence.counterparties : [];
    if (!tradeId) return { record: null, reason: 'missing current Trade ID' };
    const routeItems = items.filter((item) => item.tradeId === tradeId && normalizePositiveInt(item.itemId) && normalizePositiveInt(item.quantity) && normalizeBoundedText(item.itemName, 150)); const identities = new Map(); routeItems.forEach((item) => { const key = `${item.itemId}:${normalizedItemText(item.itemName)}`; const current = identities.get(key) || { itemId: item.itemId, itemName: normalizeBoundedText(item.itemName, 150), quantity: 0 }; current.quantity += item.quantity; identities.set(key, current); });
    if (identities.size !== 1) return { record: null, reason: 'no unique own remove-link item found' };
    const item = Array.from(identities.values())[0]; const matches = comments.map((comment) => ({ ...comment, parsed: parseTradeRecoveryComment(comment.text) })).filter((comment) => comment.parsed && normalizedItemText(comment.parsed.itemName) === normalizedItemText(item.itemName) && !comment.xids?.includes(comment.traderId));
    const uniquePrices = Array.from(new Set(matches.map((comment) => comment.parsed.unitSellPrice))); if (matches.length !== 1 || uniquePrices.length !== 1) return { record: null, reason: 'no unique own price comment found' };
    const uniqueCounterparties = Array.from(new Map(counterparties.filter((trader) => normalizePositiveInt(trader.traderId)).map((trader) => [trader.traderId, trader])).values()); if (uniqueCounterparties.length !== 1) return { record: null, reason: 'counterparty identity is ambiguous' };
    const trader = uniqueCounterparties[0]; return { reason: null, record: { version: 1, tradeId, traderId: trader.traderId, traderName: normalizeBoundedText(trader.traderName, 100), itemId: item.itemId, itemName: item.itemName, unitSellPrice: uniquePrices[0], expectedUnitPrice: uniquePrices[0], quantity: item.quantity, recordSource: 'trade-dom-recovery', recoveredAt: now, recoveryEvidence: { itemSource: 'remove-link', unitPriceSource: 'own-trade-comment', traderSource: 'trade-profile-link' }, createdAt: now, expiresAt: now + TRADE_VERIFICATION_TTL_MS } };
  }
  function recoverTradeVerificationFromCurrentDom(tradeId) {
    const route = parseTradeHash(); if (route.step !== 'view' || route.tradeId !== normalizePositiveInt(tradeId) || !document.querySelector('#trade-container .trade-cont')) return { record: null, reason: 'current full Trade route unavailable' };
    const links = Array.from(document.querySelectorAll('#trade-container .trade-cont > .user.left a[href*="#step=remove"][href*="itemID="][href*="ID="]')); const items = links.map((link) => { const parsed = parseRemoveTradeItemLink(link); const label = normalizeBoundedText(link.getAttribute('aria-label'), 250); const name = normalizeBoundedText((label.match(/^Remove\s+(.+?)\s+x[\d,]+\s+from trade\.?$/i) || [])[1], 150); return parsed && name ? { ...parsed, itemName: name } : null; }).filter(Boolean);
    const counterparties = Array.from(document.querySelectorAll('#trade-container .trade-cont > .user.right a[href*="profiles.php?XID="]')).map((link) => ({ traderId: parseProfileXid(link.getAttribute('href') || link.href), traderName: normalizeBoundedText(link.textContent, 100) })).filter((entry) => entry.traderId);
    const traderIds = counterparties.map((entry) => entry.traderId); const comments = parseTradeLogEntries().map((entry) => ({ text: getCleanTradeLineText(entry.node), xids: entry.xids, traderId: traderIds.length === 1 ? traderIds[0] : null })); const recovered = recoverTradeVerificationFromEvidence({ tradeId: route.tradeId, items, comments, counterparties });
    logDebug(recovered.record ? 'DOM recovery succeeded.' : `recovery rejected: ${recovered.reason}`, { tradeId: route.tradeId }); return recovered;
  }
  function extractTargetTradeItem(record, routeTradeId = parseTradeHash().tradeId) {
    const links = Array.from(document.querySelectorAll('#trade-container .trade-cont > .user.left a[href*="#step=remove"][href*="itemID="]')).map(parseRemoveTradeItemLink).filter(Boolean);
    const routeLinks = links.filter((item) => !item.tradeId || item.tradeId === routeTradeId);
    const matching = routeLinks.filter((item) => item.itemId === record.itemId);
    if (matching.length) return { itemId: record.itemId, quantity: matching.reduce((sum, item) => sum + item.quantity, 0), source: 'remove-link', mismatch: false };
    if (routeLinks.length) return { itemId: null, quantity: 0, source: 'remove-link', mismatch: true };
    const quantity = getOwnTradeLines().reduce((total, line) => total + (parseTargetItemQuantity(getCleanTradeLineText(line), record.itemName) || 0), 0);
    return { itemId: quantity ? record.itemId : null, quantity, source: 'clean-text', mismatch: false };
  }
  function extractTargetItemQuantity(record) { return extractTargetTradeItem(record).quantity; }
  function detectAdditionalOwnItems(record) { return getOwnTradeLines().some((line) => { const text = getCleanTradeLineText(line); if (/^(No money in trade|No items in trade|Total value)/i.test(text) || parseTornMoney(text) != null) return false; return parseTargetItemQuantity(text, record.itemName) == null; }); }
  function extractCounterpartyMoney() { let found = false; const total = Array.from(document.querySelectorAll('#trade-container .trade-cont > .user.right li.color1 .name.left')).reduce((sum, line) => { const parsed = parseTornMoney(getCleanTradeLineText(line)); if (parsed == null) return sum; found = true; return sum + parsed; }, 0n); return found ? total : null; }
  function inspectSimpleTradeComposition(record, targetQuantity, counterpartyMoney = extractCounterpartyMoney()) {
    const ownLines = getOwnTradeLines(); const counterpartyLines = getCounterpartyTradeLines(); let ownMoney = 0n; let ownAdditionalItems = 0; let counterpartyAdditionalItems = 0;
    ownLines.forEach((line) => { const text = getCleanTradeLineText(line); const money = parseTornMoney(text); if (money != null) { ownMoney += money; return; } if (/^(No money in trade|No items in trade|Total value)/i.test(text) || parseTargetItemQuantity(text, record.itemName)) return; ownAdditionalItems += 1; });
    counterpartyLines.forEach((line) => { const text = getCleanTradeLineText(line); if (parseTornMoney(text) != null || /^(No money in trade|No items in trade|Total value)/i.test(text)) return; counterpartyAdditionalItems += 1; });
    const ownProperties = document.querySelectorAll('#trade-container .trade-cont > .user.left .properties-cont, #trade-container .trade-cont > .user.left .property-cont').length; const counterpartyProperties = document.querySelectorAll('#trade-container .trade-cont > .user.right .properties-cont, #trade-container .trade-cont > .user.right .property-cont').length;
    const simpleItemForMoneyTrade = targetQuantity > 0 && ownAdditionalItems === 0 && ownMoney === 0n && ownProperties === 0 && counterpartyMoney != null && counterpartyMoney > 0n && counterpartyAdditionalItems === 0 && counterpartyProperties === 0;
    logDebug(simpleItemForMoneyTrade ? 'simple Trade composition verified.' : 'mixed Trade detected.', { ownAdditionalItems, ownMoney: ownMoney.toString(), ownProperties, counterpartyAdditionalItems, counterpartyProperties });
    return { ownTargetQuantity: targetQuantity, ownAdditionalItems, ownMoney, ownProperties, counterpartyMoney, counterpartyAdditionalItems, counterpartyProperties, simpleItemForMoneyTrade };
  }
  function calculateExpectedTradeTotal(unitPrice, quantity) { return quantity > 0 ? BigInt(unitPrice) * BigInt(quantity) : null; }
  function compareTradeMoney(expectedTotal, actualMoney) { if (expectedTotal == null || actualMoney == null) return { status: 'incomplete', difference: null }; const difference = actualMoney - expectedTotal; return { status: difference === 0n ? 'match' : difference < 0n ? 'short' : 'over', difference }; }
  function parseProfileXid(href) { try { return normalizePositiveInt(new URL(href, location.href).searchParams.get('XID')); } catch (_) { return null; } }
  function renderedTradeHasTrader(record) { const links = Array.from(document.querySelectorAll('#trade-container a[href*="profiles.php?XID="]')); return links.some((link) => parseProfileXid(link.getAttribute('href') || link.href) === record.traderId); }
  function parseTradeLogEntries() { return Array.from(document.querySelectorAll('#trade-container ul.log li .msg')).map((node) => ({ node, text: node.textContent.replace(/\s+/g, ' ').trim(), xids: Array.from(node.querySelectorAll('a[href*="profiles.php?XID="]')).map((link) => parseProfileXid(link.getAttribute('href') || link.href)).filter(Boolean) })); }
  function isTraderAcceptanceLogEntry(entry, traderId) { return /trade was accepted by/i.test(entry.text) && entry.xids.includes(traderId); }
  function isTradeMutationLogEntry(entry) { return /(added .* to the trade|removed .* from the trade|added money|removed money|added item|removed item|changed|cleared|acceptance was withdrawn|trade was modified|trade was cancelled)/i.test(entry.text); }
  function getCurrentTraderAcceptanceState(record) { for (const entry of parseTradeLogEntries()) { if (isTraderAcceptanceLogEntry(entry, record.traderId)) { logDebug('Trader acceptance current.'); return 'accepted'; } if (isTradeMutationLogEntry(entry)) { logDebug('previous acceptance invalidated by newer mutation.'); return 'not-current'; } } return 'unknown'; }
  function resolveOwnPlayerId(record) { const xids = Array.from(new Set(parseTradeLogEntries().flatMap((entry) => entry.xids))).filter((id) => id !== record.traderId); return xids.length === 1 ? xids[0] : record.ownPlayerId || null; }
  function getPlayerAcceptanceState(playerId) { if (!playerId) return 'unknown'; for (const entry of parseTradeLogEntries()) { if (/trade was accepted by/i.test(entry.text) && entry.xids.includes(playerId)) return 'accepted'; if (isTradeMutationLogEntry(entry)) return 'not-current'; } return 'unknown'; }
  function parseTradeIdFromViewLink(link) { try { return parseTradeHash(new URL(link.getAttribute('href') || link.href, location.href).hash).tradeId; } catch (_) { return null; } }
  function getConfirmedTradeCompletion() { const alert = document.querySelector('#trade-container .info-msg-cont.green .msg[role="alert"]'); const evidenceText = alert?.textContent.replace(/\s+/g, ' ').trim() || ''; if (!alert || evidenceText !== 'Trade was accepted and is now complete!') return null; const routeTradeId = parseTradeHash().tradeId; const backTradeId = parseTradeIdFromViewLink(document.querySelector('#trade-container a[href*="trade.php#step=view"][href*="ID="]')); const tradeId = routeTradeId || backTradeId; return tradeId ? { tradeId, alert, evidenceText, confirmationMethod: 'trade-completion' } : null; }
  function resolveTradeVerificationRoute() { const route = parseTradeHash(); const completion = getConfirmedTradeCompletion(); return completion ? { ...route, step: 'view', tradeId: completion.tradeId, completion: true } : route; }
  function getTradeCompletionState() { if (getConfirmedTradeCompletion()) return 'completed'; for (const entry of parseTradeLogEntries()) { if (/trade (?:was |has been )?(?:completed|finished)|trade completed/i.test(entry.text)) return 'completed'; if (/trade (?:was )?cancelled/i.test(entry.text)) return 'cancelled'; if (isTradeMutationLogEntry(entry) || /trade was accepted by/i.test(entry.text)) return 'active'; } return 'unknown'; }
  function calculateTradeVerificationSnapshot(record, route = parseTradeHash()) {
    if (route.tradeId !== record.tradeId) return { diagnosticState: 'trade-id-mismatch', tradeId: route.tradeId, comparisonStatus: 'incomplete', parseWarnings: ['TRADE ID MISMATCH'] };
    const observedCompletionState = getTradeCompletionState();
    const completionState = observedCompletionState === 'completed' || record.completionState === 'completed' ? 'completed' : observedCompletionState;
    if (!renderedTradeHasTrader(record) && completionState !== 'completed') return { diagnosticState: 'trader-mismatch', tradeId: route.tradeId, comparisonStatus: 'incomplete', parseWarnings: ['Rendered Trader identity could not be verified'] };
    const item = extractTargetTradeItem(record, route.tradeId);
    if (item.mismatch) return { diagnosticState: 'target-item-mismatch', tradeId: route.tradeId, targetQuantity: 0, comparisonStatus: 'incomplete', completionState, parseWarnings: ['TARGET ITEM MISMATCH'] };
    const quantity = item.quantity || (completionState === 'completed' ? record.quantity || record.lastObservedQuantity || 0 : 0);
    const expectedTotal = calculateExpectedTradeTotal(record.unitSellPrice, quantity);
    const traderMoney = extractCounterpartyMoney() ?? (completionState === 'completed' && (record.offeredTotal || record.lastObservedTraderMoney) != null ? BigInt(record.offeredTotal || record.lastObservedTraderMoney) : null);
    const acceptedState = getCurrentTraderAcceptanceState(record);
    const ownPlayerId = record.ownPlayerId || resolveOwnPlayerId(record);
    const ownAcceptanceState = getPlayerAcceptanceState(ownPlayerId);
    const comparison = compareTradeMoney(expectedTotal, traderMoney);
    const comparisonStatus = !quantity ? 'waiting-items' : traderMoney == null || traderMoney === 0n ? 'waiting-payment' : comparison.status;
    logDebug('Trade verification parsed.', { tradeId: route.tradeId, itemId: item.itemId, quantity, traderMoney: traderMoney?.toString(), expectedTotal: expectedTotal?.toString(), comparisonStatus, completionState });
    const composition = inspectSimpleTradeComposition(record, quantity, traderMoney);
    return { diagnosticState: null, tradeId: record.tradeId, targetItemId: item.itemId, targetQuantity: quantity, expectedTotal, traderMoney, traderAccepted: acceptedState === 'accepted', ownAccepted: ownAcceptanceState === 'accepted', bothAccepted: acceptedState === 'accepted' && ownAcceptanceState === 'accepted', acceptanceState: acceptedState, ownPlayerId, comparisonStatus, difference: comparison.difference, completionState, additionalOwnItems: composition.ownAdditionalItems > 0, ...composition, parseWarnings: [] };
  }
  function snapshotKey(snapshot) { return JSON.stringify({ q: snapshot.targetQuantity, e: snapshot.expectedTotal?.toString() || null, m: snapshot.traderMoney?.toString() || null, a: snapshot.traderAccepted, s: snapshot.comparisonStatus, d: snapshot.difference?.toString() || null, extra: snapshot.additionalOwnItems }); }
  function shouldNotifyVerificationTransition(previousKey, snapshot) { return previousKey && previousKey !== snapshotKey(snapshot) && snapshot.traderAccepted && ['match', 'short', 'over'].includes(snapshot.comparisonStatus); }
  function renderTradeVerificationPanel(record, snapshot) {
    addTornHandoffStyles();
    let panel = document.getElementById('weav3r-trade-payment-verification');
    const tradeContainer = document.querySelector('#trade-container');
    if (!panel) { panel = document.createElement('div'); panel.id = 'weav3r-trade-payment-verification'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite'); const tradeCont = document.querySelector('#trade-container .trade-cont'); if (tradeCont?.parentNode) tradeCont.parentNode.insertBefore(panel, tradeCont); else tradeContainer?.prepend(panel); }
    panel.textContent = '';
    const title = document.createElement('strong');
    const status = snapshot?.completionState === 'completed' ? 'TRADE COMPLETED' : !record ? 'VERIFICATION RECORD MISSING' : snapshot?.diagnosticState === 'trade-id-mismatch' ? 'TRADE ID MISMATCH' : snapshot?.diagnosticState === 'target-item-mismatch' ? 'TARGET ITEM MISMATCH' : snapshot?.comparisonStatus === 'waiting-items' ? 'WAITING FOR ITEMS' : snapshot?.comparisonStatus === 'waiting-payment' ? 'WAITING FOR PAYMENT' : snapshot?.comparisonStatus === 'match' ? 'PAYMENT MATCHES' : snapshot?.comparisonStatus === 'short' ? 'UNDERPAID' : snapshot?.comparisonStatus === 'over' ? 'OVERPAID' : 'Unable to verify payment';
    title.textContent = status;
    const details = document.createElement('div');
    details.textContent = record && snapshot && !snapshot.diagnosticState ? `${snapshot.completionState === 'completed' ? `Payment ${snapshot.comparisonStatus === 'match' ? 'matched' : snapshot.comparisonStatus === 'short' ? 'underpaid' : 'overpaid'} · ${record.itemName} × ${snapshot.targetQuantity} · ` : ''}Expected: ${formatTornMoneyBigInt(snapshot.expectedTotal)} · Trader paid: ${formatTornMoneyBigInt(snapshot.traderMoney)} · Difference: ${snapshot.difference == null ? '—' : formatTornMoneyBigInt(snapshot.difference, snapshot.difference > 0n)}` : snapshot?.parseWarnings?.join(' · ') || 'No Trade-ID-bound verification record is available for this view.';
    panel.append(title, details);
    if (snapshot?.additionalOwnItems) { const warning = document.createElement('div'); warning.textContent = `Additional own items detected. This comparison covers only ${record.itemName}.`; panel.append(warning); }
    if (snapshot?.difference != null && ['short', 'over'].includes(snapshot.comparisonStatus)) { const difference = document.createElement('div'); difference.textContent = `${snapshot.comparisonStatus === 'short' ? 'Short by' : 'Over by'}: ${formatTornMoneyBigInt(snapshot.difference < 0n ? -snapshot.difference : snapshot.difference, snapshot.comparisonStatus === 'over')}`; panel.append(difference); }
    const personal = record ? getTraderPersonalRatingRecord(record.traderId)?.state || 'unknown' : 'unknown';
    if (snapshot?.completionState === 'completed' && ['match', 'short', 'over'].includes(snapshot.comparisonStatus) && ['unknown', 'not-rated'].includes(personal) && !record.ratingPromptDismissedAt && normalizePositiveInt(record.traderId)) { const cta = document.createElement('div'); cta.textContent = `Trade completed · Payment ${snapshot.comparisonStatus === 'match' ? 'matched' : snapshot.comparisonStatus === 'short' ? 'underpaid' : 'overpaid'}.`; const open = document.createElement('button'); open.type = 'button'; open.textContent = `Rate ${record.traderName || 'Trader'}`; open.addEventListener('click', () => openRatingPageForVerification(record.tradeId)); const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Dismiss'; dismiss.addEventListener('click', () => dismissRatingPrompt(record.tradeId)); cta.append(' ', open, ' ', dismiss); panel.append(cta); logDebug('rating CTA shown.'); } else if (record && ['positive', 'negative'].includes(personal)) { const rated = document.createElement('div'); rated.textContent = personal === 'positive' ? 'Rated positively by you' : 'Rated negatively by you'; panel.append(rated); logDebug('rating CTA suppressed for decisive rating.'); }
  }
  function openRatingPageForVerification(tradeId) { const collection = readTradeVerifications(); const record = collection.records[String(tradeId)]; const traderId = normalizePositiveInt(record?.traderId); if (!record || !traderId) return; const url = `https://weav3r.dev/pricelist/${traderId}`; record.ratingPageOpenedAt = Date.now(); collection.records[String(tradeId)] = record; writeTradeVerifications(collection); window.open(url, '_blank', 'noopener'); showTornStatus('Weav3r: Rating page opened.'); updateTradeVerification(record); }
  function dismissRatingPrompt(tradeId) { const collection = readTradeVerifications(); const record = collection.records[String(tradeId)]; if (!record) return; record.ratingPromptDismissedAt = Date.now(); collection.records[String(tradeId)] = record; writeTradeVerifications(collection); updateTradeVerification(record); }
  function notifyVerificationTransition(snapshot) { if (!snapshot.traderAccepted) return; if (snapshot.comparisonStatus === 'match') showTornStatus('Weav3r: Trader payment matches the expected amount.'); else if (snapshot.comparisonStatus === 'short') showTornStatus(`Weav3r warning: Trader payment is ${formatTornMoneyBigInt(-snapshot.difference)} below the expected amount.`); else if (snapshot.comparisonStatus === 'over') showTornStatus(`Weav3r: Trader payment is ${formatTornMoneyBigInt(snapshot.difference)} above the expected amount.`); }
  function persistFinalTradeSnapshot(record, snapshot, source = 'verified-rerun') { if (!record || !snapshot || snapshot.diagnosticState || !['match', 'short', 'over'].includes(snapshot.comparisonStatus) || !snapshot.targetQuantity || snapshot.traderMoney == null) return null; const now = Date.now(); return upsertTradeVerification({ ...record, quantity: snapshot.targetQuantity, expectedTotal: snapshot.expectedTotal.toString(), offeredTotal: snapshot.traderMoney.toString(), difference: snapshot.difference.toString(), paymentState: snapshot.comparisonStatus, simpleItemForMoneyTrade: snapshot.simpleItemForMoneyTrade, ownAdditionalItems: snapshot.ownAdditionalItems, ownMoney: snapshot.ownMoney?.toString(), ownProperties: snapshot.ownProperties, counterpartyAdditionalItems: snapshot.counterpartyAdditionalItems, counterpartyProperties: snapshot.counterpartyProperties, otherPartyAccepted: snapshot.traderAccepted, snapshotState: snapshot.traderAccepted ? 'ready-for-final-accept' : 'verified', snapshotAt: now, finalSnapshotAt: source === 'before-accept' || source === 'pagehide' ? now : record.finalSnapshotAt, finalSnapshotSource: source === 'before-accept' || source === 'pagehide' ? source : record.finalSnapshotSource, completionState: 'active', updatedAt: now }); }
  function captureTradeSnapshotBeforeAccept(event) { const control = event.target.closest?.('#trade-container a[href*="#step=accept"][href*="ID="]'); if (!control) return; const linkTradeId = parseTradeHash(new URL(control.getAttribute('href') || control.href, location.href).hash).tradeId; const route = parseTradeHash(); if (route.step !== 'view' || !route.tradeId || linkTradeId !== route.tradeId) return; const record = getTradeVerificationRecordForId(route.tradeId); if (!record) return; const snapshot = calculateTradeVerificationSnapshot(record, route); if (persistFinalTradeSnapshot(record, snapshot, 'before-accept')) logDebug('final payment snapshot persisted before native ACCEPT.', route.tradeId); }
  function captureTradeSnapshotOnPageHide() { const route = parseTradeHash(); if (route.step !== 'view' || !route.tradeId || !document.querySelector('#trade-container .trade-cont')) return; const record = getTradeVerificationRecordForId(route.tradeId); if (!record) return; persistFinalTradeSnapshot(record, calculateTradeVerificationSnapshot(record, route), 'pagehide'); }
  function updateTradeVerification(record) { const latest = readTradeVerifications().records[String(record.tradeId)]; if (!latest) { renderTradeVerificationPanel(null, null); return; } const snapshot = calculateTradeVerificationSnapshot(latest); renderTradeVerificationPanel(latest, snapshot); if (!snapshot || snapshot.diagnosticState) return; const key = snapshotKey(snapshot); if (shouldNotifyVerificationTransition(latest.lastSnapshotKey, snapshot)) notifyVerificationTransition(snapshot); const persisted = persistFinalTradeSnapshot(latest, snapshot, 'verified-rerun') || latest; persisted.lastObservedQuantity = snapshot.targetQuantity; persisted.lastExpectedTotal = snapshot.expectedTotal?.toString() || null; persisted.lastObservedTraderMoney = snapshot.traderMoney?.toString() || null; persisted.lastTraderAccepted = snapshot.traderAccepted; persisted.ownPlayerId = persisted.ownPlayerId || snapshot.ownPlayerId; persisted.lastComparisonStatus = snapshot.comparisonStatus; persisted.lastSnapshotKey = key; persisted.updatedAt = Date.now(); upsertTradeVerification(persisted); logDebug('payment comparison changed.', snapshot); }
  function buildReducedCompletionSnapshot(record) { if (!record?.snapshotAt || !record.quantity || record.expectedTotal == null || record.offeredTotal == null || !['match', 'short', 'over'].includes(record.paymentState)) return null; return { diagnosticState: null, tradeId: record.tradeId, targetItemId: record.itemId, targetQuantity: record.quantity, expectedTotal: BigInt(record.expectedTotal), traderMoney: BigInt(record.offeredTotal), traderAccepted: record.otherPartyAccepted, ownAccepted: true, bothAccepted: Boolean(record.otherPartyAccepted), comparisonStatus: record.paymentState, difference: record.difference == null ? BigInt(record.offeredTotal) - BigInt(record.expectedTotal) : BigInt(record.difference), completionState: 'completed', additionalOwnItems: false, parseWarnings: [] }; }
  function clearTradeVerificationUi() { if (tornState.verificationObserver) tornState.verificationObserver.disconnect(); if (tornState.verificationBootstrapObserver) tornState.verificationBootstrapObserver.disconnect(); tornState.verificationObserver = null; tornState.verificationBootstrapObserver = null; tornState.verificationRouteKey = ''; clearTimeout(tornState.verificationRenderTimer); document.getElementById('weav3r-trade-payment-verification')?.remove(); logDebug('verification observer disconnected.'); }
  function processTradeVerificationForRoute(route) {
    if (route.step !== 'view' || !route.tradeId) return clearTradeVerificationUi();
    const routeKey = `view:${route.tradeId}`;
    const root = document.querySelector('#trade-container');
    if (!root) {
      if (tornState.verificationRouteKey !== routeKey) clearTradeVerificationUi();
      tornState.verificationRouteKey = routeKey;
      if (!tornState.verificationBootstrapObserver) { tornState.verificationBootstrapObserver = new MutationObserver(() => { const current = resolveTradeVerificationRoute(); if (current.step !== 'view' || current.tradeId !== route.tradeId) return clearTradeVerificationUi(); if (document.querySelector('#trade-container')) { tornState.verificationBootstrapObserver.disconnect(); tornState.verificationBootstrapObserver = null; processTradeVerificationForRoute(current); } }); tornState.verificationBootstrapObserver.observe(document.documentElement, { childList: true, subtree: true }); }
      return;
    }
    let record = getTradeVerificationRecordForId(route.tradeId);
    logDebug(record ? 'exact Trade-ID verification record selected.' : 'exact Trade-ID verification record missing.', { tradeId: route.tradeId, recordKey: String(route.tradeId) });
    const fullTradeReady = Boolean(root.querySelector('.trade-cont'));
    let recoveryReason = '';
    if (!record && fullTradeReady) { logDebug('Verification record missing; DOM recovery attempted.', route.tradeId); const recovery = recoverTradeVerificationFromCurrentDom(route.tradeId); recoveryReason = recovery.reason || ''; if (recovery.record) record = upsertTradeVerification(recovery.record); }
    const completion = getConfirmedTradeCompletion();
    if (completion?.tradeId === route.tradeId) {
      if (!record) renderTradeVerificationPanel(null, { tradeId: route.tradeId, completionState: 'completed', comparisonStatus: 'incomplete', parseWarnings: [`Verification record unavailable for Trade ${route.tradeId}.`] });
      else {
        const snapshot = buildReducedCompletionSnapshot(record);
        if (snapshot) recordConfirmedTradeSale(record, completion, Date.now());
        const completed = upsertTradeVerification({ ...record, completionState: 'completed', completedAt: record.completedAt || Date.now(), updatedAt: Date.now() });
        renderTradeVerificationPanel(completed, snapshot || { tradeId: route.tradeId, completionState: 'completed', comparisonStatus: 'incomplete', diagnosticState: 'completion-snapshot-missing', parseWarnings: ['Previous payment verification data is unavailable.'] });
        logDebug(snapshot ? 'pre-ACCEPT snapshot reused on completion page.' : 'pre-ACCEPT snapshot missing on completion page.', route.tradeId);
      }
    } else if (record && fullTradeReady) updateTradeVerification(record); else if (!record) renderTradeVerificationPanel(null, { tradeId: route.tradeId, comparisonStatus: 'incomplete', parseWarnings: [`Verification record unavailable for Trade ${route.tradeId}.`, recoveryReason ? `Automatic recovery unavailable: ${recoveryReason}.` : ''] });
    if (tornState.verificationObserver && tornState.verificationRouteKey === routeKey) return;
    if (tornState.verificationObserver) tornState.verificationObserver.disconnect();
    tornState.verificationRouteKey = routeKey;
    tornState.verificationObserver = new MutationObserver((mutations) => { if (mutations.every((mutation) => mutation.target.closest?.('#weav3r-trade-payment-verification'))) return; clearTimeout(tornState.verificationRenderTimer); tornState.verificationRenderTimer = setTimeout(() => { const current = resolveTradeVerificationRoute(); if (current.step !== 'view' || current.tradeId !== route.tradeId) return clearTradeVerificationUi(); processTradeVerificationForRoute(current); }, 120); });
    tornState.verificationObserver.observe(root, { childList: true, subtree: true });
    logDebug('route-bound verification observer started.', routeKey);
  }
  function completeTradeHandoff(handoff) { const done = { ...handoff, progress: { ...handoff.progress, completedAt: Date.now() } }; promoteHandoffToVerification(done); writeTradeHandoff(done); clearTradeItemFilterUi(); deleteTradeHandoffById(handoff.handoffId); clearActiveTradeAssociation(handoff.handoffId); const route = parseTradeHash(); waitForTornElement(() => document.querySelector('#trade-container') || null, () => processTradeVerificationForRoute(route), TORN_HANDOFF_TIMEOUT_MS); logDebug('Trade handoff completed.'); }
  function handleTradeDescription(handoff, field, route) {
    if (!field) { showTornStatus('Weav3r: Trade Description field was not found.'); return handoff; }
    if (String(field.value || '').trim()) { handoff.progress.descriptionSkippedAt = Date.now(); writeTradeHandoff(handoff); showTornStatus('Weav3r: Existing Trade Description preserved.'); return handoff; }
    const description = formatTradeDescription(handoff);
    const wasEmpty = !String(field.value || '').trim();
    if (setControlledInputValue(field, description, { focusFirst: true, beforeInput: true, change: true })) { handoff.progress.descriptionAppliedAt = Date.now(); writeTradeHandoff(handoff); logDebug('Description event sequence completed.'); maybeEnableInitiateFallback(handoff, route, field, description, wasEmpty); }
    return handoff;
  }
  function processAddStep(handoff, route) {
    waitForTornElement(isSupportedAddInventoryReady, async (inventoryReady) => {
      if (!inventoryReady) { showTornStatus('Weav3r: Torn inventory did not become available in time.'); return; }
      let latest = readTradeHandoff() || handoff;
      const latestRoute = parseTradeHash();
      if (!latest || latest.handoffId !== handoff.handoffId || latestRoute.step !== 'add' || latestRoute.tradeId !== route.tradeId || !isAssociatedTradeTab(latest, latestRoute)) return;
      latest = captureTradeIdIfNeeded(latest, latestRoute);
      const backTradeId = getTradeIdFromBackLink();
      if (backTradeId && backTradeId !== latestRoute.tradeId) { showTornStatus('Weav3r: Trade ID mismatch on Add Items page.'); logDebug('mismatched Trade ID ignored without deleting handoff.'); return; }
      if (!latest.progress.addStepEnteredAt) { latest.progress.addStepEnteredAt = Date.now(); writeTradeHandoff(latest); }
      logDebug('step=add inventory detected.');
      tornState.inventoryDiscoveryController?.abort();
      const controller = new AbortController();
      tornState.inventoryDiscoveryController = controller;
      renderTradeFilterPanel(latest, 0, getTradeFilterMode(latest), false, true);
      const discovered = await findTradeTargetWithProgressiveScroll({ inventory: getInventoryContainer(), targetItemId: latest.itemId, signal: controller.signal, isContextCurrent: () => tornState.inventoryDiscoveryController === controller && parseTradeHash().step === 'add' && parseTradeHash().tradeId === latestRoute.tradeId && readTradeHandoff()?.handoffId === latest.handoffId });
      if (controller.signal.aborted || tornState.inventoryDiscoveryController !== controller) return;
      tornState.inventoryDiscoveryController = null;
      const currentRoute = parseTradeHash();
      const currentHandoff = readTradeHandoff();
      if (!currentHandoff || currentHandoff.handoffId !== latest.handoffId || currentRoute.step !== 'add' || currentRoute.tradeId !== latestRoute.tradeId) return;
      logDebug(discovered.length ? 'lazy-loaded Trade target discovered.' : 'bounded Trade target discovery exhausted.', { rows: collectTradeInventoryRows(getInventoryContainer()).length });
      if (discovered.length) { latest.progress.itemFilterMode = 'target-only'; writeTradeHandoff(latest); }
      setupInventoryObserver(latest, latestRoute);
      applyTradeItemFilter(latest, !latest.progress.itemFilterAppliedAt);
    }, 20000);
  }
  function processTornTradeHandoff() {
    pruneExpiredHandoffs();
    const route = parseTradeHash();
    if (route.handoffId) { const explicit = getTradeHandoffById(route.handoffId); if (explicit && (!route.traderId || explicit.traderId === route.traderId)) setActiveTradeAssociation(explicit.handoffId); }
    let handoff = getAssociatedTradeHandoff();
    if (!handoff && route.step === 'start' && route.traderId) { const matches = Object.values(readTradeHandoffs().records).filter((candidate) => candidate.traderId === route.traderId && !candidate.tradeId && isTradeHandoffActivityEligible(candidate) && candidate.personalRatingStateAtHandoff !== 'negative'); if (matches.length === 1) { setActiveTradeAssociation(matches[0].handoffId); handoff = matches[0]; } else if (matches.length > 1) { showTornStatus('Weav3r: Multiple pending Trades match this Trader; use the original Trade now tab.'); logDebug('ambiguous same-Trader handoffs rejected.'); } }
    if (handoff && route.tradeId && !handoff.tradeId && ['add', 'view'].includes(route.step)) handoff = captureTradeIdIfNeeded(handoff, route);
    const verificationRoute = resolveTradeVerificationRoute();
    processTradeVerificationForRoute(verificationRoute);
    cleanupInitiateFallback();
    if (route.step !== 'add') clearTradeItemFilterUi();
    if (verificationRoute.completion) return;
    if (route.step === 'view' && route.tradeId && (!handoff || handoff.tradeId !== route.tradeId)) return;
    if (!handoff) return;
    if (shouldAssociateTradeTab(handoff, route) && !getActiveTradeAssociation()) setActiveTradeAssociation(handoff.handoffId);
    if (!validateTradeTarget(handoff, route)) { logDebug('Trade target identity mismatch; ignoring this tab.'); showTornStatus('Weav3r: Trade target does not match the stored Trader.'); return; }
    if (route.step === 'start' && !isTradeHandoffActivityEligible(handoff)) { showTornStatus('Weav3r: This Trader is no longer eligible for a new Trade based on last activity.'); deleteTradeHandoffById(handoff.handoffId); clearActiveTradeAssociation(handoff.handoffId); return; }
    if (route.step === 'start' && getTraderPersonalRatingRecord(handoff.traderId)?.state === 'negative') { showTornStatus('Weav3r: Trade blocked because you have negatively rated this Trader.'); deleteTradeHandoffById(handoff.handoffId); clearActiveTradeAssociation(handoff.handoffId); return; }
    if (route.step && route.step !== 'start' && !isAssociatedTradeTab(handoff, route)) { logDebug('unrelated tab ignored.'); return; }
    if (shouldCompleteTradeHandoff(handoff, route)) { completeTradeHandoff(handoff); return; }
    handoff = captureTradeIdIfNeeded(handoff, route);
    if (route.step === 'start' && route.traderId === handoff.traderId && !(handoff.progress.descriptionAppliedAt || handoff.progress.descriptionSkippedAt)) { waitForTornElement(findTradeDescriptionField, (field) => { const latest = readTradeHandoff() || handoff; if (getActiveTradeAssociation() === latest.handoffId) handleTradeDescription(latest, field, route); }, TORN_HANDOFF_TIMEOUT_MS); return; }
    if (route.step === 'add' && route.tradeId) processAddStep(handoff, route);
  }
  function initTornTradeHandoff() { pruneExpiredHandoffs(); pruneTradeVerifications(); processTornTradeHandoff(); if (tornState.tradeListenersAttached) return; tornState.tradeListenersAttached = true; window.addEventListener('hashchange', processTornTradeHandoff); window.addEventListener('popstate', processTornTradeHandoff); document.addEventListener('click', captureTradeSnapshotBeforeAccept, true); window.addEventListener('pagehide', captureTradeSnapshotOnPageHide); if (typeof GM_addValueChangeListener === 'function') tornState.verificationStorageListenerId = GM_addValueChangeListener(TRADE_VERIFICATIONS_KEY, (_name, _oldValue, _newValue, remote) => { if (remote) processTradeVerificationForRoute(resolveTradeVerificationRoute()); }); window.addEventListener('beforeunload', () => { disconnectTornObserver(); clearTradeItemFilterUi(); cleanupInitiateFallback(); clearTradeVerificationUi(); document.removeEventListener('click', captureTradeSnapshotBeforeAccept, true); window.removeEventListener('pagehide', captureTradeSnapshotOnPageHide); if (tornState.verificationStorageListenerId && typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(tornState.verificationStorageListenerId); tornState.verificationStorageListenerId = null; tornState.tradeListenersAttached = false; }, { once: true }); }

  function getSourceDefinitions(itemId) {
    const makeUrl = (mode, tab) => { const url = new URL(`/item/${itemId}`, location.origin); url.searchParams.set('mode', mode); url.searchParams.set('tab', tab); url.searchParams.set('timeframe', '7d'); return url.href; };
    return [
      { itemId: String(itemId), sourceType: 'bazaar', parsedKey: 'offers', url: makeUrl('buy', 'all'), method: 'api' },
      { itemId: String(itemId), sourceType: 'itemMarket', parsedKey: 'offers', url: makeUrl('buy', 'itemmarket'), method: 'iframe' },
      { itemId: String(itemId), sourceType: 'traders', parsedKey: 'traders', url: makeUrl('sell', 'itemmarket'), method: 'iframe' },
    ];
  }
  function getItemUrl(itemId) { const url = new URL(`/item/${itemId}`, location.origin); url.searchParams.set('mode', 'buy'); url.searchParams.set('tab', 'all'); url.searchParams.set('timeframe', '7d'); return url.href; }
  function collectorKey(itemId, sourceType) { return `${itemId}:${sourceType}`; }
  function parseSourceDocument(rootDocument, sourceType, itemId, sourceUrl) { if (sourceType === 'bazaar') return { parsedKey: 'offers', data: parseBazaarOffers(itemId, rootDocument, sourceUrl) }; if (sourceType === 'itemMarket') return { parsedKey: 'offers', data: parseItemMarketOffers(rootDocument, itemId, sourceUrl) }; if (sourceType === 'traders') return { parsedKey: 'traders', data: parseTraderOffers(rootDocument, sourceUrl) }; return { parsedKey: null, data: [] }; }
  function isCurrentRoute(itemId, generation) { return state.itemId === String(itemId) && state.routeGeneration === generation; }

  function normalizeDetailedMarketplaceResponse(json, itemId) {
    if (!json || typeof json !== 'object' || Number(json.item_id) !== Number(itemId) || !Array.isArray(json.listings)) throw new Error('Malformed marketplace detail response.');
    const offers = json.listings.map((listing) => {
      const price = Number(listing?.price);
      if (!Number.isFinite(price) || price <= 0) return null;
      const sellerId = Number.parseInt(listing.player_id, 10);
      return { source: 'Bazaar', sourceType: 'bazaar', sourceDetail: 'marketplaceDetailApi', price: Math.round(price), sellerId: Number.isFinite(sellerId) ? sellerId : null, sellerName: String(listing.player_name || ''), sellerUrl: Number.isFinite(sellerId) ? `https://www.torn.com/bazaar.php?userId=${sellerId}` : null, quantity: Number.isFinite(Number(listing.quantity)) ? Number(listing.quantity) : null, lastChecked: listing.last_checked || null, contentUpdated: listing.content_updated || null, capturedAt: Date.now() };
    }).filter(Boolean);
    const itemName = typeof json.item_name === 'string' ? json.item_name.trim() : '';
    if (itemName) rememberItemName(itemId, itemName);
    offers.sort((a, b) => a.price - b.price);
    return { itemName, offers };
  }
  function getWeav3rMarketplaceDetailUrl(itemId) { const id = normalizePositiveInt(itemId); return id ? `https://weav3r.dev/api/marketplace/${id}` : ''; }
  function saveDetailedMarketplaceResponse(itemId, json, sourceUrl) {
    const id = normalizePositiveInt(itemId); const normalized = normalizeDetailedMarketplaceResponse(json, id);
    if (!normalized.offers.length) { const error = new Error('Marketplace detail API returned no valid Bazaar listings.'); error.code = 'no-listings'; throw error; }
    const entry = saveCachedSourceData(id, 'bazaar', 'offers', normalized.offers, sourceUrl, { itemName: normalized.itemName, apiSource: 'marketplaceDetail' });
    if (!entry) { const error = new Error('Marketplace detail cache write failed.'); error.code = 'cache-write-failed'; throw error; }
    observeSafeBazaarQuote(resolveBazaarRecommendedPrice(id, { adjustment: '0', offers: entry.offers, source: entry.apiSource, fetchedAt: entry.capturedAt }), entry.capturedAt);
    return entry;
  }
  function requestBazaarAddMarketplaceDetail(itemId) {
    const id = normalizePositiveInt(itemId); const url = getWeav3rMarketplaceDetailUrl(id); if (!id || !url) return Promise.reject(Object.assign(new Error('Invalid Bazaar Add item ID.'), { code: 'invalid-item' }));
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({ method: 'GET', url, timeout: API_TIMEOUT_MS, anonymous: true, headers: { Accept: 'application/json' }, onload(response) { if (response.status < 200 || response.status >= 300) return reject(Object.assign(new Error(`HTTP ${response.status}`), { code: 'request-failed' })); try { resolve(JSON.parse(response.responseText)); } catch (_) { reject(Object.assign(new Error('Malformed marketplace JSON.'), { code: 'malformed-response' })); } }, ontimeout() { reject(Object.assign(new Error('Marketplace request timed out.'), { code: 'request-failed' })); }, onerror() { reject(Object.assign(new Error('Marketplace request failed.'), { code: 'request-failed' })); } });
    });
  }
  function pumpBazaarAddPriceRequests() {
    while (tornState.bazaarAdd.activePriceRequests < BAZAAR_ADD_DETAIL_CONCURRENCY && tornState.bazaarAdd.priceRequestQueue.length) { const job = tornState.bazaarAdd.priceRequestQueue.shift(); tornState.bazaarAdd.activePriceRequests += 1; logDebug('Bazaar Add price request started.', { itemId: job.itemId }); Promise.resolve().then(() => job.transport(job.itemId)).then((json) => { try { return saveDetailedMarketplaceResponse(job.itemId, json, job.url); } catch (error) { if (!error.code) error.code = 'malformed-response'; throw error; } }).then(job.resolve, job.reject).finally(() => { tornState.bazaarAdd.activePriceRequests -= 1; tornState.bazaarAdd.priceRequests.delete(String(job.itemId)); pumpBazaarAddPriceRequests(); }); }
  }
  function queueBazaarAddMarketplaceDetail(itemId, transport = requestBazaarAddMarketplaceDetail) {
    const id = normalizePositiveInt(itemId); if (!id) return Promise.reject(Object.assign(new Error('Invalid Bazaar Add item ID.'), { code: 'invalid-item' })); const key = String(id); const existing = tornState.bazaarAdd.priceRequests.get(key); if (existing) { logDebug('Bazaar Add price request deduplicated.', { itemId: id }); return existing; }
    const promise = new Promise((resolve, reject) => { tornState.bazaarAdd.priceRequestQueue.push({ itemId: id, url: getWeav3rMarketplaceDetailUrl(id), transport, resolve, reject }); logDebug('Bazaar Add price request queued.', { itemId: id }); pumpBazaarAddPriceRequests(); }); tornState.bazaarAdd.priceRequests.set(key, promise); return promise;
  }

  function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal, credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) { const retryAfter = response.headers.get('Retry-After'); throw new Error(`HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ''}`); }
      try { return await response.json(); } catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    }).finally(() => window.clearTimeout(timeoutId));
  }

  function collectBazaarWithApi(itemId, generation, force = false) {
    const key = String(itemId);
    if (!force && isSourceCacheFresh(state.cachedData.bazaar, 'bazaar')) return Promise.resolve(state.cachedData.bazaar);
    if (state.detailedBazaarRequests.has(key)) return state.detailedBazaarRequests.get(key);
    const url = `${location.origin}/api/marketplace/${encodeURIComponent(itemId)}`;
    state.sourceProgress.bazaar = 'checking';
    const promise = fetchJsonWithTimeout(url, API_TIMEOUT_MS).then((json) => {
      if (!isCurrentRoute(itemId, generation)) return null;
      const entry = saveDetailedMarketplaceResponse(itemId, json, url);
      state.cachedData.bazaar = entry;
      state.sourceProgress.bazaar = 'loaded';
      updateWatchlistNameIfBetter(itemId, entry.itemName);
      return entry;
    }).catch((error) => {
      if (!isCurrentRoute(itemId, generation)) return null;
      state.sourceProgress.bazaar = isSourceCacheFresh(state.cachedData.bazaar, 'bazaar') ? 'loaded' : 'failed';
      logWarn('Bazaar API collector failed.', error);
      return null;
    }).finally(() => state.detailedBazaarRequests.delete(key));
    state.detailedBazaarRequests.set(key, promise);
    return promise;
  }

  function normalizeMarketplaceBatchResponse(json) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.items)) throw new Error('Malformed marketplace batch response.');
    const itemsById = {};
    json.items.forEach((item) => {
      const itemId = Number.parseInt(item?.item_id, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) return;
      const lowest = item.lowest_price == null ? null : Number(item.lowest_price);
      itemsById[itemId] = { itemId, itemName: typeof item.item_name === 'string' ? item.item_name.trim() : '', lowestPrice: Number.isFinite(lowest) && lowest > 0 ? Math.round(lowest) : null, totalBazaars: Number.isFinite(Number(item.total_bazaars)) ? Number(item.total_bazaars) : null };
    });
    return { capturedAt: Date.now(), sourceUrl: `${location.origin}/api/marketplace`, itemsById };
  }

  function getMarketplaceBatch(force = false) {
    const cached = state.marketplaceBatchMemory || gmGet(MARKETPLACE_BATCH_KEY, null);
    if (!force && cached && Date.now() - Number(cached.capturedAt) <= MARKETPLACE_BATCH_CACHE_MS && cached.itemsById) { state.marketplaceBatchMemory = cached; return Promise.resolve(cached); }
    if (!force && state.marketplaceBatchPromise) return state.marketplaceBatchPromise;
    const url = `${location.origin}/api/marketplace`;
    state.marketplaceBatchPromise = fetchJsonWithTimeout(url, API_TIMEOUT_MS).then(normalizeMarketplaceBatchResponse).then((batch) => { state.marketplaceBatchMemory = batch; gmSet(MARKETPLACE_BATCH_KEY, batch); return batch; }).catch((error) => { logWarn('Marketplace batch API failed.', error); throw error; }).finally(() => { state.marketplaceBatchPromise = null; });
    return state.marketplaceBatchPromise;
  }

  function saveBatchBazaarForWatchItem(itemId, batchItem) {
    if (!batchItem) return null;
    if (batchItem.itemName) { rememberItemName(itemId, batchItem.itemName); updateWatchlistNameIfBetter(itemId, batchItem.itemName); }
    if (batchItem.lowestPrice == null) return null;
    const offer = { source: 'Bazaar', sourceType: 'bazaar', sourceDetail: 'marketplaceBatchApi', price: batchItem.lowestPrice, sellerName: '', sellerUrl: null, quantity: null, totalBazaars: batchItem.totalBazaars, capturedAt: Date.now() };
    return saveCachedSourceData(itemId, 'bazaar', 'offers', [offer], `${location.origin}/api/marketplace`, { itemName: batchItem.itemName, apiSource: 'marketplaceBatch' });
  }

  function updateSourceProgressFromCache() { ['bazaar', 'itemMarket', 'traders'].forEach((sourceType) => { if (isSourceCacheFresh(state.cachedData[sourceType], sourceType)) state.sourceProgress[sourceType] = 'loaded'; else if (state.sourceProgress[sourceType] !== 'checking' && state.sourceProgress[sourceType] !== 'failed') state.sourceProgress[sourceType] = state.cachedData[sourceType] ? 'stale' : 'pending'; }); }
  function sourceProgressMessages() { return getSourceDefinitions(state.itemId).map((definition) => `${prettySourceName(definition.sourceType)}: ${state.sourceProgress[definition.sourceType] || 'pending'}`); }
  function hasActiveCollectorsForCurrentItem() { return Array.from(state.activeCollectors.values()).some((collector) => collector.context === 'current' && collector.definition.itemId === state.itemId) || state.queuedCollectors.some((collector) => collector.context === 'current' && collector.definition.itemId === state.itemId); }

  function collectMissingSources(itemId, options = {}) {
    const generation = state.routeGeneration;
    updateSourceProgressFromCache();
    collectBazaarWithApi(itemId, generation, Boolean(options.forceBazaar)).finally(() => { if (isCurrentRoute(itemId, generation)) { fallbackBazaarIfNeeded(itemId, generation); renderComputedResult(true); } });
    getSourceDefinitions(itemId).filter((definition) => definition.method === 'iframe').forEach((definition) => {
      if (isSourceCacheFresh(state.cachedData[definition.sourceType], definition.sourceType)) return;
      enqueueCollector({ definition, generation, context: 'current', scanId: null, force: Boolean(options.forceCollectors) });
      state.sourceProgress[definition.sourceType] = 'checking';
    });
    pumpCollectorQueue();
  }

  function fallbackBazaarIfNeeded(itemId, generation) {
    if (!isCurrentRoute(itemId, generation) || isSourceCacheFresh(state.cachedData.bazaar, 'bazaar')) return;
    const domOffers = parseBazaarOffers(itemId, document, location.href);
    if (domOffers.length) { state.cachedData.bazaar = saveCachedSourceData(itemId, 'bazaar', 'offers', domOffers, location.href, { fallbackSource: 'visibleDom' }); state.sourceProgress.bazaar = 'loaded'; return; }
    const definition = getSourceDefinitions(itemId).find((item) => item.sourceType === 'bazaar');
    enqueueCollector({ definition: { ...definition, method: 'iframe' }, generation, context: 'current', scanId: null, force: true });
    state.sourceProgress.bazaar = 'checking';
    pumpCollectorQueue();
  }

  function enqueueCollector(job) {
    const key = `${job.context}:${job.scanId || 'route'}:${collectorKey(job.definition.itemId, job.definition.sourceType)}`;
    if (!job.force && isSourceCacheFresh(loadCachedSourceData(job.definition.itemId, job.definition.sourceType), job.definition.sourceType)) return;
    if (state.activeCollectors.has(key) || state.queuedCollectors.some((queued) => queued.key === key)) return;
    state.queuedCollectors.push({ ...job, key });
  }

  function pumpCollectorQueue() {
    window.clearTimeout(state.collectorPumpTimer);
    if (!state.queuedCollectors.length) return;
    if (state.activeCollectors.size >= MAX_PARALLEL_COLLECTORS) return;
    const now = Date.now();
    state.collectorStartTimes = state.collectorStartTimes.filter((time) => now - time < 60000);
    if (state.collectorStartTimes.length >= COLLECTOR_ROLLING_LIMIT || now < state.nextCollectorStartAt) {
      const waitMs = Math.max(500, state.nextCollectorStartAt - now, state.collectorStartTimes.length >= COLLECTOR_ROLLING_LIMIT ? 60000 - (now - state.collectorStartTimes[0]) : 0);
      state.collectorPumpTimer = window.setTimeout(pumpCollectorQueue, waitMs);
      return;
    }
    const job = state.queuedCollectors.shift();
    if (!isCollectorJobStillValid(job)) { pumpCollectorQueue(); return; }
    state.collectorStartTimes.push(now);
    state.nextCollectorStartAt = now + COLLECTOR_START_SPACING_MS + Math.floor(Math.random() * COLLECTOR_JITTER_MS);
    const promise = collectSourceWithIframe(job.definition, job.generation, job).then((entry) => handleCollectorSuccess(job, entry)).catch((error) => handleCollectorFailure(job, error)).finally(() => { state.activeCollectors.delete(job.key); pumpCollectorQueue(); renderComputedResult(true); updateScanProgress(); renderWatchlistPanel(); });
    state.activeCollectors.set(job.key, { promise, definition: job.definition, generation: job.generation, context: job.context, scanId: job.scanId, iframe: null });
    pumpCollectorQueue();
  }

  function isCollectorJobStillValid(job) { if (job.context === 'current') return isCurrentRoute(job.definition.itemId, job.generation); if (job.context === 'watchlist-row') return state.rowRescans.has(Number(job.definition.itemId)); if (job.context === 'offer-refresh') return state.offerRefreshWaiters.has(`${job.definition.itemId}:${job.definition.sourceType}`); return state.scan && state.scan.active && state.scan.id === job.scanId && state.scan.itemIds.has(Number(job.definition.itemId)); }
  function handleCollectorSuccess(job, entry) {
    if (!isCollectorJobStillValid(job)) return;
    if (job.context === 'current') { state.cachedData[job.definition.sourceType] = entry; state.sourceProgress[job.definition.sourceType] = 'loaded'; }
    if (job.context === 'watchlist') updateWatchlistResultAfterSource(job.definition.itemId, job.definition.sourceType, entry);
    if (job.context === 'watchlist-row') updateWatchlistRowRescanAfterSource(job.definition.itemId, job.definition.sourceType);
    if (job.context === 'offer-refresh') { const key = `${job.definition.itemId}:${job.definition.sourceType}`; state.offerRefreshWaiters.get(key)?.resolve(entry); state.offerRefreshWaiters.delete(key); }
  }
  function handleCollectorFailure(job, error) {
    if (!isCollectorJobStillValid(job)) return;
    logWarn(`${prettySourceName(job.definition.sourceType)} collector failed.`, error);
    if (job.context === 'current') state.sourceProgress[job.definition.sourceType] = isSourceCacheFresh(state.cachedData[job.definition.sourceType], job.definition.sourceType) ? 'loaded' : 'failed';
    if (job.context === 'watchlist') markWatchlistSourceFailed(job.definition.itemId, job.definition.sourceType);
    if (job.context === 'watchlist-row') markWatchlistRowRescanFailed(job.definition.itemId, job.definition.sourceType);
    if (job.context === 'offer-refresh') { const key = `${job.definition.itemId}:${job.definition.sourceType}`; state.offerRefreshWaiters.get(key)?.resolve(null); state.offerRefreshWaiters.delete(key); }
  }

  function collectSourceWithIframe(sourceDefinition, generation, job) {
    const iframe = document.createElement('iframe');
    iframe.dataset.weav3rArbitrageCollector = sourceDefinition.sourceType;
    iframe.dataset.weav3rArbitrageItemId = sourceDefinition.itemId;
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10000px;top:-10000px;border:0;';
    document.documentElement.appendChild(iframe);
    const active = state.activeCollectors.get(job.key);
    if (active) active.iframe = iframe;
    let timeoutId = 0;
    return new Promise((resolve, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('Timed out waiting for source table.')), COLLECTOR_TIMEOUT_MS);
      iframe.addEventListener('load', () => { waitForIframeDocument(iframe).then((iframeDocument) => waitForSourceTable(iframeDocument, sourceDefinition)).then((iframeDocument) => { if (!isCollectorJobStillValid(job)) throw new Error('Collector context changed before parsing.'); const parsed = parseSourceDocument(iframeDocument, sourceDefinition.sourceType, sourceDefinition.itemId, sourceDefinition.url); if (!parsed.data.length) throw new Error('Expected table was present but no valid rows were parsed.'); resolve(saveCachedSourceData(sourceDefinition.itemId, sourceDefinition.sourceType, parsed.parsedKey, parsed.data, sourceDefinition.url)); }).catch(reject); }, { once: true });
      iframe.src = sourceDefinition.url;
    }).finally(() => { window.clearTimeout(timeoutId); destroyCollectorIframe(iframe); });
  }

  function waitForIframeDocument(iframe) { return new Promise((resolve, reject) => { try { const iframeDocument = iframe.contentDocument; if (!iframeDocument) reject(new Error('Iframe document is unavailable.')); else resolve(iframeDocument); } catch (error) { reject(error); } }); }
  function waitForSourceTable(iframeDocument, sourceDefinition) { return new Promise((resolve, reject) => { let observer = null; let timeoutId = 0; let done = false; const finish = (callback, value) => { if (done) return; done = true; if (observer) observer.disconnect(); window.clearTimeout(timeoutId); callback(value); }; const check = () => { const parsed = parseSourceDocument(iframeDocument, sourceDefinition.sourceType, sourceDefinition.itemId, sourceDefinition.url); if (parsed.data.length) finish(resolve, iframeDocument); }; try { check(); if (done) return; observer = new MutationObserver(check); observer.observe(iframeDocument.documentElement || iframeDocument, { childList: true, subtree: true }); timeoutId = window.setTimeout(() => finish(reject, new Error('Timed out waiting for dynamically rendered table.')), COLLECTOR_TIMEOUT_MS); } catch (error) { finish(reject, error); } }); }
  function destroyCollectorIframe(iframe) { try { iframe?.remove(); } catch (error) { logDebug('Collector iframe cleanup failed.', error); } }
  function isOfferClickSourceFresh(entry, sourceType, now = Date.now()) { return isCompatibleSourceEntry(entry, sourceType) && now - Number(entry.capturedAt) <= OFFER_CLICK_FRESHNESS_MS; }
  function refreshBazaarOfferSource(itemId) {
    const url = `${location.origin}/api/marketplace/${encodeURIComponent(itemId)}`;
    return fetchJsonWithTimeout(url, API_TIMEOUT_MS).then((json) => normalizeDetailedMarketplaceResponse(json, itemId)).then((normalized) => normalized.offers.length ? saveCachedSourceData(itemId, 'bazaar', 'offers', normalized.offers, url, { itemName: normalized.itemName, apiSource: 'marketplaceDetail' }) : null).catch((error) => { logWarn('Bazaar offer refresh failed.', error); return null; });
  }
  function refreshItemMarketOfferSource(itemId) {
    const key = `${itemId}:itemMarket`;
    if (state.offerRefreshWaiters.has(key)) return state.offerRefreshWaiters.get(key).promise;
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    const timeoutId = setTimeout(() => { const waiter = state.offerRefreshWaiters.get(key); if (waiter) { state.offerRefreshWaiters.delete(key); waiter.resolve(null); } }, COLLECTOR_TIMEOUT_MS + 1000);
    const resolve = (value) => { clearTimeout(timeoutId); resolvePromise(value); };
    state.offerRefreshWaiters.set(key, { promise, resolve });
    const definition = getSourceDefinitions(itemId).find((entry) => entry.sourceType === 'itemMarket');
    enqueueCollector({ definition, generation: state.routeGeneration, context: 'offer-refresh', scanId: `offer:${itemId}`, force: true });
    pumpCollectorQueue();
    return promise;
  }
  function refreshCurrentConcreteOffer(itemId) {
    const id = normalizePositiveInt(itemId);
    if (!id) return Promise.resolve(null);
    if (state.offerRefreshes.has(id)) return state.offerRefreshes.get(id);
    const promise = (async () => {
      const data = loadCachedItemData(id);
      const staleSources = ['bazaar', 'itemMarket'].filter((sourceType) => !isOfferClickSourceFresh(data[sourceType], sourceType));
      logDebug('stale offer sources requiring refresh.', staleSources);
      await Promise.all(staleSources.map((sourceType) => sourceType === 'bazaar' ? refreshBazaarOfferSource(id) : refreshItemMarketOfferSource(id)));
      const latestData = loadCachedItemData(id);
      const clickFreshData = { ...latestData, bazaar: isOfferClickSourceFresh(latestData.bazaar, 'bazaar') ? latestData.bazaar : null, itemMarket: isOfferClickSourceFresh(latestData.itemMarket, 'itemMarket') ? latestData.itemMarket : null };
      const result = calculateArbitrage(clickFreshData, state.settings);
      logDebug('refreshed cheapest offer.', result.concreteOffer);
      return result.concreteOffer || null;
    })().finally(() => state.offerRefreshes.delete(id));
    state.offerRefreshes.set(id, promise);
    return promise;
  }
  function cancelCurrentCollectors() { state.queuedCollectors = state.queuedCollectors.filter((job) => job.context !== 'current'); state.activeCollectors.forEach((collector, key) => { if (collector.context === 'current') { destroyCollectorIframe(collector.iframe); state.activeCollectors.delete(key); } }); }

  function normalizeWatchlist(input) {
    const seen = new Set();
    const entries = Array.isArray(input) ? input : [];
    return entries.reduce((list, raw) => {
      const itemId = Number.parseInt(raw?.itemId, 10);
      if (!Number.isInteger(itemId) || itemId <= 0 || seen.has(itemId) || list.length >= WATCHLIST_LIMIT) return list;
      seen.add(itemId);
      list.push({ itemId, itemName: String(raw.itemName || `Item ${itemId}`).trim() || `Item ${itemId}`, addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now() });
      return list;
    }, []);
  }
  function loadWatchlist() { const stored = gmGet(WATCHLIST_KEY, []); state.watchlist = normalizeWatchlist(stored); if (JSON.stringify(stored) !== JSON.stringify(state.watchlist)) gmSet(WATCHLIST_KEY, state.watchlist); return state.watchlist; }
  function saveWatchlist(list = state.watchlist) { state.watchlist = normalizeWatchlist(list); gmSet(WATCHLIST_KEY, state.watchlist); return state.watchlist; }
  function isItemWatchlisted(itemId) { return state.watchlist.some((item) => item.itemId === Number(itemId)); }
  function addItemToWatchlist(item) { const normalized = normalizeWatchlist(state.watchlist); const itemId = Number.parseInt(item?.itemId, 10); if (!Number.isInteger(itemId) || itemId <= 0) return { ok: false, message: 'Invalid item.' }; if (normalized.some((entry) => entry.itemId === itemId)) { state.watchlist = normalized; return { ok: true, message: 'Already watchlisted.' }; } if (normalized.length >= WATCHLIST_LIMIT) return { ok: false, message: `Watchlist limit reached (${WATCHLIST_LIMIT}).` }; normalized.push({ itemId, itemName: String(item.itemName || `Item ${itemId}`).trim() || `Item ${itemId}`, addedAt: Date.now() }); saveWatchlist(normalized); return { ok: true, message: 'Added to Watchlist.' }; }
  function cancelWatchlistItemWork(itemId) {
    const id = Number(itemId);
    state.rowRescans.delete(id);
    state.queuedCollectors = state.queuedCollectors.filter((job) => Number(job.definition?.itemId) !== id || (job.context !== 'watchlist' && job.context !== 'watchlist-row'));
    state.activeCollectors.forEach((collector, key) => { if (Number(collector.definition?.itemId) === id && (collector.context === 'watchlist' || collector.context === 'watchlist-row')) { destroyCollectorIframe(collector.iframe); state.activeCollectors.delete(key); } });
  }
  function removeItemFromWatchlist(itemId) { const id = Number(itemId); cancelWatchlistItemWork(id); saveWatchlist(state.watchlist.filter((item) => item.itemId !== id)); state.watchlistResults.delete(id); if (state.scan?.summary) state.scan.summary = calculateScanSummary(); return true; }
  function rememberItemName(itemId, itemName) { if (itemName) state.itemNames[Number(itemId)] = itemName; }
  function updateWatchlistNameIfBetter(itemId, itemName) { if (!itemName) return; let changed = false; const id = Number(itemId); state.watchlist = state.watchlist.map((entry) => { if (entry.itemId === id && entry.itemName !== itemName) { changed = true; return { ...entry, itemName }; } return entry; }); if (changed) saveWatchlist(state.watchlist); }
  function getCurrentItemName() { const id = Number(state.itemId); const apiName = state.cachedData.bazaar?.itemName || state.itemNames[id]; const heading = Array.from(document.querySelectorAll('h1,h2,[data-item-name]')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).find(Boolean); return heading || apiName || state.watchlist.find((item) => item.itemId === id)?.itemName || `Item ${id}`; }

  function getWatchlistDisplayRows() {
    return state.watchlist.map((entry) => ({ entry, result: state.watchlistResults.get(entry.itemId) || { status: 'NOT CHECKED', messages: [] } })).sort((a, b) => {
      const rank = (row) => row.result.status === 'BUY & SELL' ? 0 : row.result.status === 'NOT WORTH IT' ? 1 : 2;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) < 2 && (b.result.profitPerItem || 0) !== (a.result.profitPerItem || 0)) return (b.result.profitPerItem || 0) - (a.result.profitPerItem || 0);
      return a.entry.itemName.localeCompare(b.entry.itemName);
    });
  }

  function calculateWatchlistItem(itemId) { const data = loadCachedItemData(itemId); return calculateArbitrage(data, state.settings); }
  function hasMeaningfulResult(result) { return result && result.status && result.status !== 'DATA MISSING' || Boolean(result?.lowestPurchase || result?.bestTrader); }
  function hydrateWatchlistFromCaches() {
    state.watchlist.forEach((entry) => {
      if (String(entry.itemId) === String(state.itemId) && hasMeaningfulResult(state.lastResult)) { syncCurrentItemToWatchlist(state.lastResult); return; }
      const result = calculateWatchlistItem(entry.itemId);
      const data = loadCachedItemData(entry.itemId);
      if (result.lowestPurchase || result.bestTrader || data.bazaar || data.itemMarket || data.traders) state.watchlistResults.set(entry.itemId, result);
      else if (!state.watchlistResults.has(entry.itemId)) state.watchlistResults.set(entry.itemId, { status: 'NOT CHECKED', messages: [] });
    });
  }
  function chooseNewerSourceRecord(existing, candidate, sourceType) {
    if (!isCompatibleSourceEntry(candidate, sourceType)) return existing || null;
    if (!isCompatibleSourceEntry(existing, sourceType)) return candidate;
    const candidateFresh = isSourceCacheFresh(candidate, sourceType);
    const existingFresh = isSourceCacheFresh(existing, sourceType);
    if (candidateFresh && !existingFresh) return candidate;
    if (!candidateFresh && existingFresh) return existing;
    return Number(candidate.capturedAt) > Number(existing.capturedAt) ? candidate : existing;
  }
  function syncCurrentItemToWatchlist(result = state.lastResult) {
    if (!isItemWatchlisted(state.itemId) || !result) return;
    state.watchlistResults.set(Number(state.itemId), { ...result, progress: 'current item' });
    updateWatchlistNameIfBetter(state.itemId, getCurrentItemName());
    renderWatchlistDialog();
  }
  function setWatchlistResult(itemId, partial) { const previous = state.watchlistResults.get(Number(itemId)) || {}; state.watchlistResults.set(Number(itemId), { ...previous, ...partial }); renderWatchlistPanel(); }
  function isWatchlistFullScanRunning() { return Boolean(state.scan?.active && state.scan.status === 'scanning'); }
  function isWatchlistRowRescanning(itemId) { return state.rowRescans.has(Number(itemId)); }
  function getWatchlistRowExpectedSources(itemId) { return ['bazaar', 'itemMarket', 'traders'].map((sourceType) => `${Number(itemId)}:${sourceType}`); }
  function markScanSourceSettled(itemId, sourceType) {
    if (!state.scan || !state.scan.itemIds?.has(Number(itemId))) return;
    const key = `${Number(itemId)}:${sourceType}`;
    state.scan.requiredSources.add(key);
    if (!state.scan.settledSources.has(key)) {
      state.scan.settledSources.add(key);
      state.scan.checkedSources = state.scan.settledSources.size;
    }
    const completed = Array.from(state.scan.itemIds).filter((id) => ['bazaar', 'itemMarket', 'traders'].every((source) => state.scan.settledSources.has(`${id}:${source}`))).length;
    state.scan.completedItems = completed;
  }
  function updateWatchlistResultAfterSource(itemId, sourceType) { if (!state.scan || !state.scan.active) return; markScanSourceSettled(itemId, sourceType); const result = calculateWatchlistItem(itemId); setWatchlistResult(itemId, { ...result, progress: 'checked' }); updateScanProgress(); }
  function markWatchlistSourceFailed(itemId, sourceType) { markScanSourceSettled(itemId, sourceType); const result = calculateWatchlistItem(itemId); setWatchlistResult(itemId, { ...result, status: result.status === 'BUY & SELL' ? 'DATA MISSING' : result.status, progress: `${prettySourceName(sourceType)} failed` }); updateScanProgress(); }
  function updateWatchlistRowRescanAfterSource(itemId, sourceType) {
    const id = Number(itemId);
    const result = calculateWatchlistItem(id);
    const previous = state.watchlistResults.get(id) || {};
    const settled = new Set(previous.rowSettledSources || []);
    settled.add(`${id}:${sourceType}`);
    const complete = getWatchlistRowExpectedSources(id).every((key) => settled.has(key));
    if (complete) state.rowRescans.delete(id);
    state.watchlistResults.set(id, { ...previous, ...result, progress: complete ? 'checked' : 'checking', rowSettledSources: Array.from(settled) });
    if (complete && state.scan?.summary) state.scan.summary = calculateScanSummary();
    renderWatchlistPanel();
  }
  function markWatchlistRowRescanFailed(itemId, sourceType) {
    const id = Number(itemId);
    const result = calculateWatchlistItem(id);
    const previous = state.watchlistResults.get(id) || {};
    const settled = new Set(previous.rowSettledSources || []);
    settled.add(`${id}:${sourceType}`);
    const complete = getWatchlistRowExpectedSources(id).every((key) => settled.has(key));
    if (complete) state.rowRescans.delete(id);
    state.watchlistResults.set(id, { ...previous, ...result, status: result.status === 'BUY & SELL' ? 'DATA MISSING' : result.status, progress: `${prettySourceName(sourceType)} failed`, rowSettledSources: Array.from(settled) });
    if (complete && state.scan?.summary) state.scan.summary = calculateScanSummary();
    renderWatchlistPanel();
  }

  function startWatchlistScan() {
    loadWatchlist();
    if (!state.watchlist.length) { state.watchlistMessage = 'Watchlist is empty.'; renderStatusCard(state.lastResult); return; }
    stopWatchlistScan(false);
    const scanId = Date.now();
    const itemIds = new Set(state.watchlist.map((item) => item.itemId));
    const requiredSources = new Set();
    itemIds.forEach((id) => ['bazaar', 'itemMarket', 'traders'].forEach((source) => requiredSources.add(`${id}:${source}`)));
    state.scan = { id: scanId, active: true, status: 'scanning', phase: 'running', itemIds, requiredSources, settledSources: new Set(), startedAt: Date.now(), completedAt: null, totalItems: state.watchlist.length, completedItems: 0, totalSources: requiredSources.size, checkedSources: 0, batchError: null, summary: null };
    state.watchlist.forEach((entry) => setWatchlistResult(entry.itemId, { status: 'QUEUED', progress: 'queued', messages: [] }));
    state.watchlistMessage = '';
    renderStatusCard(state.lastResult);
    getMarketplaceBatch(false).then((batch) => {
      if (!state.scan || !state.scan.active || state.scan.id !== scanId) return;
      state.watchlist.forEach((entry) => {
        const batchItem = batch.itemsById[entry.itemId];
        const saved = saveBatchBazaarForWatchItem(entry.itemId, batchItem);
        if (!saved && !isSourceCacheFresh(loadCachedSourceData(entry.itemId, 'bazaar'), 'bazaar')) setWatchlistResult(entry.itemId, { status: 'DATA MISSING', progress: 'Bazaar missing' });
        markScanSourceSettled(entry.itemId, 'bazaar');
      });
    }).catch((error) => { if (state.scan && state.scan.id === scanId) { state.scan.batchError = error.message; state.watchlistMessage = `Marketplace API failed: ${error.message}`; state.watchlist.forEach((entry) => markScanSourceSettled(entry.itemId, 'bazaar')); } }).finally(() => { if (state.scan && state.scan.active && state.scan.id === scanId) queueWatchlistFrames(scanId); });
  }

  function queueWatchlistFrames(scanId) {
    if (!state.scan || state.scan.id !== scanId) return;
    state.watchlist.forEach((entry) => {
      const data = loadCachedItemData(entry.itemId);
      ['itemMarket', 'traders'].forEach((sourceType) => {
        if (isSourceCacheFresh(data[sourceType], sourceType)) { markScanSourceSettled(entry.itemId, sourceType); return; }
        const definition = getSourceDefinitions(entry.itemId).find((source) => source.sourceType === sourceType);
        enqueueCollector({ definition, generation: state.routeGeneration, context: 'watchlist', scanId, force: true });
        setWatchlistResult(entry.itemId, { status: 'QUEUED', progress: `${prettySourceName(sourceType)} queued` });
      });
      const result = calculateWatchlistItem(entry.itemId);
      setWatchlistResult(entry.itemId, { ...result, progress: 'checking' });
    });
    pumpCollectorQueue();
    updateScanProgress();
  }

  function startWatchlistItemRescan(itemId) {
    const id = normalizePositiveInt(itemId);
    if (!id || isWatchlistFullScanRunning() || isWatchlistRowRescanning(id) || !state.watchlist.some((entry) => entry.itemId === id)) return;
    state.rowRescans.add(id);
    setWatchlistResult(id, { status: 'CHECKING PRICES...', progress: 'checking', messages: ['Rescanning item...'], rowSettledSources: [] });
    const generation = state.routeGeneration;
    getMarketplaceBatch(false).then((batch) => {
      if (!state.rowRescans.has(id)) return;
      saveBatchBazaarForWatchItem(id, batch.itemsById[id]);
      updateWatchlistRowRescanAfterSource(id, 'bazaar');
    }).catch((error) => {
      if (!state.rowRescans.has(id)) return;
      state.watchlistMessage = `Marketplace API failed for Item ${id}: ${error.message}`;
      markWatchlistRowRescanFailed(id, 'bazaar');
    }).finally(() => renderWatchlistPanel());
    const data = loadCachedItemData(id);
    ['itemMarket', 'traders'].forEach((sourceType) => {
      if (isSourceCacheFresh(data[sourceType], sourceType)) { updateWatchlistRowRescanAfterSource(id, sourceType); return; }
      const definition = getSourceDefinitions(id).find((source) => source.sourceType === sourceType);
      enqueueCollector({ definition, generation, context: 'watchlist-row', scanId: `row:${id}:${Date.now()}`, force: true });
    });
    pumpCollectorQueue();
  }

  function updateScanProgress() {
    if (!state.scan) return;
    const pendingWatchJobs = state.queuedCollectors.some((job) => job.context === 'watchlist' && job.scanId === state.scan.id) || Array.from(state.activeCollectors.values()).some((job) => job.context === 'watchlist' && job.scanId === state.scan.id);
    const allSourcesSettled = state.scan.checkedSources >= state.scan.totalSources && state.scan.totalSources === state.scan.requiredSources.size;
    if (state.scan.active && state.scan.completedItems >= state.scan.totalItems && allSourcesSettled && !pendingWatchJobs) {
      state.scan.active = false;
      state.scan.status = 'complete';
      state.scan.phase = 'completed';
      state.scan.completedAt = Date.now();
      state.scan.summary = calculateScanSummary();
    }
    renderWatchlistPanel();
  }

  function stopWatchlistScan(markCancelled = true) {
    const activeScanId = state.scan?.id;
    if (state.scan && markCancelled) {
      state.scan.status = 'cancelled';
      state.scan.phase = 'cancelled';
      state.scan.active = false;
      state.scan.completedAt = Date.now();
      Array.from(state.scan.requiredSources || []).forEach((key) => state.scan.settledSources.add(key));
      state.scan.checkedSources = state.scan.settledSources.size;
      state.watchlist.forEach((entry) => { const current = state.watchlistResults.get(entry.itemId); if (!current || current.status === 'QUEUED' || current.status === 'CHECKING') state.watchlistResults.set(entry.itemId, { status: 'CANCELLED', progress: 'cancelled', messages: [] }); });
      state.scan.summary = calculateScanSummary();
      state.watchlistMessage = 'Scan cancelled.';
    }
    state.queuedCollectors = state.queuedCollectors.filter((job) => job.context !== 'watchlist' || job.scanId !== activeScanId);
    state.activeCollectors.forEach((collector, key) => { if (collector.context === 'watchlist' && collector.scanId === activeScanId) { destroyCollectorIframe(collector.iframe); state.activeCollectors.delete(key); } });
    if (state.scan && !markCancelled) state.scan.active = false;
    renderWatchlistPanel();
  }

  function getDefaultCollapsedTop() { return Math.round(window.innerHeight * COLLAPSED_DEFAULT_TOP_RATIO); }
  function clampCollapsedTop(top) { const pillHeight = 48; const maxTop = Math.max(COLLAPSED_MARGIN_PX, window.innerHeight - pillHeight - COLLAPSED_MARGIN_PX); return Math.min(Math.max(Math.round(top), COLLAPSED_MARGIN_PX), maxTop); }
  function getCollapsedTop() { if (state.collapsedTop == null) state.collapsedTop = clampCollapsedTop(gmGet(COLLAPSED_TOP_KEY, getDefaultCollapsedTop())); return clampCollapsedTop(state.collapsedTop); }
  function saveCollapsedTop(top) { state.collapsedTop = clampCollapsedTop(top); gmSet(COLLAPSED_TOP_KEY, state.collapsedTop); }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    GM_addStyle(`#${CARD_ID}{box-sizing:border-box;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:fixed;top:16px;right:16px;z-index:2147482000;width:min(420px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;color:#f8fafc;background:#111827;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 18px 45px rgba(0,0,0,.35)}#${CARD_ID} *{box-sizing:border-box}#${CARD_ID} .wah-header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;background:rgba(255,255,255,.06)}#${CARD_ID} .wah-title{font-size:13px;font-weight:800;letter-spacing:.12em}#${CARD_ID} button,#${CARD_ID} a.wah-button,.wah-modal button,.wah-modal a.wah-button{border:0;border-radius:10px;padding:8px 10px;background:#334155;color:#f8fafc;text-decoration:none;font-weight:700;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:6px}#${CARD_ID} .wah-body{padding:14px;display:grid;gap:10px}#${CARD_ID} .wah-status{font-size:26px;font-weight:900;line-height:1;padding:12px;border-radius:14px;text-align:center}#${CARD_ID} .wah-buy,.wah-status-badge.wah-buy{background:#15803d}#${CARD_ID} .wah-bad,.wah-status-badge.wah-bad{background:#b91c1c}.wah-status-badge.wah-bad{background:rgba(185,28,28,.9)}#${CARD_ID} .wah-warn,.wah-status-badge.wah-warn{background:#c2410c}#${CARD_ID} .wah-load,.wah-status-badge.wah-load{background:#475569}#${CARD_ID} .wah-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}#${CARD_ID} .wah-profit-metric{grid-column:1/-1}#${CARD_ID} .wah-profit-value{font-size:22px}#${CARD_ID} .wah-trader-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#${CARD_ID} .wah-metric{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;background:rgba(255,255,255,.04);min-width:0}#${CARD_ID} .wah-label,.wah-note,.wah-watch-meta{color:#cbd5e1;font-size:12px}#${CARD_ID} .wah-value{font-size:18px;font-weight:850;margin-top:3px}#${CARD_ID} .wah-source-ages{font-size:12px;display:flex;flex-wrap:wrap;gap:8px}.wah-age-fresh{color:#cbd5e1}.wah-age-warning{color:#fde68a}.wah-age-stale{color:#fb923c}#${CARD_ID} .wah-action-group{display:flex;flex-wrap:wrap;gap:8px}#${CARD_ID} .wah-trade-actions{padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.08)}#${CARD_ID} .wah-tool-actions button{background:#1e293b}#${CARD_ID} .wah-primary-action{background:#15803d!important}#${CARD_ID}.wah-collapsed{top:45vh;right:0;width:auto;max-width:calc(100vw - 16px);max-height:none;overflow:visible;border-right:0;border-radius:999px 0 0 999px;cursor:grab;touch-action:none;user-select:none}#${CARD_ID}.wah-collapsed.wah-pill-dragging{cursor:grabbing}#${CARD_ID}.wah-collapsed .wah-pill{display:flex;align-items:center;gap:8px;min-height:44px;padding:10px 14px 10px 16px;font-size:13px;font-weight:900;letter-spacing:.04em;white-space:nowrap}#${CARD_ID}.wah-collapsed .wah-pill-status{max-width:180px;overflow:hidden;text-overflow:ellipsis}#${CARD_ID}.wah-collapsed .wah-pill-profit{font-variant-numeric:tabular-nums}.wah-watch-backdrop,.wah-settings-backdrop{position:fixed;inset:0;z-index:2147482500;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:16px}.wah-modal{background:#111827;color:#f8fafc;border:1px solid rgba(255,255,255,.16);border-radius:16px;box-shadow:0 22px 60px rgba(0,0,0,.45)}.wah-watch-dialog{width:min(880px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;min-height:0;gap:0;overflow:hidden;overscroll-behavior:contain}.wah-settings-dialog{width:min(500px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:hidden;padding:18px;display:flex;flex-direction:column;min-height:0;gap:14px;overscroll-behavior:contain}.wah-watch-dialog-header,.wah-watch-dialog-controls{flex:0 0 auto;background:#111827;z-index:2;padding:14px 16px}.wah-watch-dialog-header{top:0;display:flex;align-items:start;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.1)}.wah-watch-dialog-header h2,.wah-settings-dialog h2{margin:0;font-size:18px}.wah-watch-dialog-controls{top:0;display:grid;gap:10px;border-bottom:1px solid rgba(255,255,255,.1)}.wah-control-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.wah-danger{background:#7f1d1d!important}.wah-muted-action{background:#1e293b!important}.wah-scan-progress{display:grid;gap:7px;color:#cbd5e1;font-size:12px}.wah-progress-bar{height:10px;background:#020617;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}.wah-progress-bar span{display:block;height:100%;background:#38bdf8;border-radius:999px}.wah-scan-lines,.wah-current-jobs{display:flex;gap:8px;flex-wrap:wrap}.wah-watch-dialog-content{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;-webkit-overflow-scrolling:touch;touch-action:pan-y;display:grid;gap:10px;min-height:0;padding:14px 16px}.wah-watch-dialog-content:focus{outline:none}.wah-watch-dialog-content:focus-visible{outline:2px solid #38bdf8;outline-offset:-2px}.wah-watch-row{display:grid;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04)}.wah-watch-row.wah-watch-buy{border-color:#22c55e;background:rgba(21,128,61,.2)}.wah-watch-top{display:flex;justify-content:space-between;gap:12px;align-items:start}.wah-watch-name{font-weight:850;overflow-wrap:anywhere}.wah-status-badge{border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900;white-space:nowrap}.wah-watch-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.wah-watch-metric{min-width:0;border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:8px;background:rgba(2,6,23,.35)}.wah-watch-metric-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}.wah-watch-metric-value{font-weight:850;overflow-wrap:anywhere}.wah-chip-row{display:flex;gap:6px;flex-wrap:wrap}.wah-source-chip,.wah-reason-chip{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:11px;border:1px solid rgba(255,255,255,.12);background:#1e293b;color:#cbd5e1}.wah-chip-fresh{background:rgba(15,23,42,.9);color:#cbd5e1}.wah-chip-warning{background:rgba(234,179,8,.18);color:#fde68a}.wah-chip-stale,.wah-chip-missing{background:rgba(249,115,22,.18);color:#fdba74}.wah-chip-checking{background:rgba(14,165,233,.18);color:#bae6fd}.wah-chip-queued{background:rgba(100,116,139,.22);color:#cbd5e1}.wah-chip-error{background:rgba(220,38,38,.2);color:#fecaca}.wah-settings-form{flex:1 1 auto;display:grid;gap:10px;overflow-y:auto;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-right:2px}.wah-settings-form label{display:grid;gap:5px;color:#cbd5e1;font-size:12px}.wah-settings-form input{width:100%;border-radius:9px;border:1px solid #475569;background:#020617;color:#f8fafc;padding:9px}.wah-field-error{color:#fecaca;background:rgba(220,38,38,.16);border:1px solid rgba(220,38,38,.35);border-radius:10px;padding:8px;font-size:12px}.wah-dialog-actions{display:flex;justify-content:end;gap:8px;flex-wrap:wrap}.` + HIDDEN_ROW_CLASS + `{display:none!important}.` + BEST_ROW_CLASS + `{outline:2px solid #22c55e!important;outline-offset:-2px}.` + CHEAPEST_ROW_CLASS + `{outline:2px solid #38bdf8!important;outline-offset:-2px}@media(max-width:620px){#${CARD_ID}:not(.wah-collapsed){top:8px;right:8px;width:calc(100vw - 16px);max-height:calc(100vh - 16px)}#${CARD_ID} .wah-grid,.wah-watch-metrics{grid-template-columns:1fr}.wah-watch-backdrop,.wah-settings-backdrop{padding:8px}.wah-watch-dialog{width:calc(100vw - 16px);max-height:92vh}.wah-watch-dialog-header,.wah-watch-dialog-controls,.wah-watch-dialog-content{padding:12px}#${CARD_ID}.wah-collapsed .wah-pill-status{max-width:130px}}`);
    GM_addStyle(`.wah-history-backdrop{position:fixed;inset:0;z-index:2147482500;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:16px}.wah-history-dialog{width:min(920px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;overflow:hidden}.wah-history-header{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)}.wah-history-header h2{margin:0;font-size:18px}.wah-history-tabs,.wah-history-filters,.wah-history-summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.wah-history-tabs,.wah-history-filters{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.1)}.wah-history-tabs button[aria-selected="true"]{background:#0369a1}.wah-history-filters label{display:grid;gap:4px;color:#cbd5e1;font-size:11px}.wah-history-filters input,.wah-history-filters select{border:1px solid #475569;border-radius:8px;background:#020617;color:#f8fafc;padding:7px;min-width:120px}.wah-history-filters .wah-history-search{flex:1 1 210px}.wah-history-filters .wah-history-search input{width:100%}.wah-history-content{overflow-y:auto;padding:14px 16px;display:grid;gap:10px;min-height:0}.wah-history-summary{color:#cbd5e1;font-size:12px}.wah-history-warning{padding:9px;border:1px solid #f59e0b;border-radius:9px;color:#fde68a;background:rgba(245,158,11,.12)}.wah-history-card{display:grid;gap:9px;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.04)}.wah-history-card-top{display:flex;justify-content:space-between;gap:10px;align-items:start}.wah-history-type{font-weight:900}.wah-history-name{font-weight:800;overflow-wrap:anywhere}.wah-history-grid,.wah-history-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.wah-history-cell{min-width:0;overflow-wrap:anywhere}.wah-history-cell span{display:block;color:#94a3b8;font-size:11px}.wah-history-details{padding-top:9px;border-top:1px solid rgba(255,255,255,.1);grid-template-columns:repeat(2,minmax(0,1fr))}.wah-history-empty{padding:24px;text-align:center;color:#cbd5e1}.wah-history-id{overflow-wrap:anywhere}@media(max-width:620px){.wah-history-backdrop{padding:8px}.wah-history-dialog{width:calc(100vw - 16px);max-height:94vh}.wah-history-grid,.wah-history-details{grid-template-columns:1fr}.wah-history-filters{align-items:stretch}.wah-history-filters label{flex:1 1 100%}}`);
    const style = Array.from(document.querySelectorAll('style')).find((el) => el.textContent.includes(`#${CARD_ID}`));
    if (style) style.id = STYLE_ID;
    GM_addStyle(`.wah-watch-dialog{display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;min-height:0!important;overflow:hidden!important}.wah-watch-dialog-header,.wah-watch-dialog-controls{position:relative!important;min-width:0!important}.wah-watch-dialog-controls{display:grid!important;gap:8px!important}.wah-watch-dialog-content{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:12px!important;min-height:0!important;min-width:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:14px 16px 16px!important}#${WATCHLIST_CONTENT_ID}>.wah-watch-row{flex:0 0 auto!important;flex-grow:0!important;flex-shrink:0!important;flex-basis:auto!important;align-self:stretch!important;width:auto!important;height:auto!important;max-height:none!important}.wah-watch-row{display:grid!important;grid-template-rows:auto auto auto auto auto!important;gap:10px!important;height:auto!important;max-height:none!important;min-height:auto!important;overflow:visible!important;padding:10px 12px!important;margin:0!important;transform:none!important}.wah-watch-top{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:12px!important;flex-wrap:wrap!important;min-width:0!important}.wah-watch-title-line{min-width:0;flex:1 1 260px;overflow-wrap:anywhere}.wah-watch-name{font-weight:850}.wah-status-badge{flex:0 0 auto;max-width:100%;white-space:normal;text-align:center}.wah-watch-metrics{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;min-width:0!important}.wah-watch-metric{height:auto!important;min-width:0!important;overflow:visible!important;padding:7px 8px!important}.wah-watch-metric-value{font-size:15px;font-weight:900;overflow-wrap:anywhere}.wah-watch-sell .wah-watch-metric-value{font-size:17px}.wah-chip-row{display:flex!important;flex-wrap:wrap!important;gap:6px 8px!important;min-width:0!important}.wah-source-chip{max-width:100%;overflow-wrap:anywhere}.wah-reason-row{font-size:12px;color:#cbd5e1;background:rgba(15,23,42,.5);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:5px 7px;min-width:0;overflow-wrap:anywhere}.wah-watch-actions{display:flex!important;align-items:center!important;justify-content:space-between!important;flex-wrap:wrap!important;gap:8px 16px!important;min-width:0!important}.wah-watch-actions-main{display:flex;flex-wrap:wrap;gap:8px;min-width:0}.wah-watch-actions-danger{display:flex;flex:0 0 auto;margin-left:auto}.wah-remove-action{border:1px solid rgba(248,113,113,.35)!important;background:transparent!important;color:#fecaca!important}.wah-remove-action:hover,.wah-remove-action:focus{background:rgba(127,29,29,.75)!important;color:#fff!important}@media(max-width:620px){.wah-watch-dialog{width:calc(100vw - 16px);max-height:92vh}.wah-watch-dialog-header,.wah-watch-dialog-controls,.wah-watch-dialog-content{padding:12px!important}.wah-watch-metrics{grid-template-columns:1fr!important}.wah-watch-actions{align-items:stretch!important}.wah-watch-actions-main{width:100%}.wah-watch-actions-danger{margin-left:0}.wah-watch-title-line{flex-basis:100%}}`);
  }
  function statusClass(status) { return status === 'BUY & SELL' ? 'wah-buy' : status === 'NOT WORTH IT' ? 'wah-bad' : status === 'LOADING' || status === 'CHECKING PRICES...' ? 'wah-load' : 'wah-warn'; }
  function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]); }
  function escapeAttribute(value) { return escapeHtml(value); }

  function renderStatusBadge(status) { return `<span class="wah-status-badge ${statusClass(status)}">${escapeHtml(status || 'NOT CHECKED')}</span>`; }
  function getSafeTraderPricelistUrl(trader) {
    if (!trader?.priceListUrl || !trader.traderId) return '';
    try {
      const url = new URL(trader.priceListUrl, location.href);
      const match = url.pathname.match(/^\/pricelist\/(\d+)/i);
      return url.protocol === 'https:' && url.hostname === 'weav3r.dev' && match && normalizePositiveInt(match[1]) === normalizePositiveInt(trader.traderId) ? url.href : '';
    } catch (_) { return ''; }
  }
  function getSafeWatchlistCheapestOffer(entry, result) {
    return resolveCurrentMarketOffer(entry?.itemId, result);
  }
  function getWatchlistActionModel(entry, result) {
    const trader = result.bestTrader;
    const referenceTrader = result.referenceTrader || trader;
    const cheapestOffer = getSafeWatchlistCheapestOffer(entry, result);
    const actions = [];
    if (result.status === 'BUY & SELL' && trader?.tradeNowUrl && isTraderTradeEligible(trader) && isTraderPersonallyAcceptable(trader)) actions.push({ kind: 'link', action: 'watchlist-trade-now', label: 'Trade now', href: trader.tradeNowUrl, primary: true });
    if (cheapestOffer) actions.push({ kind: 'link', action: 'watchlist-open-cheapest-offer', label: state.offerCheckingItems.has(entry.itemId) ? 'Checking…' : 'Open cheapest offer', href: cheapestOffer.url || '#', disabled: state.offerCheckingItems.has(entry.itemId) });
    const priceListUrl = getSafeTraderPricelistUrl(referenceTrader);
    if (priceListUrl) actions.push({ kind: 'link', label: 'Trader price list', href: priceListUrl });
    actions.push({ kind: 'link', label: 'Open Item', href: getItemUrl(entry.itemId) });
    if (!isWatchlistFullScanRunning()) actions.push({ kind: 'button', action: 'rescan-watchlist-item', label: isWatchlistRowRescanning(entry.itemId) ? 'Rescanning…' : 'Rescan Item', disabled: isWatchlistRowRescanning(entry.itemId) });
    actions.push({ kind: 'button', action: 'remove-watchlist-item', label: 'Remove', danger: true });
    return actions;
  }
  function renderWatchlistActionRow(entry, result) {
    const actions = getWatchlistActionModel(entry, result);
    const mainActions = actions.filter((action) => !action.danger);
    const dangerActions = actions.filter((action) => action.danger);
    const renderAction = (action) => {
      const attrs = `data-wah-item-id="${entry.itemId}"`;
      const cls = action.primary ? 'wah-button wah-primary-action' : action.danger ? 'wah-remove-action' : 'wah-button';
      if (action.kind === 'link') return `<a class="${cls}" ${action.action ? `data-action="${action.action}"` : ''} ${attrs} href="${escapeAttribute(action.href)}" target="_blank" rel="noopener noreferrer" ${action.disabled ? 'aria-disabled="true"' : ''}>${escapeHtml(action.label)}</a>`;
      return `<button type="button" class="${cls}" data-action="${action.action}" ${attrs} ${action.disabled ? 'disabled' : ''}>${escapeHtml(action.label)}</button>`;
    };
    return `<div class="wah-watch-actions"><div class="wah-watch-actions-main">${mainActions.map(renderAction).join('')}</div><div class="wah-watch-actions-danger">${dangerActions.map(renderAction).join('')}</div></div>`;
  }
  function compactReasonLabel(result) {
    const labels = getDecisionReasonLabels(result);
    if (result.status === 'NOT WORTH IT') {
      const absolute = labels.some((label) => /absolute/i.test(label));
      const relative = labels.some((label) => /relative/i.test(label));
      if (absolute && relative) return 'Below absolute and relative targets';
      if (relative) return 'Relative target not met';
      if (absolute) return 'Absolute target not met';
    }
    if (result.status === 'NO TRUSTED TRADER') return 'No trusted Trader meets the rating requirement';
    if (result.status === 'NO ELIGIBLE TRADER') return 'No Trader is currently eligible for a new Trade';
    if (result.status === 'NO ACCEPTABLE TRADER') return 'All eligible Traders were excluded by your negative ratings';
    if (result.status === 'DATA STALE') return 'Purchase or Trader data is stale';
    if (result.status === 'DATA MISSING') return 'Required price data is missing';
    return labels[0] || '';
  }
  function renderWatchlistRowsMarkup() {
    const rows = getWatchlistDisplayRows();
    if (!rows.length) return '<div class="wah-note">No Watchlist items yet.</div>';
    return rows.map(({ entry, result }) => {
      const trader = result.bestTrader;
      const referenceTrader = result.referenceTrader && !result.bestTrader ? result.referenceTrader : null;
      const purchase = result.lowestPurchase;
      const reason = compactReasonLabel(result);
      const displayTrader = trader || referenceTrader;
      const topHtml = `<div class="wah-watch-top"><div><div class="wah-watch-title-line"><span class="wah-watch-name">${escapeHtml(entry.itemName)}</span><span class="wah-watch-meta"> · Item ${entry.itemId}</span></div>${result.progress ? `<div class="wah-watch-meta">${escapeHtml(result.progress)}</div>` : ''}</div>${renderStatusBadge(result.status || 'NOT CHECKED')}</div>`;
      const metricsHtml = `<div class="wah-watch-metrics"><div class="wah-watch-metric"><div class="wah-watch-metric-label">Buy</div><div class="wah-watch-metric-value">${formatMoney(purchase?.price)}</div><div class="wah-watch-meta">${escapeHtml(purchase?.source || '—')}</div></div><div class="wah-watch-metric wah-watch-sell"><div class="wah-watch-metric-label">Sell</div><div class="wah-watch-metric-value">${formatMoney(displayTrader?.buyPrice)}</div><div class="wah-watch-meta" title="${escapeAttribute(displayTrader?.traderName || '')}">${displayTrader ? `${escapeHtml(displayTrader.traderName)} [${displayTrader.rating >= 0 ? '+' : ''}${displayTrader.rating}]` : '—'}</div><div class="wah-watch-meta">${escapeHtml(displayTrader ? formatTraderTradeEligibility(displayTrader) : '')}</div><div class="wah-watch-meta">${escapeHtml(displayTrader ? formatPersonalRatingState(displayTrader.personalRatingState) : '')}</div></div><div class="wah-watch-metric"><div class="wah-watch-metric-label">Profit</div><div class="wah-watch-metric-value">${formatProfitPair(result)}</div></div></div>`;
      const chipsHtml = `<div class="wah-chip-row">${renderSourceChips(entry.itemId)}</div>`;
      const reasonHtml = reason ? `<div class="wah-reason-row">${escapeHtml(reason)}</div>` : '';
      const actionsHtml = renderWatchlistActionRow(entry, result);
      return `<div class="wah-watch-row ${result.status === 'BUY & SELL' ? 'wah-watch-buy' : ''}" data-wah-item-id="${entry.itemId}">${topHtml}${metricsHtml}${chipsHtml}${reasonHtml}${actionsHtml}</div>`;
    }).join('');
  }
  function freshnessSummary(data) { return `Bazaar: ${formatAge(data.bazaar)} · Item Market: ${formatAge(data.itemMarket)} · Traders: ${formatAge(data.traders)}`; }
  function formatCompactAge(entry) { if (!entry) return ''; const seconds = Math.max(0, Math.round((Date.now() - Number(entry.capturedAt)) / 1000)); if (seconds < 3) return 'now'; if (seconds < 60) return `${seconds}s`; return `${Math.round(seconds / 60)}m`; }
  function getSourceDisplayState(entry, sourceType, overrideState = '') { if (overrideState === 'checking' || overrideState === 'queued' || overrideState === 'error') return overrideState; if (!entry) return 'missing'; return getSourceAgeState(entry, sourceType); }
  function getSourceChipModel(itemId, sourceType) { const active = Array.from(state.activeCollectors.values()).some((job) => ['watchlist', 'watchlist-row'].includes(job.context) && Number(job.definition.itemId) === Number(itemId) && job.definition.sourceType === sourceType); const queued = state.queuedCollectors.some((job) => ['watchlist', 'watchlist-row'].includes(job.context) && Number(job.definition.itemId) === Number(itemId) && job.definition.sourceType === sourceType); const result = state.watchlistResults.get(Number(itemId)); const failed = typeof result?.progress === 'string' && result.progress.includes(`${prettySourceName(sourceType)} failed`); const entry = loadCachedSourceData(itemId, sourceType); const stateName = getSourceDisplayState(entry, sourceType, active ? 'checking' : queued ? 'queued' : failed ? 'error' : ''); const age = formatCompactAge(entry); const label = ['fresh', 'warning', 'stale'].includes(stateName) ? `${stateName === 'warning' ? 'near stale' : stateName}${age ? ` · ${age}` : ''}` : stateName; return { sourceType, name: prettySourceName(sourceType), state: stateName, label }; }
  function renderSourceChips(itemId) { return ['bazaar', 'itemMarket', 'traders'].map((sourceType) => { const chip = getSourceChipModel(itemId, sourceType); return `<span class="wah-source-chip wah-chip-${chip.state}">${escapeHtml(chip.name)} · ${escapeHtml(chip.label)}</span>`; }).join(''); }
  function getDecisionReasonLabels(result) { const labels = []; (result.messages || []).forEach((message) => { if (message === 'Both targets not met') labels.push('Absolute target not met', 'Relative target not met'); else if (message === 'Only one purchase source available') labels.push(result.lowestPurchase?.source ? `Only ${result.lowestPurchase.source} available` : 'Only one purchase source available'); else if (!/^Missing:|^Stale:|^Failed to auto-load:/i.test(message)) labels.push(message); }); return Array.from(new Set(labels)); }
  function calculateScanSummary() { const summary = { opportunities: 0, belowTargets: 0, incomplete: 0, errors: 0 }; state.watchlist.forEach((entry) => { const result = state.watchlistResults.get(entry.itemId) || { status: 'NOT CHECKED' }; if (result.status === 'BUY & SELL') summary.opportunities += 1; else if (result.status === 'NOT WORTH IT' && isMeaningfulCalculatedProfit(result)) summary.belowTargets += 1; else if (result.status === 'ERROR') summary.errors += 1; else summary.incomplete += 1; }); return summary; }
  function calculateScanProgress() { const scan = state.scan; const totalItems = scan?.totalItems || state.watchlist.length; const totalSourceChecks = scan?.totalSources || 0; const settledSourceChecks = scan?.checkedSources || 0; const activeJobs = Array.from(state.activeCollectors.values()).filter((job) => job.context === 'watchlist' && (!scan || job.scanId === scan.id)).map((job) => ({ itemId: Number(job.definition.itemId), itemName: state.watchlist.find((item) => item.itemId === Number(job.definition.itemId))?.itemName || `Item ${job.definition.itemId}`, sourceType: job.definition.sourceType })); const queuedJobs = state.queuedCollectors.filter((job) => job.context === 'watchlist' && (!scan || job.scanId === scan.id)); return { status: scan?.status || (scan?.active ? 'scanning' : 'idle'), totalItems, completedItems: scan?.completedItems || 0, totalSourceChecks, settledSourceChecks, activeJobs, queuedJobs: queuedJobs.length, startedAt: scan?.startedAt || null, completedAt: scan?.completedAt || null, summary: scan?.summary || null }; }
  function formatScanSummaryLine(totalItems, summary) { const incomplete = summary.incomplete + summary.errors; return `${totalItems} checked · ${summary.opportunities} ${summary.opportunities === 1 ? 'opportunity' : 'opportunities'} · ${summary.belowTargets} below targets · ${incomplete} incomplete`; }
  function renderScanProgressMarkup() { const progress = calculateScanProgress(); const percent = progress.totalSourceChecks ? Math.round((progress.settledSourceChecks / progress.totalSourceChecks) * 100) : 0; if (progress.status === 'scanning') return `<div class="wah-scan-progress"><strong>Scanning Watchlist</strong><div class="wah-progress-bar"><span style="width:${Math.min(100, percent)}%"></span></div><div class="wah-scan-lines"><span>${progress.completedItems} of ${progress.totalItems} items complete</span><span>${progress.settledSourceChecks} of ${progress.totalSourceChecks} source checks processed</span><span>${progress.activeJobs.length} active · ${progress.queuedJobs} queued</span></div>${progress.activeJobs.length ? `<div class="wah-current-jobs"><span>Currently checking:</span>${progress.activeJobs.map((job) => `<span>${escapeHtml(job.itemName)} · ${escapeHtml(prettySourceName(job.sourceType))}</span>`).join('')}</div>` : ''}</div>`; if (progress.status === 'complete' && progress.summary) return `<div class="wah-scan-progress wah-scan-progress-complete"><strong>Scan complete · ${escapeHtml(formatAge({ capturedAt: progress.completedAt }))}</strong><div>${escapeHtml(formatScanSummaryLine(progress.totalItems, progress.summary))}</div></div>`; if (progress.status === 'cancelled') return `<div class="wah-scan-progress wah-scan-progress-complete"><strong>Scan cancelled</strong><div>${progress.completedItems} of ${progress.totalItems} items completed · completed results preserved</div></div>`; return `<div class="wah-scan-progress wah-scan-progress-complete"><strong>${state.scan?.summary ? 'Last scan complete' : `Ready to scan ${state.watchlist.length} items`}</strong>${state.scan?.summary ? `<div>${escapeHtml(formatScanSummaryLine(state.watchlist.length, state.scan.summary))}</div>` : ''}</div>`; }

  function ensureWatchlistDialogRoots() {
    let backdrop = document.getElementById(WATCHLIST_BACKDROP_ID);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = WATCHLIST_BACKDROP_ID;
      backdrop.dataset.weav3rArbitrage = 'watchlist-backdrop';
      document.body.appendChild(backdrop);
    }
    let dialog = document.getElementById(WATCHLIST_DIALOG_ID);
    if (!dialog) {
      dialog = document.createElement('section');
      dialog.id = WATCHLIST_DIALOG_ID;
      dialog.dataset.weav3rArbitrage = 'watchlist-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', WATCHLIST_TITLE_ID);
      backdrop.appendChild(dialog);
    }
    return { backdrop, dialog };
  }

  function openWatchlistDialog() {
    loadWatchlist();
    hydrateWatchlistFromCaches();
    openModal('watchlist', document.getElementById('weav3r-arbitrage-watchlist-button'));
    renderWatchlistDialog();
    focusInitialModalElement('watchlist');
  }

  function closeWatchlistDialog(refocus = true, reason = 'close') { closeModal('watchlist', reason, { refocus }); }

  function renderWatchlistDialog() {
    if (!state.watchlistDialogOpen) { document.getElementById(WATCHLIST_BACKDROP_ID)?.remove(); return; }
    const { backdrop, dialog } = ensureWatchlistDialogRoots();
    const content = document.getElementById(WATCHLIST_CONTENT_ID);
    const previousScrollTop = content ? content.scrollTop : 0;
    const scanning = isWatchlistFullScanRunning();
    const scanLabel = state.scan?.status === 'complete' || state.scan?.status === 'cancelled' ? 'Scan Again' : 'Scan Watchlist';
    backdrop.className = 'wah-watch-backdrop';
    dialog.className = 'wah-watch-dialog wah-modal';
    dialog.innerHTML = `<header class="wah-watch-dialog-header"><div><h2 id="${WATCHLIST_TITLE_ID}">Arbitrage Watchlist</h2><div class="wah-watch-meta">${state.watchlist.length} / ${WATCHLIST_LIMIT} items</div></div><button type="button" data-action="close-watchlist-dialog">Close</button></header><div class="wah-watch-dialog-controls">${renderScanProgressMarkup()}<div class="wah-control-row">${scanning ? '<button type="button" class="wah-danger" data-action="stop-watchlist-scan">Stop Scan</button>' : `<button type="button" data-action="scan-watchlist">${scanLabel}</button>`}<button type="button" class="wah-remove-action" data-action="remove-all-watchlist-items" ${scanning || !state.watchlist.length ? 'disabled' : ''}>Remove All</button>${state.watchlistMessage ? `<span class="wah-note">${escapeHtml(state.watchlistMessage)}</span>` : ''}</div></div><div id="${WATCHLIST_CONTENT_ID}" class="wah-watch-dialog-content" tabindex="0" aria-label="Arbitrage Watchlist results">${renderWatchlistRowsMarkup()}</div>`;
    const newContent = document.getElementById(WATCHLIST_CONTENT_ID);
    if (newContent) newContent.scrollTop = previousScrollTop;
    diagnoseWatchlistFlexCompression();
  }

  function diagnoseWatchlistFlexCompression() {
    if (!DEBUG) return;
    const content = document.getElementById(WATCHLIST_CONTENT_ID);
    if (!content) return;
    const issues = Array.from(content.querySelectorAll(':scope > .wah-watch-row')).map((row) => {
      const computed = getComputedStyle(row);
      const renderedHeight = row.getBoundingClientRect().height;
      return {
        itemId: row.dataset.wahItemId,
        renderedHeight: Math.round(renderedHeight),
        contentHeight: row.scrollHeight,
        flex: computed.flex,
        flexShrink: computed.flexShrink,
        flexBasis: computed.flexBasis,
        compressed: row.scrollHeight > renderedHeight + 2 || computed.flexShrink !== '0',
      };
    }).filter((row) => row.compressed);
    const signature = issues.map((row) => `${row.itemId}:${row.renderedHeight}:${row.contentHeight}:${row.flexShrink}:${row.flexBasis}`).join('|');
    if (signature && signature !== state.watchlistLayoutDiagnosticSignature) {
      state.watchlistLayoutDiagnosticSignature = signature;
      logDebug('Watchlist card flex compression detected.', issues);
    }
  }

  function renderWatchlistPanel() { renderWatchlistDialog(); }

  function formatHistoryTimestamp(value) { const date = new Date(Number(value)); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(); }
  function renderTransactionCard(transaction) {
    const expanded = state.expandedTransactionIds.has(transaction.id);
    const difference = getTransactionDifference(transaction);
    const actualUnit = transaction.unitPrice == null ? '—' : formatLedgerMoney(transaction.unitPrice);
    const counterparty = transaction.counterpartyName || transaction.counterpartyId ? `${transaction.counterpartyName || '—'}${transaction.counterpartyId ? ` [${transaction.counterpartyId}]` : ''}` : '—';
    return `<article class="wah-history-card" data-transaction-id="${escapeAttribute(transaction.id)}"><div class="wah-history-card-top"><div><div class="wah-history-type">${escapeHtml(transaction.type.toUpperCase())}</div><div class="wah-history-name">${escapeHtml(transaction.itemName)} [${transaction.itemId}]</div></div><button type="button" data-action="toggle-history-details" data-transaction-id="${escapeAttribute(transaction.id)}" aria-expanded="${expanded}">${expanded ? 'Hide details' : 'Details'}</button></div><div class="wah-history-grid"><div class="wah-history-cell"><span>Quantity / unit price</span>${transaction.quantity}${transaction.unitPrice == null ? ` · Unit price: ${actualUnit}` : ` × ${actualUnit}`}</div><div class="wah-history-cell"><span>Actual total</span>${formatLedgerMoney(transaction.totalPrice)}</div><div class="wah-history-cell"><span>Source</span>${escapeHtml(transactionSourceLabel(transaction.source))}</div><div class="wah-history-cell"><span>Expected</span>${formatLedgerMoney(transaction.expectedTotalPrice)}</div><div class="wah-history-cell"><span>Difference</span>${difference == null ? '—' : formatLedgerMoney(difference, true)}</div><div class="wah-history-cell"><span>Confirmed</span>${escapeHtml(formatHistoryTimestamp(transaction.confirmedAt))}</div></div>${expanded ? `<div class="wah-history-details"><div class="wah-history-cell wah-history-id"><span>Transaction ID</span>${escapeHtml(transaction.id)}</div><div class="wah-history-cell"><span>Schema version</span>${transaction.schemaVersion}</div><div class="wah-history-cell"><span>Origin</span>${escapeHtml(transactionOriginLabel(transaction.origin))}</div><div class="wah-history-cell"><span>Confirmation</span>${escapeHtml(transactionConfirmationLabel(transaction.confirmationMethod))}</div><div class="wah-history-cell"><span>Counterparty</span>${escapeHtml(counterparty)}</div><div class="wah-history-cell"><span>Trade ID</span>${transaction.tradeId || '—'}</div><div class="wah-history-cell"><span>Expected unit price</span>${formatLedgerMoney(transaction.expectedUnitPrice)}</div><div class="wah-history-cell"><span>Original market quote</span>${formatLedgerMoney(transaction.marketQuoteUnitPrice)}</div><div class="wah-history-cell"><span>Correlation ID</span>${escapeHtml(transaction.correlationId || '—')}</div><div class="wah-history-cell"><span>Created</span>${escapeHtml(formatHistoryTimestamp(transaction.createdAt))}</div><div class="wah-history-cell"><span>Confirmed</span>${escapeHtml(formatHistoryTimestamp(transaction.confirmedAt))}</div></div>` : ''}</article>`;
  }
  function renderConfirmedTransactionsView() {
    const diagnostics = readTransactionLedgerDiagnostics();
    const all = Object.values(diagnostics.ledger.transactions);
    const contextual = filterTransactionsByHistoryContext(all);
    const summary = summarizeTransactions(contextual);
    const rows = filterAndSortTransactions(contextual, { type: state.historyTypeFilter, source: state.historySourceFilter, search: state.historySearch, sort: state.historySort });
    const date = getHistoryExportDate();
    const exportUrls = getHistoryExportUrls(diagnostics.ledger);
    return `<div class="wah-history-filters"><label>Type<select data-history-filter="type"><option value="all"${state.historyTypeFilter === 'all' ? ' selected' : ''}>All</option><option value="buy"${state.historyTypeFilter === 'buy' ? ' selected' : ''}>Buy</option><option value="sell"${state.historyTypeFilter === 'sell' ? ' selected' : ''}>Sell</option></select></label><label>Source<select data-history-filter="source"><option value="all"${state.historySourceFilter === 'all' ? ' selected' : ''}>All</option><option value="bazaar"${state.historySourceFilter === 'bazaar' ? ' selected' : ''}>Bazaar</option><option value="item-market"${state.historySourceFilter === 'item-market' ? ' selected' : ''}>Item Market</option><option value="trade"${state.historySourceFilter === 'trade' ? ' selected' : ''}>Trade</option></select></label><label class="wah-history-search">Search<input type="search" data-history-filter="search" value="${escapeAttribute(state.historySearch)}" placeholder="Item, counterparty, or Trade ID"></label><label>Sort<select data-history-filter="sort"><option value="newest"${state.historySort === 'newest' ? ' selected' : ''}>Newest first</option><option value="oldest"${state.historySort === 'oldest' ? ' selected' : ''}>Oldest first</option></select></label><a class="wah-button" href="${escapeAttribute(exportUrls.json)}" download="weav3r-arbitrage-transactions-${date}.json">Export JSON</a><a class="wah-button" href="${escapeAttribute(exportUrls.csv)}" download="weav3r-arbitrage-transactions-${date}.csv">Export CSV</a></div><div id="${HISTORY_CONTENT_ID}" class="wah-history-content"><div class="wah-history-summary"><strong>Confirmed transactions: ${summary.confirmed}</strong>${state.historyContext.kind !== 'global' ? '<button type="button" data-action="clear-history-context">All transactions</button>' : ''}<span>Buys: ${summary.buys}</span><span>Sells: ${summary.sells}</span></div>${diagnostics.rejectedCount ? `<div class="wah-history-warning">Warning: ${diagnostics.rejectedCount} stored transaction record(s) could not be validated and are not shown.</div>` : ''}${rows.length ? rows.map(renderTransactionCard).join('') : `<div class="wah-history-empty">No confirmed transactions recorded yet.<br>Only transactions with exact supported Torn completion evidence appear here.</div>`}</div>`;
  }
  function formatPendingDuration(milliseconds) { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); if (seconds < 60) return `${seconds}s`; const minutes = Math.floor(seconds / 60); return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
  function pendingPurchaseStatus(record) { return ({ 'destination-claimed': 'Destination claimed', 'interaction-observed': 'Purchase interaction observed', 'awaiting-confirmation': 'Awaiting confirmed Torn purchase evidence' })[record?.lastKnownState] || 'Awaiting destination'; }
  function renderPendingPurchaseCard(record, now = Date.now()) { const seller = record.sellerName || record.sellerId ? `${record.sellerName || '—'}${record.sellerId ? ` [${record.sellerId}]` : ''}` : '—'; return `<article class="wah-history-card"><div class="wah-history-card-top"><div><div class="wah-history-type">PENDING · UNCONFIRMED</div><div class="wah-history-name">${escapeHtml(record.itemName)} [${record.itemId}]</div></div></div><div class="wah-history-grid"><div class="wah-history-cell"><span>Source</span>${escapeHtml(transactionSourceLabel(record.source))}</div><div class="wah-history-cell"><span>Origin</span>${escapeHtml(transactionOriginLabel(record.origin))}</div><div class="wah-history-cell"><span>Expected market unit price</span>${formatLedgerMoney(record.displayedUnitPrice)}</div><div class="wah-history-cell"><span>Seller</span>${escapeHtml(seller)}</div><div class="wah-history-cell"><span>Age</span>${escapeHtml(formatPendingDuration(now - record.createdAt))}</div><div class="wah-history-cell"><span>Expires in</span>${escapeHtml(formatPendingDuration(record.expiresAt - now))}</div></div><div class="wah-history-cell wah-history-id"><span>Correlation</span>${escapeHtml(record.correlationId)}</div><div class="wah-history-cell"><span>Status</span>${escapeHtml(pendingPurchaseStatus(record))}</div></article>`; }
  function renderPendingPurchasesView() { const records = Object.values(readPurchaseTransports().records).sort((left, right) => right.createdAt - left.createdAt || left.correlationId.localeCompare(right.correlationId)); return `<div id="${HISTORY_CONTENT_ID}" class="wah-history-content"><div class="wah-history-warning">Bazaar and Item Market BUYs can be recorded after exact Torn success evidence. Confirmed simple Item-for-Money Trade SELLs are also supported.</div>${records.length ? records.map((record) => renderPendingPurchaseCard(record)).join('') : '<div class="wah-history-empty">No active pending purchase correlations.</div>'}<div class="wah-note">Pending correlations are temporary diagnostics, not confirmed transactions, and are never included in History counts or exports.</div></div>`; }
  function ensureHistoryDialogRoot() { let backdrop = document.getElementById(HISTORY_BACKDROP_ID); if (!backdrop) { backdrop = document.createElement('div'); backdrop.id = HISTORY_BACKDROP_ID; backdrop.dataset.weav3rArbitrage = 'history-backdrop'; document.body.appendChild(backdrop); } let dialog = document.getElementById(HISTORY_DIALOG_ID); if (!dialog) { dialog = document.createElement('section'); dialog.id = HISTORY_DIALOG_ID; dialog.dataset.weav3rArbitrage = 'history-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', HISTORY_TITLE_ID); backdrop.appendChild(dialog); } return { backdrop, dialog }; }
  function renderHistoryDialog() { if (!state.historyDialogOpen) { document.getElementById(HISTORY_BACKDROP_ID)?.remove(); return; } const previousContent = document.getElementById(HISTORY_CONTENT_ID); const previousScrollTop = previousContent?.scrollTop || 0; const { backdrop, dialog } = ensureHistoryDialogRoot(); backdrop.className = 'wah-history-backdrop'; dialog.className = 'wah-history-dialog wah-modal'; dialog.innerHTML = `<header class="wah-history-header"><div><h2 id="${HISTORY_TITLE_ID}">${escapeHtml(historyContextTitle())}</h2><div class="wah-note">Confirmed history and temporary correlations are kept separate.</div></div><button type="button" data-action="close-history-dialog">Close</button></header><nav class="wah-history-tabs" aria-label="History views"><button type="button" role="tab" data-action="set-history-tab" data-history-tab="transactions" aria-selected="${state.historyTab === 'transactions'}">Transactions</button><button type="button" role="tab" data-action="set-history-tab" data-history-tab="pending" aria-selected="${state.historyTab === 'pending'}">Pending Purchases</button></nav>${state.historyTab === 'transactions' ? renderConfirmedTransactionsView() : renderPendingPurchasesView()}`; const content = document.getElementById(HISTORY_CONTENT_ID); if (content) content.scrollTop = previousScrollTop; }
  function openHistoryDialog(options = {}) { state.historyContext = normalizeHistoryContext(options.context || state.historyContext); if (options.initialTab) state.historyTab = options.initialTab === 'pending' ? 'pending' : 'transactions'; openModal('history', options.opener || document.getElementById('weav3r-arbitrage-history-button') || document.getElementById(HISTORY_LAUNCHER_ID)); renderHistoryDialog(); focusInitialModalElement('history'); logDebug('history modal opened with context.', state.historyContext); }
  function closeHistoryDialog(refocus = true, reason = 'close') { closeModal('history', reason, { refocus }); }
  function attachHistoryStorageListeners() { if (typeof GM_addValueChangeListener !== 'function') return; if (!state.historyRevisionListenerId) state.historyRevisionListenerId = GM_addValueChangeListener(TRANSACTION_STORE_REVISION_KEY, () => { invalidateTransactionEventCache('cross-tab revision'); if (state.historyDialogOpen && state.historyTab === 'transactions') renderHistoryDialog(); if (location.pathname === '/item.php') scheduleTornInventoryBasisRefresh(); }); if (!state.historyLedgerListenerId) state.historyLedgerListenerId = GM_addValueChangeListener(TRANSACTION_LEDGER_KEY, () => { logDebug('legacy compatibility import.'); migrateLegacyLedgerV1(); if (state.historyDialogOpen && state.historyTab === 'transactions') renderHistoryDialog(); }); if (!state.historyTransportListenerId) state.historyTransportListenerId = GM_addValueChangeListener(PURCHASE_TRANSPORTS_KEY, () => { if (state.historyDialogOpen && state.historyTab === 'pending') renderHistoryDialog(); }); window.addEventListener('beforeunload', () => { if (typeof GM_removeValueChangeListener === 'function') { if (state.historyRevisionListenerId) GM_removeValueChangeListener(state.historyRevisionListenerId); if (state.historyLedgerListenerId) GM_removeValueChangeListener(state.historyLedgerListenerId); if (state.historyTransportListenerId) GM_removeValueChangeListener(state.historyTransportListenerId); } state.historyRevisionListenerId = null; state.historyLedgerListenerId = null; state.historyTransportListenerId = null; revokeHistoryExportUrls(); }, { once: true }); }

  function ensureSettingsDialogRoot() {
    let backdrop = document.getElementById(SETTINGS_BACKDROP_ID);
    if (!backdrop) { backdrop = document.createElement('div'); backdrop.id = SETTINGS_BACKDROP_ID; backdrop.dataset.weav3rArbitrage = 'settings-backdrop'; document.body.appendChild(backdrop); }
    let dialog = document.getElementById(SETTINGS_DIALOG_ID);
    if (!dialog) { dialog = document.createElement('section'); dialog.id = SETTINGS_DIALOG_ID; dialog.dataset.weav3rArbitrage = 'settings-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', SETTINGS_TITLE_ID); backdrop.appendChild(dialog); }
    return { backdrop, dialog };
  }
  function openSettingsDialog() { state.settingsError = ''; openModal('settings', document.getElementById('weav3r-arbitrage-settings-button')); renderSettingsDialog(); focusInitialModalElement('settings'); }
  function closeSettingsDialog(refocus = true, reason = 'close') { closeModal('settings', reason, { refocus }); }
  function renderSettingsDialog() {
    if (!state.settingsDialogOpen) { document.getElementById(SETTINGS_BACKDROP_ID)?.remove(); return; }
    const { backdrop, dialog } = ensureSettingsDialogRoot();
    backdrop.className = 'wah-settings-backdrop';
    dialog.className = 'wah-settings-dialog wah-modal';
    dialog.innerHTML = `<h2 id="${SETTINGS_TITLE_ID}">Arbitrage Settings</h2><p class="wah-note">BUY & SELL is shown only when both the absolute and relative profit targets are met.</p>${state.settingsError ? `<div class="wah-field-error">${escapeHtml(state.settingsError)}</div>` : ''}<form id="${SETTINGS_FORM_ID}" class="wah-settings-form"><label for="weav3r-arbitrage-min-rating">Minimum Trader Rating<input id="weav3r-arbitrage-min-rating" name="weav3rArbitrageMinimumTraderRating" data-wah-field="rating" type="number" step="1" inputmode="numeric" autocomplete="off" value="${state.settings.minimumTraderRating}"></label><label for="weav3r-arbitrage-min-profit">Minimum Profit Per Item<input id="weav3r-arbitrage-min-profit" name="weav3rArbitrageMinimumProfitPerItem" data-wah-field="profit" type="text" inputmode="numeric" autocomplete="off" value="${formatMoney(state.settings.minimumProfitPerItem)}"></label><label for="weav3r-arbitrage-min-relative-profit">Minimum Relative Profit<input id="weav3r-arbitrage-min-relative-profit" name="weav3rArbitrageMinimumRelativeProfit" data-wah-field="relative-profit" type="text" inputmode="decimal" autocomplete="off" value="${state.settings.minimumRelativeProfitPercent}%"></label><div class="wah-dialog-actions"><button type="button" data-action="close-settings-dialog">Cancel</button><button type="submit">Save settings</button></div></form>`;
  }

  function renderStatusCard(result) {
    state.isRendering = true; addStyles(); loadWatchlist();
    let card = document.getElementById(CARD_ID);
    if (!card) { card = document.createElement('section'); card.id = CARD_ID; card.dataset.weav3rArbitrage = 'status-card'; document.body.appendChild(card); }
    card.classList.toggle('wah-collapsed', state.collapsed);
    const trader = result.bestTrader;
    const referenceTrader = result.referenceTrader && !result.bestTrader ? result.referenceTrader : null;
    const displayTrader = trader || referenceTrader;
    const purchase = result.lowestPurchase;
    if (state.collapsed) {
      card.style.top = `${getCollapsedTop()}px`; card.style.right = '0px';
      card.innerHTML = `<div class="wah-pill ${statusClass(result.status)}" data-action="expand-pill" role="button" tabindex="0" aria-label="Expand arbitrage check"><span class="wah-pill-status">${escapeHtml(result.status)}</span><span aria-hidden="true">·</span><span class="wah-pill-profit">${formatMoney(result.profitPerItem, true)}</span></div>`;
    } else {
      card.style.top = ''; card.style.right = '';
      const watchlisted = isItemWatchlisted(state.itemId);
      const tradeNowClass = result.status === 'BUY & SELL' ? 'wah-button wah-primary-action' : 'wah-button';
      card.innerHTML = `<div class="wah-header"><div class="wah-title">ARBITRAGE CHECK</div><button type="button" data-action="collapse">Collapse</button></div><div class="wah-body"><div class="wah-status ${statusClass(result.status)}">${escapeHtml(result.status)}</div><div class="wah-grid wah-main-grid"><div class="wah-metric"><div class="wah-label">Buy</div><div class="wah-value">${formatMoney(purchase && purchase.price)}</div><div class="wah-label">${purchase ? purchase.source : 'No purchase data'}</div></div><div class="wah-metric"><div class="wah-label">Sell to</div><div class="wah-value wah-trader-name" title="${escapeAttribute(displayTrader ? displayTrader.traderName : '')}">${displayTrader ? `${escapeHtml(displayTrader.traderName)} [${displayTrader.rating >= 0 ? '+' : ''}${displayTrader.rating}]` : '—'}</div><div class="wah-label">${formatMoney(displayTrader && displayTrader.buyPrice)}</div>${displayTrader ? `<div class="wah-label">${escapeHtml(formatTraderTradeEligibility(displayTrader))}</div><div class="wah-label">${escapeHtml(formatPersonalRatingState(displayTrader.personalRatingState))}</div>` : ''}</div><div class="wah-metric wah-profit-metric" title="Both the minimum absolute and relative profit settings must be met."><div class="wah-label">Profit per item</div><div class="wah-value wah-profit-value">${formatProfitPair(result)}</div></div></div>${result.messages.length ? `<div class="wah-note">${result.messages.map(escapeHtml).join('<br>')}</div>` : ''}<div class="wah-source-ages">${renderSourceAges(state.cachedData)}</div><div class="wah-action-group wah-trade-actions">${resolveCurrentMarketOffer(state.itemId, result) ? `<a class="wah-button" data-action="open-cheapest-offer" href="${escapeAttribute(resolveCurrentMarketOffer(state.itemId, result).url || '#')}" target="_blank" rel="noopener noreferrer" ${state.offerCheckingItems.has(Number(state.itemId)) ? 'aria-disabled="true"' : ''}>${state.offerCheckingItems.has(Number(state.itemId)) ? 'Checking…' : 'Open cheapest offer'}</a>` : ''}${displayTrader && displayTrader.priceListUrl ? `<a class="wah-button" href="${escapeAttribute(displayTrader.priceListUrl)}" target="_blank" rel="noopener noreferrer">Trader price list</a>` : ''}${trader && trader.tradeNowUrl ? `<a class="${tradeNowClass}" data-action="trade-now" href="${escapeAttribute(trader.tradeNowUrl)}" target="_blank" rel="noopener noreferrer">Trade now</a>` : displayTrader ? `<span class="wah-note">Trader must have been online within the past 6 hours.</span>` : ''}</div><div class="wah-action-group wah-tool-actions"><button type="button" data-action="toggle-watchlist-item">${watchlisted ? '★ Watchlisted' : '☆ Add to Watchlist'}</button><button type="button" data-action="open-watchlist-dialog" id="weav3r-arbitrage-watchlist-button">Watchlist (${state.watchlist.length})</button><button type="button" data-action="open-history-dialog" id="weav3r-arbitrage-history-button">History</button><button type="button" data-action="open-settings-dialog" id="weav3r-arbitrage-settings-button">Settings</button><button type="button" data-action="recheck">Recheck</button></div></div>`;
    }
    state.isRendering = false;
  }

  function normalizeSettings(raw) {
    const minimumTraderRating = parseRating(raw?.minimumTraderRating);
    const minimumProfitPerItem = parseMoney(raw?.minimumProfitPerItem);
    const minimumRelativeProfitPercent = parsePercentage(raw?.minimumRelativeProfitPercent);
    return {
      minimumTraderRating: minimumTraderRating == null ? DEFAULT_SETTINGS.minimumTraderRating : minimumTraderRating,
      minimumProfitPerItem: minimumProfitPerItem == null || minimumProfitPerItem < 0 ? DEFAULT_SETTINGS.minimumProfitPerItem : Math.round(minimumProfitPerItem),
      minimumRelativeProfitPercent: minimumRelativeProfitPercent == null ? DEFAULT_SETTINGS.minimumRelativeProfitPercent : minimumRelativeProfitPercent,
    };
  }
  function readSettings() { state.settings = normalizeSettings(gmGet(SETTINGS_KEY, {})); }
  function saveSettingsFromDialog() {
    const dialog = document.getElementById(SETTINGS_DIALOG_ID);
    const rating = parseRating(dialog?.querySelector('[data-wah-field="rating"]')?.value);
    const profit = parseMoney(dialog?.querySelector('[data-wah-field="profit"]')?.value);
    const relativeProfit = parsePercentage(dialog?.querySelector('[data-wah-field="relative-profit"]')?.value);
    if (rating == null) state.settingsError = 'Minimum Trader Rating must be an integer.';
    else if (profit == null || profit < 0) state.settingsError = 'Minimum Profit Per Item must be a non-negative dollar amount.';
    else if (relativeProfit == null) state.settingsError = 'Minimum Relative Profit must be a non-negative percentage.';
    if (state.settingsError) { renderSettingsDialog(); return false; }
    state.settings = { minimumTraderRating: rating, minimumProfitPerItem: Math.round(profit), minimumRelativeProfitPercent: relativeProfit };
    gmSet(SETTINGS_KEY, state.settings);
    filterTraderRows(parseTraderOffers(document, location.href), state.settings.minimumTraderRating);
    recalculateWatchlistResults();
    renderComputedResult(false);
    closeSettingsDialog();
    return true;
  }
  function recalculateWatchlistResults() { state.watchlist.forEach((entry) => { if (state.watchlistResults.has(entry.itemId)) state.watchlistResults.set(entry.itemId, calculateWatchlistItem(entry.itemId)); }); renderWatchlistPanel(); }
  function collectRelevantTradersForEligibility() { const traders = []; if (state.cachedData.traders?.traders) traders.push(...state.cachedData.traders.traders); state.watchlist.forEach((entry) => { const data = loadCachedItemData(entry.itemId); if (data.traders?.traders) traders.push(...data.traders.traders); }); return traders.map((trader) => normalizeTraderActivityFields(trader, trader.activityCapturedAt || trader.capturedAt)); }
  function scheduleEligibilityExpiryTimer() { clearTimeout(state.eligibilityTimer); state.eligibilityTimer = 0; const now = Date.now(); const expiry = getNearestEligibilityExpiryFromTraders(collectRelevantTradersForEligibility(), now); if (!expiry) return; const delay = Math.max(250, Math.min(expiry - now + 250, 2 ** 31 - 1)); state.eligibilityTimer = setTimeout(() => { logDebug('eligibility timer fired.'); recalculateWatchlistResults(); renderComputedResult(true); scheduleEligibilityExpiryTimer(); }, delay); logDebug('eligibility timer scheduled.', expiry); }
  function highlightRows(result) { document.querySelectorAll(`.${BEST_ROW_CLASS},.${CHEAPEST_ROW_CLASS}`).forEach((row) => row.classList.remove(BEST_ROW_CLASS, CHEAPEST_ROW_CLASS)); if (result.lowestPurchase?.row) result.lowestPurchase.row.classList.add(CHEAPEST_ROW_CLASS); if (result.bestTrader?.row) result.bestTrader.row.classList.add(BEST_ROW_CLASS); }
  function parseCurrentVisiblePage(itemId) { const bazaarOffers = parseBazaarOffers(itemId, document, location.href); const itemMarketOffers = parseItemMarketOffers(document, itemId, location.href); const traders = parseTraderOffers(document, location.href); if (bazaarOffers.length) state.cachedData.bazaar = saveCachedSourceData(itemId, 'bazaar', 'offers', bazaarOffers, location.href, { fallbackSource: 'visibleDom' }); if (itemMarketOffers.length) state.cachedData.itemMarket = saveCachedSourceData(itemId, 'itemMarket', 'offers', itemMarketOffers, location.href); if (traders.length) state.cachedData.traders = saveCachedSourceData(itemId, 'traders', 'traders', traders, location.href); filterTraderRows(traders, state.settings.minimumTraderRating); const liveAwareData = { ...state.cachedData }; if (bazaarOffers.length) liveAwareData.bazaar = { ...state.cachedData.bazaar, offers: bazaarOffers }; if (itemMarketOffers.length) liveAwareData.itemMarket = { ...state.cachedData.itemMarket, offers: itemMarketOffers }; if (traders.length) liveAwareData.traders = { ...state.cachedData.traders, traders }; return liveAwareData; }
  function renderComputedResult(useCachedOnly = false) { scheduleEligibilityExpiryTimer(); const failedSources = Object.entries(state.sourceProgress).filter(([, value]) => value === 'failed').map(([source]) => source); const result = calculateArbitrage(state.cachedData, state.settings, { checking: hasActiveCollectorsForCurrentItem() || state.sourceProgress.bazaar === 'checking', progressMessages: sourceProgressMessages(), failedSources }); state.lastResult = result; if (!useCachedOnly) highlightRows(result); syncCurrentItemToWatchlist(result); renderStatusCard(result); return result; }
  function evaluateCurrentPage(options = {}) { try { const itemId = getCurrentItemId(); if (!itemId) return; if (itemId !== state.itemId) { state.itemId = itemId; state.routeGeneration += 1; cancelCurrentCollectors(); clearTimeout(state.eligibilityTimer); state.eligibilityTimer = 0; state.sourceProgress = emptySourceProgress(); state.cachedData = loadCachedItemData(itemId); renderStatusCard({ status: 'LOADING', messages: ['Loading item data...'] }); } if (options.forceCollect) { cancelCurrentCollectors(); state.routeGeneration += 1; state.sourceProgress = emptySourceProgress(); } const liveAwareData = parseCurrentVisiblePage(itemId); updateSourceProgressFromCache(); const result = calculateArbitrage(liveAwareData, state.settings); state.lastResult = result; highlightRows(result); syncCurrentItemToWatchlist(result); renderStatusCard(result); collectMissingSources(itemId, { forceBazaar: Boolean(options.forceCollect), forceCollectors: Boolean(options.forceCollect) }); renderComputedResult(true); logDebug('Evaluation complete.', result); } catch (error) { logError('Evaluation failed.', error); renderStatusCard({ status: 'DATA MISSING', messages: ['Could not evaluate the current page safely.'] }); } }
  function scheduleEvaluation() { if (state.isRendering) return; clearTimeout(state.recheckTimer); state.recheckTimer = setTimeout(evaluateCurrentPage, RECHECK_DELAY_MS); }
  function handleRouteChange() { if (location.href === state.lastUrl) return; state.lastUrl = location.href; cancelCurrentCollectors(); clearTimeout(state.eligibilityTimer); state.eligibilityTimer = 0; state.routeGeneration += 1; state.itemId = getCurrentItemId(); state.sourceProgress = emptySourceProgress(); state.cachedData = loadCachedItemData(state.itemId); renderStatusCard({ status: 'LOADING', messages: ['Route changed. Rechecking current item...'] }); scheduleVisibleTraderQuoteCapture(); scheduleEvaluation(); }

  function beginPillDrag(event) { const pill = event.target.closest(`#${CARD_ID}.wah-collapsed .wah-pill`); if (!pill || event.button > 0) return; const card = document.getElementById(CARD_ID); state.pillDrag = { pointerId: event.pointerId, startY: event.clientY, startTop: getCollapsedTop(), moved: false }; card?.setPointerCapture?.(event.pointerId); }
  function movePillDrag(event) { if (!state.pillDrag || event.pointerId !== state.pillDrag.pointerId) return; const deltaY = event.clientY - state.pillDrag.startY; if (Math.abs(deltaY) >= PILL_DRAG_THRESHOLD_PX) state.pillDrag.moved = true; if (!state.pillDrag.moved) return; document.getElementById(CARD_ID)?.classList.add('wah-pill-dragging'); event.preventDefault(); const top = clampCollapsedTop(state.pillDrag.startTop + deltaY); state.collapsedTop = top; const card = document.getElementById(CARD_ID); if (card) { card.style.top = `${top}px`; card.style.right = '0px'; } }
  function endPillDrag(event) { if (!state.pillDrag || event.pointerId !== state.pillDrag.pointerId) return; const drag = state.pillDrag; state.pillDrag = null; const card = document.getElementById(CARD_ID); card?.releasePointerCapture?.(event.pointerId); card?.classList.remove('wah-pill-dragging'); if (drag.moved) { saveCollapsedTop(state.collapsedTop); return; } state.collapsed = false; renderStatusCard(state.lastResult); }
  function cancelPillDrag(event) { if (!state.pillDrag || event.pointerId !== state.pillDrag.pointerId) return; state.pillDrag = null; const top = getCollapsedTop(); const card = document.getElementById(CARD_ID); card?.classList.remove('wah-pill-dragging'); card?.releasePointerCapture?.(event.pointerId); if (card && state.collapsed) { card.style.top = `${top}px`; card.style.right = '0px'; } }
  function reclampCollapsedPill() { if (!state.collapsed) return; saveCollapsedTop(getCollapsedTop()); const card = document.getElementById(CARD_ID); if (card) { card.style.top = `${state.collapsedTop}px`; card.style.right = '0px'; } }
  function handleCardKeydown(event) { const pill = event.target.closest(`#${CARD_ID}.wah-collapsed .wah-pill`); if (!pill || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); state.collapsed = false; renderStatusCard(state.lastResult); }

  function describeConcreteOffer(offer) { return offer ? `${offer.source === 'bazaar' ? 'Bazaar' : 'Item Market'} ${formatMoney(offer.unitPrice)}` : 'none'; }
  function setCheapestOfferTriggerState(trigger, mode) {
    if (!trigger) return;
    if (!trigger.dataset.wahIdleLabel) trigger.dataset.wahIdleLabel = trigger.textContent.trim() || 'Open cheapest offer';
    const checking = mode === 'checking';
    trigger.setAttribute('aria-disabled', String(checking));
    trigger.setAttribute('aria-busy', String(checking));
    trigger.textContent = checking ? 'Checking…' : trigger.dataset.wahIdleLabel;
  }
  function reportCheapestOfferResult(origin, message) {
    if (origin === 'watchlist') { state.watchlistMessage = message; const controls = document.querySelector(`#${WATCHLIST_DIALOG_ID} .wah-control-row`); let messageNode = controls?.querySelector('.wah-cheapest-offer-message'); if (controls && !messageNode) { messageNode = document.createElement('span'); messageNode.className = 'wah-note wah-cheapest-offer-message'; controls.appendChild(messageNode); } if (messageNode) messageNode.textContent = message; }
    else { state.lastResult = { ...state.lastResult, messages: (state.lastResult?.messages || []).filter((entry) => entry !== message).concat(message) }; renderStatusCard(state.lastResult); }
  }

  function resolveWeav3rCurrentItemContext(url = location.href) {
    let parsed; try { parsed = new URL(url, location.href); } catch (_) { return null; }
    const match = parsed.pathname.match(/^\/item\/(\d+)(?:\/|$)/i); const itemId = match ? normalizePositiveInt(match[1]) : null;
    const itemName = normalizeBoundedText(getCurrentItemName(), 150);
    if (!itemId || !itemName || itemName === `Item ${itemId}`) { logDebug('ignored native link: current item context is ambiguous.', { itemId, itemName }); return null; }
    const context = { itemId, itemName, url: parsed.href, mode: ['buy', 'sell'].includes(parsed.searchParams.get('mode')) ? parsed.searchParams.get('mode') : null };
    logDebug('current item context.', context); return context;
  }
  function findClickedOffer(anchor, offers, urlField) {
    const row = anchor.closest('tr'); if (!row) return null;
    const href = new URL(anchor.href, location.href).href;
    return offers.find((offer) => offer.row === row && offer[urlField] && new URL(offer[urlField], location.href).href === href) || null;
  }
  function classifyWeav3rNativeNavigation(anchor, context = resolveWeav3rCurrentItemContext()) {
    if (!anchor?.href || !context || isInsideOwnedUi(anchor)) return null;
    let target; try { target = new URL(anchor.href, location.href); } catch (_) { return null; }
    if (target.hostname !== 'www.torn.com') return null;
    if (target.pathname === '/bazaar.php') { const offer = findClickedOffer(anchor, parseBazaarOffers(context.itemId, document, location.href), 'sellerUrl'); return offer ? { kind: 'bazaar', context, offer, targetUrl: target.href } : null; }
    if (target.pathname === '/page.php' && target.searchParams.get('sid') === 'ItemMarket') { const offer = findClickedOffer(anchor, parseItemMarketOffers(document, context.itemId, location.href), 'offerUrl'); return offer ? { kind: 'item-market', context, offer, targetUrl: target.href } : null; }
    if (target.pathname === '/trade.php') { const trader = findClickedOffer(anchor, parseTraderOffers(document, location.href), 'tradeNowUrl'); return trader ? { kind: 'trade', context, trader, targetUrl: target.href } : null; }
    return null;
  }
  function prepareNativeMarketNavigation(classification) {
    const { context, offer, targetUrl } = classification; let sellerId = null;
    try { sellerId = normalizePositiveInt(new URL(targetUrl).searchParams.get('userId')); } catch (_) { sellerId = null; }
    const source = classification.kind === 'bazaar' ? 'bazaar' : 'item-market';
    const transport = createPurchaseTransport({ source, itemId: context.itemId, itemName: context.itemName, sellerId, sellerName: offer.sellerName, displayedUnitPrice: offer.price, intendedQuantity: offer.quantity, expectedDestination: targetUrl, origin: 'weav3r-native-click' });
    if (!transport.ok) return null;
    if (source === 'bazaar') {
      const concrete = { source, itemId: context.itemId, url: targetUrl, unitPrice: offer.price, sellerId, sellerName: offer.sellerName, quantity: offer.quantity };
      const raw = createBazaarHandoffFromConcreteOffer(concrete, context.itemName, transport.record.correlationId);
      const handoff = normalizeHandoff({ ...raw, sellerName: offer.sellerName, offerQuantity: offer.quantity, origin: 'weav3r-native-click', selectionMode: 'manual-exact', searchIntent: 'explicit-item' }, 'bazaar');
      if (!handoff || !writeBazaarHandoff(handoff)) return null;
      logDebug('Bazaar manual handoff created.', { itemId: context.itemId, sellerId, price: offer.price });
    } else logDebug('Item Market transport created.', { itemId: context.itemId, price: offer.price || null });
    return transport.record;
  }
  function createManualTradeHandoff(context, trader, targetUrl, now = Date.now()) {
    const handoffId = makeHandoffId(); const destination = new URL(targetUrl); const hash = new URLSearchParams(destination.hash.replace(/^#/, '')); hash.set('wahHandoffId', handoffId); destination.hash = hash.toString();
    return normalizeHandoff({ version: 2, handoffId, action: 'trade-now', itemId: context.itemId, itemName: context.itemName, traderId: trader.traderId, traderName: trader.traderName, traderRating: trader.rating, unitSellPrice: trader.buyPrice, targetUrl: destination.href, traderActivityText: trader.activityText, traderLastSeenAt: trader.lastSeenAt, traderTradeEligibleUntil: trader.tradeEligibleUntil, traderPricelistUrl: trader.priceListUrl, personalRatingStateAtHandoff: trader.personalRatingState, personalRatingObservedAt: trader.personalRatingObservedAt, origin: 'weav3r-native-click', selectionMode: 'manual-exact', createdAt: now, expiresAt: now + TRADE_HANDOFF_TTL_MS, progress: emptyTradeProgress() }, 'trade');
  }
  function prepareNativeTradeNavigation(classification) {
    const handoff = createManualTradeHandoff(classification.context, classification.trader, classification.targetUrl); if (!handoff || !upsertTradeHandoff(handoff)) return null;
    const outsideRules = handoff.personalRatingStateAtHandoff === 'negative' || !isTradeHandoffActivityEligible(handoff) || handoff.traderRating < state.settings.minimumTraderRating;
    if (outsideRules) showTornStatus('Weav3r: Manually selected Trader is outside your automatic eligibility rules.');
    logDebug('manual Trade handoff created.', { handoffId: handoff.handoffId, traderId: handoff.traderId, outsideRules }); return handoff;
  }
  function handleWeav3rNativeNavigation(event) {
    if (!((event.type === 'click' && event.button === 0) || (event.type === 'auxclick' && event.button === 1))) return;
    const anchor = event.target.closest?.('a[href]'); const classification = classifyWeav3rNativeNavigation(anchor); if (!classification) return;
    logDebug('native link classified.', { kind: classification.kind, href: anchor.href });
    if (classification.kind !== 'trade') { prepareNativeMarketNavigation(classification); return; }
    const handoff = prepareNativeTradeNavigation(classification); if (!handoff) return;
    const original = anchor.getAttribute('href'); anchor.href = handoff.targetUrl; logDebug('href decorated.', handoff.handoffId);
    setTimeout(() => { if (original == null) anchor.removeAttribute('href'); else anchor.setAttribute('href', original); logDebug('href restored.', handoff.handoffId); }, 0);
  }
  function initializeWeav3rNativeNavigation() { if (state.nativeNavigationInitialized) return; state.nativeNavigationInitialized = true; document.addEventListener('click', handleWeav3rNativeNavigation, true); document.addEventListener('auxclick', handleWeav3rNativeNavigation, true); }
  function openCheapestOfferForItem({ itemId, itemName, result = null, triggerElement = null, origin = 'item-page' }) {
    const id = normalizePositiveInt(itemId);
    const name = normalizeBoundedText(itemName, 150);
    if (!id || !name || name === `Item ${id}`) { reportCheapestOfferResult(origin, 'A valid item name is required to open the cheapest offer.'); return Promise.resolve(null); }
    if (state.offerCheckingItems.has(id)) return Promise.resolve(null);
    const initialOffer = resolveCurrentMarketOffer(id, result);
    state.offerCheckingItems.add(id);
    setCheapestOfferTriggerState(triggerElement, 'checking');
    logDebug('Cheapest-offer action invoked.', { origin, itemId: id, itemName: name, sharedHandler: true });
    return refreshCurrentConcreteOffer(id).then((latestOffer) => {
      const destination = latestOffer && latestOffer.itemId === id ? normalizeConcreteMarketUrl(latestOffer.source, latestOffer.url, id) : '';
      if (!latestOffer || !destination) { reportCheapestOfferResult(origin, 'No current market offer is available.'); logDebug('No current offer after shared freshness check.', { origin, itemId: id }); return null; }
      const pendingResult = createPurchaseTransport({ source: latestOffer.source, itemId: id, itemName: name, sellerId: latestOffer.sellerId, displayedUnitPrice: latestOffer.unitPrice, offerId: latestOffer.offerId, expectedDestination: destination, origin });
      if (!pendingResult.ok) { reportCheapestOfferResult(origin, 'The purchase context could not be prepared safely.'); return null; }
      if (latestOffer.source === 'bazaar') {
        const handoff = normalizeHandoff(createBazaarHandoffFromConcreteOffer(latestOffer, name, pendingResult.record.correlationId), 'bazaar');
        if (!handoff) { reportCheapestOfferResult(origin, 'The Bazaar offer could not be prepared safely.'); return null; }
        writeBazaarHandoff(handoff);
        logDebug('Bazaar handoff created.', { itemIdMatches: handoff.itemId === id, itemNameMatches: handoff.itemName === name, validExpiry: handoff.expiresAt > Date.now() });
      } else logDebug('Item Market URL selected.', { itemId: id });
      if (initialOffer && (initialOffer.source !== latestOffer.source || initialOffer.unitPrice !== latestOffer.unitPrice)) reportCheapestOfferResult(origin, `Cheapest offer updated: ${describeConcreteOffer(initialOffer)} → ${describeConcreteOffer(latestOffer)}`);
      const opened = window.open(destination, '_blank', 'noopener');
      if (!opened) { reportCheapestOfferResult(origin, 'Could not open the market. Allow pop-ups and try again.'); return null; }
      logDebug('Navigation delegated to shared cheapest-offer opener.', { origin, itemId: id, source: latestOffer.source });
      return latestOffer;
    }).catch((error) => { logWarn('Cheapest offer check failed.', error); reportCheapestOfferResult(origin, 'No current market offer is available.'); return null; }).finally(() => {
      state.offerCheckingItems.delete(id);
      setCheapestOfferTriggerState(triggerElement, 'idle');
    });
  }

  function handleCardClick(event) {
    if (event.__wahHistoryHandled) return;
    if (event.target.id === WATCHLIST_BACKDROP_ID) { closeWatchlistDialog(); return; }
    if (event.target.id === SETTINGS_BACKDROP_ID) { closeSettingsDialog(); return; }
    if (event.target.id === HISTORY_BACKDROP_ID) { closeHistoryDialog(); return; }
    const target = event.target.closest('[data-action]');
    if (!target || (!target.closest(`#${CARD_ID}`) && !target.closest(`#${WATCHLIST_DIALOG_ID}`) && !target.closest(`#${SETTINGS_DIALOG_ID}`) && !target.closest(`#${HISTORY_DIALOG_ID}`))) return;
    const action = target.dataset.action;
    if (!action || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    if (action === 'expand-pill') { state.collapsed = false; renderStatusCard(state.lastResult); return; }
    if (action === 'collapse') { state.collapsed = true; closeWatchlistDialog(); closeSettingsDialog(false); closeHistoryDialog(false); renderStatusCard(state.lastResult); return; }
    if (action === 'open-settings-dialog') openSettingsDialog();
    if (action === 'open-history-dialog') openHistoryDialog();
    if (action === 'close-history-dialog') closeHistoryDialog();
    if (action === 'set-history-tab') { state.historyTab = target.dataset.historyTab === 'pending' ? 'pending' : 'transactions'; renderHistoryDialog(); }
    if (action === 'toggle-history-details') { const id = target.dataset.transactionId; if (state.expandedTransactionIds.has(id)) state.expandedTransactionIds.delete(id); else state.expandedTransactionIds.add(id); renderHistoryDialog(); }
    if (action === 'close-settings-dialog') closeSettingsDialog();
    if (action === 'open-watchlist-dialog') openWatchlistDialog();
    if (action === 'close-watchlist-dialog') closeWatchlistDialog();
    if (action === 'toggle-watchlist-item') { const result = isItemWatchlisted(state.itemId) ? (removeItemFromWatchlist(state.itemId), { message: 'Removed from Watchlist.' }) : addItemToWatchlist({ itemId: state.itemId, itemName: getCurrentItemName() }); state.watchlistMessage = result.message; syncCurrentItemToWatchlist(state.lastResult); }
    if (action === 'remove-watchlist-item') removeItemFromWatchlist(target.dataset.wahItemId);
    if (action === 'remove-all-watchlist-items') { if (state.scan?.active || !state.watchlist.length) return; if (Date.now() > state.removeAllConfirmUntil) { state.removeAllConfirmUntil = Date.now() + 8000; state.watchlistMessage = `Click Remove All again to remove ${state.watchlist.length} items.`; renderWatchlistDialog(); return; } saveWatchlist([]); state.watchlistResults.clear(); state.watchlistMessage = 'Watchlist cleared.'; state.removeAllConfirmUntil = 0; }
    if (action === 'scan-watchlist') startWatchlistScan();
    if (action === 'stop-watchlist-scan') stopWatchlistScan(true);
    if (action === 'rescan-watchlist-item') startWatchlistItemRescan(target.dataset.wahItemId);
    if (action === 'watchlist-open-cheapest-offer') { event.preventDefault(); event.stopPropagation(); const itemId = normalizePositiveInt(target.dataset.wahItemId); const entry = state.watchlist.find((item) => item.itemId === itemId); openCheapestOfferForItem({ itemId, itemName: entry?.itemName, result: calculateWatchlistItem(itemId), triggerElement: target, origin: 'watchlist' }); }
    if (action === 'watchlist-trade-now') {
      const itemId = normalizePositiveInt(target.dataset.wahItemId);
      const entry = state.watchlist.find((item) => item.itemId === itemId);
      const refreshed = calculateWatchlistItem(itemId);
      state.watchlistResults.set(itemId, refreshed);
      if (refreshed.status !== 'BUY & SELL' || !refreshed.bestTrader || refreshed.bestTrader.tradeNowUrl !== target.href || !isTraderTradeEligible(refreshed.bestTrader) || !isTraderPersonallyAcceptable(refreshed.bestTrader)) {
        event.preventDefault();
        event.stopPropagation();
        state.watchlistMessage = refreshed.status === 'NO ACCEPTABLE TRADER' ? 'Trade unavailable: you have negatively rated this Trader.' : 'Trade unavailable: this Trader is no longer the current eligible target.';
        renderWatchlistPanel();
        return;
      }
      const handoff = normalizeHandoff(createTradeHandoffFromResult(refreshed, itemId, entry?.itemName), 'trade');
      if (handoff && isTradeHandoffActivityEligible(handoff) && handoff.personalRatingStateAtHandoff !== 'negative') { writeTradeHandoff(handoff); target.href = handoff.targetUrl; }
      else { event.preventDefault(); event.stopPropagation(); state.watchlistMessage = 'Trade unavailable: the saved Trader target is no longer valid.'; renderWatchlistPanel(); }
    }
    if (action === 'open-cheapest-offer') { event.preventDefault(); event.stopPropagation(); openCheapestOfferForItem({ itemId: state.itemId, itemName: getCurrentItemName(), result: state.lastResult, triggerElement: target, origin: 'item-page' }); }
    if (action === 'trade-now') { const refreshed = calculateArbitrage(parseCurrentVisiblePage(state.itemId), state.settings); state.lastResult = refreshed; if (!refreshed.bestTrader || !isTraderTradeEligible(refreshed.bestTrader) || !isTraderPersonallyAcceptable(refreshed.bestTrader)) { event.preventDefault(); event.stopPropagation(); const message = refreshed.referenceTrader?.personalRatingState === 'negative' || refreshed.status === 'NO ACCEPTABLE TRADER' ? 'Trade unavailable: you have negatively rated this Trader.' : 'Trade unavailable: this Trader was last active more than 6 hours ago.'; state.lastResult = { ...refreshed, messages: (refreshed.messages || []).concat(message) }; renderStatusCard(state.lastResult); logDebug('Trade now blocked at click time.'); return; } const handoff = normalizeHandoff(createTradeHandoffFromResult(refreshed), 'trade'); if (handoff && isTradeHandoffActivityEligible(handoff) && handoff.personalRatingStateAtHandoff !== 'negative') { writeTradeHandoff(handoff); target.href = handoff.targetUrl; } else { event.preventDefault(); event.stopPropagation(); renderStatusCard({ ...refreshed, messages: (refreshed.messages || []).concat('Trade unavailable: this Trader was last active more than 6 hours ago.') }); } }
    if (action === 'recheck') evaluateCurrentPage({ forceCollect: true });
    if (action === 'save-settings') saveSettingsFromDialog();
    if (!['save-settings', 'recheck', 'scan-watchlist', 'stop-watchlist-scan', 'open-cheapest-offer', 'trade-now', 'rescan-watchlist-item', 'watchlist-open-cheapest-offer', 'watchlist-trade-now'].includes(action)) renderStatusCard(state.lastResult);
  }

  function isInsideOwnedUi(node) { return node?.nodeType === 1 && (node.closest?.(`#${CARD_ID},#${WATCHLIST_BACKDROP_ID},#${WATCHLIST_DIALOG_ID},#${SETTINGS_BACKDROP_ID},#${SETTINGS_DIALOG_ID},#${HISTORY_BACKDROP_ID},#${HISTORY_DIALOG_ID},iframe[data-weav3r-arbitrage-collector],[data-weav3r-arbitrage]`)); }
  function isOwnedMutation(mutation) { return isInsideOwnedUi(mutation.target) || Array.from(mutation.addedNodes || []).some(isInsideOwnedUi) || Array.from(mutation.removedNodes || []).some(isInsideOwnedUi); }
  function scrollWatchlistContentByKey(event) {
    if (state.activeModalType !== 'watchlist') return false;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')) return false;
    const content = document.getElementById(WATCHLIST_CONTENT_ID);
    if (!content) return false;
    const line = 48;
    const page = Math.max(120, content.clientHeight - line);
    const actions = { ArrowDown: line, ArrowUp: -line, PageDown: page, PageUp: -page, Home: -Infinity, End: Infinity };
    if (!(event.key in actions)) return false;
    event.preventDefault();
    if (event.key === 'Home') content.scrollTop = 0;
    else if (event.key === 'End') content.scrollTop = content.scrollHeight;
    else content.scrollTop += actions[event.key];
    return true;
  }
  function handleGlobalKeydown(event) {
    if (event.key === 'Escape') { if (state.activeModalType) { closeActiveModal('escape'); return; } }
    if (scrollWatchlistContentByKey(event)) return;
    handleCardKeydown(event);
  }
  function handleHistoryFilterChange(event) { const field = event.target?.dataset?.historyFilter; if (!field) return; const selection = field === 'search' ? event.target.selectionStart : null; if (field === 'type') state.historyTypeFilter = event.target.value; else if (field === 'source') state.historySourceFilter = event.target.value; else if (field === 'sort') state.historySort = event.target.value; else if (field === 'search') state.historySearch = event.target.value; renderHistoryDialog(); if (field === 'search') { const input = document.querySelector(`#${HISTORY_DIALOG_ID} [data-history-filter="search"]`); focusElementWithoutScroll(input); input?.setSelectionRange?.(selection, selection); } }
  function handleOwnedSubmit(event) { if (event.target?.id !== SETTINGS_FORM_ID) return; event.preventDefault(); saveSettingsFromDialog(); }

  function attachPageObservers() { if (state.observer) state.observer.disconnect(); state.observer = new MutationObserver((mutations) => { scheduleVisibleTraderQuoteCapture(); if (mutations.every(isOwnedMutation)) return; scheduleEvaluation(); }); state.observer.observe(document.documentElement, { childList: true, subtree: true }); if (!state.listenersAttached) { const originalPushState = history.pushState; const originalReplaceState = history.replaceState; history.pushState = function (...args) { const value = originalPushState.apply(this, args); setTimeout(handleRouteChange, 0); return value; }; history.replaceState = function (...args) { const value = originalReplaceState.apply(this, args); setTimeout(handleRouteChange, 0); return value; }; window.addEventListener('popstate', handleRouteChange); document.addEventListener('pointerdown', beginPillDrag); document.addEventListener('pointermove', movePillDrag, { passive: false }); document.addEventListener('pointerup', endPillDrag); document.addEventListener('pointercancel', cancelPillDrag); window.addEventListener('resize', reclampCollapsedPill); document.addEventListener('click', handleCardClick); document.addEventListener('submit', handleOwnedSubmit); state.listenersAttached = true; } }
  function initWeav3rArbitrageHelper() { readSettings(); loadWatchlist(); state.itemId = getCurrentItemId(); state.routeGeneration += 1; state.sourceProgress = emptySourceProgress(); state.cachedData = loadCachedItemData(state.itemId); renderStatusCard({ status: 'LOADING', messages: ['Waiting for Weav3r tables...'] }); attachPageObservers(); captureVisibleWeav3rTraderQuotes(); evaluateCurrentPage(); }
  function getPricelistTraderId() { const match = location.pathname.match(/^\/pricelist\/(\d+)/i); const traderId = match ? normalizePositiveInt(match[1]) : null; if (traderId) logDebug('pricelist Trader ID resolved.', traderId); return traderId; }
  function normalizeCssColor(value) {
    const text = normalizeBoundedText(value, 80).toLowerCase();
    if (!text || /^var\(/i.test(text)) return '';
    const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) { const raw = hex[1].length === 3 ? hex[1].split('').map((char) => char + char).join('') : hex[1]; return `#${raw.toLowerCase()}`; }
    const rgb = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
    if (!rgb) return '';
    const parts = rgb.slice(1, 4).map((part) => Number(part));
    const alpha = rgb[4] == null ? 1 : Number(rgb[4]);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255) || !Number.isFinite(alpha) || alpha <= 0) return '';
    return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  }
  function getRatingSvgStroke(svg) { if (!svg) return { raw: '', computed: '', normalized: '' }; const raw = svg.getAttribute('stroke') || ''; let computed = ''; try { computed = getComputedStyle(svg).stroke || ''; } catch (_) { computed = ''; } return { raw, computed, normalized: normalizeCssColor(raw) || normalizeCssColor(computed) }; }
  function isPositiveRatingStroke(stroke) { return normalizeCssColor(stroke) === '#22c55e'; }
  function isNegativeRatingStroke(stroke) { return normalizeCssColor(stroke) === '#ef4444'; }
  function resolvePersonalRatingFromPricelist(root = document) {
    const containers = Array.from(root.querySelectorAll('[title="Pricelist rating"]'));
    if (containers.length !== 1) { logDebug('ambiguous rating state ignored.', { containers: containers.length }); return { state: 'unknown', confidence: 'ambiguous' }; }
    const container = containers[0];
    logDebug('rating container found.');
    const upvote = container.querySelector('button[aria-label="Upvote"]');
    const downvote = container.querySelector('button[aria-label="Downvote"]');
    const upvoteSvg = upvote?.querySelector('svg');
    const downvoteSvg = downvote?.querySelector('svg');
    if (!upvote || !downvote || !upvoteSvg || !downvoteSvg) { logDebug('ambiguous rating state ignored.', 'missing rating controls.'); return { state: 'unknown', confidence: 'ambiguous' }; }
    const upvoteStroke = getRatingSvgStroke(upvoteSvg);
    const downvoteStroke = getRatingSvgStroke(downvoteSvg);
    logDebug('raw Upvote stroke.', upvoteStroke.raw || upvoteStroke.computed);
    logDebug('raw Downvote stroke.', downvoteStroke.raw || downvoteStroke.computed);
    logDebug('normalized Upvote stroke.', upvoteStroke.normalized);
    logDebug('normalized Downvote stroke.', downvoteStroke.normalized);
    const upvoteGreen = isPositiveRatingStroke(upvoteStroke.normalized);
    const downvoteRed = isNegativeRatingStroke(downvoteStroke.normalized);
    if (upvoteGreen && !downvoteRed) { logDebug('positive state detected.'); return { state: 'positive', confidence: 'decisive' }; }
    if (downvoteRed && !upvoteGreen) { logDebug('negative state detected.'); return { state: 'negative', confidence: 'decisive' }; }
    logDebug('ambiguous rating state ignored.', { upvoteGreen, downvoteRed });
    return { state: 'unknown', confidence: 'ambiguous' };
  }
  function persistPricelistRatingObservation(traderId, traderName = '') { const observation = resolvePersonalRatingFromPricelist(); if (observation.confidence !== 'decisive') return; const previous = getTraderPersonalRatingRecord(traderId); const record = mergeTraderPersonalRating({ traderId, traderName, state: observation.state, observedAt: Date.now(), source: 'weav3r-pricelist' }); if (record && previous?.state !== record.state) { logDebug('personal-rating cache updated.', record); showTornStatus(record.state === 'positive' ? 'Weav3r: Personal Trader rating recorded as positive.' : 'Weav3r: Personal Trader rating recorded as negative.'); } }
  function schedulePricelistRatingCapture(traderId) { tornState.pricelistRetryTimers.forEach(clearTimeout); tornState.pricelistRetryTimers = [0, 200, 800].map((delay) => setTimeout(() => requestAnimationFrame(() => persistPricelistRatingObservation(traderId, document.querySelector('h1,h2')?.textContent || '')), delay)); }
  function initWeav3rPricelistRatingCapture() { const traderId = getPricelistTraderId(); if (!traderId) return; addTornHandoffStyles(); schedulePricelistRatingCapture(traderId); const ratingContainer = document.querySelector('[title="Pricelist rating"]'); const root = ratingContainer?.parentElement || document.querySelector('main') || document.body; if (!root) return; tornState.pricelistObserver?.disconnect(); tornState.pricelistObserver = new MutationObserver(() => schedulePricelistRatingCapture(traderId)); tornState.pricelistObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['stroke', 'style'] }); const stopObserver = () => { tornState.pricelistObserver?.disconnect(); tornState.pricelistRetryTimers.forEach(clearTimeout); }; setTimeout(stopObserver, 5000); window.addEventListener('beforeunload', stopObserver, { once: true }); }
  function handleRatingStorageChanged() { if (location.hostname === 'weav3r.dev' && location.pathname.startsWith('/item/')) { recalculateWatchlistResults(); renderComputedResult(false); } else if (location.hostname === 'www.torn.com' && location.pathname === '/trade.php') { const handoff = readTradeHandoff(); const route = parseTradeHash(); if (handoff && route.step === 'start' && getTraderPersonalRatingRecord(handoff.traderId)?.state === 'negative') processTornTradeHandoff(); processTradeVerificationForRoute(route); } else if (location.hostname === 'www.torn.com' && location.pathname === '/item.php') scheduleTornInventoryBasisRefresh(); }
  function attachRatingChangeListener() { if (state.ratingChangeListenerId || typeof GM_addValueChangeListener !== 'function') return; state.ratingChangeListenerId = GM_addValueChangeListener(TRADER_PERSONAL_RATINGS_KEY, handleRatingStorageChanged); window.addEventListener('focus', handleRatingStorageChanged); document.addEventListener('visibilitychange', () => { if (!document.hidden) handleRatingStorageChanged(); }); window.addEventListener('beforeunload', () => { if (state.ratingChangeListenerId && typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(state.ratingChangeListenerId); state.ratingChangeListenerId = null; }, { once: true }); }

  function normalizeInventoryIdentityText(value) { return normalizeBoundedText(value, 150).toLowerCase(); }
  function parseTornInventoryRow(row) {
    if (!row?.matches?.('li[data-item][data-rowkey]')) return null;
    const itemId = normalizePositiveInt(row.dataset?.item); const itemName = normalizeBoundedText(row.dataset?.sort, 150); const rowKey = normalizeBoundedText(row.dataset?.rowkey, 120); const armoryId = normalizeBoundedText(row.dataset?.armoryid, 40); const group = normalizeBoundedText(row.dataset?.group, 20).toLowerCase();
    if (!itemId || !itemName || !rowKey) return null;
    const instanceKey = armoryId && rowKey === `u${armoryId}` ? armoryId : null; if (armoryId && !instanceKey) return null; if (!instanceKey && rowKey !== `g${itemId}`) return null;
    const imageIds = new Set(Array.from(row.querySelectorAll?.('img[src*="/images/items/"],img[srcset*="/images/items/"]') || []).flatMap((image) => [image.getAttribute?.('src'), image.getAttribute?.('srcset')]).filter(Boolean).flatMap((source) => Array.from(String(source).matchAll(/\/images\/items\/(\d+)\//g), (match) => normalizePositiveInt(match[1])).filter(Boolean))); if (imageIds.size && (imageIds.size !== 1 || !imageIds.has(itemId))) return null;
    const names = [row.querySelector?.('.title-wrap .name')?.textContent, ...Array.from(row.querySelectorAll?.('img[alt]') || []).map((image) => image.getAttribute('alt')), ...Array.from(row.querySelectorAll?.('.thumbnail-wrap[aria-label]') || []).map((node) => node.getAttribute('aria-label'))].map((value) => normalizeInventoryIdentityText(value)).filter(Boolean); if (names.some((name) => name !== normalizeInventoryIdentityText(itemName))) return null;
    const isGroupParent = group === 'parent'; const isGroupChild = group === 'item' && Boolean(instanceKey); const rawQuantity = normalizePositiveInt(row.dataset?.qty); const quantity = instanceKey ? 1 : rawQuantity; if (!quantity) return null;
    return { itemId, itemName, category: normalizeBoundedText(row.dataset?.category, 80) || '', quantity, rowKey, instanceKey, groupKey: isGroupParent || isGroupChild ? `g${itemId}` : null, groupState: isGroupParent ? 'closed-parent' : isGroupChild ? 'open-child' : instanceKey ? 'instance' : 'stack', isGroupParent, isGroupChild, sourceRow: row };
  }
  function scanTornInventoryList(container) {
    const sourceRows = Array.from(container?.querySelectorAll?.(':scope > li[data-item][data-rowkey]') || []); const parsedRows = sourceRows.map(parseTornInventoryRow); const rows = parsedRows.filter(Boolean); const groups = [];
    for (let index = 0; index < parsedRows.length;) { const row = parsedRows[index]; if (!row) { index += 1; continue; } if (row.isGroupParent) { groups.push({ groupKey: row.groupKey, itemId: row.itemId, state: 'closed', rowKeys: [row.rowKey], totalQuantity: row.quantity }); index += 1; continue; } if (row.isGroupChild) { const block = []; let cursor = index; while (cursor < parsedRows.length && parsedRows[cursor]?.isGroupChild && parsedRows[cursor].itemId === row.itemId && parsedRows[cursor].groupKey === row.groupKey) block.push(parsedRows[cursor++]); groups.push({ groupKey: row.groupKey, itemId: row.itemId, state: 'open', rowKeys: block.map((entry) => entry.rowKey), totalQuantity: block.length }); index = cursor; continue; } index += 1; }
    return { rows, groups, totalQuantity: rows.reduce((total, row) => total + row.quantity, 0) };
  }
  function resolveItemLineAcquisitionCost(event, line) {
    if (line?.direction !== 'in') return null;
    const totalPrice = line.totalPrice == null ? null : normalizeMoneyString(line.totalPrice, true); if (totalPrice != null) return totalPrice;
    const unitPrice = line.unitPrice == null ? null : normalizeMoneyString(line.unitPrice, true); if (unitPrice != null) return (BigInt(unitPrice) * BigInt(line.quantity)).toString();
    if (event?.itemLines?.length === 1 && event.cash?.direction === 'out') return normalizeMoneyString(event.cash.amount, true);
    return null;
  }
  function aggregateItemBasisEvents(events) {
    const aggregates = new Map();
    for (const event of events || []) {
      if (event?.schemaVersion !== 2 || event.confidence !== 'confirmed' || !Array.isArray(event.itemLines)) continue;
      for (const line of event.itemLines) {
        const itemId = normalizePositiveInt(line?.itemId); const quantity = normalizePositiveInt(line?.quantity); if (!itemId || !quantity || !['in', 'out'].includes(line.direction)) continue;
        const aggregate = aggregates.get(itemId) || { itemId, confirmedInboundQuantity: 0, confirmedOutboundQuantity: 0, knownPurchaseQuantity: 0, knownPurchaseCost: 0n };
        if (line.direction === 'in') {
          aggregate.confirmedInboundQuantity += quantity;
          const cost = resolveItemLineAcquisitionCost(event, line); if (cost != null) { aggregate.knownPurchaseQuantity += quantity; aggregate.knownPurchaseCost += BigInt(cost); }
        } else aggregate.confirmedOutboundQuantity += quantity;
        aggregates.set(itemId, aggregate);
      }
    }
    return aggregates;
  }
  function formatItemBasisAverage(cost, quantity) {
    const count = normalizePositiveInt(quantity); if (!count) return null;
    const total = typeof cost === 'bigint' ? cost : BigInt(normalizeMoneyString(cost)); const divisor = BigInt(count); const whole = total / divisor; const remainder = total % divisor;
    if (remainder === 0n) return { exact: true, amount: whole.toString(), display: formatLedgerMoney(whole.toString()) };
    const roundedCents = (total * 100n + divisor / 2n) / divisor; const dollars = roundedCents / 100n; const cents = (roundedCents % 100n).toString().padStart(2, '0'); return { exact: false, amount: null, display: `≈ $${dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}` };
  }
  function greatestCommonDivisor(left, right) { let a = left < 0n ? -left : left; let b = right < 0n ? -right : right; while (b) { const remainder = a % b; a = b; b = remainder; } return a || 1n; }
  function makeBigIntRatio(numerator, denominator = 1n) { let top = BigInt(numerator); let bottom = BigInt(denominator); if (bottom === 0n) return null; if (bottom < 0n) { top = -top; bottom = -bottom; } const divisor = greatestCommonDivisor(top, bottom); return { numerator: (top / divisor).toString(), denominator: (bottom / divisor).toString() }; }
  function subtractBigIntRatios(left, right) { const leftTop = BigInt(left.numerator); const leftBottom = BigInt(left.denominator); const rightTop = BigInt(right.numerator); const rightBottom = BigInt(right.denominator); return makeBigIntRatio(leftTop * rightBottom - rightTop * leftBottom, leftBottom * rightBottom); }
  function roundBigIntRatio(numerator, denominator) { const top = BigInt(numerator); const bottom = BigInt(denominator); const negative = top < 0n; const absolute = negative ? -top : top; const rounded = (absolute + bottom / 2n) / bottom; return negative ? -rounded : rounded; }
  function formatBigIntRatioMoney(ratio, signed = false) { if (!ratio) return '—'; const top = BigInt(ratio.numerator); const bottom = BigInt(ratio.denominator); if (top % bottom === 0n) return formatLedgerMoney((top / bottom).toString(), signed); const cents = roundBigIntRatio(top * 100n, bottom); const negative = cents < 0n; const absolute = negative ? -cents : cents; const dollars = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); const fraction = (absolute % 100n).toString().padStart(2, '0'); return `${negative ? '-' : signed && cents > 0n ? '+' : ''}$${dollars}.${fraction}`; }
  function formatInventoryRoi(ratio) { if (!ratio) return 'n. v.'; const hundredths = roundBigIntRatio(BigInt(ratio.numerator) * 100n, BigInt(ratio.denominator)); const negative = hundredths < 0n; const absolute = negative ? -hundredths : hundredths; return `${negative ? '-' : hundredths > 0n ? '+' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')} %`; }
  function buildItemBasisSummary(itemId, currentQuantity, aggregates) {
    const normalizedItemId = normalizePositiveInt(itemId); const current = normalizePositiveInt(currentQuantity); if (!normalizedItemId || !current) return null;
    const aggregate = aggregates?.get?.(normalizedItemId) || { confirmedInboundQuantity: 0, confirmedOutboundQuantity: 0, knownPurchaseQuantity: 0, knownPurchaseCost: 0n };
    const trackedNetQuantity = aggregate.confirmedInboundQuantity - aggregate.confirmedOutboundQuantity; let reconstructionStatus;
    if (trackedNetQuantity < 0 || trackedNetQuantity > current) reconstructionStatus = 'divergent'; else if (trackedNetQuantity === current) reconstructionStatus = 'full'; else if (trackedNetQuantity === 0) reconstructionStatus = 'untracked'; else reconstructionStatus = 'partial';
    const knownPurchaseCost = aggregate.knownPurchaseCost.toString(); const weightedConfirmedPurchasePrice = formatItemBasisAverage(aggregate.knownPurchaseCost, aggregate.knownPurchaseQuantity); const allInboundCostsKnown = aggregate.confirmedInboundQuantity > 0 && aggregate.knownPurchaseQuantity === aggregate.confirmedInboundQuantity; const reconstructable = ['full', 'partial'].includes(reconstructionStatus); const knownLotsCertainlyRemain = reconstructable && aggregate.confirmedOutboundQuantity === 0 && aggregate.knownPurchaseQuantity > 0; const costCoveredQuantity = allInboundCostsKnown && reconstructable ? trackedNetQuantity : knownLotsCertainlyRemain ? aggregate.knownPurchaseQuantity : 0; const currentCostBasis = !costCoveredQuantity ? null : allInboundCostsKnown ? makeBigIntRatio(aggregate.knownPurchaseCost * BigInt(trackedNetQuantity), BigInt(aggregate.knownPurchaseQuantity)) : makeBigIntRatio(aggregate.knownPurchaseCost); const costBasisStatus = reconstructionStatus === 'divergent' ? 'divergent' : reconstructionStatus === 'untracked' ? 'untracked' : !currentCostBasis ? 'unknown-cost' : costCoveredQuantity === current ? 'full' : 'partial';
    return { itemId: normalizedItemId, currentQuantity: current, confirmedInboundQuantity: aggregate.confirmedInboundQuantity, confirmedOutboundQuantity: aggregate.confirmedOutboundQuantity, trackedNetQuantity, coveredQuantity: currentCostBasis ? costCoveredQuantity : null, unknownQuantity: reconstructionStatus === 'partial' || reconstructionStatus === 'untracked' ? current - Math.max(0, trackedNetQuantity) : 0, knownPurchaseQuantity: aggregate.knownPurchaseQuantity, knownPurchaseCost, weightedConfirmedPurchasePrice, allInboundCostsKnown, currentCostBasis, costBasisStatus, reconstructionStatus };
  }
  function buildTornInventoryBasisBlocks(scan) {
    const groupByFirstRow = new Map((scan?.groups || []).map((group) => [group.rowKeys[0], group])); const groupedRows = new Set((scan?.groups || []).flatMap((group) => group.rowKeys)); const blocks = [];
    for (const model of scan?.rows || []) { const group = groupByFirstRow.get(model.rowKey); if (group) blocks.push({ model, currentQuantity: group.totalQuantity, rowKeys: group.rowKeys.slice() }); else if (!groupedRows.has(model.rowKey)) blocks.push({ model, currentQuantity: model.quantity, rowKeys: [model.rowKey] }); }
    return blocks;
  }
  function indexLatestTraderQuotes(collection = readTraderQuotes()) {
    const latestByTraderItem = new Map();
    for (const quote of Object.values(collection.records || {})) { const key = `${quote.itemId}:${quote.traderId}`; const previous = latestByTraderItem.get(key); if (!previous || quote.lastSeenAt > previous.lastSeenAt || (quote.lastSeenAt === previous.lastSeenAt && quote.observedAt > previous.observedAt)) latestByTraderItem.set(key, quote); }
    const byItem = new Map(); for (const quote of latestByTraderItem.values()) { const quotes = byItem.get(quote.itemId) || []; quotes.push(quote); byItem.set(quote.itemId, quotes); } return byItem;
  }
  function getStoredTraderQuoteEligibility(quote, minimumTraderRating, now = Date.now(), personalRatings = null) {
    const base = { traderId: quote.traderId, rating: quote.traderRatingAtObservation, lastSeenAt: quote.traderActivityLastSeenAt }; const personal = personalRatings?.[String(quote.traderId)]; const trader = personalRatings ? { ...base, personalRatingState: personal?.state || 'unknown', personalRatingObservedAt: personal?.observedAt || null } : applyPersonalRatingToTrader(base); let result; let reason; if (!isTraderPersonallyAcceptable(trader)) { result = 'ineligible'; reason = 'negative-personal-rating'; } else if (trader.rating < minimumTraderRating) { result = 'ineligible'; reason = 'rating-below-minimum'; } else if (now - quote.lastSeenAt > TRADER_CACHE_MS) { result = 'unknown'; reason = 'quote-not-recently-observed'; } else { result = getTrustedTraderEligibility(trader, minimumTraderRating, now); reason = result === 'eligible' ? 'rating-and-activity-eligible' : result === 'ineligible' ? trader.rating < minimumTraderRating ? 'rating-below-minimum' : 'activity-ineligible' : 'activity-unknown'; } logDebug('trader-eligibility-evaluated', { traderId: quote.traderId, quoteAge: Math.max(0, now - quote.lastSeenAt), rating: trader.rating, activity: quote.traderActivityTextAtObservation, personalRatingState: trader.personalRatingState, result, reason }); return result;
  }
  function compareCurrentTraderQuotes(left, right) { const price = BigInt(left.quote.price) - BigInt(right.quote.price); if (price) return price > 0n ? -1 : 1; const rating = (right.quote.traderRatingAtObservation ?? -Infinity) - (left.quote.traderRatingAtObservation ?? -Infinity); return rating || left.quote.traderId - right.quote.traderId; }
  function resolveInventoryTraderQuote(itemId, quoteIndex, minimumTraderRating, now = Date.now(), personalRatings = null) {
    logDebug('inventory-trader-resolve-start', { itemId }); const quotes = quoteIndex?.get?.(normalizePositiveInt(itemId)) || []; logDebug('inventory-trader-quotes-found', { itemId, totalQuotesForItem: quotes.length, newestPerTraderCount: new Set(quotes.map((quote) => quote.traderId)).size }); if (!quotes.length) { const result = { status: 'unavailable', quote: null, reason: 'no-quotes' }; logDebug('inventory-trader-resolved', { status: result.status, selectedTrader: null, unitPrice: null, reason: result.reason }); return result; }
    const classified = quotes.map((quote) => ({ quote, eligibility: getStoredTraderQuoteEligibility(quote, minimumTraderRating, now, personalRatings) })); const eligible = classified.filter((entry) => entry.eligibility === 'eligible').sort(compareCurrentTraderQuotes); if (eligible.length) { const result = { status: 'eligible', ...eligible[0], reason: null }; logDebug('inventory-trader-resolved', { status: result.status, selectedTrader: result.quote.traderName, unitPrice: result.quote.price, reason: null }); return result; }
    const unknown = classified.filter((entry) => entry.eligibility === 'unknown').sort((left, right) => right.quote.lastSeenAt - left.quote.lastSeenAt || right.quote.observedAt - left.quote.observedAt || left.quote.traderId - right.quote.traderId); const result = unknown.length ? { status: 'unverified', ...unknown[0], reason: 'current-status-unverified' } : { status: 'unavailable', quote: null, reason: 'all-quotes-ineligible' }; logDebug('inventory-trader-resolved', { status: result.status, selectedTrader: result.quote?.traderName || null, unitPrice: result.quote?.price || null, reason: result.reason }); return result;
  }
  function buildInventoryTraderValuation(result, currentQuantity) { const quantity = normalizePositiveInt(currentQuantity); const price = normalizeMoneyString(result?.quote?.price); if (!quantity || !price || !['eligible', 'unverified'].includes(result?.status)) return { ...result, quantity, unitPrice: null, totalPrice: null }; return { ...result, quantity, unitPrice: price, totalPrice: (BigInt(price) * BigInt(quantity)).toString() }; }
  function formatStoredQuoteAge(timestamp, now = Date.now()) { const age = Math.max(0, now - Number(timestamp)); const units = age < 60 * 60 * 1000 ? [60 * 1000, 'Min.', 'Min.'] : age < 24 * 60 * 60 * 1000 ? [60 * 60 * 1000, 'Std.', 'Std.'] : age < 60 * 24 * 60 * 60 * 1000 ? [24 * 60 * 60 * 1000, 'Tag', 'Tagen'] : [30 * 24 * 60 * 60 * 1000, 'Monat', 'Monaten']; const count = Math.max(1, Math.floor(age / units[0])); return `vor ${count} ${count === 1 ? units[1] : units[2]}`; }
  function renderTornInventoryTrader(block, result, now = Date.now()) {
    const row = block?.model?.sourceRow; if (!row) return null; let node = row.querySelector?.(':scope [data-wah-item-trader]'); const host = row.querySelector?.('.title-wrap') || row.querySelector?.('.name-wrap'); if (!host) return null; if (!node) { node = document.createElement('span'); node.className = 'wah-item-trader'; node.dataset.wahItemTrader = String(block.model.itemId); host.appendChild(node); }
    const valuation = buildInventoryTraderValuation(result, block.currentQuantity); if (!valuation.unitPrice) node.textContent = 'Trader n. v.'; else { const prefix = valuation.status === 'eligible' ? 'Trader' : 'Gespeicherter Trader'; const total = valuation.quantity === 1 ? '' : ` · ${formatLedgerMoney(valuation.totalPrice)} gesamt`; node.textContent = `${prefix} ${valuation.quote.traderName} · ${formatLedgerMoney(valuation.unitPrice)} / Stk.${total} · ${formatStoredQuoteAge(valuation.quote.lastSeenAt, now)}`; }
    node.title = valuation.status === 'eligible' ? `Aktuell anhand der zuletzt sicher beobachteten Weav3r-Daten eligible. Item-ID-basierter Traderpreis; keine Aussage zum Wert einer konkreten Instanz. Quote ${formatStoredQuoteAge(valuation.quote.lastSeenAt, now)} gesehen.` : valuation.status === 'unverified' ? `Gespeicherter sicherer Weav3r-Traderpreis. Aktueller Eligibility-Status ist nicht geprüft; dies ist nicht als aktuell bester Trader zu verstehen. Item-ID-basierte Quote ${formatStoredQuoteAge(valuation.quote.lastSeenAt, now)} gesehen.` : 'Keine aktuell geeignete oder sicher als Fallback darstellbare Trader-Quote verfügbar.'; return node;
  }
  function renderTornInventoryBasis(block, summary) {
    const row = block?.model?.sourceRow; if (!row || !summary) return null; let basis = row.querySelector?.(':scope [data-wah-item-basis]'); const host = row.querySelector?.('.title-wrap') || row.querySelector?.('.name-wrap'); if (!host) return null;
    if (!basis) { basis = document.createElement('span'); basis.className = 'wah-item-basis'; basis.dataset.wahItemBasis = String(summary.itemId); host.appendChild(basis); }
    const average = summary.weightedConfirmedPurchasePrice?.display || '—';
    if (summary.reconstructionStatus === 'divergent') basis.textContent = 'Basis · Bestand nicht vollständig rekonstruierbar';
    else if (summary.reconstructionStatus === 'untracked') basis.textContent = 'Basis · Keine bestätigte Kaufbasis';
    else basis.textContent = `Basis · ${summary.trackedNetQuantity} / ${summary.currentQuantity} getrackt · Ø Kauf ${average} · Restbasis ${summary.currentCostBasis ? formatBigIntRatioMoney(summary.currentCostBasis) : 'n. v.'}`;
    basis.title = `Item-ID-basierte Auswertung aus bestätigten Weav3r-Arbitrage-Helper-Transaktionen. Die Restbasis verwendet nur sicher zuordenbare Kosten; nach Outbounds wird bei vollständig bekannten Inbound-Kosten eine exakte rationale WAC-Restbestandsrechnung verwendet. Andere Bestandsänderungen können nicht vollständig erfasst sein.${summary.knownPurchaseQuantity < summary.confirmedInboundQuantity ? ' Nicht alle bestätigten Eingänge besitzen einen eindeutig zuordenbaren Preis.' : ''}`;
    return basis;
  }
  function buildInventoryBazaarValuation(result, currentQuantity) {
    const quantity = normalizePositiveInt(currentQuantity); if (!quantity || !result) return { status: 'unavailable', quantity, recommendedUnitPrice: null, recommendedTotal: null, reason: 'invalid-input' };
    if (result.status !== 'available' || !normalizeMoneyString(result.recommendedUnitPrice)) return { ...result, quantity, recommendedUnitPrice: null, recommendedTotal: null };
    const recommendedUnitPrice = normalizeMoneyString(result.recommendedUnitPrice); return { ...result, quantity, recommendedUnitPrice, recommendedTotal: (BigInt(recommendedUnitPrice) * BigInt(quantity)).toString() };
  }
  function resolveInventoryBestSale(bazaarResult, traderResult, currentQuantity) {
    const quantity = normalizePositiveInt(currentQuantity); const unavailable = (reason) => ({ status: 'unavailable', channel: 'unavailable', unitPrice: null, totalValue: null, quantity, trader: null, verification: 'none', freshness: null, reason });
    if (!quantity) return unavailable('invalid-quantity');
    const bazaar = buildInventoryBazaarValuation(bazaarResult, quantity); const trader = buildInventoryTraderValuation(traderResult, quantity); const candidates = [];
    if (bazaar.status === 'available' && bazaar.recommendedUnitPrice) candidates.push({ status: 'available', channel: 'bazaar', unitPrice: bazaar.recommendedUnitPrice, totalValue: bazaar.recommendedTotal, quantity, trader: null, verification: 'verified', freshness: bazaar.fetchedAt || null, reason: 'safe-bazaar-recommendation' });
    if (trader.status === 'eligible' && trader.unitPrice) candidates.push({ status: 'available', channel: 'trader', unitPrice: trader.unitPrice, totalValue: trader.totalPrice, quantity, trader: { traderId: trader.quote.traderId || null, traderName: trader.quote.traderName, quoteLastSeenAt: trader.quote.lastSeenAt }, verification: 'verified', freshness: trader.quote.lastSeenAt || null, reason: 'eligible-trader-quote' });
    candidates.sort((left, right) => { const difference = BigInt(right.unitPrice) - BigInt(left.unitPrice); if (difference) return difference > 0n ? 1 : -1; return left.channel === right.channel ? 0 : left.channel === 'bazaar' ? -1 : 1; });
    if (candidates.length) return candidates[0];
    if (trader.status === 'unverified' && trader.unitPrice) return { status: 'fallback', channel: 'stored-trader', unitPrice: trader.unitPrice, totalValue: trader.totalPrice, quantity, trader: { traderId: trader.quote.traderId || null, traderName: trader.quote.traderName, quoteLastSeenAt: trader.quote.lastSeenAt }, verification: 'unverified', freshness: trader.quote.lastSeenAt || null, reason: trader.reason || 'current-status-unverified' };
    return unavailable(bazaar.status === 'loading' ? 'pricing-loading' : 'no-verified-sale-channel');
  }
  function resolveInventoryPotentialProfit(input) {
    const { basisSummary, bestSaleResult, quantity } = input || {};
    const currentQuantity = normalizePositiveInt(quantity ?? basisSummary?.currentQuantity); const unavailable = (reason, coveredQuantity = 0) => ({ status: 'unavailable', coveredQuantity, currentQuantity, knownCurrentCostBasis: null, coveredSaleValue: null, potentialProfit: null, roi: null, saleChannel: null, reason });
    if (!currentQuantity || !basisSummary || currentQuantity !== basisSummary.currentQuantity) return unavailable('invalid-input');
    if (basisSummary.reconstructionStatus === 'divergent') return unavailable('divergent-inventory');
    if (basisSummary.reconstructionStatus === 'untracked' || basisSummary.trackedNetQuantity <= 0) return unavailable('no-confirmed-basis');
    if (!basisSummary.currentCostBasis) return unavailable('acquisition-cost-not-assignable');
    const coveredQuantity = normalizePositiveInt(basisSummary.coveredQuantity); if (!coveredQuantity || coveredQuantity > currentQuantity || coveredQuantity > basisSummary.trackedNetQuantity) return unavailable('unsafe-covered-quantity');
    if (bestSaleResult?.status !== 'available' || bestSaleResult.verification !== 'verified' || !['bazaar', 'trader'].includes(bestSaleResult.channel) || !normalizeMoneyString(bestSaleResult.unitPrice)) return unavailable('no-verified-best-sale', coveredQuantity);
    const knownCurrentCostBasis = makeBigIntRatio(basisSummary.currentCostBasis.numerator, basisSummary.currentCostBasis.denominator); const coveredSaleValue = makeBigIntRatio(BigInt(bestSaleResult.unitPrice) * BigInt(coveredQuantity)); const potentialProfit = subtractBigIntRatios(coveredSaleValue, knownCurrentCostBasis); const costNumerator = BigInt(knownCurrentCostBasis.numerator); const roi = costNumerator === 0n ? null : makeBigIntRatio(BigInt(potentialProfit.numerator) * BigInt(knownCurrentCostBasis.denominator) * 100n, BigInt(potentialProfit.denominator) * costNumerator);
    return { status: coveredQuantity === currentQuantity ? 'full' : 'partial', coveredQuantity, currentQuantity, knownCurrentCostBasis, coveredSaleValue, potentialProfit, roi, saleChannel: bestSaleResult.channel, reason: costNumerator === 0n ? 'zero-cost-basis' : null };
  }
  function inventoryProfitUnavailableReason(reason) { return ({ 'invalid-input': 'Ungültige Bestandsdaten.', 'divergent-inventory': 'Bestand nicht vollständig rekonstruierbar.', 'no-confirmed-basis': 'Keine bestätigte Kaufbasis.', 'acquisition-cost-not-assignable': 'Einkaufskosten nicht sicher dem Restbestand zuordenbar.', 'unsafe-covered-quantity': 'Kostenmäßig bekannte Bestandsmenge nicht sicher bestimmbar.', 'no-verified-best-sale': 'Kein aktuell verifizierter Verkaufswert.' })[reason] || 'Potentieller Bruttogewinn nicht sicher bestimmbar.'; }
  function renderTornInventoryProfit(block, result) {
    const row = block?.model?.sourceRow; if (!row) return null; let node = row.querySelector?.(':scope [data-wah-item-profit]'); const host = row.querySelector?.('.title-wrap') || row.querySelector?.('.name-wrap'); if (!host) return null;
    if (!node) { node = document.createElement('span'); node.className = 'wah-item-profit'; node.dataset.wahItemProfit = String(block.model.itemId); host.appendChild(node); }
    if (!['full', 'partial'].includes(result.status)) node.textContent = 'Profit n. v.'; else { const coverage = result.status === 'partial' ? ` auf ${result.coveredQuantity}/${result.currentQuantity}` : ` · ${result.coveredQuantity}/${result.currentQuantity} Stück`; node.textContent = `Profit ${formatBigIntRatioMoney(result.potentialProfit, true)}${coverage} · ROI ${formatInventoryRoi(result.roi)}`; }
    node.title = ['full', 'partial'].includes(result.status) ? `Potentieller Bruttogewinn auf Basis bestätigter Einkaufskosten und des aktuell verifizierten Best-Sale-Werts. Unbekannte Bestandsanteile werden nicht einbezogen. Item-ID-basierte WAC-Restbasis; keine Aussage zur konkreten Instanz. Keine Verkaufsgebühren berücksichtigt.${result.roi ? '' : ' ROI ist bei einer bestätigten Kostenbasis von $0 nicht verfügbar.'}` : `${inventoryProfitUnavailableReason(result.reason)} Kein realisierter oder garantierter Gewinn.`;
    return node;
  }
  function renderTornInventoryBestSale(block, result, now = Date.now()) {
    const row = block?.model?.sourceRow; if (!row) return null; let node = row.querySelector?.(':scope [data-wah-item-best-sale]'); const host = row.querySelector?.('.title-wrap') || row.querySelector?.('.name-wrap'); if (!host) return null;
    if (!node) { node = document.createElement('span'); node.className = 'wah-item-best-sale'; node.dataset.wahItemBestSale = String(block.model.itemId); host.appendChild(node); }
    if (result.channel === 'stored-trader') node.textContent = `Gespeichert: ${result.trader.traderName} · ${formatLedgerMoney(result.unitPrice)}/Stk. · ${formatLedgerMoney(result.totalValue)} gesamt`;
    else if (result.status !== 'available') node.textContent = 'Best Sale: n. v.';
    else { const label = result.channel === 'bazaar' ? 'Bazaar' : result.trader.traderName; node.textContent = `Best Sale: ${label} · ${formatLedgerMoney(result.unitPrice)}/Stk. · ${formatLedgerMoney(result.totalValue)} gesamt`; }
    node.title = result.channel === 'stored-trader' ? `Gespeicherter Trader-Quote (${formatStoredQuoteAge(result.freshness, now)}), dessen aktuelle Eligibility nicht verifiziert ist. Keine Behauptung, dass der Trader ihn noch annimmt. Möglicher Bruttowert, kein garantierter Erlös.` : result.status === 'available' ? `Aktuell sicher bewerteter Verkaufsweg (${result.channel === 'bazaar' ? 'Bazaar-Preisempfehlung' : 'eligible Trader'}). Möglicher Bruttowert, kein garantierter Erlös.` : 'Kein aktuell sicher bewerteter Verkaufsweg verfügbar. Bruttowert und Erlös werden nicht geschätzt.';
    return node;
  }
  function renderTornInventoryBazaar(block, result, storedValuation = null, now = Date.now()) {
    const row = block?.model?.sourceRow; if (!row) return null; let node = row.querySelector?.(':scope [data-wah-item-bazaar]'); const host = row.querySelector?.('.title-wrap') || row.querySelector?.('.name-wrap'); if (!host) return null;
    if (!node) { node = document.createElement('span'); node.className = 'wah-item-bazaar'; node.dataset.wahItemBazaar = String(block.model.itemId); host.appendChild(node); }
    const valuation = buildInventoryBazaarValuation(result, block.currentQuantity);
    if (valuation.status !== 'available' && storedValuation?.status === 'sort-available') node.textContent = `Gespeichert: Bazaar ${formatLedgerMoney(storedValuation.recommendedUnitPrice)} · ${formatStoredQuoteAge(storedValuation.lastSeenAt, now)}`; else if (valuation.status === 'loading') node.textContent = 'Bazaar …'; else if (valuation.status !== 'available') node.textContent = 'Bazaar n. v.'; else node.textContent = valuation.quantity === 1 ? `Bazaar ${formatLedgerMoney(valuation.recommendedUnitPrice)} · aktuell` : `Bazaar ${formatLedgerMoney(valuation.recommendedUnitPrice)} / Stk. · ${formatLedgerMoney(valuation.recommendedTotal)} gesamt · aktuell`;
    node.title = valuation.status === 'available' ? `Aktuell verifizierter möglicher Brutto-Verkaufswert auf Basis der sicheren Bazaar-Preisempfehlung. Kein garantierter Verkaufserlös. Markt: ${formatLedgerMoney(valuation.marketUnitPrice)} · Anpassung: ${valuation.adjustment} · Empfehlung: ${formatLedgerMoney(valuation.recommendedUnitPrice)}.` : storedValuation?.status === 'sort-available' ? `Gespeicherte sichere Bazaar-Marktbeobachtung, ${formatStoredQuoteAge(storedValuation.lastSeenAt, now)} gesehen. Die aktuelle Preisanpassung wurde neu angewendet. Für Sortierung nutzbar, aber nicht als aktuell verifizierter Best Sale oder Profit.` : `Bazaar-Preis nicht verfügbar${valuation.reason ? ` (${valuation.reason})` : ''}. Keine Preis- oder Gewinnerwartung wird erfunden.`;
    return node;
  }
  function getActiveTornInventoryContainer(root = document) { return root.querySelector?.('.items-cont[aria-hidden="false"]') || null; }
  function getTornPageJQuery() { const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window; return pageWindow?.jQuery || pageWindow?.$ || null; }
  function getTornInventoryLoadState(container) { if (!container) return null; const dataAll = container.getAttribute?.('data-all'); const dataFromText = container.getAttribute?.('data-from'); const dataQueue = container.getAttribute?.('data-queue'); const dataFrom = /^\d+$/.test(String(dataFromText || '')) ? Number(dataFromText) : null; const rowCount = container.querySelectorAll?.(':scope > li[data-item][data-rowkey]')?.length ?? null; return { dataAll, dataFrom, dataQueue, rowCount }; }
  function abortTornInventoryFullLoad(reason) { const load = state.inventoryFullLoad; clearTimeout(load.timer); load.timer = 0; load.awaitingProgress = false; load.status = 'terminal-aborted'; load.terminalSnapshot = getTornInventoryLoadState(load.container); logDebug('inventory-full-load-abort', { reason, triggerAttempts: load.triggerAttempts, readinessRetries: load.readinessRetries, generation: load.generation }); scheduleTornInventoryBasisRefresh(); return { status: 'terminal-aborted', reason };
  }
  function scheduleTornInventoryFullLoad(delay = INVENTORY_FULL_LOAD_RETRY_MS, progressTimeout = false) { const generation = state.inventoryFullLoad.generation; clearTimeout(state.inventoryFullLoad.timer); state.inventoryFullLoad.timer = setTimeout(() => { state.inventoryFullLoad.timer = 0; if (generation !== state.inventoryFullLoad.generation) return; if (progressTimeout && state.inventoryFullLoad.awaitingProgress) { state.inventoryFullLoad.awaitingProgress = false; logDebug('inventory-full-load-state', { status: 'progress-timeout', triggerAttempts: state.inventoryFullLoad.triggerAttempts, generation }); } ensureFullTornInventoryLoaded(); }, delay); }
  function resetTornInventoryFullLoad(container, now, status = 'waiting-for-load-state') { const previous = state.inventoryFullLoad; clearTimeout(previous.timer); state.inventoryFullLoad = { container, generation: previous.generation + 1, status, triggerAttempts: 0, readinessRetries: 0, startedAt: now, awaitingProgress: false, snapshot: null, terminalSnapshot: null, timer: 0 }; return state.inventoryFullLoad; }
  function ensureFullTornInventoryLoaded(now = Date.now()) {
    if (location.pathname !== '/item.php') return { status: 'ignored' }; const container = getActiveTornInventoryContainer(document); let load = state.inventoryFullLoad;
    if (!container) { if (load.container) { logDebug('inventory-full-load-container-changed', { previousGeneration: load.generation }); load = resetTornInventoryFullLoad(null, now, 'waiting-for-container'); } else if (!load.startedAt) { load.status = 'waiting-for-container'; load.startedAt = now; } if (now - load.startedAt > INVENTORY_FULL_LOAD_MAX_DURATION_MS) return abortTornInventoryFullLoad('container-timeout'); if (load.status !== 'terminal-aborted') { load.readinessRetries += 1; logDebug('inventory-full-load-wait', { reason: 'active-container-missing' }); scheduleTornInventoryFullLoad(); } return { status: load.status, reason: 'active-container-missing' }; }
    if (load.container !== container) { if (load.container) logDebug('inventory-full-load-container-changed', { previousGeneration: load.generation }); load = resetTornInventoryFullLoad(container, now); logDebug('inventory-full-load-start', { generation: load.generation }); }
    const snapshot = getTornInventoryLoadState(container); const validLoadState = Boolean(snapshot && ['0', '1'].includes(snapshot.dataAll) && snapshot.dataFrom != null && snapshot.dataQueue); logDebug('inventory-full-load-enter', { generation: load.generation, status: load.status, dataAll: snapshot?.dataAll, dataFrom: snapshot?.dataFrom, dataQueue: snapshot?.dataQueue, rows: snapshot?.rowCount });
    if (!validLoadState) { if (now - load.startedAt > INVENTORY_FULL_LOAD_MAX_DURATION_MS) return abortTornInventoryFullLoad('load-state-timeout'); load.status = 'waiting-for-load-state'; load.readinessRetries += 1; logDebug('inventory-full-load-wait', { reason: 'container-state-not-ready' }); scheduleTornInventoryFullLoad(); return { status: 'waiting-for-load-state', reason: 'container-state-not-ready' }; }
    if (load.status === 'terminal-aborted') { const terminal = load.terminalSnapshot; const changedSinceAbort = !terminal || terminal.dataAll !== snapshot.dataAll || terminal.dataFrom !== snapshot.dataFrom || terminal.dataQueue !== snapshot.dataQueue || terminal.rowCount !== snapshot.rowCount; if (!changedSinceAbort) return { status: 'terminal-aborted', reason: 'unchanged-since-abort' }; load = resetTornInventoryFullLoad(container, now, 'ready-to-load'); logDebug('inventory-full-load-start', { generation: load.generation, recovered: true }); }
    if (snapshot.dataAll === '1') { const changed = load.status !== 'complete'; clearTimeout(load.timer); load.timer = 0; load.awaitingProgress = false; load.status = 'complete'; logDebug('inventory-full-load-complete', { ...snapshot, generation: load.generation }); if (changed) { state.inventoryValuationGeneration += 1; state.inventoryBazaarPending.clear(); resetInventoryBazaarRound(); scheduleTornInventoryBasisRefresh(); } return { status: 'complete', ...snapshot }; }
    if (now - load.startedAt > INVENTORY_FULL_LOAD_MAX_DURATION_MS) return abortTornInventoryFullLoad('max-duration');
    if (load.awaitingProgress) { const progressed = snapshot.dataAll === '1' || snapshot.dataFrom > load.snapshot.dataFrom || snapshot.rowCount > load.snapshot.rowCount; if (!progressed) return { status: 'awaiting-progress', ...snapshot }; clearTimeout(load.timer); load.timer = 0; load.awaitingProgress = false; load.status = 'ready-to-load'; logDebug('inventory-full-load-progress', { oldRows: load.snapshot.rowCount, newRows: snapshot.rowCount, oldDataFrom: load.snapshot.dataFrom, newDataFrom: snapshot.dataFrom, dataAll: snapshot.dataAll }); scheduleTornInventoryFullLoad(100); return { status: 'ready-to-load', progressed: true, ...snapshot }; }
    if (load.triggerAttempts >= INVENTORY_FULL_LOAD_MAX_ATTEMPTS) return abortTornInventoryFullLoad('no-progress'); const button = document.querySelector?.('#load-more-items [role="button"]'); const jquery = getTornPageJQuery(); const buttonReady = Boolean(button && button.isConnected !== false && button.hidden !== true && button.disabled !== true); logDebug('inventory-full-load-ready', { buttonFound: buttonReady, jqueryFound: typeof jquery === 'function' });
    if (!buttonReady || typeof jquery !== 'function') { load.status = 'ready-to-load'; load.readinessRetries += 1; const reason = !buttonReady ? 'load-more-control-missing-or-inactive' : 'page-jquery-unavailable'; logDebug('inventory-full-load-wait', { reason }); scheduleTornInventoryFullLoad(); return { status: 'ready-to-load', reason }; }
    load.triggerAttempts += 1; load.snapshot = snapshot; load.awaitingProgress = true; load.status = 'awaiting-progress'; logDebug('inventory-full-load-trigger', { triggerAttempt: load.triggerAttempts, rows: snapshot.rowCount, dataFrom: snapshot.dataFrom }); jquery(button).trigger('click'); scheduleTornInventoryFullLoad(INVENTORY_FULL_LOAD_PROGRESS_TIMEOUT_MS, true); return { status: 'awaiting-progress', triggered: true, attempt: load.triggerAttempts, ...snapshot };
  }
  function isTornInventoryFullLoadPending(container) { const load = state.inventoryFullLoad; return load.container === container && !['complete', 'terminal-aborted'].includes(load.status) && getTornInventoryLoadState(container)?.dataAll !== '1'; }
  function inventorySortDependsOnBazaar(criterion) { return ['bazaar-unit', 'bazaar-total', 'best-sale-unit', 'best-sale-total', 'profit', 'roi'].includes(criterion); }
  function canApplyInventorySortSnapshot(container) { if (isTornInventoryFullLoadPending(container)) return { allowed: false, reason: 'full-inventory-load' }; return { allowed: true, reason: null }; }
  function resetInventoryBazaarRound(generation = state.inventoryValuationGeneration) { clearTimeout(state.inventoryBazaarRefreshTimer); state.inventoryBazaarRefreshTimer = null; state.inventoryBazaarRound = { generation, startedAt: 0, total: 0, settled: 0, settledSinceRefresh: 0, initialSnapshotDone: false }; }
  function registerInventoryBazaarRequests(itemIds, now = Date.now()) { const round = state.inventoryBazaarRound; if (round.generation !== state.inventoryValuationGeneration) resetInventoryBazaarRound(); const fresh = []; for (const itemId of itemIds) { const key = `${state.inventoryValuationGeneration}:${itemId}`; if (state.inventoryBazaarPending.has(key)) continue; state.inventoryBazaarPending.add(key); fresh.push(itemId); } if (fresh.length) { if (!state.inventoryBazaarRound.startedAt) { state.inventoryBazaarRound.startedAt = now; state.inventoryBazaarRefreshTimer = setTimeout(() => { state.inventoryBazaarRefreshTimer = null; state.inventoryBazaarRound.initialSnapshotDone = true; state.inventoryBazaarRound.settledSinceRefresh = 0; scheduleTornInventoryBasisRefresh(); }, INVENTORY_BAZAAR_INITIAL_SETTLE_MS); } state.inventoryBazaarRound.total += fresh.length; } return fresh; }
  function prioritizeInventoryBazaarRequests(itemIds, quoteIndex) { return Array.from(itemIds).sort((left, right) => { const leftSeen = quoteIndex.get(left)?.lastSeenAt || 0; const rightSeen = quoteIndex.get(right)?.lastSeenAt || 0; return leftSeen - rightSeen || left - right; }); }
  function scheduleInventoryBazaarResultRefresh(generation, finalResult = false) { const round = state.inventoryBazaarRound; if (generation !== state.inventoryValuationGeneration || round.generation !== generation) return false; round.settled += 1; round.settledSinceRefresh += 1; const pendingForGeneration = Array.from(state.inventoryBazaarPending).some((key) => key.startsWith(`${generation}:`)); const batchSize = Math.max(INVENTORY_BAZAAR_REFRESH_BATCH_MIN, Math.ceil(round.total / 5)); if (!round.initialSnapshotDone && pendingForGeneration) return false; const flushNow = finalResult || !pendingForGeneration || round.settledSinceRefresh >= batchSize; clearTimeout(state.inventoryBazaarRefreshTimer); state.inventoryBazaarRefreshTimer = setTimeout(() => { state.inventoryBazaarRefreshTimer = null; round.initialSnapshotDone = true; round.settledSinceRefresh = 0; scheduleTornInventoryBasisRefresh(); }, flushNow ? 40 : INVENTORY_BAZAAR_REFRESH_QUIET_MS); return flushNow; }
  const INVENTORY_SORT_CRITERIA = Object.freeze(['original', 'name', 'quantity', 'average-acquisition', 'current-basis', 'bazaar-unit', 'bazaar-total', 'trader-unit', 'trader-total', 'best-sale-unit', 'best-sale-total', 'profit', 'roi']);
  function normalizeInventorySortSettings(raw) { const criterion = INVENTORY_SORT_CRITERIA.includes(raw?.criterion) ? raw.criterion : 'original'; const direction = ['asc', 'desc'].includes(raw?.direction) ? raw.direction : 'asc'; return { criterion, direction: criterion === 'original' ? 'asc' : direction }; }
  function inventorySortRatio(value) { if (!value || value.numerator == null || value.denominator == null) return null; try { return makeBigIntRatio(value.numerator, value.denominator); } catch (_) { return null; } }
  function inventorySortMoney(value) { if (value == null) return null; try { return makeBigIntRatio(BigInt(value)); } catch (_) { return null; } }
  function buildInventorySortKey(record, criterion) {
    if (!record) return null; if (criterion === 'original') return inventorySortMoney(record.originalIndex); if (criterion === 'name') return { text: normalizeInventoryIdentityText(record.block?.model?.itemName) }; if (criterion === 'quantity') return inventorySortMoney(record.block?.currentQuantity);
    if (criterion === 'average-acquisition') return record.summary?.knownPurchaseQuantity ? makeBigIntRatio(record.summary.knownPurchaseCost, record.summary.knownPurchaseQuantity) : null; if (criterion === 'current-basis') return inventorySortRatio(record.summary?.currentCostBasis);
    if (criterion === 'bazaar-unit') return ['available', 'sort-available'].includes(record.bazaarSortValuation?.status) ? inventorySortMoney(record.bazaarSortValuation.recommendedUnitPrice) : null; if (criterion === 'bazaar-total') return ['available', 'sort-available'].includes(record.bazaarSortValuation?.status) ? inventorySortMoney(record.bazaarSortValuation.recommendedTotal) : null;
    if (criterion === 'trader-unit') return record.traderValuation?.status === 'eligible' ? inventorySortMoney(record.traderValuation.unitPrice) : null; if (criterion === 'trader-total') return record.traderValuation?.status === 'eligible' ? inventorySortMoney(record.traderValuation.totalPrice) : null;
    if (criterion === 'best-sale-unit') return record.bestSaleResult?.status === 'available' && record.bestSaleResult.verification === 'verified' ? inventorySortMoney(record.bestSaleResult.unitPrice) : null; if (criterion === 'best-sale-total') return record.bestSaleResult?.status === 'available' && record.bestSaleResult.verification === 'verified' ? inventorySortMoney(record.bestSaleResult.totalValue) : null;
    if (criterion === 'profit') return ['full', 'partial'].includes(record.profitResult?.status) ? inventorySortRatio(record.profitResult.potentialProfit) : null; if (criterion === 'roi') return ['full', 'partial'].includes(record.profitResult?.status) ? inventorySortRatio(record.profitResult.roi) : null; return null;
  }
  function compareInventorySortRatios(left, right) { const comparison = BigInt(left.numerator) * BigInt(right.denominator) - BigInt(right.numerator) * BigInt(left.denominator); return comparison < 0n ? -1 : comparison > 0n ? 1 : 0; }
  function compareInventorySortRecords(left, right, direction = 'asc') {
    if (left.sortKey == null || right.sortKey == null) { if (left.sortKey == null && right.sortKey == null) return compareInventorySortTieBreakers(left.record, right.record); return left.sortKey == null ? 1 : -1; }
    let comparison = left.sortKey.text != null || right.sortKey.text != null ? String(left.sortKey.text || '').localeCompare(String(right.sortKey.text || '')) : compareInventorySortRatios(left.sortKey, right.sortKey); if (comparison && direction === 'desc') comparison = -comparison; return comparison || compareInventorySortTieBreakers(left.record, right.record);
  }
  function compareInventorySortTieBreakers(left, right) { const leftModel = left.block.model; const rightModel = right.block.model; const name = normalizeInventoryIdentityText(leftModel.itemName).localeCompare(normalizeInventoryIdentityText(rightModel.itemName)); if (name) return name; if (leftModel.itemId !== rightModel.itemId) return leftModel.itemId - rightModel.itemId; if (left.originalIndex !== right.originalIndex) return left.originalIndex - right.originalIndex; return String(leftModel.rowKey || leftModel.instanceKey || '').localeCompare(String(rightModel.rowKey || rightModel.instanceKey || '')); }
  function sortInventoryBlockRecords(records, settings) { const normalized = normalizeInventorySortSettings(settings); return records.map((record) => ({ record, sortKey: buildInventorySortKey(record, normalized.criterion) })).sort((left, right) => compareInventorySortRecords(left, right, normalized.direction)).map((entry) => entry.record); }
  function inventoryBlockStableIdentity(block) { return block?.model?.groupKey || block?.model?.rowKey || `item:${block?.model?.itemId}`; }
  function getInventoryOriginalIndex(container, block) { let originals = state.inventorySortOriginals.get(container); if (!originals) { originals = new Map(); state.inventorySortOriginals.set(container, originals); } const identity = inventoryBlockStableIdentity(block); if (!originals.has(identity)) originals.set(identity, originals.size); return originals.get(identity); }
  function applyInventoryBlockOrder(container, records, scan, settings = state.inventorySortSettings) { const byRowKey = new Map(scan.rows.map((model) => [model.rowKey, model.sourceRow])); const sorted = sortInventoryBlockRecords(records, settings); const desiredRows = sorted.flatMap((record) => record.block.rowKeys.map((rowKey) => byRowKey.get(rowKey)).filter((row) => row?.parentElement === container)); const currentRows = Array.from(container.children || []).filter((row) => byRowKey.has(row.dataset?.rowkey)); if (desiredRows.length === currentRows.length && desiredRows.some((row, index) => row !== currentRows[index])) for (const row of desiredRows) { state.inventorySortInternalRows.add(row); container.appendChild(row); } if (desiredRows.length) setTimeout(() => desiredRows.forEach((row) => state.inventorySortInternalRows.delete(row)), 0); return sorted; }
  function inventorySortKeySignature(key) { return key == null ? 'missing' : key.text != null ? `text:${key.text}` : `ratio:${key.numerator}/${key.denominator}`; }
  function buildInventorySortSnapshotSignature(records, settings = state.inventorySortSettings) { const normalized = normalizeInventorySortSettings(settings); const keys = records.map((record) => [inventoryBlockStableIdentity(record.block), inventorySortKeySignature(buildInventorySortKey(record, normalized.criterion))]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))); return JSON.stringify([normalized.criterion, normalized.direction, ...keys]); }
  function flushInventorySortBatch(reason = 'quiet') { clearTimeout(state.inventorySortQuietTimer); clearTimeout(state.inventorySortMaxTimer); state.inventorySortQuietTimer = 0; state.inventorySortMaxTimer = 0; const pending = Array.from(state.inventorySortPending.values()); state.inventorySortPending.clear(); for (const entry of pending) { if (!entry.container?.isConnected && entry.container?.isConnected !== undefined) continue; applyInventoryBlockOrder(entry.container, entry.records, entry.scan, entry.settings); state.inventorySortLastSignatures.set(entry.container, entry.signature); } logDebug('inventory-sort-batch-applied', { reason, containerCount: pending.length }); return pending.length; }
  function queueInventoryStableSort(container, records, scan, suppliedOptions = null) { const options = suppliedOptions || {}; const settings = normalizeInventorySortSettings(state.inventorySortSettings); const signature = buildInventorySortSnapshotSignature(records, settings); if (!options.force && signature === state.inventorySortLastSignatures.get(container)) return { queued: false, reason: 'sort-key-unchanged' }; state.inventorySortPending.set(container, { container, records, scan, settings, signature }); const staticCriterion = ['original', 'name', 'quantity'].includes(settings.criterion); if (options.immediate || staticCriterion) return { queued: true, applied: flushInventorySortBatch(options.immediate ? 'user-change' : 'static-criterion') }; clearTimeout(state.inventorySortQuietTimer); state.inventorySortQuietTimer = setTimeout(() => flushInventorySortBatch('quiet-period'), INVENTORY_SORT_QUIET_MS); if (!state.inventorySortMaxTimer) state.inventorySortMaxTimer = setTimeout(() => flushInventorySortBatch('max-batch-age'), INVENTORY_SORT_MAX_BATCH_MS); return { queued: true, applied: 0 };
  }
  function isInternalInventorySortMutation(mutation) { const moved = [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].filter((node) => node?.nodeType === 1); if (!moved.length || !moved.every((node) => state.inventorySortInternalRows.has(node))) return false; return true; }
  function ensureInventorySortControl(container) {
    if (!container?.parentElement) return null; let control = document.getElementById(INVENTORY_SORT_CONTROL_ID); if (!control) { control = document.createElement('div'); control.id = INVENTORY_SORT_CONTROL_ID; control.className = 'wah-inventory-sort'; control.innerHTML = `<label>Sortieren: <select data-wah-inventory-sort="criterion">${[['original','Original'],['name','Name'],['quantity','Menge'],['average-acquisition','Ø Einkauf'],['current-basis','Restbasis'],['bazaar-unit','Bazaar / Stk.'],['bazaar-total','Bazaar gesamt'],['trader-unit','Trader / Stk.'],['trader-total','Trader gesamt'],['best-sale-unit','Best Sale / Stk.'],['best-sale-total','Best Sale gesamt'],['profit','Profit'],['roi','ROI']].map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>Richtung: <select data-wah-inventory-sort="direction"><option value="asc">aufsteigend</option><option value="desc">absteigend</option></select></label>`; control.addEventListener('change', (event) => { const field = event.target?.dataset?.wahInventorySort; if (!['criterion', 'direction'].includes(field)) return; state.inventorySortSettings = normalizeInventorySortSettings({ ...state.inventorySortSettings, [field]: event.target.value }); state.inventorySortImmediate = true; gmSet(INVENTORY_SORT_SETTINGS_KEY, state.inventorySortSettings); scheduleTornInventoryBasisRefresh(); }); }
    if (control.parentElement !== container.parentElement || control.nextElementSibling !== container) container.parentElement.insertBefore(control, container); const criterion = control.querySelector('[data-wah-inventory-sort="criterion"]'); const direction = control.querySelector('[data-wah-inventory-sort="direction"]'); criterion.value = state.inventorySortSettings.criterion; direction.value = state.inventorySortSettings.direction; direction.disabled = state.inventorySortSettings.criterion === 'original'; return control;
  }
  function isInventorySortContainerActive(container) { return Boolean(container) && !container.closest?.('[hidden],[aria-hidden="true"]'); }
  function refreshTornInventoryBasis(root = document) {
    if (location.pathname !== '/item.php') return 0; ensureFullTornInventoryLoaded(); const activeContainer = getActiveTornInventoryContainer(document); if (isTornInventoryFullLoadPending(activeContainer)) { logDebug('inventory-sort-deferred', { reason: 'full-inventory-load' }); return 0; }
    const candidateRows = Array.from(root.querySelectorAll?.('li[data-item][data-rowkey]') || []); const containers = [...new Set(candidateRows.map((row) => row.parentElement).filter(isInventorySortContainerActive))]; const events = listTransactionEvents(); const aggregates = aggregateItemBasisEvents(events); const quoteIndex = indexLatestTraderQuotes(readTraderQuotes()); const bazaarQuoteIndex = indexBazaarQuotes(readBazaarQuotes()); const personalRatings = readTraderPersonalRatings().records; const adjustment = normalizeBazaarAddSettings(gmGet(BAZAAR_ADD_UI_SETTINGS_KEY, null)).priceAdjustment; const requestedItemIds = new Set(); const newRequestItemIds = []; const now = Date.now(); let rendered = 0;
    for (const container of containers) {
      const scan = scanTornInventoryList(container); const blocks = buildTornInventoryBasisBlocks(scan); const targetRows = new Set(blocks.map((block) => block.model.sourceRow)); const sortRecords = [];
      for (const model of scan.rows) if (!targetRows.has(model.sourceRow)) { model.sourceRow.querySelector?.(':scope [data-wah-item-basis]')?.remove(); model.sourceRow.querySelector?.(':scope [data-wah-item-bazaar]')?.remove(); model.sourceRow.querySelector?.(':scope [data-wah-item-trader]')?.remove(); model.sourceRow.querySelector?.(':scope [data-wah-item-best-sale]')?.remove(); model.sourceRow.querySelector?.(':scope [data-wah-item-profit]')?.remove(); }
      for (const block of blocks) {
        const summary = buildItemBasisSummary(block.model.itemId, block.currentQuantity, aggregates); if (renderTornInventoryBasis(block, summary)) rendered += 1;
        const cached = getBazaarAddCachedOffers(block.model.itemId); let priceResult = state.inventoryBazaarResults.get(block.model.itemId); if (cached.fresh) { const data = loadCachedItemData(block.model.itemId).bazaar; priceResult = resolveBazaarRecommendedPrice(block.model.itemId, { offers: cached.offers, adjustment, source: data?.apiSource, fetchedAt: data?.capturedAt }); state.inventoryBazaarResults.set(block.model.itemId, priceResult); } else if (!priceResult || priceResult.adjustment !== adjustment) { priceResult = { status: 'loading', itemId: block.model.itemId, adjustment, reason: null }; state.inventoryBazaarResults.set(block.model.itemId, priceResult); requestedItemIds.add(block.model.itemId); }
        const traderResult = resolveInventoryTraderQuote(block.model.itemId, quoteIndex, state.settings.minimumTraderRating, now, personalRatings); const bazaarValuation = buildInventoryBazaarValuation(priceResult, block.currentQuantity); const storedBazaarValuation = resolveStoredBazaarSortValuation(bazaarQuoteIndex.get(block.model.itemId), block.currentQuantity, adjustment, now); const bazaarSortValuation = bazaarValuation.status === 'available' ? { ...bazaarValuation, origin: 'live', freshness: 'live-current' } : storedBazaarValuation; const traderValuation = buildInventoryTraderValuation(traderResult, block.currentQuantity); const bestSaleResult = resolveInventoryBestSale(priceResult, traderResult, block.currentQuantity); const profitResult = resolveInventoryPotentialProfit({ basisSummary: summary, bestSaleResult, quantity: block.currentQuantity }); renderTornInventoryBazaar(block, priceResult, storedBazaarValuation, now); renderTornInventoryTrader(block, traderResult, now); renderTornInventoryBestSale(block, bestSaleResult, now); renderTornInventoryProfit(block, profitResult); sortRecords.push({ block, summary, bazaarValuation, bazaarSortValuation, traderValuation, bestSaleResult, profitResult, originalIndex: getInventoryOriginalIndex(container, block) });
      }
      ensureInventorySortControl(container); newRequestItemIds.push(...registerInventoryBazaarRequests(prioritizeInventoryBazaarRequests(requestedItemIds, bazaarQuoteIndex), now)); const sortReadiness = canApplyInventorySortSnapshot(container, state.inventorySortSettings.criterion, now); if (sortReadiness.allowed) queueInventoryStableSort(container, sortRecords, scan, { immediate: state.inventorySortImmediate }); else logDebug('inventory-sort-deferred', { reason: sortReadiness.reason, pending: state.inventoryBazaarPending.size, generation: state.inventoryValuationGeneration });
    }
    state.inventorySortImmediate = false;
    for (const itemId of newRequestItemIds) { const generation = state.inventoryValuationGeneration; void loadBazaarRecommendedPrice(itemId, { adjustment }).then((result) => { if (location.pathname !== '/item.php') return; const currentAdjustment = normalizeBazaarAddSettings(gmGet(BAZAAR_ADD_UI_SETTINGS_KEY, null)).priceAdjustment; if (result.adjustment !== currentAdjustment) return; state.inventoryBazaarResults.set(itemId, result); }).finally(() => { state.inventoryBazaarPending.delete(`${generation}:${itemId}`); scheduleInventoryBazaarResultRefresh(generation); }); }
    logDebug('item.php basis refresh.', { eventCount: events.length, rendered }); return rendered;
  }
  function scheduleTornInventoryBasisRefresh() { if (location.pathname !== '/item.php' || state.inventoryBasisRefreshTimer) return; state.inventoryBasisRefreshTimer = setTimeout(() => { state.inventoryBasisRefreshTimer = null; logDebug('item.php Trader refresh.'); refreshTornInventoryBasis(document); }, 40); }
  function ensureTornInventoryHistoryButton(model) { const row = model?.sourceRow; if (!row?.isConnected && row?.isConnected !== undefined) return null; let button = row?.querySelector?.(':scope [data-wah-item-history]'); if (button) return button; const host = row?.querySelector?.('.title-wrap') || row?.querySelector?.('.name-wrap'); if (!host) return null; button = document.createElement('button'); button.type = 'button'; button.className = 'wah-item-history-button'; button.dataset.wahItemHistory = String(model.itemId); button.dataset.wahItemName = model.itemName; button.dataset.action = 'open-item-history'; button.setAttribute('aria-label', `History: ${model.itemName}`); button.textContent = 'History'; host.appendChild(button); return button; }
  function processTornInventoryRows(root = document) { const rows = []; if (root?.matches?.('li[data-item][data-rowkey]')) rows.push(root); rows.push(...Array.from(root?.querySelectorAll?.('li[data-item][data-rowkey]') || [])); rows.forEach((row) => { const model = parseTornInventoryRow(row); if (model) ensureTornInventoryHistoryButton(model); }); return rows.length; }
  function nodeContainsTornInventoryRow(node) { return Boolean(node?.nodeType === 1 && (node.matches?.('li[data-item][data-rowkey]') || node.querySelector?.('li[data-item][data-rowkey]'))); }
  function initTornItemInventoryHistory() { if (location.pathname !== '/item.php') return; processTornInventoryRows(document); ensureFullTornInventoryLoaded(); scheduleTornInventoryBasisRefresh(); if (state.inventoryHistoryInitialized) return; state.inventorySortSettings = normalizeInventorySortSettings(gmGet(INVENTORY_SORT_SETTINGS_KEY, null)); state.inventoryHistoryInitialized = true; state.inventoryHistoryObserver = new MutationObserver((mutations) => { let changed = false; for (const mutation of mutations) { if (isInternalInventorySortMutation(mutation)) continue; if (mutation.type === 'attributes') { changed = true; continue; } for (const node of mutation.addedNodes || []) if (nodeContainsTornInventoryRow(node)) { processTornInventoryRows(node); changed = true; } } if (changed) { state.inventoryValuationGeneration += 1; state.inventoryBazaarPending.clear(); resetInventoryBazaarRound(); state.inventorySortPending.clear(); clearTimeout(state.inventorySortQuietTimer); clearTimeout(state.inventorySortMaxTimer); state.inventorySortQuietTimer = 0; state.inventorySortMaxTimer = 0; scheduleTornInventoryFullLoad(80); scheduleTornInventoryBasisRefresh(); } }); state.inventoryHistoryObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-all', 'data-from', 'data-queue', 'aria-hidden'] }); if (typeof GM_addValueChangeListener === 'function') { state.inventoryBazaarSettingsListenerId = GM_addValueChangeListener(BAZAAR_ADD_UI_SETTINGS_KEY, () => { state.inventoryBazaarResults.clear(); state.inventoryValuationGeneration += 1; state.inventoryBazaarPending.clear(); resetInventoryBazaarRound(); scheduleTornInventoryBasisRefresh(); }); state.inventoryBazaarQuoteListenerId = GM_addValueChangeListener(BAZAAR_QUOTES_KEY, (_key, _oldValue, _newValue, remote) => { const refreshScheduled = Boolean(remote); logDebug('bazaar-quote-store-change', { remote: Boolean(remote), inventoryRefreshScheduled: refreshScheduled }); if (refreshScheduled) scheduleTornInventoryBasisRefresh(); }); state.inventoryTraderQuoteListenerId = GM_addValueChangeListener(TRADER_QUOTES_KEY, (_key, _oldValue, _newValue, remote) => { logDebug('trader-quote-store-change', { remote: Boolean(remote), inventoryRefreshScheduled: true }); scheduleTornInventoryBasisRefresh(); }); state.inventorySettingsListenerId = GM_addValueChangeListener(SETTINGS_KEY, () => { readSettings(); scheduleTornInventoryBasisRefresh(); }); } window.addEventListener('beforeunload', () => { state.inventoryHistoryObserver?.disconnect(); clearTimeout(state.inventoryBasisRefreshTimer); clearTimeout(state.inventoryBazaarRefreshTimer); clearTimeout(state.inventorySortQuietTimer); clearTimeout(state.inventorySortMaxTimer); clearTimeout(state.inventoryFullLoad.timer); if (typeof GM_removeValueChangeListener === 'function') { if (state.inventoryBazaarSettingsListenerId) GM_removeValueChangeListener(state.inventoryBazaarSettingsListenerId); if (state.inventoryBazaarQuoteListenerId) GM_removeValueChangeListener(state.inventoryBazaarQuoteListenerId); if (state.inventoryTraderQuoteListenerId) GM_removeValueChangeListener(state.inventoryTraderQuoteListenerId); if (state.inventorySettingsListenerId) GM_removeValueChangeListener(state.inventorySettingsListenerId); } state.inventoryHistoryObserver = null; state.inventoryBasisRefreshTimer = null; state.inventoryBazaarSettingsListenerId = null; state.inventoryBazaarQuoteListenerId = null; state.inventoryTraderQuoteListenerId = null; state.inventorySettingsListenerId = null; state.inventoryBazaarResults.clear(); state.inventorySortOriginals = new WeakMap(); state.inventorySortLastSignatures = new WeakMap(); state.inventorySortPending.clear(); state.inventoryBazaarPending.clear(); state.inventoryHistoryInitialized = false; }, { once: true }); logDebug('Torn item.php inventory history, full loading, valuation, and stable sorting initialized.'); }

  function resolveTornHistoryContext(url = location.href) {
    let parsed; try { parsed = new URL(url, location.href); } catch (_) { return { kind: 'global' }; }
    if (parsed.pathname === '/trade.php') { const match = `${parsed.search}${parsed.hash}`.match(/(?:ID|id)=(\d+)/); return match ? normalizeHistoryContext({ kind: 'trade', tradeId: match[1] }) : { kind: 'global' }; }
    if (parsed.pathname === '/page.php' && parsed.searchParams.get('sid') === 'ItemMarket') { const match = `${parsed.search}${parsed.hash}`.match(/itemID=(\d+)/i); return match ? normalizeHistoryContext({ kind: 'item', itemId: match[1] }) : { kind: 'global' }; }
    if (parsed.pathname === '/bazaar.php') { const itemId = normalizePositiveInt(parsed.searchParams.get('itemId')); if (itemId) return { kind: 'item', itemId, itemName: '' }; const matched = findMatchingBazaarHandoff(); if (matched?.handoff) return { kind: 'item', itemId: matched.handoff.itemId, itemName: matched.handoff.itemName }; }
    return { kind: 'global' };
  }
  function ensureSharedHistoryStyles() {
    if (document.getElementById(HISTORY_SHARED_STYLE_ID)) return;
    GM_addStyle(`.wah-history-backdrop{position:fixed;inset:0;z-index:2147482500;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:16px}.wah-history-dialog{width:min(920px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #475569;border-radius:14px;background:#111827;color:#f8fafc;box-shadow:0 18px 60px rgba(0,0,0,.5);font:13px system-ui,sans-serif}.wah-history-header,.wah-history-tabs,.wah-history-filters,.wah-history-summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.wah-history-header{justify-content:space-between;padding:14px 16px;border-bottom:1px solid #334155}.wah-history-header h2{margin:0}.wah-history-tabs,.wah-history-filters{padding:10px 16px;border-bottom:1px solid #334155}.wah-history-content{overflow:auto;padding:14px 16px;display:grid;gap:10px}.wah-history-card{display:grid;gap:9px;padding:12px;border:1px solid #334155;border-radius:10px}.wah-history-card-top{display:flex;justify-content:space-between}.wah-history-grid,.wah-history-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.wah-history-cell span,.wah-note{display:block;color:#94a3b8;font-size:11px}.wah-history-warning{padding:9px;border:1px solid #f59e0b;border-radius:8px}.wah-history-filters label{display:grid;gap:3px}.wah-history-filters input,.wah-history-filters select,.wah-history-dialog button,.wah-history-dialog .wah-button{border:1px solid #475569;border-radius:7px;background:#1e293b;color:#fff;padding:7px;text-decoration:none}.wah-history-empty{padding:24px;text-align:center}.wah-item-basis{display:inline-block;margin-left:6px;padding:2px 6px;border:1px solid #64748b;border-radius:5px;background:#0f172a;color:#e2e8f0;font:600 10px system-ui,sans-serif;vertical-align:middle}.wah-item-bazaar{display:inline-block;margin-left:6px;padding:2px 6px;border:1px solid #0f766e;border-radius:5px;background:#042f2e;color:#ccfbf1;font:600 10px system-ui,sans-serif;vertical-align:middle}.wah-item-trader{display:inline-block;margin-left:6px;padding:2px 6px;border:1px solid #7c3aed;border-radius:5px;background:#2e1065;color:#ede9fe;font:600 10px system-ui,sans-serif;vertical-align:middle}.wah-item-best-sale{display:inline-block;margin-left:6px;padding:2px 6px;border:1px solid #ca8a04;border-radius:5px;background:#422006;color:#fef9c3;font:700 10px system-ui,sans-serif;vertical-align:middle}.wah-item-profit{display:inline-block;margin-left:6px;padding:2px 6px;border:1px solid #2563eb;border-radius:5px;background:#172554;color:#dbeafe;font:700 10px system-ui,sans-serif;vertical-align:middle}.wah-inventory-sort{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0;padding:6px 8px;border:1px solid #475569;border-radius:7px;background:#111827;color:#e2e8f0;font:600 11px system-ui,sans-serif}.wah-inventory-sort label{display:flex;gap:4px;align-items:center}.wah-inventory-sort select{max-width:150px;border:1px solid #64748b;border-radius:5px;background:#1e293b;color:#fff;padding:3px 5px}.wah-item-history-button{margin-left:6px;border:1px solid #64748b;border-radius:999px;background:#1e293b;color:#fff;padding:2px 7px;font:600 10px system-ui,sans-serif;cursor:pointer}#${HISTORY_LAUNCHER_ID}{position:fixed;right:16px;top:72px;z-index:2147482200;border:1px solid #64748b;border-radius:999px;background:#111827;color:#fff;padding:7px 11px;font:600 12px system-ui,sans-serif;box-shadow:0 5px 18px rgba(0,0,0,.3);cursor:pointer}@media(max-width:620px){#${HISTORY_LAUNCHER_ID}{right:8px;top:56px}.wah-history-grid,.wah-history-details{grid-template-columns:1fr}.wah-history-backdrop{padding:8px}}`);
    const style = Array.from(document.querySelectorAll('style')).find((node) => node.textContent.includes(`#${HISTORY_LAUNCHER_ID}`)); if (style) style.id = HISTORY_SHARED_STYLE_ID;
  }
  function ensureHistoryLauncher(context = state.historyContext) { if (location.hostname !== 'www.torn.com') return; let button = document.getElementById(HISTORY_LAUNCHER_ID); if (!button) { button = document.createElement('button'); button.id = HISTORY_LAUNCHER_ID; button.type = 'button'; button.dataset.action = 'open-history-dialog'; document.body.appendChild(button); } const normalized = normalizeHistoryContext(context); button.textContent = normalized.kind === 'item' ? `History · ${normalized.itemName || `Item ${normalized.itemId}`}` : normalized.kind === 'trade' ? `History · Trade #${normalized.tradeId}` : 'Weav3r · History'; }
  function reconcileSharedHistoryContext() { state.sharedHistoryUrl = location.href; const next = location.hostname === 'www.torn.com' ? resolveTornHistoryContext() : { kind: 'global' }; const changed = JSON.stringify(next) !== JSON.stringify(state.historyContext); state.historyContext = next; ensureHistoryLauncher(next); if (changed && state.historyDialogOpen) renderHistoryDialog(); if (changed) logDebug('history context changed.', next); }
  function handleSharedHistoryClick(event) { if (event.target.id === HISTORY_BACKDROP_ID) { event.__wahHistoryHandled = true; return closeHistoryDialog(); } const target = event.target.closest?.('[data-action]'); if (!target) return; const action = target.dataset.action; if (!['open-history-dialog', 'close-history-dialog', 'set-history-tab', 'toggle-history-details', 'clear-history-context', 'open-item-history'].includes(action)) return; event.__wahHistoryHandled = true; if (action === 'open-history-dialog') openHistoryDialog({ opener: target, context: state.historyContext }); else if (action === 'open-item-history') { event.preventDefault(); event.stopPropagation(); openHistoryDialog({ opener: target, context: { kind: 'item', itemId: target.dataset.wahItemHistory, itemName: target.dataset.wahItemName } }); } else if (action === 'close-history-dialog') closeHistoryDialog(); else if (action === 'set-history-tab') { state.historyTab = target.dataset.historyTab === 'pending' ? 'pending' : 'transactions'; renderHistoryDialog(); } else if (action === 'toggle-history-details') { const id = target.dataset.transactionId; if (state.expandedTransactionIds.has(id)) state.expandedTransactionIds.delete(id); else state.expandedTransactionIds.add(id); renderHistoryDialog(); } else if (action === 'clear-history-context') { state.historyContext = { kind: 'global' }; renderHistoryDialog(); }
  }
  function initializeSharedHistoryInfrastructure() {
    ensureSharedHistoryStyles(); attachHistoryStorageListeners(); reconcileSharedHistoryContext(); if (state.sharedHistoryInitialized) return; state.sharedHistoryInitialized = true;
    document.addEventListener('click', handleSharedHistoryClick); document.addEventListener('keydown', handleGlobalKeydown); document.addEventListener('change', handleHistoryFilterChange); document.addEventListener('input', (event) => { if (event.target?.dataset?.historyFilter === 'search') handleHistoryFilterChange(event); }); window.addEventListener('hashchange', reconcileSharedHistoryContext); window.addEventListener('popstate', reconcileSharedHistoryContext);
    state.sharedHistoryObserver = new MutationObserver(() => { if (location.href !== state.sharedHistoryUrl) reconcileSharedHistoryContext(); else if (location.hostname === 'www.torn.com' && !document.getElementById(HISTORY_LAUNCHER_ID)) ensureHistoryLauncher(state.historyContext); }); state.sharedHistoryObserver.observe(document.documentElement, { childList: true, subtree: true }); logDebug('shared history bootstrap.');
  }
  function routeUserscript() {
    pruneExpiredHandoffs();
    ensureTransactionStoreReady();
    attachRatingChangeListener();
    initializeSharedHistoryInfrastructure();
    if (location.hostname === 'weav3r.dev' && location.pathname.startsWith('/pricelist/')) initWeav3rPricelistRatingCapture();
    else if (location.hostname === 'weav3r.dev') { initializeWeav3rNativeNavigation(); initWeav3rArbitrageHelper(); }
    else if (location.hostname === 'www.torn.com' && location.pathname === '/bazaar.php') initTornBazaarHandoff();
    else if (location.hostname === 'www.torn.com' && location.pathname === '/page.php' && new URL(location.href).searchParams.get('sid') === 'ItemMarket') initTornMarketPurchaseInfrastructure('item-market');
    else if (location.hostname === 'www.torn.com' && location.pathname === '/trade.php') initTornTradeHandoff();
    else if (location.hostname === 'www.torn.com' && location.pathname === '/item.php') { ensureHistoryLauncher({ kind: 'global' }); initTornItemInventoryHistory(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', routeUserscript, { once: true }); else routeUserscript();
})();
