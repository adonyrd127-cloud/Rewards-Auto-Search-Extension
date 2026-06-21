// Import search topics
importScripts('words.js');

// Constants
const EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.69";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";
const BING_SEARCH_URL = "https://www.bing.com/search?q=";

// Default configuration
const DEFAULT_SETTINGS = {
  desktopSearches: 30,
  mobileSearches: 20,
  edgeSearches: 20,
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
  autoStartNextMode: true
};

// Default session state
const DEFAULT_SESSION = {
  status: "idle", // "idle", "running", "paused", "stopped", "completed"
  mode: null, // "desktop", "mobile", "edge"
  totalSearches: 0,
  completedSearches: 0,
  pointsEarned: 0,
  currentIndex: 0,
  queries: [],
  tabId: null,
  modesQueue: [] // To chain desktop -> mobile -> edge
};

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

// Listener for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSession") {
    startSearchSession(message.mode, message.queue || [])
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
  
  if (message.action === "pauseSession") {
    pauseSearchSession()
      .then(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.action === "resumeSession") {
    resumeSearchSession()
      .then(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.action === "stopSession") {
    stopSearchSession()
      .then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "updateSchedule") {
    updateScheduleAlarm()
      .then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "openAndCloseTab") {
    chrome.tabs.create({ url: message.url, active: false }, (tab) => {
      setTimeout(() => {
        try {
          chrome.tabs.remove(tab.id);
        } catch (e) {
          // ignore
        }
      }, message.delay || 6000);
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "syncPoints") {
    syncUserInfo()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Abrir la página de Rewards y dejar que el content script haga su trabajo
  if (message.action === "runDailyTasks") {
    openRewardsDashboard()
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
});

// Alarm Listener for scheduling
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily-rewards-run") {
    console.log("Scheduled run triggered!");
    triggerScheduledRun();
  } else if (alarm.name === "check-schedule") {
    // Fallback scheduler verification
    checkAndTriggerSchedule();
  } else if (alarm.name === "daily-tasks-reminder") {
    // Recordatorio de las 10 PM si no se han completado las tareas
    checkDailyTasksReminder();
  }
});

// Abrir el dashboard de Rewards para que los content scripts trabajen
async function openRewardsDashboard() {
  // Verificar si ya hay una pestaña de rewards abierta
  const tabs = await chrome.tabs.query({ url: "*://rewards.bing.com/*" });
  if (tabs.length > 0) {
    // Activar la pestaña existente y recargarla
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.tabs.reload(tabs[0].id);
  } else {
    // Abrir nueva pestaña
    await chrome.tabs.create({ url: "https://rewards.bing.com/earn", active: true });
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

// Spoof User-Agent header using declarativeNetRequest
async function setUserAgentRule(mode) {
  const ruleId = 1;
  
  // Remove rule if it exists
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId]
  });

  if (mode === "desktop") {
    console.log("UA Rule: Default desktop agent (no rule)");
    return;
  }

  let requestHeaders = [];
  if (mode === "edge") {
    requestHeaders = [
      { header: "User-Agent", operation: "set", value: EDGE_UA },
      { header: "Sec-CH-UA-Mobile", operation: "set", value: "?0" },
      { header: "Sec-CH-UA-Platform", operation: "set", value: "\"Windows\"" },
      { header: "Sec-CH-UA", operation: "set", value: "\"Not)A;Brand\";v=\"99\", \"Microsoft Edge\";v=\"116\", \"Chromium\";v=\"116\"" }
    ];
  } else if (mode === "mobile") {
    requestHeaders = [
      { header: "User-Agent", operation: "set", value: MOBILE_UA },
      { header: "Sec-CH-UA-Mobile", operation: "set", value: "?1" },
      { header: "Sec-CH-UA-Platform", operation: "set", value: "\"Android\"" }
    ];
  }

  console.log(`UA Rule: Setting UA spoofing rule for ${mode} mode`);

  const rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: requestHeaders
    },
    condition: {
      urlFilter: "*://*.bing.com/*",
      resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "other"]
    }
  };

  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [rule]
  });
}

// Generate search queries
function generateQueries(source, count, customQueriesRaw) {
  let list = [];
  if (source === "custom" && customQueriesRaw.trim()) {
    list = customQueriesRaw.split(",").map(q => q.trim()).filter(q => q.length > 0);
  }
  
  if (list.length < count) {
    const topics = self.SEARCH_TOPICS || ["microsoft rewards", "bing search", "google vs bing", "xbox games"];
    const shuffled = [...topics].sort(() => 0.5 - Math.random());
    
    // Fill remaining items
    while (list.length < count) {
      list.push(shuffled[list.length % shuffled.length]);
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

  if (currentSession.status === "running" || currentSession.status === "paused") {
    throw new Error("A search session is already active.");
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
    } else if (mode === "mobile" && stats.mobileSearch) {
      currentPoints = stats.mobileSearch.current || 0;
      maxPoints = stats.mobileSearch.max || 0;
    }

    // Only skip if we have REAL data from today AND searches are truly completed
    // maxPoints must be > 0 (known) AND currentPoints must have reached it
    if (maxPoints > 0 && currentPoints >= maxPoints) {
      console.log(`Skipping ${mode} mode: searches are already completed today (${currentPoints}/${maxPoints} points).`);
      
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
  let count = mode === "desktop" ? settings.desktopSearches : (mode === "mobile" ? settings.mobileSearches : settings.edgeSearches);
  
  // Calculate exact remaining searches based on stats
  if (stats && maxPoints > 0) {
    const remainingPoints = maxPoints - currentPoints;
    const searchesNeeded = Math.ceil(remainingPoints / 3);
    // Don't do more searches than what's needed to max out
    if (searchesNeeded > 0 && searchesNeeded < count) {
      count = searchesNeeded;
    }
  }

  const queries = generateQueries(settings.querySource, count, settings.customQueries);
  
  const newSession = {
    status: "running",
    mode: mode,
    totalSearches: count,
    completedSearches: 0,
    pointsEarned: 0,
    currentIndex: 0,
    queries: queries,
    tabId: null,
    modesQueue: queue
  };

  await sendWebhookNotification(`▶️ Iniciando búsquedas en modo **${mode.toUpperCase()}** (${newSession.totalSearches} búsquedas). Queue restante: ${queue.length > 0 ? queue.join(", ") : "Ninguna"}`);

  await chrome.storage.local.set({ session: newSession });
  notifyPopup();

  // Run the async session loop
  runSessionLoop(newSession);
}

// Session loop orchestrator
async function runSessionLoop(session) {
  try {
    const storage = await chrome.storage.local.get("settings");
    const settings = storage.settings || DEFAULT_SETTINGS;

    // Apply User Agent rule for the session mode
    await setUserAgentRule(session.mode);

    // Create the search tab
    const tab = await chrome.tabs.create({
      url: "https://www.bing.com",
      active: false // runs in background
    });
    
    session.tabId = tab.id;
    await chrome.storage.local.set({ session });

    // Wait for the page to settle
    await new Promise(resolve => setTimeout(resolve, 3000));

    while (session.currentIndex < session.totalSearches) {
      // Re-fetch current state in case of pause/stop
      const state = await chrome.storage.local.get("session");
      session = state.session;

      if (!session || session.status === "stopped") {
        break;
      }

      if (session.status === "paused") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const query = session.queries[session.currentIndex];
      console.log(`Searching [${session.currentIndex + 1}/${session.totalSearches}]: ${query}`);

      // Simulate human typing by executing a script in the Bing tab
      const searchUrl = BING_SEARCH_URL + encodeURIComponent(query);
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: (searchQuery, fallbackUrl) => {
             const input = document.querySelector('textarea[name="q"], input[name="q"]');
             if (!input) {
                // Si no hay barra de búsqueda (ej. la página no cargó bien), navegar directo
                window.location.href = fallbackUrl;
                return;
             }
             
             // Enfocar y limpiar la barra
             input.focus();
             input.value = "";
             
             // Simular escritura letra por letra
             let i = 0;
             function typeNext() {
                if (i < searchQuery.length) {
                   input.value += searchQuery.charAt(i);
                   input.dispatchEvent(new Event('input', { bubbles: true }));
                   i++;
                   // Retraso humano entre teclas (40 a 120ms)
                   setTimeout(typeNext, 40 + Math.random() * 80);
                } else {
                   // Esperar un poquito antes de presionar enter/buscar
                   setTimeout(() => {
                      const form = input.closest('form');
                      if (form) {
                         const btn = form.querySelector('input[type="submit"], button[type="submit"], #search_icon');
                         if (btn) btn.click();
                         else form.submit();
                      } else {
                         // Fallback presionando Enter
                         const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", keyCode: 13 });
                         input.dispatchEvent(e);
                         // Fallback final si no funciona nada
                         setTimeout(() => { window.location.href = fallbackUrl; }, 1000);
                      }
                   }, 300 + Math.random() * 400);
                }
             }
             typeNext();
          },
          args: [query, searchUrl]
        });
      } catch (e) {
        // Fallback si la inyección de script falla (ej. pestaña cerrada o página aún cargando la primera vez)
        console.log("Scripting falló, navegando directamente...", e);
        try {
          const newTab = await chrome.tabs.update(session.tabId, { url: searchUrl });
        } catch (err) {
          // Tab was closed by user, recreate it
          console.log("Search tab was closed, recreating...");
          const newTab = await chrome.tabs.create({ url: searchUrl, active: false });
          session.tabId = newTab.id;
          await chrome.storage.local.set({ session });
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Increment completed count
      session.completedSearches++;
      session.currentIndex++;
      session.pointsEarned += 3; // Bing Rewards: 3 points per search

      await chrome.storage.local.set({ session });
      notifyPopup();

      // Check if finished
      if (session.currentIndex >= session.totalSearches) {
        break;
      }

      // Calculate delay
      let delayMs = settings.cooldownBetweenSearches * 1000;
      if (settings.enableRandomDelay) {
        const rand = Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1)) + settings.minDelay;
        delayMs += rand * 1000;
      }

      // Wait the delay in small increments to support rapid pause/stop responsiveness
      const startDelay = Date.now();
      while (Date.now() - startDelay < delayMs) {
        const loopState = await chrome.storage.local.get("session");
        if (!loopState.session || loopState.session.status === "stopped") {
          break;
        }
        if (loopState.session.status === "paused") {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Wrap up session
    const finalState = await chrome.storage.local.get(["session", "settings"]);
    session = finalState.session;

    if (session && session.status === "running") {
      session.status = "completed";
      await chrome.storage.local.set({ session });
      
      // Update stats and history
      await updateStatsAndHistory(session);
      notifyPopup();

      // Clean up tab
      if (finalState.settings.autoCloseTabs && session.tabId) {
        try {
          await chrome.tabs.remove(session.tabId);
        } catch (e) {
          // ignore
        }
      }

      // Reset UA rule
      await setUserAgentRule("desktop");

      // Check queue for next mode (Desktop -> Mobile -> Edge chaining)
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
        await chrome.storage.local.set({
          session: DEFAULT_SESSION
        });
        notifyPopup();
        // Reprogramar la próxima ejecución (para aplicar nuevo jitter al día siguiente)
        updateScheduleAlarm();
        await sendWebhookNotification(`✅ Todos los modos de búsqueda han finalizado correctamente.`);
      }
    } else if (session && session.status === "stopped") {
      // Clean up tab
      if (finalState.settings.autoCloseTabs && session.tabId) {
        try {
          await chrome.tabs.remove(session.tabId);
        } catch (e) {
          // ignore
        }
      }
      await setUserAgentRule("desktop");
      await updateStatsAndHistory(session);
      await chrome.storage.local.set({ session: DEFAULT_SESSION });
      notifyPopup();
      await sendWebhookNotification(`🛑 Sesión detenida por el usuario o debido a un error.`);
    }

  } catch (error) {
    console.error("Error in session loop:", error);
    await setUserAgentRule("desktop");
    await chrome.storage.local.set({ session: DEFAULT_SESSION });
    notifyPopup();
  }
}

// Pause session
async function pauseSearchSession() {
  const data = await chrome.storage.local.get("session");
  const session = data.session;
  if (session && session.status === "running") {
    session.status = "paused";
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
    await chrome.storage.local.set({ session });
    notifyPopup();
  }
}

// Stop session
async function stopSearchSession() {
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
    await openRewardsDashboard();
    // Dar tiempo suficiente para que los content scripts escaneen y reclamen
    // (El panel se encarga de todo automáticamente)
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log("Paso 1 completado: Dashboard de Rewards procesado.");
  } catch (e) {
    console.warn("Error abriendo dashboard de Rewards:", e);
  }

  // PASO 2: Ejecutar búsquedas automatizadas
  console.log("Paso 2: Iniciando búsquedas automatizadas...");
  
  // Build queue of enabled search modes
  const queue = [];
  if (settings.mobileSearches > 0) queue.push("mobile");
  if (settings.edgeSearches > 0) queue.push("edge");
  
  // Start with desktop if configured
  if (settings.desktopSearches > 0) {
    startSearchSession("desktop", queue);
  } else if (queue.length > 0) {
    startSearchSession(queue[0], queue.slice(1));
  }
}

// Notify popup of progress updates
function notifyPopup() {
  chrome.runtime.sendMessage({ action: "sessionUpdate" }).catch(() => {
    // Ignore error if popup is closed
  });
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
      if (retries === 0) return null;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  // Si data sigue siendo null después del loop (no debería llegar aquí, pero por seguridad)
  if (!data || !data.userStatus) {
    console.log("Rewards API: data is null after loop, returning null.");
    return null;
  }

  // Extraer datos
  const userStatus = data.userStatus;
  const counters = userStatus.counters || {};

  // Intentar obtener el 'Puntos de hoy' real del DOM
  let realTodayPoints = userStatus.todayPoints || 0;
  try {
    const tabs = await chrome.tabs.query({ url: "*://rewards.bing.com/*" });
    if (tabs.length > 0) {
      const domResult = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          const elem = document.querySelector('mee-rewards-counter-animation span');
          if (elem && elem.innerText) {
            const pts = parseInt(elem.innerText.replace(/\D/g, ''));
            if (!isNaN(pts)) return pts;
          }
          return null;
        }
      });
      if (domResult && domResult[0] && domResult[0].result) {
        realTodayPoints = domResult[0].result;
      }
    }
  } catch (e) {
    console.log("No se pudo obtener Puntos de hoy del DOM, usando valor de API.");
  }

  // Standard PC Search
  let pcCurrent = 0, pcMax = 0;
  if (counters.pcSearch && counters.pcSearch[0]) {
    pcCurrent = counters.pcSearch[0].pointProgress || 0;
    pcMax = counters.pcSearch[0].pointProgressMax || 0;
  }

  // Edge Search
  let edgeCurrent = 0, edgeMax = 0;
  if (counters.pcSearch && counters.pcSearch[1]) {
    edgeCurrent = counters.pcSearch[1].pointProgress || 0;
    edgeMax = counters.pcSearch[1].pointProgressMax || 0;
  } else if (counters.edgeSearch && counters.edgeSearch[0]) {
    edgeCurrent = counters.edgeSearch[0].pointProgress || 0;
    edgeMax = counters.edgeSearch[0].pointProgressMax || 0;
  }

  // Mobile Search
  let mobileCurrent = 0, mobileMax = 0;
  if (counters.mobileSearch && counters.mobileSearch[0]) {
    mobileCurrent = counters.mobileSearch[0].pointProgress || 0;
    mobileMax = counters.mobileSearch[0].pointProgressMax || 0;
  } else if (counters.mobileSearch && counters.mobileSearch.length > 0) {
    mobileCurrent = counters.mobileSearch[counters.mobileSearch.length-1].pointProgress || 0;
    mobileMax = counters.mobileSearch[counters.mobileSearch.length-1].pointProgressMax || 0;
  } else if (!counters.mobileSearch && pcMax > 0 && pcMax <= 60) {
    mobileMax = 0;
  }

  const stats = {
    todayPoints: realTodayPoints,
    totalPoints: userStatus.availablePoints || 0,
    streak: userStatus.streakInfo?.activityStreak || 0,
    level: userStatus.levelInfo?.activeLevel || "Nivel 1",
    lastUpdatedDate: new Date().toISOString().split("T")[0],
    pcSearch: { current: pcCurrent, max: pcMax },
    edgeSearch: { current: edgeCurrent, max: edgeMax },
    mobileSearch: { current: mobileCurrent, max: mobileMax }
  };

  await chrome.storage.local.set({ stats });
  console.log("Rewards API: Synced real stats:", stats);
  return stats;
}
