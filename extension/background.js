// Import search topics
importScripts('words.js');

// Constants
// EDGE_UA removed — no longer used (dead code cleanup v4.2)
// MOBILE_UA removed — mobile searches no longer earn Rewards points (2024-2025)
const BING_SEARCH_URL = "https://www.bing.com/search?q=";

// Default configuration
const DEFAULT_SETTINGS = {
  desktopSearches: 30,
  minDelay: 6, // seconds
  maxDelay: 15, // seconds
  cooldownBetweenSearches: 2, // seconds
  enableRandomDelay: true,
  autoCloseTabs: true,
  querySource: "random", // "random" or "custom"
  customQueries: "",
  scheduleTime: "09:00",
  scheduleEnabled: false,
  activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  autoStartNextMode: true,
  runSearchesInActiveTab: false, // Búsqueda silenciosa en segundo plano por defecto (no interrumpe la navegación del usuario)
  cooldown15MinBatch: false // Modo Cooldown de 15 min (4 búsquedas por lote)
};

// Default session state
const DEFAULT_SESSION = {
  status: "idle", // "idle", "running", "paused", "stopped", "completed"
  mode: null, // "desktop" or "edge"
  totalSearches: 0,
  completedSearches: 0,
  pointsEarned: 0,
  currentIndex: 0,
  queries: [],
  tabId: null,
  modesQueue: [], // To chain desktop -> mobile -> edge
  openedTabIds: [] // Track all opened tabs for auto-close
};

// ---------------------------------------------------------------------------
// In-Memory Session Cache & Execution State
// ---------------------------------------------------------------------------
let inMemorySession = null;
let isLoopRunning = false;
let keepAliveInterval = null;

/**
 * Periodically calls an extension API to keep the MV3 Service Worker alive
 * during active automation search sessions.
 */
function startKeepAlive() {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

/**
 * Safely creates a tab without throwing "No current window" error in MV3 Service Worker.
 * If no normal window is open, it creates a new window.
 * @param {chrome.tabs.CreateProperties} createProperties
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function createTabSafe(createProperties) {
  try {
    let windowId = createProperties.windowId;
    if (!windowId) {
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      if (windows && windows.length > 0) {
        const focusedWin = windows.find(w => w.focused) || windows[0];
        windowId = focusedWin.id;
      }
    }
    
    if (windowId) {
      return await chrome.tabs.create({ ...createProperties, windowId });
    }
    
    // No existing normal window — create one
    const newWin = await chrome.windows.create({
      url: createProperties.url || "https://www.bing.com",
      focused: createProperties.active !== false
    });
    return (newWin.tabs && newWin.tabs.length > 0) ? newWin.tabs[0] : null;
  } catch (err) {
    console.warn("[RewardsBot] createTabSafe fallback creating window due to:", err);
    try {
      const newWin = await chrome.windows.create({
        url: createProperties.url || "https://www.bing.com",
        focused: createProperties.active !== false
      });
      return (newWin.tabs && newWin.tabs.length > 0) ? newWin.tabs[0] : null;
    } catch (winErr) {
      console.error("[RewardsBot] Failed to create window fallback:", winErr);
      throw winErr;
    }
  }
}

// Hydrate session cache from storage on SW startup
chrome.storage.local.get('session', (data) => {
  inMemorySession = data.session || { ...DEFAULT_SESSION };
});

// Keep the in-memory cache always in sync
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.session) {
    inMemorySession = changes.session.newValue || { ...DEFAULT_SESSION };
  }
});

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Rewards Auto Search & Claimer installed.");
  
  // Save default settings if not exists
  const data = await chrome.storage.local.get(["settings", "session", "stats", "history"]);
  if (!data.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  if (!data.session) {
    await chrome.storage.local.set({ session: DEFAULT_SESSION });
  }
  if (!data.stats) {
    await chrome.storage.local.set({
      stats: {
        todayPoints: 0,
        totalPoints: 0,
        streak: 0,
        lastUpdatedDate: ""
      }
    });
  }
  if (!data.history) {
    await chrome.storage.local.set({ history: [] });
  }

  // Set up daily check alarm
  chrome.alarms.create("check-schedule", { periodInMinutes: 1 });
  // Recordatorio nocturno a las 10 PM (verifica cada 30 min)
  chrome.alarms.create("daily-tasks-reminder", { periodInMinutes: 30 });
  updateScheduleAlarm();
});

// ---------------------------------------------------------------------------
// Service Worker Recovery — handles SW restart after Chrome kills it.
// ---------------------------------------------------------------------------
chrome.runtime.onStartup.addListener(async () => {
  console.log('[RewardsBot][startup] Service Worker starting up...');
  try {
    const data = await chrome.storage.local.get(['session', 'settings']);
    const session = data.session;
    
    if (session && session.status === 'running') {
      const sessionAge = Date.now() - (session.startTime || 0);
      if (session.currentIndex < session.totalSearches && sessionAge < 1800000) {
        console.log('[RewardsBot][startup] Resuming active session from startup...');
        await appendActivityLog(`🔄 Reanudando sesión activa tras reinicio (${session.currentIndex}/${session.totalSearches})`);
        if (!isLoopRunning) {
          runSessionLoop(session);
        }
      } else {
        console.warn('[RewardsBot][startup] Found stale session in state:', session.status);
        session.status = 'stopped';
        await chrome.storage.local.set({ session });
        await cleanupSessionTabs();
        await clearAllAutomationTabs();
        await appendActivityLog('⚠️ Sesión anterior finalizada por tiempo');
        await chrome.storage.local.set({ session: DEFAULT_SESSION });
      }
    } else if (session && session.status === 'paused') {
      console.log('[RewardsBot][startup] Session remains paused.');
    }
    
    // Re-create periodic alarms
    chrome.alarms.create('check-schedule', { periodInMinutes: 1 });
    chrome.alarms.create('daily-tasks-reminder', { periodInMinutes: 30 });
    updateScheduleAlarm();
  } catch (e) {
    console.error('[RewardsBot][startup] Error during startup recovery:', e);
  }
});

// State for sequential task tab tracking
let activeTaskTabId = null;
let dashboardTabId = null;

// ---------------------------------------------------------------------------
// Automation Tab Tracking — prevents automation from running in user's
// manual tabs. Only tabs explicitly created by the extension are tracked.
// ---------------------------------------------------------------------------

/**
 * Registers a tab as controlled by the extension's automation.
 * Persists to chrome.storage.local so content scripts can query it.
 * @param {number} tabId
 */
async function registerAutomationTab(tabId) {
  if (!tabId) return;
  const data = await chrome.storage.local.get('automationTabIds');
  const ids = data.automationTabIds || [];
  if (!ids.includes(tabId)) {
    ids.push(tabId);
    await chrome.storage.local.set({ automationTabIds: ids });
    console.log(`[RewardsBot][background] Registered automation tab: ${tabId}. Active set: [${ids}]`);
  }
}

/**
 * Removes a tab from the automation tracking set.
 * @param {number} tabId
 */
async function unregisterAutomationTab(tabId) {
  if (!tabId) return;
  const data = await chrome.storage.local.get('automationTabIds');
  const ids = (data.automationTabIds || []).filter(id => id !== tabId);
  await chrome.storage.local.set({ automationTabIds: ids });
  console.log(`[RewardsBot][background] Unregistered automation tab: ${tabId}. Remaining: [${ids}]`);
}

/**
 * Clears all tracked automation tabs (used on session end).
 */
async function clearAllAutomationTabs() {
  await chrome.storage.local.set({ automationTabIds: [] });
  console.log('[RewardsBot][background] Cleared all automation tab IDs.');
}

/**
 * Tracks a tab ID in the session state.
 */
async function trackOpenedTab(tabId) {
  if (!tabId) return;
  try {
    const data = await chrome.storage.local.get("session");
    const session = data.session || {};
    if (!session.openedTabIds) session.openedTabIds = [];
    if (!session.openedTabIds.includes(tabId)) {
      session.openedTabIds.push(tabId);
    }
    await chrome.storage.local.set({ session });
    console.log(`[RewardsBot][background] Tracked opened tab: ${tabId}`);
  } catch (e) {
    console.error("Error in trackOpenedTab:", e);
  }
}

/**
 * Removes a tab ID from the session openedTabIds.
 */
async function removeTrackedTab(tabId) {
  if (!tabId) return;
  try {
    const data = await chrome.storage.local.get("session");
    const session = data.session;
    if (session && session.openedTabIds) {
      session.openedTabIds = session.openedTabIds.filter(id => id !== tabId);
      await chrome.storage.local.set({ session });
      console.log(`[RewardsBot][background] Untracked tab: ${tabId}`);
    }
  } catch (e) {
    console.error("Error in removeTrackedTab:", e);
  }
}

/**
 * Closes all tabs opened by the extension and clears tracking list.
 */
async function cleanupSessionTabs() {
  try {
    const data = await chrome.storage.local.get("session");
    const session = data.session;
    if (session && session.openedTabIds && session.openedTabIds.length > 0) {
      console.log(`[RewardsBot][background] Cleaning up ${session.openedTabIds.length} tabs:`, session.openedTabIds);
      for (const tabId of session.openedTabIds) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          // Tab might have been closed already
        }
      }
      session.openedTabIds = [];
      await chrome.storage.local.set({ session });
    }
  } catch (e) {
    console.error("Error in cleanupSessionTabs:", e);
  }
}

// Cleanup on service worker suspend/deactivation
chrome.runtime.onSuspend.addListener(() => {
  cleanupSessionTabs();
});

// Track task tab creation
chrome.tabs.onCreated.addListener((tab) => {
  if (dashboardTabId && !activeTaskTabId) {
    if (tab.openerTabId === dashboardTabId || (tab.pendingUrl && /bing\.com|microsoft\.com/i.test(tab.pendingUrl))) {
      activeTaskTabId = tab.id;
      registerAutomationTab(tab.id); // Mark as automation-controlled
      console.log(`[RewardsBot][background] Registered active task tab: ${tab.id} opened by dashboard: ${dashboardTabId}`);
    }
  }
});

// Track task tab removal/closing
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Always clean up from automation set when any tracked tab closes
  unregisterAutomationTab(tabId);

  // Clean up dashboardTabId if the dashboard tab itself was closed
  if (tabId === dashboardTabId) {
    console.log(`[RewardsBot][background] Dashboard tab ${tabId} closed. Clearing reference.`);
    dashboardTabId = null;
  }

  if (tabId === activeTaskTabId) {
    console.log(`[RewardsBot][background] Active task tab ${tabId} closed.`);
    activeTaskTabId = null;
    if (dashboardTabId) {
      chrome.tabs.sendMessage(dashboardTabId, { action: "taskTabClosed", tabId }).catch(() => {
        // Dashboard tab might have been closed or reloaded, ignore
      });
    }
  }
});

// Listener for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- Tab identity check: content scripts ask "am I an automation tab?" ---
  // This is the critical guard that prevents automation from running in
  // the user's manual Bing tabs. Only tabs explicitly created by the
  // extension's search session or task claiming flow return true.
  if (message.action === "isAutomationTab") {
    const senderTabId = sender.tab?.id;
    chrome.storage.local.get(['automationTabIds', 'session'], (data) => {
      const ids = data.automationTabIds || [];
      const session = data.session || {};
      // A tab is an automation tab if it's in our tracked set OR if it's
      // the current session's search tab
      const isAutomation = ids.includes(senderTabId) || session.tabId === senderTabId;
      sendResponse({ isAutomation });
    });
    return true; // async response
  }

  if (message.action === "prepareForTaskTab") {
    dashboardTabId = sender.tab?.id;
    activeTaskTabId = null;
    console.log(`[RewardsBot][background] Preparing for task tab from dashboard: ${dashboardTabId}`);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "openTaskTab") {
    dashboardTabId = sender.tab?.id;
    createTabSafe({ url: message.url, active: false }).then(async (newTab) => {
      if (newTab && newTab.id) {
        activeTaskTabId = newTab.id;
        await registerAutomationTab(newTab.id);
        console.log(`[RewardsBot][background] Task tab opened deterministically: ${newTab.id} for ${message.url}`);
        sendResponse({ success: true, tabId: newTab.id });
      } else {
        sendResponse({ success: false, error: "Could not create task tab" });
      }
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }

  if (message.action === "closeMyTab") {
    const tabId = sender.tab?.id;
    if (tabId) {
      console.log(`[RewardsBot][background] Closing task tab: ${tabId}`);
      chrome.tabs.remove(tabId);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "No tab ID found" });
    }
    return true;
  }

  if (message.action === "captchaDetected") {
    pauseSearchSession().then(() => {
      showNotification(
        "⚠️ CAPTCHA Detectado",
        "Se requiere intervención humana para resolver el reto. La sesión de búsqueda se ha pausado."
      );
      sendWebhookNotification("⚠️ **CAPTCHA Detectado**: Se requiere intervención humana. La sesión de búsqueda se ha pausado.");
      sendResponse({ success: true });
    });
    return true; // async response
  }

  if (message.action === "startSession") {
    startSearchSession(message.mode, message.queue || [])
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
  
  if (message.action === "pauseSession") {
    pauseSearchSession()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.action === "resumeSession") {
    resumeSearchSession()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.action === "stopSession") {
    stopSearchSession()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "updateSchedule") {
    updateScheduleAlarm()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "openAndCloseTab") {
    (async () => {
      try {
        const tab = await createTabSafe({ url: message.url, active: false });
        if (tab && tab.id) {
          await registerAutomationTab(tab.id);
          await trackOpenedTab(tab.id);
          // Use chrome.alarms instead of setTimeout — safe for SW lifecycle
          const alarmName = `close-tab-${tab.id}-${Date.now()}`;
          chrome.alarms.create(alarmName, { delayInMinutes: (message.delay || 6000) / 60000 });
          // The alarm handler (in onAlarm listener) will close the tab
        }
      } catch (e) {
        console.error('[RewardsBot] openAndCloseTab error:', e);
      }
    })();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "syncPoints") {
    syncUserInfo()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Abrir la página de Rewards y ejecutar el reclamo automático de tareas
  if (message.action === "runDailyTasks") {
    openRewardsDashboard(true)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Notificación cuando se completan las tareas
  if (message.action === "tasksClaimed") {
    const count = message.count || 0;
    showNotification(
      "¡Tareas Completadas!",
      `Se procesaron ${count} tarea(s) de Microsoft Rewards.`
    );
    sendResponse({ success: true });
    return true;
  }

  // Refrescar datos para el popup
  if (message.action === "refreshData") {
    syncUserInfo().then(stats => {
      chrome.runtime.sendMessage({ action: "sessionUpdate" }).catch(() => {});
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "forceUpdateTodayPoints") {
    chrome.storage.local.get("stats", (res) => {
      const stats = res.stats || {};
      stats.todayPoints = message.points;
      stats.lastUpdatedDate = new Date().toISOString().split("T")[0];
      chrome.storage.local.set({ stats });
      console.log(`[RewardsBot] forceUpdateTodayPoints: ${message.points}`);
    });
    sendResponse({ success: true });
    return true;
  }

});

// Alarm Listener for scheduling and dynamic tab/search alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "daily-rewards-run") {
    console.log("Scheduled run triggered!");
    triggerScheduledRun();
  } else if (alarm.name === "check-schedule") {
    // Fallback scheduler verification
    checkAndTriggerSchedule();
  } else if (alarm.name === "daily-tasks-reminder") {
    // Recordatorio de las 10 PM si no se han completado las tareas
    checkDailyTasksReminder();
  } else if (alarm.name === "search-next-step") {
    console.log("[RewardsBot] Alarm 'search-next-step' fired!");
    const data = await chrome.storage.local.get("session");
    const session = data.session;
    if (session && session.status === "running" && !isLoopRunning) {
      console.log("[RewardsBot] Resuming search loop from alarm at index:", session.currentIndex);
      runSessionLoop(session);
    }
  } else if (alarm.name.startsWith('close-tab-')) {
    // Dynamic alarm to close a temporary tab (replaces setTimeout for SW safety)
    const parts = alarm.name.split('-');
    const tabId = parseInt(parts[2], 10);
    if (!isNaN(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (e) {
        // Tab may already be closed
      }
      await removeTrackedTab(tabId);
      await unregisterAutomationTab(tabId);
    }
  }
});

// ---------------------------------------------------------------------------
// waitForTabLoad — Waits for a tab to reach 'complete' status.
// Replaces fragile setTimeout(3000) with event-driven loading detection.
// Falls back to the timeout if the tab doesn't load in time.
// ---------------------------------------------------------------------------
function waitForTabLoad(tabId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        console.log(`[RewardsBot] waitForTabLoad: timeout after ${timeoutMs}ms for tab ${tabId}`);
        resolve(false); // timed out
      }
    }, timeoutMs);
    
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete' && !resolved) {
        resolved = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true); // loaded successfully
      }
    }
    
    // Check if tab is already complete
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(false); }
        return;
      }
      if (tab.status === 'complete' && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(true);
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    });
  });
}

// Abrir el dashboard de Rewards para que los content scripts trabajen
async function openRewardsDashboard(autoClaim = false) {
  if (autoClaim) {
    await chrome.storage.local.set({ autoClaimPending: true });
  }

  const targetUrl = autoClaim ? "https://rewards.bing.com/earn#autoClaim=true" : "https://rewards.bing.com/earn";
  const tabs = await chrome.tabs.query({ url: "*://rewards.bing.com/*" });
  let targetTabId = null;

  if (tabs.length > 0) {
    targetTabId = tabs[0].id;
    await registerAutomationTab(targetTabId);
    await appendActivityLog("🎯 Navegando a Microsoft Rewards (Ganar) para reclamar tareas");
    await chrome.tabs.update(targetTabId, { url: targetUrl });
  } else {
    // Abrir nueva pestaña en Rewards en segundo plano (active: false)
    const newTab = await createTabSafe({ url: targetUrl, active: false });
    if (newTab && newTab.id) {
      targetTabId = newTab.id;
      await registerAutomationTab(targetTabId);
      await trackOpenedTab(targetTabId);
      await appendActivityLog("🎯 Abriendo Microsoft Rewards (Ganar) para reclamar tareas en segundo plano");
    }
  }

  if (targetTabId && autoClaim) {
    setTimeout(() => {
      chrome.tabs.sendMessage(targetTabId, { action: "startAutoClaimAll" }).catch(() => {});
    }, 3000);
  }
}

// Mostrar notificación nativa del navegador
function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: title,
      message: message,
      priority: 2
    });
  } catch (e) {
    console.warn("No se pudo mostrar notificación:", e);
  }
}

// Handle notification button clicks (Mejora 4B)
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === "rewards-session-completed") {
    if (buttonIndex === 0) {
      createTabSafe({ url: "https://rewards.bing.com", active: true }).catch(() => {});
    }
    chrome.notifications.clear(notificationId);
  }
});

// Recordatorio de tareas diarias a las 10 PM
async function checkDailyTasksReminder() {
  const now = new Date();
  if (now.getHours() >= 22) {
    // Verificar si hay tareas pendientes
    const stats = await syncUserInfo();
    if (stats) {
      const pcDone = stats.pcSearch.max > 0 && stats.pcSearch.current >= stats.pcSearch.max;
      const edgeDone = stats.edgeSearch.max > 0 && stats.edgeSearch.current >= stats.edgeSearch.max;
      if (!pcDone || !edgeDone) {
        showNotification(
          "⚠️ Tareas Pendientes",
          "Aún tienes búsquedas de Rewards sin completar hoy. ¡No pierdas tu racha!"
        );
      }
    }
  }
}



// Fetch Google Trends RSS feed and parse queries using regex
async function fetchTrendingQueries() {
  try {
    const res = await fetch("https://trends.google.com/trending/rss?geo=US");
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const text = await res.text();
    
    // Google Trends RSS items format: <item><title>Query</title>...</item>
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>([\s\S]*?)<\/title>/;
    
    const queries = [];
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const itemContent = match[1];
      const titleMatch = titleRegex.exec(itemContent);
      if (titleMatch && titleMatch[1]) {
        const query = titleMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        if (query) {
          queries.push(query);
        }
      }
    }
    console.log(`[Google Trends] Fetched ${queries.length} trending queries.`);
    return queries;
  } catch (error) {
    console.error("[Google Trends] Error fetching trending queries:", error);
    return [];
  }
}

// Generate search queries
async function generateQueries(source, count, customQueriesRaw) {
  let list = [];
  if (source === "custom" && customQueriesRaw.trim()) {
    list = customQueriesRaw.split(",").map(q => q.trim()).filter(q => q.length > 0);
  } else if (source === "trends") {
    console.log("[Google Trends] Using trending queries...");
    const trends = await fetchTrendingQueries();
    list = trends;
  }
  
  if (list.length < count) {
    console.log("[Google Trends] Enriching queries list with local fallback topics...");
    const topics = self.SEARCH_TOPICS || ["microsoft rewards", "bing search", "google vs bing", "xbox games"];
    const shuffled = [...topics].sort(() => 0.5 - Math.random());
    
    // Fill remaining items with natural humanized variations
    while (list.length < count) {
      if (typeof self.getHumanizedSearchQuery === "function" && Math.random() > 0.3) {
        list.push(self.getHumanizedSearchQuery());
      } else {
        list.push(shuffled[list.length % shuffled.length]);
      }
    }
  }
  
  // Return sliced list of correct count, randomized
  return list.slice(0, count).sort(() => 0.5 - Math.random());
}

// Start search session
async function startSearchSession(mode, queue = []) {
  const storage = await chrome.storage.local.get(["settings", "session"]);
  const settings = storage.settings || DEFAULT_SETTINGS;
  const currentSession = storage.session || DEFAULT_SESSION;

  if (isLoopRunning || (currentSession.status === "running" && currentSession.currentIndex < currentSession.totalSearches)) {
    if (!isLoopRunning) {
      console.log("[RewardsBot] Session marked as running but loop inactive. Resuming loop...");
      runSessionLoop(currentSession);
      return;
    }
    throw new Error("Una sesión de búsqueda ya está activa.");
  }

  // Check if today's searches for this mode are already completed
  let stats = await syncUserInfo();
  if (!stats) {
    const s = await chrome.storage.local.get("stats");
    stats = s.stats;
  }
  
  // Verify cached stats are from TODAY — if they're stale, ignore them
  const today = new Date().toISOString().split("T")[0];
  const statsAreFromToday = stats && stats.lastUpdatedDate === today;
  
  let currentPoints = 0, maxPoints = 0;
  if (stats && statsAreFromToday) {
    if (mode === "desktop" && stats.pcSearch) {
      currentPoints = stats.pcSearch.current || 0;
      maxPoints = stats.pcSearch.max || 0;
    } else if (mode === "edge" && stats.edgeSearch) {
      currentPoints = stats.edgeSearch.current || 0;
      maxPoints = stats.edgeSearch.max || 0;
    }

    // Only skip if we have REAL data from today AND searches are truly completed
    // maxPoints must be > 0 (known) AND currentPoints must have reached it
    if (maxPoints > 0 && currentPoints >= maxPoints) {
      console.log(`Skipping ${mode} mode: searches are already completed today (${currentPoints}/${maxPoints} points).`);
      await appendActivityLog(`⏭️ Omitiendo modo ${mode.toUpperCase()} (ya completado hoy)`);
      
      // If there are other modes queued, chain to the next one
      if (queue && queue.length > 0) {
        const nextMode = queue[0];
        const remainingQueue = queue.slice(1);
        await startSearchSession(nextMode, remainingQueue);
      } else {
        // Reset session state
        await chrome.storage.local.set({ session: DEFAULT_SESSION });
        notifyPopup();
        
        // Notify popup that it skipped
        chrome.runtime.sendMessage({ action: "sessionSkipped", mode }).catch(() => {});
      }
      return;
    }
  } else {
    console.log(`Stats are stale or unavailable (lastUpdatedDate: ${stats?.lastUpdatedDate}, today: ${today}). Allowing searches.`);
  }

  // Determine search count
  let count = mode === "desktop" ? settings.desktopSearches : settings.edgeSearches;
  
  // Calculate exact remaining searches based on stats
  if (stats && maxPoints > 0) {
    const remainingPoints = maxPoints - currentPoints;
    const searchesNeeded = Math.ceil(remainingPoints / 3);
    // Don't do more searches than what's needed to max out
    if (searchesNeeded > 0 && searchesNeeded < count) {
      count = searchesNeeded;
    }
  }

  const queries = await generateQueries(settings.querySource, count, settings.customQueries);
  
  const newSession = {
    status: "running",
    mode: mode,
    totalSearches: count,
    completedSearches: 0,
    pointsEarned: 0,
    currentIndex: 0,
    queries: queries,
    tabId: null,
    modesQueue: queue,
    startTime: Date.now(),
    speedHistory: []
  };

  await sendWebhookNotification(`▶️ Iniciando búsquedas en modo **${mode.toUpperCase()}** (${newSession.totalSearches} búsquedas). Queue restante: ${queue.length > 0 ? queue.join(", ") : "Ninguna"}`);
  await appendActivityLog(`🚀 Iniciando búsquedas en modo ${mode.toUpperCase()} (${count} búsquedas)`);

  await chrome.storage.local.set({ session: newSession });
  notifyPopup();

  // Run the async session loop
  runSessionLoop(newSession);
}

// Session loop orchestrator
async function runSessionLoop(session) {
  if (isLoopRunning) {
    console.log("[RewardsBot] Loop is already running, skipping duplicate invocation.");
    return;
  }
  isLoopRunning = true;
  startKeepAlive();

  try {
    const storage = await chrome.storage.local.get("settings");
    const settings = storage.settings || DEFAULT_SETTINGS;

    // Check if session.tabId already exists and is still valid
    let currentTab = null;
    if (session.tabId) {
      try {
        currentTab = await chrome.tabs.get(session.tabId);
      } catch (e) {
        currentTab = null;
      }
    }

    if (!currentTab) {
      // Create the search tab safely (prevents "No current window" error)
      const tab = await createTabSafe({
        url: "https://www.bing.com/#ua=" + session.mode,
        active: settings.runSearchesInActiveTab === true
      });

      if (!tab || !tab.id) {
        throw new Error("No se pudo crear la pestaña de búsqueda.");
      }

      session.tabId = tab.id;
      await registerAutomationTab(tab.id); // Mark as automation-controlled

      if (!session.openedTabIds) session.openedTabIds = [];
      if (!session.openedTabIds.includes(tab.id)) session.openedTabIds.push(tab.id);
      await chrome.storage.local.set({ session });

      // Wait for the page to fully load (event-driven, with 10s timeout fallback)
      await waitForTabLoad(tab.id, 10000);
    } else {
      await registerAutomationTab(currentTab.id);
    }

    while (session.currentIndex < session.totalSearches) {
      // Use in-memory cache for rapid status checks (avoids storage polling)
      const cachedSession = inMemorySession;
      if (!cachedSession || cachedSession.status === "stopped") {
        // Confirm with authoritative storage read
        const state = await chrome.storage.local.get("session");
        session = state.session;
        if (!session || session.status === "stopped") break;
      }

      if (cachedSession && cachedSession.status === "paused") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Refresh session from storage once per search iteration for data integrity
      const state = await chrome.storage.local.get("session");
      session = state.session;
      if (!session || session.status !== "running") break;

      const query = session.queries[session.currentIndex];
      console.log(`Searching [${session.currentIndex + 1}/${session.totalSearches}]: ${query}`);
      await appendActivityLog(`🔍 Búsqueda #${session.currentIndex + 1}: "${query}"`);

      const searchUrl = BING_SEARCH_URL + encodeURIComponent(query) + "&form=QBRE#ua=" + session.mode;
      
      try {
        // Navegación determinista a la URL de búsqueda (solo activa la pestaña si el usuario lo configuró explícitamente)
        const updateParams = { url: searchUrl };
        if (settings.runSearchesInActiveTab === true) {
          updateParams.active = true;
        }
        await chrome.tabs.update(session.tabId, updateParams);
        
        // Esperar a que la página de resultados cargue completamente
        await waitForTabLoad(session.tabId, 8000);

        // Inyectar override de visibilidad e interacciones humanas en los resultados
        await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: () => {
            try {
              Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
              Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
              Object.defineProperty(document, 'hasFocus', { get: () => true, configurable: true });
              window.dispatchEvent(new Event('focus'));
              document.dispatchEvent(new Event('focus'));
            } catch(e) {}

            // Simular interacción humana en resultados si RewardsUtils está presente
            if (window.RewardsUtils && window.RewardsUtils.Human && window.RewardsUtils.Human.simulateSearchPageInteractions) {
              window.RewardsUtils.Human.simulateSearchPageInteractions().catch(() => {});
            }
          }
        });
      } catch (e) {
        console.log("[RewardsBot] Error en ciclo de búsqueda:", e);
        try {
          const newTab = await createTabSafe({ url: searchUrl, active: settings.runSearchesInActiveTab === true });
          if (newTab && newTab.id) {
            session.tabId = newTab.id;
            await registerAutomationTab(newTab.id);
            await waitForTabLoad(newTab.id, 8000);
          }
        } catch (err) {}
      }

      // Increment completed count
      session.completedSearches++;
      session.currentIndex++;
      session.pointsEarned += 3; // Bing Rewards: ~3 points per search (estimated, varies by tier)

      // Calculate speed and save to history
      if (session.startTime) {
        const elapsedMin = (Date.now() - session.startTime) / 60000;
        const currentSpeed = elapsedMin > 0 ? (session.completedSearches / elapsedMin) : 0;
        if (!session.speedHistory) session.speedHistory = [];
        session.speedHistory.push(parseFloat(currentSpeed.toFixed(1)));
        if (session.speedHistory.length > 10) {
          session.speedHistory.shift();
        }
      }

      await chrome.storage.local.set({ session });
      notifyPopup();

      // Check if finished
      if (session.currentIndex >= session.totalSearches) {
        break;
      }

      // 15-Minute Cooldown Batching (4 búsquedas cada 15 min para cuentas con restricción de Microsoft)
      if (settings.cooldown15MinBatch && session.completedSearches > 0 && session.completedSearches % 4 === 0) {
        const cooldownMs = 15 * 60 * 1000; // 15 minutos
        console.log(`[15-Min Cooldown] Lote de 4 búsquedas completado. Pausando 15 minutos para desbloquear siguiente lote de Microsoft...`);
        await appendActivityLog(`⏳ Cooldown de 15m activo: Pausando 15 min antes del siguiente lote (${session.completedSearches}/${session.totalSearches})`);
        
        const startCooldown = Date.now();
        while (Date.now() - startCooldown < cooldownMs) {
          const cached = inMemorySession;
          if (!cached || cached.status === "stopped") break;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Calculate delay using a non-uniform distribution:
      // 70% short (7-15s), 22% medium (15-28s), 8% coffee breaks (45-75s)
      let delaySec = 0;
      const randRoll = Math.random() * 100;
      if (randRoll < 70) {
        delaySec = Math.floor(Math.random() * (15 - 7 + 1)) + 7;
      } else if (randRoll < 92) {
        delaySec = Math.floor(Math.random() * (28 - 15 + 1)) + 15;
      } else {
        delaySec = Math.floor(Math.random() * (75 - 45 + 1)) + 45;
        console.log(`[Smart Delay] Taking a coffee break: ${delaySec}s`);
      }

      let delayMs = delaySec * 1000;
      if (settings.cooldownBetweenSearches) {
        delayMs += settings.cooldownBetweenSearches * 1000;
      }
      await appendActivityLog(`⏳ Esperando ${Math.round(delayMs / 1000)}s...`);

      // Set backup alarm in case SW is suspended during delay
      try {
        await chrome.alarms.create("search-next-step", { when: Date.now() + delayMs });
      } catch (e) {
        console.warn("[RewardsBot] Could not create search-next-step alarm:", e);
      }

      // Wait the delay using in-memory session cache
      const startDelay = Date.now();
      let wasInterrupted = false;
      while (Date.now() - startDelay < delayMs) {
        const cached = inMemorySession;
        if (!cached || cached.status === "stopped" || cached.status === "paused") {
          wasInterrupted = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Clear the backup alarm since wait completed in memory
      try {
        await chrome.alarms.clear("search-next-step");
      } catch (e) {}

      if (wasInterrupted) {
        continue;
      }
    }

    // Wrap up session
    const finalState = await chrome.storage.local.get(["session", "settings"]);
    session = finalState.session;

    if (session && session.status === "running") {
      session.status = "completed";
      await appendActivityLog(`✅ ${session.mode.toUpperCase()} completado (+${session.pointsEarned} pts)`);
      await clearAllAutomationTabs(); // Clean up automation tab tracking
      await chrome.storage.local.set({ session });
      
      // Update stats and history
      await updateStatsAndHistory(session);

      // Refresh stats from API after session completes (best effort)
      try {
        await syncUserInfo();
      } catch(e) {
        console.log('Post-session syncUserInfo failed (non-critical):', e);
      }

      notifyPopup();

      // Clean up tab
      if (finalState.settings.autoCloseTabs && session.tabId) {
        try {
          await chrome.tabs.remove(session.tabId);
        } catch (e) {
          // ignore
        }
      }

      // Check queue for next mode (Desktop -> Edge chaining)
      if (session.modesQueue && session.modesQueue.length > 0) {
        const nextMode = session.modesQueue[0];
        const remainingQueue = session.modesQueue.slice(1);
        
        console.log(`Starting next queued mode: ${nextMode}`);
        // Small cooldown between modes
        await new Promise(resolve => setTimeout(resolve, 5000));
        await startSearchSession(nextMode, remainingQueue);
      } else {
        // Idle out
        console.log("All queued search sessions finished!");
        
        // Show summary notification
        try {
          const durationMs = session.startTime ? (Date.now() - session.startTime) : 0;
          const durationMin = Math.floor(durationMs / 60000);
          const durationSec = Math.floor((durationMs % 60000) / 1000);
          const durationStr = `${durationMin}m ${durationSec}s`;
          const summaryMessage = `${session.completedSearches} búsquedas • +${session.pointsEarned} pts • ${durationStr}`;
          
          chrome.notifications.create("rewards-session-completed", {
            type: "basic",
            iconUrl: "icons/icon-128.png",
            title: "✅ Sesión Completada",
            message: summaryMessage,
            buttons: [
              { title: "Ver Dashboard" },
              { title: "Cerrar" }
            ],
            priority: 2
          });
        } catch (err) {
          console.error("Failed to create completion notification:", err);
        }

        await cleanupSessionTabs();
        await chrome.storage.local.set({
          session: DEFAULT_SESSION
        });
        notifyPopup();
        updateScheduleAlarm();
        await sendWebhookNotification(`✅ Todos los modos de búsqueda han finalizado correctamente.`);
      }
    } else if (session && session.status === "stopped") {
      await clearAllAutomationTabs(); // Clean up automation tab tracking
      await cleanupSessionTabs();
      await updateStatsAndHistory(session);
      await appendActivityLog("🛑 Sesión detenida por el usuario");
      await chrome.storage.local.set({ session: DEFAULT_SESSION });
      notifyPopup();
      await sendWebhookNotification(`🛑 Sesión detenida por el usuario o debido a un error.`);
    }

  } catch (error) {
    console.error("Error in session loop:", error);
    await clearAllAutomationTabs();
    await cleanupSessionTabs();
    await appendActivityLog(`❌ Error: ${error.message || error}`);
    await chrome.storage.local.set({ session: DEFAULT_SESSION });
    notifyPopup();
  } finally {
    isLoopRunning = false;
    stopKeepAlive();
    try {
      await chrome.alarms.clear("search-next-step");
    } catch (e) {}
  }
}

// Pause session
async function pauseSearchSession() {
  const data = await chrome.storage.local.get("session");
  const session = data.session;
  if (session && session.status === "running") {
    session.status = "paused";
    session.pausedTime = Date.now();
    try {
      await chrome.alarms.clear("search-next-step");
    } catch (e) {}
    stopKeepAlive();
    await appendActivityLog("⏸️ Automatización pausada");
    await chrome.storage.local.set({ session });
    notifyPopup();
  }
}

// Resume session
async function resumeSearchSession() {
  const data = await chrome.storage.local.get("session");
  const session = data.session;
  if (session && session.status === "paused") {
    session.status = "running";
    if (session.pausedTime) {
      const pauseDuration = Date.now() - session.pausedTime;
      session.startTime = (session.startTime || Date.now()) + pauseDuration;
      delete session.pausedTime;
    }
    await appendActivityLog("▶️ Automatización reanudada");
    await chrome.storage.local.set({ session });
    notifyPopup();
    
    // If the loop in memory is not running, restart it immediately
    if (!isLoopRunning) {
      console.log("[RewardsBot] Restarting search loop on resume from index:", session.currentIndex);
      runSessionLoop(session);
    }
  }
}

// Stop session
async function stopSearchSession() {
  try {
    await chrome.alarms.clear("search-next-step");
  } catch (e) {}
  stopKeepAlive();
  const data = await chrome.storage.local.get("session");
  const session = data.session;
  if (session && (session.status === "running" || session.status === "paused")) {
    session.status = "stopped";
    await chrome.storage.local.set({ session });
    notifyPopup();
  }
}

// Update stats and history
async function updateStatsAndHistory(session) {
  if (session.completedSearches === 0) return;

  const storage = await chrome.storage.local.get(["stats", "history"]);
  const stats = storage.stats || { todayPoints: 0, totalPoints: 0, streak: 0, lastUpdatedDate: "" };
  const history = storage.history || [];

  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Streak and daily point calculations
  if (stats.lastUpdatedDate === todayStr) {
    stats.todayPoints += session.pointsEarned;
  } else {
    // Check if it's consecutive day to maintain streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    
    if (stats.lastUpdatedDate === yesterdayStr) {
      stats.streak += 1;
    } else if (stats.lastUpdatedDate !== "") {
      stats.streak = 1; // reset streak
    } else {
      stats.streak = 1; // start streak
    }
    
    stats.todayPoints = session.pointsEarned;
    stats.lastUpdatedDate = todayStr;
  }

  stats.totalPoints += session.pointsEarned;

    // Update search counters to reflect completed session
    if (session.mode === 'desktop' && stats.pcSearch) {
      stats.pcSearch.current = Math.min(
        (stats.pcSearch.current || 0) + session.pointsEarned,
        stats.pcSearch.max || 90
      );
    } else if (session.mode === 'edge' && stats.edgeSearch) {
      stats.edgeSearch.current = Math.min(
        (stats.edgeSearch.current || 0) + session.pointsEarned,
        stats.edgeSearch.max || 60
      );
    }

  // Add history item
  const historyItem = {
    date: new Date().toISOString(),
    mode: session.mode,
    searches: `${session.completedSearches}/${session.totalSearches}`,
    points: session.pointsEarned,
    status: session.status
  };

  // Limit history to 50 items
  const newHistory = [historyItem, ...history].slice(0, 50);

  await chrome.storage.local.set({
    stats: stats,
    history: newHistory
  });
}

// Enviar notificación a Discord/Telegram vía Webhook
async function sendWebhookNotification(message) {
  const storage = await chrome.storage.local.get("settings");
  const settings = storage.settings || DEFAULT_SETTINGS;
  const webhookUrl = settings.webhookUrl;

  if (!webhookUrl) return;

  try {
    const payload = {
      content: `🤖 **Rewards Auto Search**: ${message}`
    };

    // Formato básico para Discord. Podría adaptarse para Telegram detectando "api.telegram.org"
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("Webhook enviado exitosamente.");
  } catch (error) {
    console.error("Error al enviar webhook:", error);
  }
}

// Schedule alarm update
async function updateScheduleAlarm() {
  const storage = await chrome.storage.local.get("settings");
  const settings = storage.settings || DEFAULT_SETTINGS;

  await chrome.alarms.clear("daily-rewards-run");

  if (!settings.scheduleEnabled) {
    console.log("Schedule disabled. Alarm cleared.");
    return;
  }

  const [hours, minutes] = settings.scheduleTime.split(":").map(Number);
  
  // Calculate next occurrence
  const nextRun = new Date();
  nextRun.setHours(hours, minutes, 0, 0);

  // Añadir variación aleatoria (jitter) de hasta ±30 minutos para evitar patrones detectables
  if (settings.enableRandomDelay) {
    const jitterMinutes = Math.floor(Math.random() * 61) - 30; // -30 a +30
    nextRun.setMinutes(nextRun.getMinutes() + jitterMinutes);
  }

  // If time is in the past today, schedule for tomorrow
  if (nextRun.getTime() <= Date.now()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  console.log(`Schedule enabled. Next run scheduled at: ${nextRun.toLocaleString()}`);

  // Create alarm
  chrome.alarms.create("daily-rewards-run", {
    when: nextRun.getTime()
    // Ya no usamos periodInMinutes fijo aquí para que cada día tenga un jitter diferente.
    // updateScheduleAlarm será llamado nuevamente al finalizar las búsquedas o al reiniciar el navegador.
  });
}

// Check and trigger schedule (fallback mechanism)
async function checkAndTriggerSchedule() {
  const storage = await chrome.storage.local.get(["settings", "session"]);
  const settings = storage.settings || DEFAULT_SETTINGS;
  
  if (!settings.scheduleEnabled) return;
  
  const todayStr = new Date().toISOString().split("T")[0];
  const lastRunKey = `last_scheduled_run_${todayStr}`;
  const runRecord = await chrome.storage.local.get(lastRunKey);
  
  if (runRecord[lastRunKey]) return; // already run today

  const now = new Date();
  const dayName = now.toLocaleString("en-US", { weekday: "short" }); // "Mon", "Tue" etc.
  
  if (!settings.activeDays.includes(dayName)) return; // not active today

  const [schedHours, schedMinutes] = settings.scheduleTime.split(":").map(Number);
  const schedTimeToday = new Date();
  schedTimeToday.setHours(schedHours, schedMinutes, 0, 0);

  if (now.getTime() >= schedTimeToday.getTime()) {
    console.log("Fallback scheduler: Triggering daily run!");
    // Mark as run for today
    const update = {};
    update[lastRunKey] = true;
    await chrome.storage.local.set(update);
    
    triggerScheduledRun();
  }
}

// Trigger scheduled run
async function triggerScheduledRun() {
  const storage = await chrome.storage.local.get(["settings", "session"]);
  const settings = storage.settings || DEFAULT_SETTINGS;
  const currentSession = storage.session || DEFAULT_SESSION;

  if (currentSession.status === "running" || currentSession.status === "paused") {
    console.log("Cannot trigger scheduled run: Another session is already active.");
    return;
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const lastRunKey = `last_scheduled_run_${todayStr}`;
  
  // Double check run record
  const runRecord = await chrome.storage.local.get(lastRunKey);
  if (!runRecord[lastRunKey]) {
    const update = {};
    update[lastRunKey] = true;
    await chrome.storage.local.set(update);
  }

  console.log("Triggering automated sequence...");

  // PASO 1: Abrir el dashboard de Rewards para que los content scripts 
  // reclamen las tareas diarias (Daily Set, More Activities, etc.)
  try {
    console.log("Paso 1: Abriendo dashboard de Rewards para tareas diarias...");
    await openRewardsDashboard(true);
    // Dar tiempo suficiente para que los content scripts escaneen y reclamen
    await new Promise(resolve => setTimeout(resolve, 35000));
    console.log("Paso 1 completado: Dashboard de Rewards procesado.");
  } catch (e) {
    console.warn("Error abriendo dashboard de Rewards:", e);
  }

  // PASO 2: Ejecutar búsquedas automatizadas
  console.log("Paso 2: Iniciando búsquedas automatizadas...");
  
  // Build queue of enabled search modes
  const queue = [];
  if (settings.edgeSearches > 0) queue.push("edge");
  
  // Start with desktop if configured
  if (settings.desktopSearches > 0) {
    startSearchSession("desktop", queue);
  } else if (queue.length > 0) {
    startSearchSession(queue[0], queue.slice(1));
  }
}

/**
 * Updates the extension icon badge.
 */
function updateBadge(session) {
  try {
    if (session && session.status === "running") {
      const remaining = session.totalSearches - session.completedSearches;
      chrome.action.setBadgeText({ text: remaining > 0 ? String(remaining) : "" });
      chrome.action.setBadgeBackgroundColor({ color: "#10B981" }); // Green
    } else if (session && session.status === "completed") {
      chrome.action.setBadgeText({ text: "✓" });
      chrome.action.setBadgeBackgroundColor({ color: "#10B981" }); // Green
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 2000);
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    console.error("Error updating badge:", e);
  }
}

// Notify popup of progress updates and update the icon badge
function notifyPopup() {
  chrome.storage.local.get("session").then(data => {
    if (data.session) {
      updateBadge(data.session);
    }
  }).catch(e => console.error("Error getting session for badge update:", e));

  chrome.runtime.sendMessage({ action: "sessionUpdate" }).catch(() => {
    // Ignore error if popup is closed
  });
}

/**
 * Appends a message to the activity log in chrome.storage.local.
 */
async function appendActivityLog(message) {
  try {
    const timeStr = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const logEntry = `[${timeStr}] ${message}`;
    
    const data = await chrome.storage.local.get("activityLog");
    const logs = data.activityLog || [];
    logs.push(logEntry);
    
    // Prune to last 20 entries
    if (logs.length > 20) {
      logs.shift();
    }
    
    await chrome.storage.local.set({ activityLog: logs });
    
    // Notify popup if it is open
    chrome.runtime.sendMessage({ action: "activityLogUpdate", logEntry }).catch(() => {
      // Ignore if popup is closed
    });
  } catch (e) {
    console.error("Error appending activity log:", e);
  }
}

// Fetch user stats directly from Microsoft Rewards internal API
async function syncUserInfo() {
  let retries = 3;
  let delay = 2000;
  // CRITICAL: data must be declared at function scope so it's accessible after the while loop
  let data = null;
  
  while (retries > 0) {
    try {
      data = null;
      let usedFallback = false;

      // 1. Intentar fetch directo desde el background service worker
      try {
        const res = await fetch("https://rewards.bing.com/api/getuserinfo", { 
          credentials: "include",
          redirect: "manual"
        });
        if (res.ok && res.type !== "opaqueredirect") {
          data = await res.json();
          console.log("Rewards API: Background fetch succeeded.");
        }
      } catch (e) {
        console.log("Rewards API: Background fetch failed, trying tab fallback.");
      }

      // 2. Fallback: inyectar script en pestaña de rewards.bing.com
      if (!data || !data.userStatus) {
        const tabs = await chrome.tabs.query({ url: "*://rewards.bing.com/*" });
        if (tabs.length > 0) {
          try {
            const result = await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              world: "MAIN",
              func: () => {
                // Leer window.dashboard directamente
                if (window.dashboard && window.dashboard.userStatus) {
                  try {
                    return JSON.parse(JSON.stringify({ userStatus: window.dashboard.userStatus }));
                  } catch(e) {}
                }
                // Fallback: parsear script tags
                try {
                  const scripts = document.querySelectorAll('script');
                  for (let s of scripts) {
                    if (s.innerText && s.innerText.includes('var dashboard')) {
                      const match = s.innerText.match(/var\s+dashboard\s*=\s*(\{[\s\S]*?\});/);
                      if (match && match[1]) {
                        try {
                          const db = JSON.parse(match[1]);
                          if (db && db.userStatus) {
                            return JSON.parse(JSON.stringify({ userStatus: db.userStatus }));
                          }
                        } catch(e) {}
                      }
                    }
                  }
                } catch(e) {}
                return null;
              }
            });
            if (result && result[0] && result[0].result) {
              data = result[0].result;
              usedFallback = true;
              console.log("Rewards API: Tab fallback succeeded.");
            }
          } catch (e) {
            console.log("Rewards API: Tab fallback failed:", e);
          }
        } else {
          console.log("Rewards API: No rewards.bing.com tab open for fallback.");
        }
      }

      // Si no obtuvimos data, reintentar
      if (!data || !data.userStatus) {
        console.log(`Rewards API: No userStatus on attempt ${4 - retries}. Retrying...`);
        retries--;
        if (retries === 0) {
          console.log("Rewards API: All retries exhausted. Returning null.");
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      
      if (usedFallback) {
        console.log("Rewards API: Data obtained via content script fallback.");
      }
      
      // Éxito — salir del bucle
      break;

    } catch (e) {
      console.error(`Rewards API: Error in syncUserInfo (Retries left: ${retries - 1}):`, e);
      retries--;
      if (retries === 0) break;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  // Obtener stats previos por si el API falla por completo
  const prevData = await chrome.storage.local.get("stats");
  const prevStats = prevData.stats || {};

  // Si data sigue siendo null después del loop, usamos un fallback
  let userStatus = {};
  if (data && data.userStatus) {
    userStatus = data.userStatus;
  } else {
    console.log("Rewards API: data is null after loop, proceeding with DOM fallback only.");
  }

  const counters = userStatus.counters || {};

  // Calcular matemáticamente los Puntos Hoy desde la API nativa de Microsoft
  let apiCalculatedTodayPoints = 0;
  if (counters.dailyPoint && Array.isArray(counters.dailyPoint)) {
    apiCalculatedTodayPoints = counters.dailyPoint.reduce((acc, curr) => acc + (curr.pointProgress || 0), 0);
  }

  // Intentar obtener Puntos y Racha robustamente del DOM como fallback
  let domTodayPoints = null;
  let domTotalPoints = null;
  let domStreak = null;
  try {
    const tabs = await chrome.tabs.query({ url: "*://rewards.bing.com/*" });
    if (tabs.length > 0) {
      const domResult = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        world: "MAIN",
        func: async () => {
          let todayPts = null;
          let totalPts = null;
          let stk = null;
          
          // Total Points / Available Points
          const totalElems = document.querySelectorAll('header .flex.items-center.gap-2 > p, [data-bi-id="points"], .points-value');
          for (let el of totalElems) {
            if (el && el.innerText) {
              const pts = parseInt(el.innerText.replace(/\D/g, ''));
              if (!isNaN(pts) && pts > 0) {
                totalPts = pts;
                break;
              }
            }
          }

          const values = [];

          // 1. Intentar obtener de window.dashboard (si existe)
          try {
            if (window.dashboard && window.dashboard.userStatus) {
              const userStatus = window.dashboard.userStatus;
              if (userStatus.todayPoints !== undefined && userStatus.todayPoints !== null) {
                const val = parseInt(userStatus.todayPoints, 10);
                if (!isNaN(val) && val > 0) values.push(val);
              }
              if (userStatus.counters && userStatus.counters.dailyPoint) {
                const apiPts = userStatus.counters.dailyPoint.reduce((acc, curr) => acc + (curr.pointProgress || 0), 0);
                if (apiPts > 0) {
                  values.push(apiPts);
                }
              }
            }
          } catch(e) {}

          // 2. Intentar fetch local del API (getuserinfo)
          try {
            const response = await fetch("https://rewards.bing.com/api/getuserinfo", { credentials: "include" });
            if (response.ok) {
              const data = await response.json();
              if (data && data.userStatus) {
                if (data.userStatus.todayPoints !== undefined && data.userStatus.todayPoints !== null) {
                  const val = parseInt(data.userStatus.todayPoints, 10);
                  if (!isNaN(val) && val > 0) values.push(val);
                }
                if (data.userStatus.counters && data.userStatus.counters.dailyPoint) {
                  const calculated = data.userStatus.counters.dailyPoint.reduce((acc, curr) => acc + (curr.pointProgress || 0), 0);
                  if (calculated > 0) {
                    values.push(calculated);
                  }
                }
              }
            }
          } catch (e) {}

          // Helper para buscar un elemento por texto dentro de Shadow DOM
          function findElementByTextDeep(root, regex) {
            if (!root) return null;
            if (root.nodeType === Node.ELEMENT_NODE) {
              if (root.shadowRoot) {
                const found = findElementByTextDeep(root.shadowRoot, regex);
                if (found) return found;
              }
              const text = (root.innerText || root.textContent || "").trim();
              if (regex.test(text)) {
                let childMatch = null;
                for (let child of root.children) {
                  const found = findElementByTextDeep(child, regex);
                  if (found) {
                    childMatch = found;
                    break;
                  }
                }
                return childMatch || root;
              }
            } else if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
              for (let child of root.children) {
                const found = findElementByTextDeep(child, regex);
                if (found) return found;
              }
            }
            return null;
          }

          // Helper para extraer números dentro del contenedor (incluyendo Shadow DOM)
          function getNumbersDeep(node) {
            const numbers = [];
            function collect(n) {
              if (!n) return;
              if (n.nodeType === Node.ELEMENT_NODE) {
                const text = (n.innerText || n.textContent || "").trim();
                const val = parseInt(text.replace(/\D/g, ""), 10);
                if (!isNaN(val) && val > 0) {
                  numbers.push(val);
                }
                if (n.shadowRoot) {
                  collect(n.shadowRoot);
                }
              }
              for (let child of n.childNodes) {
                collect(child);
              }
            }
            collect(node);
            return numbers;
          }

          // 3. Búsqueda localizada en el DOM por etiqueta (Shadow-DOM Piercing)
          try {
            const targetRegex = /^(Puntos de hoy|Today's points)$/i;
            const labelEl = findElementByTextDeep(document.body, targetRegex);
            if (labelEl) {
              const parent = labelEl.parentElement || labelEl.getRootNode();
              if (parent) {
                const siblingNumbers = getNumbersDeep(parent);
                if (siblingNumbers.length > 0) {
                  values.push(siblingNumbers[0]);
                }
              }
            }
          } catch(e) {}

          // 4. Regex innerText Fallback
          try {
            const bodyText = document.body.innerText || document.body.textContent || "";
            const match = bodyText.match(/(?:Puntos de hoy|Today's points)[^\d]{1,40}?(\d+)/i);
            if (match && match[1]) {
              const val = parseInt(match[1], 10);
              if (!isNaN(val)) values.push(val);
            } else {
              const match2 = bodyText.match(/(?:Puntos de hoy|Today's points)[\s\S]{1,50}?(?:\n|\r)\s*(\d+)/i);
              if (match2 && match2[1]) {
                const val = parseInt(match2[1], 10);
                if (!isNaN(val)) values.push(val);
              }
            }
          } catch(e) {}

          // Seleccionar el valor máximo
          if (values.length > 0) {
            todayPts = Math.max(...values);
          }
          
          // Streak
          const stkElems = document.querySelectorAll('button, .streak-count, [data-bi-id="streak"]');
          for (let el of stkElems) {
            if (el && el.innerText && (el.innerText.toLowerCase().includes('racha') || el.classList.contains('streak-count'))) {
              const parsedStk = parseInt(el.innerText.replace(/\D/g, ''));
              if (!isNaN(parsedStk)) {
                stk = parsedStk;
                break;
              }
            }
          }
          
          return { todayPts, totalPts, stk };
        }
      });
      if (domResult && domResult[0] && domResult[0].result) {
        domTodayPoints = domResult[0].result.todayPts;
        domTotalPoints = domResult[0].result.totalPts;
        domStreak = domResult[0].result.stk;
      }
    }
  } catch (e) {
    console.log("No se pudo obtener Puntos/Racha del DOM, usando valor de API o previos.");
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const isToday = prevStats.lastUpdatedDate === todayStr;

  // Calculate final todayPoints by selecting the maximum value from all available sources
  let todayPointsCandidates = [];
  if (userStatus.todayPoints !== undefined && userStatus.todayPoints !== null) {
    todayPointsCandidates.push(parseInt(userStatus.todayPoints, 10));
  }
  if (apiCalculatedTodayPoints > 0) {
    todayPointsCandidates.push(apiCalculatedTodayPoints);
  }
  if (domTodayPoints !== null) {
    todayPointsCandidates.push(domTodayPoints);
  }
  if (isToday && prevStats.todayPoints > 0) {
    todayPointsCandidates.push(prevStats.todayPoints);
  }
  
  let realTodayPoints = todayPointsCandidates.length > 0 
    ? Math.max(...todayPointsCandidates.filter(v => !isNaN(v))) 
    : 0;

  let realTotalPoints = userStatus.availablePoints;
  if (realTotalPoints === undefined || realTotalPoints === 0) {
    realTotalPoints = domTotalPoints !== null ? domTotalPoints : prevStats.totalPoints || 0;
  }
  if (domTotalPoints !== null && (!data || !data.userStatus)) {
    realTotalPoints = domTotalPoints;
  }
  
  let realStreak = userStatus.streakInfo?.activityStreak;
  if (realStreak === undefined || realStreak === 0) {
    realStreak = domStreak !== null ? domStreak : prevStats.streak || 0;
  }
  if (domStreak !== null && domStreak > (realStreak || 0)) {
    realStreak = domStreak;
  }

  // Raw API/counter detection
  let apiPcCurrent = 0, apiPcMax = 0, apiPcFound = false;
  if (counters.pcSearch && counters.pcSearch[0]) {
    apiPcCurrent = counters.pcSearch[0].pointProgress || 0;
    apiPcMax = counters.pcSearch[0].pointProgressMax || 0;
    apiPcFound = true;
  }

  let pcCurrent = 0, pcMax = 90;

  if (isToday) {
    // If lastUpdatedDate is today, only update if the new points from the API are >= the cached points.
    const prevPcCurrent = prevStats.pcSearch ? (prevStats.pcSearch.current || 0) : 0;
    const prevPcMax = prevStats.pcSearch ? (prevStats.pcSearch.max || 90) : 90;
    pcCurrent = (apiPcFound && apiPcCurrent >= prevPcCurrent) ? apiPcCurrent : prevPcCurrent;
    pcMax = (apiPcFound && apiPcMax > 0) ? apiPcMax : prevPcMax;
  } else {
    // The day has changed. We reset points to 0, but preserve/default max points if API returns 0.
    if (apiPcFound) {
      pcCurrent = apiPcCurrent;
      pcMax = apiPcMax > 0 ? apiPcMax : (prevStats.pcSearch?.max || 90);
    } else {
      pcCurrent = 0;
      pcMax = prevStats.pcSearch?.max || 90;
    }
  }

  // Tier Auto-detection based on API max points
  let detectedTier = userStatus.levelInfo?.activeLevel || prevStats.level || "Member";
  if (pcMax >= 250 || pcMax > 150) {
    detectedTier = "Gold";
  } else if (pcMax === 150 || (pcMax > 50 && pcMax <= 150)) {
    detectedTier = "Silver";
  } else if (pcMax <= 75) {
    detectedTier = "Member";
  }

  // Reliable Today Points using startOfDayPoints
  let startOfDayPoints = prevStats.startOfDayPoints || realTotalPoints;
  if (!isToday || startOfDayPoints > realTotalPoints) {
    startOfDayPoints = realTotalPoints;
  }
  let calculatedTodayPoints = realTotalPoints - startOfDayPoints;
  if (calculatedTodayPoints < 0) calculatedTodayPoints = 0;
  
  // Use calculated points unless the API explicitly provides a higher number
  if (calculatedTodayPoints > (realTodayPoints || 0)) {
    realTodayPoints = calculatedTodayPoints;
  }

  const stats = {
    todayPoints: (realTodayPoints !== undefined && realTodayPoints !== null) ? realTodayPoints : 0,
    totalPoints: realTotalPoints || 0,
    streak: realStreak || 0,
    level: detectedTier,
    lastUpdatedDate: todayStr,
    startOfDayPoints: startOfDayPoints,
    pcSearch: { current: pcCurrent, max: pcMax }
  };

  await chrome.storage.local.set({ stats });
  console.log("Rewards API: Synced real stats:", stats);
  return stats;
}
