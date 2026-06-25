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
const btnLaunchMobile = document.getElementById('launch-mobile');
const btnLaunchEdge = document.getElementById('launch-edge');
const btnLaunchAll = document.getElementById('launch-all');
const btnLaunchDailyTasks = document.getElementById('launch-daily-tasks');
const lblDesktopCount = document.getElementById('lbl-desktop-count');
const lblMobileCount = document.getElementById('lbl-mobile-count');
const lblEdgeCount = document.getElementById('lbl-edge-count');
const btnRefreshPoints = document.getElementById('btn-refresh-points');

// Settings Form Elements
const settingsForm = document.getElementById('settings-form');
const setDesktopSearches = document.getElementById('set-desktop-searches');
const setMobileSearches = document.getElementById('set-mobile-searches');
const setEdgeSearches = document.getElementById('set-edge-searches');
const setMinDelay = document.getElementById('set-min-delay');
const setMaxDelay = document.getElementById('set-max-delay');
const setEnableRandomDelay = document.getElementById('set-enable-random-delay');
const setCooldown = document.getElementById('set-cooldown');
const setAutoClose = document.getElementById('set-auto-close');
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

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Bind Tab Click Handlers
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Load configuration and data
  await loadAllData();

  // Bind Form toggles
  setupUIInteractionToggles();

  // Bind Actions
  setupActionListeners();

  // Trigger on-demand sync with Microsoft Rewards API
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
      loadAllData(); // Refresh history/stats
    }
    if (message.action === "sessionSkipped") {
      showToast(`${message.mode.toUpperCase()} omitido: ¡Búsquedas ya completadas hoy!`, false);
      updateDashboard();
      loadAllData();
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
  // Query source toggling
  const toggleQueryArea = () => {
    const selectedSource = document.querySelector('input[name="querySource"]:checked').value;
    customQueriesArea.style.display = selectedSource === "custom" ? "block" : "none";
  };
  querySourceRadios.forEach(radio => radio.addEventListener('change', toggleQueryArea));

  // Schedule config toggling
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
  if (levelText.toLowerCase().includes("level2") || levelText === "Level 2") levelText = "Nivel 2";
  else if (levelText.toLowerCase().includes("level1") || levelText === "Level 1") levelText = "Nivel 1";
    
  statTodayPoints.innerText = stats.todayPoints || 0;
  statStreak.innerText = stats.streak || 0;
  statTotalPoints.innerText = stats.totalPoints || 0;
  if (statLevel) statLevel.innerText = levelText;

  // Pre-populate settings form
  if (settings) {
    setDesktopSearches.value = settings.desktopSearches ?? 30;
    setMobileSearches.value = settings.mobileSearches ?? 20;
    setEdgeSearches.value = settings.edgeSearches ?? 20;
    setMinDelay.value = settings.minDelay ?? 6;
    setMaxDelay.value = settings.maxDelay ?? 15;
    setEnableRandomDelay.checked = settings.enableRandomDelay ?? true;
    setCooldown.value = settings.cooldownBetweenSearches ?? 2;
    setAutoClose.checked = settings.autoCloseTabs ?? true;
    if (setWebhookUrl) setWebhookUrl.value = settings.webhookUrl || '';
    
    // Label display counts on launcher
    const pcMax = stats.pcSearch ? (stats.pcSearch.max || 90) : (settings.desktopSearches * 3 || 90);
    const pcCurrent = stats.pcSearch ? (stats.pcSearch.current || 0) : 0;
    lblDesktopCount.innerText = `${pcCurrent}/${pcMax} pts (${Math.round(pcCurrent/3)}/${Math.round(pcMax/3)} búsquedas)`;
    updateLauncherProgress('desktop', pcCurrent, pcMax);
    updateLauncherCompletion('desktop', pcCurrent, pcMax);

    const mobileMax = stats.mobileSearch ? (stats.mobileSearch.max || 60) : (settings.mobileSearches * 3 || 60);
    const mobileCurrent = stats.mobileSearch ? (stats.mobileSearch.current || 0) : 0;
    
    if (lblMobileCount) {
      if (stats.mobileSearch && stats.mobileSearch.max > 0) {
        lblMobileCount.innerText = `${mobileCurrent}/${mobileMax} pts (${Math.round(mobileCurrent/3)}/${Math.round(mobileMax/3)} búsquedas)`;
        if (btnLaunchMobile && (!session || session.status === "idle" || session.status === "stopped")) {
          btnLaunchMobile.disabled = false;
          btnLaunchMobile.style.opacity = "1";
        }
      } else if (stats.lastUpdatedDate && stats.mobileSearch && stats.mobileSearch.max === 0) {
        lblMobileCount.innerText = "No disponible (Nivel)";
        if (btnLaunchMobile) {
          btnLaunchMobile.disabled = true;
          btnLaunchMobile.style.opacity = "0.5";
        }
      } else {
        lblMobileCount.innerText = `${mobileCurrent}/${mobileMax} pts (${Math.round(mobileCurrent/3)}/${Math.round(mobileMax/3)} búsquedas)`;
      }
      updateLauncherProgress('mobile', mobileCurrent, mobileMax);
      updateLauncherCompletion('mobile', mobileCurrent, mobileMax);
    }

    const edgeMax = stats.edgeSearch ? (stats.edgeSearch.max || 60) : (settings.edgeSearches * 3 || 60);
    const edgeCurrent = stats.edgeSearch ? (stats.edgeSearch.current || 0) : 0;
    lblEdgeCount.innerText = `${edgeCurrent}/${edgeMax} pts (${Math.round(edgeCurrent/3)}/${Math.round(edgeMax/3)} búsquedas)`;
    updateLauncherProgress('edge', edgeCurrent, edgeMax);
    updateLauncherCompletion('edge', edgeCurrent, edgeMax);

    // Update Circular Progress Rings
    const totalMaxSearchPoints = pcMax + mobileMax + edgeMax;
    updateCircularProgress('ring-today', stats.todayPoints || 0, totalMaxSearchPoints || 210);

    // Update Weekly Streak mini-bar
    const streakBar = document.getElementById('streak-bar');
    if (streakBar) {
      const streakPct = Math.min((stats.streak / 7) * 100, 100);
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
  if (history.length === 0) {
    historyRows.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Sin historial aún.</td></tr>`;
    return;
  }

  historyRows.innerHTML = history.map(item => {
    const dateObj = new Date(item.date);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    
    return `
      <tr>
        <td>
          <div>${dateStr}</div>
          <div class="text-muted" style="font-size: 9px;">${timeStr}</div>
        </td>
        <td><span class="history-badge ${item.mode}">${item.mode}</span></td>
        <td>${item.searches}</td>
        <td class="text-green font-bold">+${item.points} pts</td>
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

// Update circular progress ring offset
function updateCircularProgress(elementId, value, max) {
  const circle = document.getElementById(elementId);
  if (!circle) return;
  
  const circumference = 2 * Math.PI * 42; // r=42
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const offset = circumference - (percent / 100) * circumference;
  
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = offset;
  
  // Color based on completion
  if (percent >= 100) {
    circle.style.stroke = '#10b981';
  } else if (percent >= 50) {
    circle.style.stroke = '#f59e0b';
  } else {
    circle.style.stroke = '#3b82f6';
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
    fill.style.background = 'linear-gradient(90deg, #3b82f6, #60a5fa)';
  }
}

// Update session panel with visual classes
function updateSessionVisualState(session) {
  const panel = document.getElementById('active-session-container');
  const icon = document.getElementById('session-icon');
  const title = document.getElementById('session-title');
  
  if (!panel) return;
  
  panel.classList.remove('running', 'paused', 'idle');
  
  if (session.status === 'running') {
    panel.classList.add('running');
    if (icon) icon.innerText = '⚡';
    if (title) title.innerText = 'Automatización Activa';
  } else if (session.status === 'paused') {
    panel.classList.add('paused');
    if (icon) icon.innerText = '⏸️';
    if (title) title.innerText = 'Automatización Pausada';
  } else {
    panel.classList.add('idle');
    if (icon) icon.innerText = '🤖';
    if (title) title.innerText = 'Automatización Inactiva';
  }
}

// Render Daily Tasks mini status checklist
function updateDailyTasksUI(scannedTasks) {
  const list = document.getElementById('daily-tasks-list');
  const countBadge = document.getElementById('daily-tasks-count');
  if (!list) return;
  
  if (!scannedTasks || (!scannedTasks.dailySet && !scannedTasks.moreActivities && !scannedTasks.punchCards)) {
    list.innerHTML = `
      <div class="task-item pending">
        <span class="task-icon">⏳</span>
        <span class="task-name">Daily Set (No detectado)</span>
      </div>
      <div class="task-item pending">
        <span class="task-icon">⏳</span>
        <span class="task-name">More Activities (No detectado)</span>
      </div>
      <div class="task-item pending">
        <span class="task-icon">⏳</span>
        <span class="task-name">Punch Cards (No detectado)</span>
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
      countBadge.style.background = 'rgba(16, 185, 129, 0.1)';
    } else {
      countBadge.style.color = '#f59e0b';
      countBadge.style.background = 'rgba(245, 158, 11, 0.1)';
    }
  }
  
  // Build Daily Set item
  const dsPending = dailySet.filter(t => !t.completed).length;
  const dsText = dailySet.length === 0 ? "Daily Set (No detectado)" : `Daily Set (${dailySet.length - dsPending}/${dailySet.length})`;
  const dsClass = dailySet.length === 0 ? "pending" : (dsPending === 0 ? "completed" : "pending");
  const dsIcon = dailySet.length === 0 ? "⏳" : (dsPending === 0 ? "✅" : "⏳");
  
  // Build More Activities item
  const maPending = moreActivities.filter(t => !t.completed).length;
  const maText = moreActivities.length === 0 ? "More Activities (No detectado)" : `More Activities (${moreActivities.length - maPending}/${moreActivities.length})`;
  const maClass = moreActivities.length === 0 ? "pending" : (maPending === 0 ? "completed" : "pending");
  const maIcon = moreActivities.length === 0 ? "⏳" : (maPending === 0 ? "✅" : "⏳");
  
  // Build Punch Cards item
  const pcPending = punchCards.filter(t => !t.completed).length;
  const pcText = punchCards.length === 0 ? "Punch Cards (No detectado)" : `Punch Cards (${punchCards.length - pcPending}/${punchCards.length})`;
  const pcClass = punchCards.length === 0 ? "pending" : (pcPending === 0 ? "completed" : "pending");
  const pcIcon = punchCards.length === 0 ? "⏳" : (pcPending === 0 ? "✅" : "⏳");
  
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
    // Idle state
    lastDisplayedQuery = "";
    if (statusDot) {
      statusDot.className = 'status-dot';
    }
    if (statusText) statusText.innerText = 'Listo';
    
    sessionModeBadge.className = "badge";
    sessionModeBadge.innerText = "-";
    sessionProgressText.innerText = "Sin sesión activa";
    sessionPercentage.innerText = "0%";
    sessionProgressFill.style.width = "0%";
    sessionCurrentQuery.innerText = "Esperando iniciar...";
    sessionCurrentQuery.className = "detail-val text-muted";
    sessionEstimatedPoints.innerText = "+0 pts";
    
    btnPauseResume.disabled = true;
    btnPauseText.innerText = "Pausar";
    btnStop.disabled = true;
    
    // Hide speed graph
    const speedRow = document.getElementById('session-speed-row');
    if (speedRow) speedRow.style.display = 'none';

    // Enable launchers
    btnLaunchDesktop.disabled = false;
    if (btnLaunchMobile) {
      if (stats && stats.mobileSearch && stats.mobileSearch.max === 0) {
        btnLaunchMobile.disabled = true;
      } else {
        btnLaunchMobile.disabled = false;
      }
    }
    btnLaunchEdge.disabled = false;
    btnLaunchAll.disabled = false;
    return;
  }

  // Active running/paused state
  let translatedMode = session.mode === 'desktop' ? 'Escritorio' : (session.mode === 'mobile' ? 'Móvil' : 'Edge');
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
  } else if (!sessionCurrentQuery.innerText || sessionCurrentQuery.innerText === "Esperando iniciar...") {
    sessionCurrentQuery.innerText = currentQuery;
  }
  sessionCurrentQuery.className = "detail-val";
  sessionEstimatedPoints.innerText = `+${session.pointsEarned} pts`;
  
  btnPauseResume.disabled = false;
  btnStop.disabled = false;
  
  if (session.status === "paused") {
    btnPauseText.innerText = "Reanudar";
    btnPauseResume.querySelector('svg').innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`; // Play icon in new SVG format
    if (statusDot) {
      statusDot.className = 'status-dot orange';
    }
    if (statusText) statusText.innerText = 'Pausado';
  } else {
    btnPauseText.innerText = "Pausar";
    btnPauseResume.querySelector('svg').innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`; // Pause icon in new SVG format
    if (statusDot) {
      statusDot.className = 'status-dot green';
    }
    if (statusText) statusText.innerText = `Corriendo (${translatedMode})`;
  }

  // Disable launchers
  btnLaunchDesktop.disabled = true;
  if (btnLaunchMobile) btnLaunchMobile.disabled = true;
  btnLaunchEdge.disabled = true;
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
}

// Bind Action Listeners
function setupActionListeners() {
  // Launchers
  btnLaunchDesktop.addEventListener('click', () => triggerLaunch('desktop'));
  if (btnLaunchMobile) btnLaunchMobile.addEventListener('click', () => triggerLaunch('mobile'));
  btnLaunchEdge.addEventListener('click', () => triggerLaunch('edge'));
  
  btnLaunchAll.addEventListener('click', async () => {
    const data = await chrome.storage.local.get("settings");
    const settings = data.settings || {};
    
    const queue = [];
    const desktopSearches = settings.desktopSearches ?? 30;
    const mobileSearches = settings.mobileSearches ?? 20;
    const edgeSearches = settings.edgeSearches ?? 20;
    
    if (edgeSearches > 0) queue.push('edge');
    if (mobileSearches > 0) queue.unshift('mobile'); // Ensure queue is mobile -> edge
    
    if (desktopSearches > 0) {
      triggerLaunch('desktop', queue);
    } else if (queue.length > 0) {
      triggerLaunch(queue[0], queue.slice(1));
    } else {
      showToast("¡Habilite las cantidades de búsqueda primero!", true);
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
            <div class="spinner-mini"></div>
            <span class="launcher-label">Procesando...</span>
            <span class="launcher-sub">Reclamando set</span>
          `;
          setTimeout(() => {
            btnLaunchDailyTasks.disabled = false;
            btnLaunchDailyTasks.innerHTML = `
              <div class="launcher-icon">🎁</div>
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
      showToast("Sincronizando puntos con Microsoft...");
      chrome.runtime.sendMessage({ action: "syncPoints" }, (response) => {
        btnRefreshPoints.classList.remove('spinning');
        if (response && response.success) {
          loadAllData();
          showToast("✅ Puntos actualizados");
        } else {
          showToast("⚠️ No se pudieron actualizar los puntos", true);
        }
      });
    });
  }

  // Session Controls
  btnPauseResume.addEventListener('click', async () => {
    const data = await chrome.storage.local.get("session");
    const session = data.session;
    if (session) {
      const action = session.status === "paused" ? "resumeSession" : "pauseSession";
      chrome.runtime.sendMessage({ action });
    }
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "stopSession" });
  });

  // Settings Save
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const querySource = document.querySelector('input[name="querySource"]:checked').value;
    
    const updatedSettings = {
      desktopSearches: parseInt(setDesktopSearches.value) || 0,
      mobileSearches: parseInt(setMobileSearches.value) || 0,
      edgeSearches: parseInt(setEdgeSearches.value) || 0,
      minDelay: parseInt(setMinDelay.value) || 6,
      maxDelay: parseInt(setMaxDelay.value) || 15,
      enableRandomDelay: setEnableRandomDelay.checked,
      cooldownBetweenSearches: parseInt(setCooldown.value) || 2,
      autoCloseTabs: setAutoClose.checked,
      webhookUrl: setWebhookUrl ? setWebhookUrl.value.trim() : '',
      querySource,
      customQueries: setCustomQueries.value
    };

    // Save to storage
    const storage = await chrome.storage.local.get("settings");
    const oldSettings = storage.settings || {};
    
    // Preserve scheduling variables
    updatedSettings.scheduleEnabled = oldSettings.scheduleEnabled ?? false;
    updatedSettings.scheduleTime = oldSettings.scheduleTime || "09:00";
    updatedSettings.activeDays = oldSettings.activeDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    await chrome.storage.local.set({ settings: updatedSettings });
    
    // Update labels on launchers
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
    
    // Tell background worker to reschedule daily run
    chrome.runtime.sendMessage({ action: "updateSchedule" }, () => {
      showToast("¡Horario actualizado!");
    });
  });

  // Clear History
  btnClearHistory.addEventListener('click', async () => {
    if (confirm("¿Estás seguro de que quieres borrar el historial de búsquedas?")) {
      await chrome.storage.local.set({ history: [] });
      renderHistory([]);
      showToast("Historial borrado.");
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
  const toast = document.createElement('div');
  toast.className = `toast-popup ${isError ? 'error' : ''}`;
  toast.innerText = message;
  
  // Custom styles for toast
  Object.assign(toast.style, {
    position: 'absolute',
    bottom: '50px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: isError ? '#ef4444' : '#10b981',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    pointerEvents: 'none'
  });
  
  document.body.appendChild(toast);
  
  // Trigger animations
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, -4px)';
  }, 50);

  // Fade out
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 0px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2500);
}

// ═══════════════════════════════════════════════════════════════
// VISUAL ENHANCEMENTS & HELPERS
// ═══════════════════════════════════════════════════════════════

let currentTypewriterInterval = null;
let lastDisplayedQuery = "";

// Typewriter effect for query display
function typeWriter(element, text, speed = 40) {
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
  
  const width = 60;
  const height = 16;
  const maxVal = Math.max(...history, 10);
  const minVal = Math.min(...history, 0);
  const range = maxVal - minVal || 1;
  
  const points = history.map((val, index) => {
    const x = (index / (history.length - 1)) * width;
    const y = height - ((val - minVal) / range) * height;
    return `${x},${y}`;
  });
  
  const pathData = `M ${points.join(' L ')}`;
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', 'var(--primary)');
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
    indicator.innerText = '✓';
    btn.classList.add('completed');
  } else {
    indicator.className = 'completion-indicator pending';
    indicator.innerText = '○';
    btn.classList.remove('completed');
  }
}
