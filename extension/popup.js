// ═══════════════════════════════════════════════════════════════
// Rewards Auto Search & Claimer — Popup Logic v4.2
// ═══════════════════════════════════════════════════════════════

// Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Stats Elements
const statTodayPoints = document.getElementById('stat-today-points');
const statStreak = document.getElementById('stat-streak');
const statTotalPoints = document.getElementById('stat-total-points');
const statLevel = document.getElementById('stat-level');

// Session Panel Elements
const activeSessionContainer = document.getElementById('active-session-container');
const sessionModeBadge = document.getElementById('session-mode-badge');
const sessionProgressText = document.getElementById('session-progress-text');
const sessionPercentage = document.getElementById('session-percentage');
const sessionProgressFill = document.getElementById('session-progress-fill');
const sessionCurrentQuery = document.getElementById('session-current-query');
const sessionEstimatedPoints = document.getElementById('session-estimated-points');
const btnPauseResume = document.getElementById('btn-pause-resume');
const btnPauseText = document.getElementById('btn-pause-text');
const btnStop = document.getElementById('btn-stop');

// Launcher Elements
const btnLaunchDesktop = document.getElementById('launch-desktop');
const btnLaunchAll = document.getElementById('launch-all');
const btnLaunchDailyTasks = document.getElementById('launch-daily-tasks');
const lblDesktopCount = document.getElementById('lbl-desktop-count');
const btnRefreshPoints = document.getElementById('btn-refresh-points');

// Settings Form Elements
const settingsForm = document.getElementById('settings-form');
const setDesktopSearches = document.getElementById('set-desktop-searches');
const setMinDelay = document.getElementById('set-min-delay');
const setMaxDelay = document.getElementById('set-max-delay');
const setEnableRandomDelay = document.getElementById('set-enable-random-delay');
const setCooldown = document.getElementById('set-cooldown');
const setAutoClose = document.getElementById('set-auto-close');
const setRunActiveTab = document.getElementById('set-run-active-tab');
const setCooldown15min = document.getElementById('set-cooldown-15min');
const setWebhookUrl = document.getElementById('set-webhook-url');
const querySourceRadios = document.getElementsByName('querySource');
const customQueriesArea = document.getElementById('custom-queries-area');
const setCustomQueries = document.getElementById('set-custom-queries');

// Schedule Form Elements
const scheduleForm = document.getElementById('schedule-form');
const setScheduleEnabled = document.getElementById('set-schedule-enabled');
const scheduleConfigArea = document.getElementById('schedule-config-area');
const setScheduleTime = document.getElementById('set-schedule-time');
const dayCheckboxes = document.querySelectorAll('.days-selector input');

// History Elements
const historyRows = document.getElementById('history-rows');
const btnClearHistory = document.getElementById('btn-clear-history');

// Activity Log Elements
const activityHeaderToggle = document.getElementById('activity-header-toggle');
const activityLogBody = document.getElementById('activity-log-body');
const activityLogContent = document.getElementById('activity-log-content');
const activityArrow = document.getElementById('activity-arrow');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Refrescar automáticamente si hay cambios en storage local
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.stats || changes.session || changes.scannedTasks) {
        loadAllData();
      }
    }
  });

  // Bind Tab Click Handlers
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Load configuration and data
  await loadAllData();

  // Load and render activity logs
  const logsData = await chrome.storage.local.get(["activityLog", "activityPanelExpanded"]);
  renderActivityLogs(logsData.activityLog || []);
  if (logsData.activityPanelExpanded && activityLogBody && activityArrow) {
    activityLogBody.classList.add('expanded');
    activityArrow.innerText = '▲';
  }

  // Bind Activity Log expand/collapse toggle
  if (activityHeaderToggle) {
    activityHeaderToggle.addEventListener('click', async () => {
      const isExpanded = activityLogBody.classList.contains('expanded');
      if (isExpanded) {
        activityLogBody.classList.remove('expanded');
        activityArrow.innerText = '▼';
        await chrome.storage.local.set({ activityPanelExpanded: false });
      } else {
        activityLogBody.classList.add('expanded');
        activityArrow.innerText = '▲';
        setTimeout(() => {
          activityLogContent.scrollTop = activityLogContent.scrollHeight;
        }, 350);
        await chrome.storage.local.set({ activityPanelExpanded: true });
      }
    });
  }

  // Bind Form toggles
  setupUIInteractionToggles();

  // Bind Actions
  setupActionListeners();

  // Trigger on-demand sync with Microsoft Rewards API in background
  chrome.runtime.sendMessage({ action: "syncPoints" }, (res) => {
    if (res && res.success) {
      loadAllData();
    }
  });

  // Poll storage for active session updates
  setInterval(updateDashboard, 1000);

  // Listen to background runtime messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "sessionUpdate") {
      updateDashboard();
      loadAllData();
    }
    if (message.action === "sessionSkipped") {
      showToast(`${message.mode.toUpperCase()} omitido: ¡Búsquedas ya completadas hoy!`, false);
      updateDashboard();
      loadAllData();
    }
    if (message.action === "activityLogUpdate" && message.logEntry) {
      appendLogEntryToUI(message.logEntry);
    }
  });
});

// Switch visible tab
function switchTab(tabId) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });
}

// Bind show/hide fields
function setupUIInteractionToggles() {
  const toggleQueryArea = () => {
    const selectedRadio = document.querySelector('input[name="querySource"]:checked');
    const selectedSource = selectedRadio ? selectedRadio.value : "random";
    customQueriesArea.style.display = selectedSource === "custom" ? "block" : "none";
  };
  querySourceRadios.forEach(radio => radio.addEventListener('change', toggleQueryArea));

  const toggleScheduleArea = () => {
    scheduleConfigArea.style.display = setScheduleEnabled.checked ? "block" : "none";
  };
  setScheduleEnabled.addEventListener('change', toggleScheduleArea);
}

// Load and populate fields
async function loadAllData() {
  const data = await chrome.storage.local.get(["settings", "session", "stats", "history", "scannedTasks"]);
  
  const settings = data.settings || {};
  const session = data.session || {};
  const stats = data.stats || { todayPoints: 0, totalPoints: 0, streak: 0 };
  const history = data.history || [];

  // Update Stats UI
  let levelText = stats.level || "Nivel 1";
  if (levelText.toLowerCase().includes("level2") || levelText === "Level 2" || levelText === "Silver") levelText = "Nivel 2";
  else if (levelText.toLowerCase().includes("gold")) levelText = "Nivel Gold";
  else if (levelText.toLowerCase().includes("level1") || levelText === "Level 1" || levelText === "Member") levelText = "Nivel 1";
    
  statTodayPoints.innerText = stats.todayPoints ?? 0;
  statStreak.innerText = stats.streak ?? 0;
  statTotalPoints.innerText = stats.totalPoints ?? 0;
  if (statLevel) statLevel.innerText = levelText;

  // Pre-populate settings form
  if (settings) {
    setDesktopSearches.value = settings.desktopSearches ?? 30;
    setMinDelay.value = settings.minDelay ?? 6;
    setMaxDelay.value = settings.maxDelay ?? 15;
    setEnableRandomDelay.checked = settings.enableRandomDelay ?? true;
    setCooldown.value = settings.cooldownBetweenSearches ?? 2;
    setAutoClose.checked = settings.autoCloseTabs ?? true;
    if (setRunActiveTab) setRunActiveTab.checked = settings.runSearchesInActiveTab ?? true;
    if (setCooldown15min) setCooldown15min.checked = settings.cooldown15MinBatch ?? false;
    if (setWebhookUrl) setWebhookUrl.value = settings.webhookUrl || '';
    
    // Label display counts on launcher
    const pcMax = stats.pcSearch ? (stats.pcSearch.max || 90) : (settings.desktopSearches * 3 || 90);
    const pcCurrent = stats.pcSearch ? (stats.pcSearch.current || 0) : 0;
    lblDesktopCount.innerText = `${pcCurrent}/${pcMax} pts (${Math.round(pcCurrent/3)}/${Math.round(pcMax/3)} búsquedas)`;
    updateLauncherProgress('desktop', pcCurrent, pcMax);
    updateLauncherCompletion('desktop', pcCurrent, pcMax);

    // Update Circular Progress Rings
    const totalMaxSearchPoints = pcMax || 90;
    updateCircularProgress('ring-today', stats.todayPoints || 0, totalMaxSearchPoints);

    // Update Weekly Streak mini-bar
    const streakBar = document.getElementById('streak-bar');
    if (streakBar) {
      const streakPct = Math.min(((stats.streak || 0) / 7) * 100, 100);
      streakBar.style.width = `${streakPct}%`;
    }

    // Query source selection
    querySourceRadios.forEach(radio => {
      if (radio.value === (settings.querySource || "random")) {
        radio.checked = true;
      }
    });
    customQueriesArea.style.display = (settings.querySource || "random") === "custom" ? "block" : "none";
    setCustomQueries.value = settings.customQueries || "";

    // Pre-populate schedule
    setScheduleEnabled.checked = settings.scheduleEnabled ?? false;
    scheduleConfigArea.style.display = (settings.scheduleEnabled ?? false) ? "block" : "none";
    setScheduleTime.value = settings.scheduleTime || "09:00";
    
    const activeDays = settings.activeDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    dayCheckboxes.forEach(chk => {
      chk.checked = activeDays.includes(chk.value);
    });
  }

  // Render History Table
  renderHistory(history);

  // Render Daily Tasks Status list from storage
  updateDailyTasksUI(data.scannedTasks);

  // Initial dashboard sync
  updateDashboardState(session, stats);

  // Remove skeleton classes once loaded
  document.querySelectorAll('.skeleton-text').forEach(el => el.classList.remove('skeleton-text'));
  document.querySelectorAll('.skeleton-item').forEach(el => el.classList.remove('skeleton-item'));
}

// Render history rows
function renderHistory(history) {
  if (!history || history.length === 0) {
    historyRows.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Sin historial registrado aún.</td></tr>`;
    return;
  }

  historyRows.innerHTML = history.map(item => {
    const dateObj = new Date(item.date);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const modeLabel = item.mode === 'desktop' ? 'PC' : (item.mode || 'Auto');
    
    return `
      <tr>
        <td>
          <div style="font-weight:600;">${dateStr}</div>
          <div class="text-muted" style="font-size: 9.5px;">${timeStr}</div>
        </td>
        <td><span class="badge" style="color:var(--cyan); border-color:rgba(6,182,212,0.3); background:var(--cyan-dim);">${modeLabel}</span></td>
        <td>${item.searches}</td>
        <td class="text-green" style="font-weight:700;">+${item.points} pts</td>
      </tr>
    `;
  }).join('');
}

// Update dashboard states periodically
async function updateDashboard() {
  const data = await chrome.storage.local.get(["session", "stats", "scannedTasks"]);
  updateDashboardState(data.session, data.stats);
  updateDailyTasksUI(data.scannedTasks);
}

// Update circular progress ring offset dynamically
function updateCircularProgress(elementId, value, max) {
  const circle = document.getElementById(elementId);
  if (!circle) return;
  
  const r = parseFloat(circle.getAttribute('r')) || 40;
  const circumference = 2 * Math.PI * r;
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const offset = circumference - (percent / 100) * circumference;
  
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = offset;
  
  if (percent >= 100) {
    circle.style.stroke = '#10b981';
  } else if (percent >= 50) {
    circle.style.stroke = '#f59e0b';
  } else {
    circle.style.stroke = '#06b6d4';
  }
}

// Update launcher progress bar fill
function updateLauncherProgress(mode, current, max) {
  const fill = document.getElementById(`progress-${mode}`);
  if (!fill) return;
  
  const percent = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  fill.style.width = `${percent}%`;
  
  if (percent >= 100) {
    fill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
  } else {
    fill.style.background = 'linear-gradient(90deg, #06b6d4, #3b82f6)';
  }
}

// Update session panel with visual classes
function updateSessionVisualState(session) {
  const panel = document.getElementById('active-session-container');
  const icon = document.getElementById('session-icon');
  const title = document.getElementById('session-title');
  
  if (!panel) return;
  
  panel.classList.remove('running', 'paused', 'idle');
  
  if (session && session.status === 'running') {
    panel.classList.add('running');
    if (icon) icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>`;
    if (title) title.innerText = 'Automatización Activa';
  } else if (session && session.status === 'paused') {
    panel.classList.add('paused');
    if (icon) icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>`;
    if (title) title.innerText = 'Automatización Pausada';
  } else {
    panel.classList.add('idle');
    if (icon) icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>`;
    if (title) title.innerText = 'Automatización Inactiva';
  }
}

// Render Daily Tasks mini status checklist with SVG icons
function updateDailyTasksUI(scannedTasks) {
  const list = document.getElementById('daily-tasks-list');
  const countBadge = document.getElementById('daily-tasks-count');
  if (!list) return;

  const checkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>`;
  const clockIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 6 12 12 16 14" /></svg>`;
  
  if (!scannedTasks || (!scannedTasks.dailySet && !scannedTasks.moreActivities && !scannedTasks.punchCards)) {
    list.innerHTML = `
      <div class="task-item pending">
        <span class="task-icon">${clockIcon}</span>
        <span class="task-name">Daily Set (Sin escanear)</span>
      </div>
      <div class="task-item pending">
        <span class="task-icon">${clockIcon}</span>
        <span class="task-name">More Activities (Sin escanear)</span>
      </div>
      <div class="task-item pending">
        <span class="task-icon">${clockIcon}</span>
        <span class="task-name">Punch Cards (Sin escanear)</span>
      </div>
    `;
    if (countBadge) {
      countBadge.classList.remove('skeleton-text');
      countBadge.innerText = '—';
    }
    const dailyBar = document.getElementById('progress-daily-tasks');
    if (dailyBar) dailyBar.style.width = '0%';
    return;
  }
  
  const dailySet = scannedTasks.dailySet || [];
  const moreActivities = scannedTasks.moreActivities || [];
  const punchCards = scannedTasks.punchCards || [];
  
  const totalTasks = dailySet.length + moreActivities.length + punchCards.length;
  const completedTasks = dailySet.filter(t => t.completed).length +
                         moreActivities.filter(t => t.completed).length +
                         punchCards.filter(t => t.completed).length;

  const dailyPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const dailyBar = document.getElementById('progress-daily-tasks');
  if (dailyBar) {
    dailyBar.style.width = `${dailyPct}%`;
  }
  
  if (countBadge) {
    countBadge.classList.remove('skeleton-text');
    countBadge.innerText = `${completedTasks}/${totalTasks}`;
    if (completedTasks === totalTasks && totalTasks > 0) {
      countBadge.style.color = '#10b981';
      countBadge.style.background = 'rgba(16, 185, 129, 0.12)';
      countBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      countBadge.style.color = '#f59e0b';
      countBadge.style.background = 'rgba(245, 158, 11, 0.12)';
      countBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    }
  }
  
  const dsPending = dailySet.filter(t => !t.completed).length;
  const dsText = dailySet.length === 0 ? "Daily Set (Sin actividades)" : `Daily Set (${dailySet.length - dsPending}/${dailySet.length})`;
  const dsClass = dailySet.length === 0 ? "pending" : (dsPending === 0 ? "completed" : "pending");
  const dsIcon = (dailySet.length > 0 && dsPending === 0) ? checkIcon : clockIcon;
  
  const maPending = moreActivities.filter(t => !t.completed).length;
  const maText = moreActivities.length === 0 ? "More Activities (Sin actividades)" : `More Activities (${moreActivities.length - maPending}/${moreActivities.length})`;
  const maClass = moreActivities.length === 0 ? "pending" : (maPending === 0 ? "completed" : "pending");
  const maIcon = (moreActivities.length > 0 && maPending === 0) ? checkIcon : clockIcon;
  
  const pcPending = punchCards.filter(t => !t.completed).length;
  const pcText = punchCards.length === 0 ? "Punch Cards (Sin tarjetas)" : `Punch Cards (${punchCards.length - pcPending}/${punchCards.length})`;
  const pcClass = punchCards.length === 0 ? "pending" : (pcPending === 0 ? "completed" : "pending");
  const pcIcon = (punchCards.length > 0 && pcPending === 0) ? checkIcon : clockIcon;
  
  list.innerHTML = `
    <div class="task-item ${dsClass}">
      <span class="task-icon">${dsIcon}</span>
      <span class="task-name">${dsText}</span>
    </div>
    <div class="task-item ${maClass}">
      <span class="task-icon">${maIcon}</span>
      <span class="task-name">${maText}</span>
    </div>
    <div class="task-item ${pcClass}">
      <span class="task-icon">${pcIcon}</span>
      <span class="task-name">${pcText}</span>
    </div>
  `;
}

// Update dashboard state DOM
function updateDashboardState(session, stats) {
  updateSessionVisualState(session);

  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  if (!session || session.status === "idle" || session.status === "completed" || session.status === "stopped") {
    document.body.className = "mode-idle";
    lastDisplayedQuery = "";
    if (statusDot) {
      statusDot.className = 'status-dot green';
    }
    if (statusText) statusText.innerText = 'Listo';
    
    sessionModeBadge.className = "badge";
    sessionModeBadge.innerText = "-";
    sessionProgressText.innerText = "Sin sesión activa";
    sessionPercentage.innerText = "0%";
    sessionProgressFill.style.width = "0%";
    sessionCurrentQuery.innerText = "Esperando inicio...";
    sessionCurrentQuery.className = "detail-val text-muted";
    sessionEstimatedPoints.innerText = "+0 pts";
    
    btnPauseResume.disabled = true;
    btnPauseText.innerText = "Pausar";
    btnStop.disabled = true;
    
    const speedRow = document.getElementById('session-speed-row');
    if (speedRow) speedRow.style.display = 'none';
    const tabsRow = document.getElementById('session-tabs-row');
    if (tabsRow) tabsRow.style.display = 'none';

    btnLaunchDesktop.disabled = false;
    btnLaunchAll.disabled = false;
    return;
  }

  // Active running or paused state
  document.body.className = session.mode === 'desktop' ? 'mode-desktop' : 'mode-edge';
  let translatedMode = session.mode === 'desktop' ? 'Escritorio' : 'Edge';
  sessionModeBadge.innerText = translatedMode;
  sessionModeBadge.className = `badge running`;
  
  const pct = Math.round((session.completedSearches / session.totalSearches) * 100) || 0;
  sessionProgressText.innerText = `${session.completedSearches} / ${session.totalSearches} Búsquedas`;
  sessionPercentage.innerText = `${pct}%`;
  sessionProgressFill.style.width = `${pct}%`;
  
  const currentQuery = session.queries[session.currentIndex] || "Buscando...";
  if (currentQuery !== lastDisplayedQuery) {
    lastDisplayedQuery = currentQuery;
    typeWriter(sessionCurrentQuery, currentQuery);
  } else if (!sessionCurrentQuery.innerText || sessionCurrentQuery.innerText === "Esperando inicio...") {
    sessionCurrentQuery.innerText = currentQuery;
  }
  sessionCurrentQuery.className = "detail-val";
  sessionEstimatedPoints.innerText = `+${session.pointsEarned} pts`;
  
  btnPauseResume.disabled = false;
  btnStop.disabled = false;
  
  if (session.status === "paused") {
    btnPauseText.innerText = "Reanudar";
    const playSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg>`;
    const curSvg = btnPauseResume.querySelector('svg');
    if (curSvg) curSvg.outerHTML = playSvg;
    if (statusDot) statusDot.className = 'status-dot orange';
    if (statusText) statusText.innerText = 'Pausado';
  } else {
    btnPauseText.innerText = "Pausar";
    const pauseSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>`;
    const curSvg = btnPauseResume.querySelector('svg');
    if (curSvg) curSvg.outerHTML = pauseSvg;
    if (statusDot) statusDot.className = 'status-dot green';
    if (statusText) statusText.innerText = `Buscando (${translatedMode})`;
  }

  btnLaunchDesktop.disabled = true;
  btnLaunchAll.disabled = true;

  // Speed and Sparkline updates
  const speedRow = document.getElementById('session-speed-row');
  const speedVal = document.getElementById('session-speed');
  if (session.startTime && session.completedSearches > 0) {
    const elapsedMin = (Date.now() - session.startTime) / 60000;
    const speed = elapsedMin > 0 ? (session.completedSearches / elapsedMin) : 0;
    if (speedRow && speedVal) {
      speedRow.style.display = 'flex';
      speedVal.innerText = `${speed.toFixed(1)} búsquedas/min`;
      
      if (session.speedHistory && session.speedHistory.length > 0) {
        renderSpeedSparkline(session.speedHistory);
      } else {
        renderSpeedSparkline([speed, speed]);
      }
    }
  } else {
    if (speedRow) speedRow.style.display = 'none';
  }

  // Tabs opened updates
  const tabsRow = document.getElementById('session-tabs-row');
  const tabsVal = document.getElementById('session-tabs-count');
  if (tabsRow && tabsVal) {
    const tabsCount = (session.openedTabIds || []).length;
    if (tabsCount > 0) {
      tabsRow.style.display = 'flex';
      tabsVal.innerText = tabsCount;
    } else {
      tabsRow.style.display = 'none';
    }
  }
}

// Bind Action Listeners
function setupActionListeners() {
  // Launchers
  btnLaunchDesktop.addEventListener('click', () => triggerLaunch('desktop'));
  
  btnLaunchAll.addEventListener('click', async () => {
    const data = await chrome.storage.local.get("settings");
    const settings = data.settings || {};
    
    const queue = [];
    const desktopSearches = settings.desktopSearches ?? 30;
    
    if (desktopSearches > 0) {
      triggerLaunch('desktop', queue);
    } else if (queue.length > 0) {
      triggerLaunch(queue[0], queue.slice(1));
    } else {
      showToast("¡Configura cantidad de búsquedas primero!", true);
    }
  });

  // Daily Tasks Launcher
  if (btnLaunchDailyTasks) {
    btnLaunchDailyTasks.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "runDailyTasks" }, (response) => {
        if (response && response.success) {
          showToast("Abriendo Rewards para reclamar tareas...");
          btnLaunchDailyTasks.disabled = true;
          btnLaunchDailyTasks.innerHTML = `
            <div class="launcher-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinning"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            </div>
            <span class="launcher-label">Procesando...</span>
            <span class="launcher-sub">Reclamando set</span>
          `;
          setTimeout(() => {
            btnLaunchDailyTasks.disabled = false;
            btnLaunchDailyTasks.innerHTML = `
              <div class="launcher-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" rx="1" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
              </div>
              <span class="launcher-label">Reclamar Tareas</span>
              <span class="launcher-sub">Daily Set + Más</span>
            `;
          }, 35000);
        } else {
          showToast(response?.error || "Error al abrir Rewards", true);
        }
      });
    });
  }

  // Refresh Points Button
  if (btnRefreshPoints) {
    btnRefreshPoints.addEventListener('click', () => {
      btnRefreshPoints.classList.add('spinning');
      showToast("Sincronizando con Microsoft Rewards...");
      chrome.runtime.sendMessage({ action: "syncPoints" }, (response) => {
        btnRefreshPoints.classList.remove('spinning');
        if (response && response.success) {
          loadAllData();
          showToast("Puntos actualizados correctamente");
        } else {
          showToast("No se pudo conectar a la API", true);
        }
      });
    });
  }

  // Session Controls
  btnPauseResume.addEventListener('click', async () => {
    const data = await chrome.storage.local.get("session");
    const session = data.session;
    if (session) {
      const isPaused = session.status === "paused";
      const action = isPaused ? "resumeSession" : "pauseSession";
      btnPauseResume.disabled = true;
      chrome.runtime.sendMessage({ action }, (res) => {
        btnPauseResume.disabled = false;
        if (res && res.error) {
          showToast(res.error, true);
        }
        updateDashboard();
      });
    }
  });

  btnStop.addEventListener('click', () => {
    btnStop.disabled = true;
    chrome.runtime.sendMessage({ action: "stopSession" }, () => {
      btnStop.disabled = false;
      updateDashboard();
    });
  });

  // Settings Save
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selectedRadio = document.querySelector('input[name="querySource"]:checked');
    const querySource = selectedRadio ? selectedRadio.value : "random";
    
    const updatedSettings = {
      desktopSearches: parseInt(setDesktopSearches.value) || 30,
      minDelay: parseInt(setMinDelay.value) || 6,
      maxDelay: parseInt(setMaxDelay.value) || 15,
      enableRandomDelay: setEnableRandomDelay.checked,
      cooldownBetweenSearches: parseInt(setCooldown.value) || 2,
      autoCloseTabs: setAutoClose.checked,
      runSearchesInActiveTab: setRunActiveTab ? setRunActiveTab.checked : true,
      cooldown15MinBatch: setCooldown15min ? setCooldown15min.checked : false,
      webhookUrl: setWebhookUrl ? setWebhookUrl.value.trim() : '',
      querySource,
      customQueries: setCustomQueries.value
    };

    const storage = await chrome.storage.local.get("settings");
    const oldSettings = storage.settings || {};
    
    updatedSettings.scheduleEnabled = oldSettings.scheduleEnabled ?? false;
    updatedSettings.scheduleTime = oldSettings.scheduleTime || "09:00";
    updatedSettings.activeDays = oldSettings.activeDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    await chrome.storage.local.set({ settings: updatedSettings });
    loadAllData();
    showToast("¡Ajustes guardados exitosamente!");
  });

  // Schedule Save
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const activeDays = [];
    dayCheckboxes.forEach(chk => {
      if (chk.checked) activeDays.push(chk.value);
    });

    const storage = await chrome.storage.local.get("settings");
    const settings = storage.settings || {};

    settings.scheduleEnabled = setScheduleEnabled.checked;
    settings.scheduleTime = setScheduleTime.value;
    settings.activeDays = activeDays;

    await chrome.storage.local.set({ settings });
    
    chrome.runtime.sendMessage({ action: "updateSchedule" }, () => {
      showToast("¡Horario programado actualizado!");
    });
  });

  // Clear History
  btnClearHistory.addEventListener('click', async () => {
    if (confirm("¿Deseas vaciar el registro histórico de sesiones?")) {
      await chrome.storage.local.set({ history: [] });
      renderHistory([]);
      showToast("Historial vaciado.");
    }
  });
}

// Start a search run
function triggerLaunch(mode, queue = []) {
  chrome.runtime.sendMessage({ action: "startSession", mode, queue }, (response) => {
    if (response && response.success) {
      updateDashboard();
    } else {
      showToast(response?.error || "Error al iniciar sesión", true);
    }
  });
}

// Mini Toast feedback
function showToast(message, isError = false) {
  const existing = document.querySelector('.toast-popup');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-popup ${isError ? 'error' : ''}`;
  toast.innerText = message;
  
  Object.assign(toast.style, {
    position: 'absolute',
    bottom: '48px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: isError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '11.5px',
    fontWeight: '700',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(8px)',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap'
  });
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, -6px)';
  }, 30);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 0px)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 2400);
}

// Typewriter effect for query display
let currentTypewriterInterval = null;
let lastDisplayedQuery = "";

function typeWriter(element, text, speed = 30) {
  if (!element) return;
  if (currentTypewriterInterval) clearInterval(currentTypewriterInterval);
  element.innerText = "";
  element.classList.add("typing");
  let i = 0;
  currentTypewriterInterval = setInterval(() => {
    if (i < text.length) {
      element.innerText += text.charAt(i);
      i++;
    } else {
      clearInterval(currentTypewriterInterval);
      element.classList.remove("typing");
    }
  }, speed);
}

// Render dynamic sparkline speed graph using SVG path
function renderSpeedSparkline(history) {
  const svg = document.getElementById('speed-sparkline');
  if (!svg) return;
  svg.innerHTML = '';
  
  if (!history || history.length < 2) return;
  
  const width = 50;
  const height = 14;
  const maxVal = Math.max(...history, 10);
  const minVal = Math.min(...history, 0);
  const range = maxVal - minVal || 1;
  
  const points = history.map((val, index) => {
    const x = (index / (history.length - 1)) * width;
    const y = height - ((val - minVal) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  
  const pathData = `M ${points.join(' L ')}`;
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', '#10b981');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  
  svg.appendChild(path);
}

// Update launcher completion indicator checks
function updateLauncherCompletion(mode, current, max) {
  const btn = document.getElementById(`launch-${mode}`);
  if (!btn) return;
  let indicator = btn.querySelector('.completion-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'completion-indicator';
    btn.appendChild(indicator);
  }
  if (max > 0 && current >= max) {
    indicator.className = 'completion-indicator completed';
    indicator.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>`;
    btn.classList.add('completed');
  } else {
    indicator.className = 'completion-indicator pending';
    indicator.innerHTML = '';
    btn.classList.remove('completed');
  }
}

// Render all activity logs in the UI
function renderActivityLogs(logs) {
  if (!activityLogContent) return;
  
  if (!logs || logs.length === 0) {
    activityLogContent.innerHTML = '<div class="log-empty-msg">Sin actividad reciente.</div>';
    return;
  }
  
  activityLogContent.innerHTML = logs.map(log => formatLogEntry(log)).join('');
  activityLogContent.scrollTop = activityLogContent.scrollHeight;
}

// Appends a single log entry to the UI in real-time
function appendLogEntryToUI(logEntry) {
  if (!activityLogContent) return;
  
  const emptyMsg = activityLogContent.querySelector('.log-empty-msg');
  if (emptyMsg) {
    emptyMsg.remove();
  }
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = formatLogEntry(logEntry);
  if (tempDiv.firstElementChild) {
    activityLogContent.appendChild(tempDiv.firstElementChild);
    activityLogContent.scrollTop = activityLogContent.scrollHeight;
  }
}

// Formats a log string into CSS-styled HTML
function formatLogEntry(logStr) {
  const match = logStr.match(/^\[(.*?)\] (.*)$/);
  if (match) {
    return `<div class="log-entry"><span class="log-time">[${match[1]}]</span><span class="log-msg">${match[2]}</span></div>`;
  }
  return `<div class="log-entry">${logStr}</div>`;
}
