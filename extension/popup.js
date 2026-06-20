// Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Stats Elements
const statTodayPoints = document.getElementById('stat-today-points');
const statStreak = document.getElementById('stat-streak');
const statTotalPoints = document.getElementById('stat-total-points');

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
const globalStatus = document.getElementById('global-status');

// Launcher Elements
const btnLaunchDesktop = document.getElementById('launch-desktop');
const btnLaunchEdge = document.getElementById('launch-edge');
const btnLaunchAll = document.getElementById('launch-all');
const btnLaunchDailyTasks = document.getElementById('launch-daily-tasks');
const lblDesktopCount = document.getElementById('lbl-desktop-count');
const lblEdgeCount = document.getElementById('lbl-edge-count');

// Settings Form Elements
const settingsForm = document.getElementById('settings-form');
const setDesktopSearches = document.getElementById('set-desktop-searches');
const setEdgeSearches = document.getElementById('set-edge-searches');
const setMinDelay = document.getElementById('set-min-delay');
const setMaxDelay = document.getElementById('set-max-delay');
const setEnableRandomDelay = document.getElementById('set-enable-random-delay');
const setCooldown = document.getElementById('set-cooldown');
const setAutoClose = document.getElementById('set-auto-close');
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
  const data = await chrome.storage.local.get(["settings", "session", "stats", "history"]);
  
  const settings = data.settings || {};
  const session = data.session || {};
  const stats = data.stats || { todayPoints: 0, totalPoints: 0, streak: 0 };
  const history = data.history || [];

  // Update Stats UI
  statTodayPoints.innerText = stats.todayPoints || 0;
  statStreak.innerText = stats.streak || 0;
  statTotalPoints.innerText = stats.totalPoints || 0;

  // Pre-populate settings form
  if (settings) {
    setDesktopSearches.value = settings.desktopSearches ?? 30;
    setEdgeSearches.value = settings.edgeSearches ?? 20;
    setMinDelay.value = settings.minDelay ?? 6;
    setMaxDelay.value = settings.maxDelay ?? 15;
    setEnableRandomDelay.checked = settings.enableRandomDelay ?? true;
    setCooldown.value = settings.cooldownBetweenSearches ?? 2;
    setAutoClose.checked = settings.autoCloseTabs ?? true;
    
    // Label display counts on launcher
    if (stats.pcSearch && stats.pcSearch.max > 0) {
      lblDesktopCount.innerText = `${stats.pcSearch.current}/${stats.pcSearch.max} pts (${Math.round(stats.pcSearch.current/3)}/${Math.round(stats.pcSearch.max/3)} búsquedas)`;
    } else {
      lblDesktopCount.innerText = `${settings.desktopSearches ?? 30} búsquedas`;
    }


    if (stats.edgeSearch && stats.edgeSearch.max > 0) {
      lblEdgeCount.innerText = `${stats.edgeSearch.current}/${stats.edgeSearch.max} pts (${Math.round(stats.edgeSearch.current/3)}/${Math.round(stats.edgeSearch.max/3)} búsquedas)`;
    } else {
      lblEdgeCount.innerText = `${settings.edgeSearches ?? 20} búsquedas`;
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

  // Initial dashboard sync
  updateDashboardState(session);
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
  const data = await chrome.storage.local.get("session");
  updateDashboardState(data.session);
}

// Update dashboard state DOM
function updateDashboardState(session) {
  if (!session || session.status === "idle" || session.status === "completed" || session.status === "stopped") {
    // Idle state
    activeSessionContainer.classList.add('idle');
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
    
    globalStatus.innerHTML = `<span class="status-dot"></span><span class="status-label">Inactivo</span>`;
    
    // Enable launchers
    btnLaunchDesktop.disabled = false;
    btnLaunchEdge.disabled = false;
    btnLaunchAll.disabled = false;
    return;
  }

  // Active running/paused state
  activeSessionContainer.classList.remove('idle');
  
  let translatedMode = session.mode === 'desktop' ? 'Escritorio' : 'Edge';
  sessionModeBadge.innerText = translatedMode;
  sessionModeBadge.className = `badge running`;
  
  const pct = Math.round((session.completedSearches / session.totalSearches) * 100) || 0;
  sessionProgressText.innerText = `${session.completedSearches} / ${session.totalSearches} Búsquedas`;
  sessionPercentage.innerText = `${pct}%`;
  sessionProgressFill.style.width = `${pct}%`;
  
  const currentQuery = session.queries[session.currentIndex] || "Buscando...";
  sessionCurrentQuery.innerText = currentQuery;
  sessionCurrentQuery.className = "detail-val";
  sessionEstimatedPoints.innerText = `+${session.pointsEarned} pts`;
  
  btnPauseResume.disabled = false;
  btnStop.disabled = false;
  
  if (session.status === "paused") {
    btnPauseText.innerText = "Reanudar";
    btnPauseResume.querySelector('svg').innerHTML = `<path d="M8 5v14l11-7z"/>`; // Play icon
    globalStatus.innerHTML = `<span class="status-dot orange"></span><span class="status-label">Pausado</span>`;
  } else {
    btnPauseText.innerText = "Pausar";
    btnPauseResume.querySelector('svg').innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`; // Pause icon
    globalStatus.innerHTML = `<span class="status-dot green"></span><span class="status-label">Corriendo (${translatedMode})</span>`;
  }

  // Disable launchers
  btnLaunchDesktop.disabled = true;
  btnLaunchEdge.disabled = true;
  btnLaunchAll.disabled = true;
}

// Bind Action Listeners
function setupActionListeners() {
  // Launchers
  btnLaunchDesktop.addEventListener('click', () => triggerLaunch('desktop'));
  btnLaunchEdge.addEventListener('click', () => triggerLaunch('edge'));
  
  btnLaunchAll.addEventListener('click', async () => {
    const data = await chrome.storage.local.get("settings");
    const settings = data.settings || {};
    
    const queue = [];
    const desktopSearches = settings.desktopSearches ?? 30;
    const edgeSearches = settings.edgeSearches ?? 20;
    
    if (edgeSearches > 0) queue.push('edge');
    
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
          btnLaunchDailyTasks.innerText = "⏳ Procesando...";
          setTimeout(() => {
            btnLaunchDailyTasks.disabled = false;
            btnLaunchDailyTasks.innerText = "🎁 Abrir & Reclamar Tareas";
          }, 35000);
        } else {
          showToast(response?.error || "Error al abrir Rewards", true);
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
      edgeSearches: parseInt(setEdgeSearches.value) || 0,
      minDelay: parseInt(setMinDelay.value) || 6,
      maxDelay: parseInt(setMaxDelay.value) || 15,
      enableRandomDelay: setEnableRandomDelay.checked,
      cooldownBetweenSearches: parseInt(setCooldown.value) || 0,
      autoCloseTabs: setAutoClose.checked,
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
