// ============================================================
// Content Script Principal — Rewards Auto Search & Claimer v2
// Orquesta los workers y muestra el panel flotante en rewards.bing.com
// También maneja el auto-solver de quizzes/polls en páginas de búsqueda
// ============================================================

const isRewardsPage = window.location.hostname === "rewards.bing.com" || window.location.pathname.includes("/rewards/");
const isSearchPage = window.location.hostname.includes("bing.com") && window.location.pathname.includes("/search");

// State and helper functions for sequential task tab lifecycle tracking (rewards dashboard)
let taskClosedResolver = null;

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "taskTabClosed") {
      if (taskClosedResolver) {
        console.log("[RewardsBot] Task tab closed signal received from background.");
        taskClosedResolver();
        taskClosedResolver = null;
      }
      sendResponse({ success: true });
      return true;
    }
  });
}

function waitForTaskTabClose(timeoutMs = 60000) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        taskClosedResolver = null;
        console.log("[RewardsBot] Timeout waiting for task tab to close.");
        resolve();
      }
    }, timeoutMs);

    taskClosedResolver = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve();
      }
    };
  });
}

function isCardCompleted(task) {
  let el = task.element;
  if (!el || !document.contains(el)) {
    if (task.url) {
      const escapedUrl = task.url.replace(/["\\]/g, '\\$&');
      el = document.querySelector(`a[href="${escapedUrl}"]`);
    }
  }
  if (!el) {
    console.log(`[RewardsBot] Card element not found for: ${task.title}`);
    return false;
  }
  
  const fullText = el.innerText || '';
  const hasCheckmark = el.querySelector('.text-statusPositiveTintFg, [class*="statusPositive"]') !== null || 
    /\b(completad[oa]s?|listo|hecho|done|completed)\b/i.test(fullText) ||
    /[✓✔]/.test(fullText);
  return hasCheckmark;
}

// --- CAPTCHA DETECTION ---
let captchaNotified = false;

function checkCaptcha() {
  if (captchaNotified) return;

  const captchaSelectors = [
    'iframe[src*="arkoselabs"]',
    'iframe[src*="funcaptcha"]',
    'iframe[src*="turing/challenge"]',
    'iframe[src*="challenge"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="recaptcha"]',
    '#challenge-container',
    '#challenge-stage',
    '.challenge-container',
    '.challenge-stage',
    '#turing_captcha',
    '#arkose-iframe',
    '#captcha-container',
    'div[id*="captcha" i]',
    'div[class*="captcha" i]',
    'iframe[title*="challenge" i]'
  ];

  const urlLower = window.location.href.toLowerCase();
  let found = urlLower.includes('turing/challenge') || 
              urlLower.includes('challenge/verify') || 
              urlLower.includes('captcha');

  if (!found) {
    for (const selector of captchaSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            found = true;
            break;
          }
        }
      } catch (e) {}
    }
  }

  if (!found && document.body) {
    const bodyText = document.body.innerText.toLowerCase();
    const phrases = [
      "verify you are human",
      "verification required",
      "verify your identity",
      "solve the puzzle",
      "comprueba que eres un ser humano",
      "verifique que es un ser humano"
    ];
    for (const phrase of phrases) {
      if (bodyText.includes(phrase)) {
        found = true;
        break;
      }
    }
  }

  if (found) {
    captchaNotified = true;
    console.warn("[RewardsBot] CAPTCHA / Reto detectado. Notificando a background.js...");
    chrome.runtime.sendMessage({ action: "captchaDetected" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[RewardsBot] Error al enviar mensaje de CAPTCHA:", chrome.runtime.lastError);
      } else {
        console.log("[RewardsBot] Background recibió alerta de CAPTCHA:", response);
      }
    });
  }
}

// Check on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    checkCaptcha();
    observeCaptcha();
  });
} else {
  checkCaptcha();
  observeCaptcha();
}

// Observe dynamic insertions
function observeCaptcha() {
  const observer = new MutationObserver(() => {
    checkCaptcha();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// --- REWARDS DASHBOARD AUTOMATION ---
if (isRewardsPage) {
  console.log("[RewardsBot] Cargado en página de Rewards.");
  // Esperar a que los Web Components de Microsoft se rendericen
  setTimeout(() => initRewardsPanel(), 2500);

  // Detectar navegación SPA (Single Page Application)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log("[RewardsBot] Navegación SPA detectada. URL cambió a:", url);
      setTimeout(() => initRewardsPanel(), 2000);
    }
  }).observe(document, { subtree: true, childList: true });
}

// --- BING SEARCH QUIZ/POLL AUTO-SOLVER & HUMANIZATION ---
if (isSearchPage) {
  // Guardar flag si proviene de rewards.bing.com (tarea clickeada)
  if (document.referrer && document.referrer.includes("rewards.bing.com")) {
    sessionStorage.setItem("isRewardsTaskTab", "true");
    console.log("[RewardsBot] Referrer es rewards.bing.com. Marcando pestaña en sessionStorage: isRewardsTaskTab = true");
  }

  // Leer sesión de chrome.storage.local para verificar estado
  chrome.storage.local.get("session", (data) => {
    const session = data.session || {};
    const isRunning = session.status === "running";
    const isRewardsTask = sessionStorage.getItem("isRewardsTaskTab") === "true";

    console.log(`[RewardsBot] Bing Search Page. Estado sesión: ${session.status}, isRewardsTaskTab: ${isRewardsTask}`);

    if (isRunning || isRewardsTask) {
      console.log("[RewardsBot] Condición cumplida (sesión activa o tarea de Rewards). Iniciando auto-solver y lectura...");
      setTimeout(solveActiveTasks, 2500);
      
      // Simular lectura aleatoria para parecer más humano (solo 50% de las veces)
      if (Math.random() > 0.5) {
        setTimeout(() => {
          if (window.RewardsUtils && window.RewardsUtils.Human && window.RewardsUtils.Human.simulateReading) {
            window.RewardsUtils.Human.simulateReading();
          }
        }, 1500);
      }

      // Si es una tarea de rewards, iniciar el monitoreo para cerrar la pestaña cuando termine
      if (isRewardsTask) {
        console.log("[RewardsBot] Tarea de Rewards detectada en pestaña. Iniciando monitoreo de ciclo de vida...");
        setTimeout(() => {
          if (isQuizOrPollPresent()) {
            console.log("[RewardsBot] Quiz o Poll detectado. Monitoreando resolución...");
            let lastActionTime = Date.now();
            let totalElapsed = 0;
            
            const updateAction = () => {
              lastActionTime = Date.now();
            };
            document.addEventListener("click", updateAction);

            const interval = setInterval(() => {
              totalElapsed += 2000;
              const quizActive = isQuizOrPollPresent();
              const idleTime = Date.now() - (window.lastRewardsActionTime || lastActionTime);

              console.log(`[RewardsBot] Monitoreo de Quiz: activo=${quizActive}, inactivo por=${Math.round(idleTime/1000)}s, total=${Math.round(totalElapsed/1000)}s`);

              if ((!quizActive && idleTime > 8000) || idleTime > 25000 || totalElapsed > 90000) {
                console.log("[RewardsBot] El quiz/poll ha terminado o se alcanzó el timeout. Cerrando pestaña...");
                clearInterval(interval);
                document.removeEventListener("click", updateAction);
                chrome.runtime.sendMessage({ action: "closeMyTab" });
              }
            }, 2000);
          } else {
            console.log("[RewardsBot] Tarea de visita simple detectada. Programando cierre en 10s...");
            setTimeout(() => {
              console.log("[RewardsBot] 10s transcurridos. Cerrando pestaña de visita...");
              chrome.runtime.sendMessage({ action: "closeMyTab" });
            }, 10000);
          }
        }, 3500);
      }
    } else {
      console.log("[RewardsBot] Auto-solver y lectura omitidos: la sesión no está activa y no es una tarea de Rewards.");
    }
  });
}

// Función auxiliar para detectar presencia de widgets de quiz o poll
function isQuizOrPollPresent() {
  const pollOptions = document.querySelectorAll(
    ".btOption, .btoption, [class*='btOption'], [id*='btoption'], [id*='poll'] button, .option-card, .bt_optionCard"
  );
  const startQuizBtn = document.getElementById("rqStartQuiz")
    || document.querySelector("[id*='startquiz' i]")
    || document.querySelector(".rqStartQuiz")
    || document.querySelector("#quizWelcomeContainer input[type='button']")
    || document.querySelector(".rw_btn[value*='Start' i], .rw_btn[value*='Comenzar' i], .wk_button[value*='Start' i]");
  const quizOptions = document.querySelectorAll(
    ".rqOption, .rqOptionCard, [id*='rqOption'], #rqAnswerOption0, #rqAnswerOption1, " +
    ".wk_OptionClickClass, [data-option], .btOption, #bt_option0, #bt_option1, #bt_option2, #bt_option3, " +
    ".rw_btn, .rw_option, .b_cards[iscorrectoption], .b_Cards[iscorrectoption], .b_ans"
  );
  const totOptions = document.querySelectorAll(
    "#rqAnswerOption0, #rqAnswerOption1, .btOptionCard, .rqOption, .wk_OptionClickClass, .b_cards[iscorrectoption]"
  );
  return (pollOptions.length > 0 || startQuizBtn || quizOptions.length > 0 || totOptions.length >= 2);
}

// ============================================================
// PANEL FLOTANTE MEJORADO v3.1
// ============================================================

// ─── Configuración Visual ───
const THEME = {
  bg: 'rgba(11, 15, 25, 0.94)',
  bgSolid: '#0b0f19',
  panelBorder: 'rgba(30, 41, 59, 0.8)',
  textMain: '#f8fafc',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  
  daily: { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)', bg: 'rgba(59, 130, 246, 0.08)' },
  more: { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.3)', bg: 'rgba(168, 85, 247, 0.08)' },
  punch: { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)', bg: 'rgba(236, 72, 153, 0.08)' },
  streak: { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)', bg: 'rgba(245, 158, 11, 0.08)' },
  
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b'
};

// ─── Estado del Panel ───
let panelState = {
  isOpen: true,
  isMinimized: false,
  position: { x: window.innerWidth - 380, y: 80 },
  sections: {
    dailySet: { loading: true, tasks: [], expanded: true },
    moreActivities: { loading: true, tasks: [], expanded: true },
    punchCards: { loading: true, tasks: [], expanded: false },
    streakBonus: { loading: true, data: null, expanded: false }
  },
  lastUpdate: null
};

// ─── Inyección de Estilos CSS ───
function injectStyles() {
  const existing = document.getElementById('rewards-panel-styles');
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.id = 'rewards-panel-styles';
  style.textContent = `
    #rewards-auto-panel, #rewards-auto-panel * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: normal;
      line-height: normal;
    }

    #rewards-auto-panel {
      position: fixed;
      top: ${panelState.position.y}px;
      left: ${panelState.position.x}px;
      width: 340px;
      max-height: 85vh;
      background: ${THEME.bg};
      backdrop-filter: blur(20px) saturate(1.5);
      -webkit-backdrop-filter: blur(20px) saturate(1.5);
      border: 1px solid ${THEME.panelBorder};
      border-radius: 16px;
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05),
        0 0 40px rgba(16, 185, 129, 0.08);
      z-index: 999999;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, box-shadow 0.3s ease;
      animation: panelSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #rewards-auto-panel.minimized {
      height: auto !important;
      max-height: 56px !important;
      overflow: hidden;
    }

    #rewards-auto-panel.minimized .panel-body {
      display: none;
    }

    #rewards-auto-panel.dragging {
      opacity: 0.9;
      box-shadow: 0 30px 60px rgba(0,0,0,0.6);
      cursor: grabbing !important;
    }

    .rap-header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.05));
      border-bottom: 1px solid ${THEME.panelBorder};
      cursor: grab;
      user-select: none;
      position: relative;
      overflow: hidden;
    }

    .rap-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, #10b981, transparent);
      animation: headerScan 3s linear infinite;
    }

    .rap-header-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .rap-header-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
      animation: iconFloat 3s ease-in-out infinite;
    }

    .rap-header-title {
      font-size: 13px;
      font-weight: 800;
      color: ${THEME.textMain};
      letter-spacing: -0.3px;
    }

    .rap-header-title span {
      color: #10b981;
      text-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
    }

    .rap-header-version {
      font-size: 9px;
      color: ${THEME.textDim};
      background: rgba(255,255,255,0.05);
      padding: 1px 5px;
      border-radius: 4px;
      margin-left: 4px;
      font-weight: 600;
    }

    .rap-header-actions {
      display: flex;
      gap: 6px;
    }

    .rap-btn-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid ${THEME.panelBorder};
      background: rgba(255,255,255,0.03);
      color: ${THEME.textMuted};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 12px;
    }

    .rap-btn-icon:hover {
      background: rgba(255,255,255,0.08);
      color: ${THEME.textMain};
      transform: scale(1.1);
    }

    .rap-btn-icon.close:hover {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.3);
    }

    .rap-status-bar {
      flex-shrink: 0;
      padding: 8px 16px;
      background: rgba(16, 185, 129, 0.05);
      border-bottom: 1px solid ${THEME.panelBorder};
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.3s;
    }

    .rap-status-bar.success { background: rgba(16, 185, 129, 0.08); color: #10b981; }
    .rap-status-bar.warning { background: rgba(245, 158, 11, 0.08); color: #f59e0b; }
    .rap-status-bar.error { background: rgba(239, 68, 68, 0.08); color: #ef4444; }
    .rap-status-bar.info { background: rgba(59, 130, 246, 0.08); color: #60a5fa; }

    .rap-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
      animation: statusPulse 2s infinite;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .panel-body::-webkit-scrollbar { width: 4px; }
    .panel-body::-webkit-scrollbar-track { background: transparent; }
    .panel-body::-webkit-scrollbar-thumb { 
      background: ${THEME.panelBorder}; 
      border-radius: 4px; 
    }

    .rap-section {
      background: linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      border: 1px solid ${THEME.panelBorder};
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .rap-section:hover {
      border-color: rgba(255,255,255,0.1);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .rap-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
      position: relative;
    }

    .rap-section-header:hover {
      background: rgba(255,255,255,0.02);
    }

    .rap-section-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .rap-section-icon {
      font-size: 16px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--section-bg);
      transition: transform 0.3s ease;
    }

    .rap-section:hover .rap-section-icon {
      transform: scale(1.1) rotate(-5deg);
    }

    .rap-section-title {
      font-size: 12px;
      font-weight: 700;
      color: ${THEME.textMain};
      text-shadow: 0 0 10px var(--section-glow);
    }

    .rap-section-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
      background: var(--section-bg);
      color: var(--section-color);
      border: 1px solid var(--section-glow);
      transition: all 0.3s ease;
    }

    .rap-section-badge.done {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.3);
    }

    .rap-section-toggle {
      color: ${THEME.textDim};
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      flex-shrink: 0;
      display: block;
    }

    .rap-section.expanded .rap-section-toggle {
      transform: rotate(180deg);
    }

    .rap-section-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rap-section.expanded .rap-section-body {
      max-height: 500px;
    }

    .rap-section-content {
      padding: 10px 14px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .rap-section-progress {
      height: 3px;
      background: rgba(255,255,255,0.05);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 4px;
    }

    .rap-section-progress-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--section-color);
      opacity: 0.7;
      transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 0 8px var(--section-glow);
    }

    .rap-task-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.02);
      border-radius: 10px;
      border: 1px solid transparent;
      transition: all 0.25s ease;
      cursor: pointer;
      position: relative;
    }

    .rap-task-item::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--section-color);
      opacity: 0;
      transition: opacity 0.3s;
      border-radius: 10px 0 0 10px;
    }

    .rap-task-item:hover {
      background: rgba(255,255,255,0.04);
      border-color: rgba(255,255,255,0.08);
      transform: translateX(2px);
    }

    .rap-task-item:hover::before {
      opacity: 0.5;
    }

    .rap-task-item.completed {
      opacity: 0.6;
    }

    .rap-task-item.completed .rap-task-title {
      text-decoration: line-through;
      color: ${THEME.textDim};
    }

    .rap-task-check {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid ${THEME.textDim};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 10px;
      font-weight: bold;
    }

    .rap-task-item:hover .rap-task-check {
      border-color: var(--section-color);
      box-shadow: 0 0 6px var(--section-glow);
    }

    .rap-task-item.completed .rap-task-check {
      background: #10b981;
      border-color: #10b981;
      color: #fff;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.35);
      animation: checkPop 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rap-task-item.processing .rap-task-check {
      border-color: var(--section-color);
      background: transparent;
      color: transparent;
      animation: checkSpin 1s linear infinite;
      border-top-color: transparent;
      border-radius: 50%;
    }

    .rap-task-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rap-task-title {
      font-size: 11px;
      font-weight: 600;
      color: ${THEME.textMain};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rap-task-meta {
      font-size: 9px;
      color: ${THEME.textDim};
      font-weight: 500;
    }

    .rap-task-points {
      font-size: 10px;
      font-weight: 700;
      color: var(--section-color);
      text-shadow: 0 0 8px var(--section-glow);
      flex-shrink: 0;
      padding: 2px 6px;
      background: var(--section-bg);
      border-radius: 6px;
    }

    .rap-empty-state {
      padding: 16px 10px;
      text-align: center;
      color: ${THEME.textDim};
      font-size: 11px;
    }

    .rap-empty-state-icon {
      font-size: 22px;
      margin-bottom: 6px;
      opacity: 0.5;
    }

    .rap-empty-state-text {
      font-weight: 500;
    }

    .rap-empty-state-sub {
      font-size: 9px;
      margin-top: 2px;
      color: ${THEME.textDim};
    }

    .rap-skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
      background-size: 200% 100%;
      animation: skeletonShimmer 1.5s infinite;
      border-radius: 6px;
    }

    .rap-skeleton-text {
      height: 12px;
      width: 70%;
      margin-bottom: 6px;
    }

    .rap-streak-card {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(239, 68, 68, 0.05));
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .rap-streak-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rap-streak-days {
      font-size: 20px;
      font-weight: 800;
      color: #f59e0b;
      text-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
      line-height: 1;
    }

    .rap-streak-label {
      font-size: 9px;
      color: ${THEME.textMuted};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .rap-streak-claim-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid rgba(245, 158, 11, 0.3);
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05));
      color: #f59e0b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }

    .rap-streak-claim-btn:hover {
      transform: scale(1.1);
      border-color: #f59e0b;
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
    }

    .rap-streak-claim-btn.claimed {
      background: rgba(16, 185, 129, 0.15);
      border-color: #10b981;
      color: #10b981;
      cursor: default;
    }

    .rap-footer {
      flex-shrink: 0;
      padding: 12px 16px;
      border-top: 1px solid ${THEME.panelBorder};
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .rap-claim-all-btn {
      width: 100%;
      padding: 10px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
      position: relative;
      overflow: hidden;
    }

    .rap-claim-all-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35);
    }

    .rap-claim-all-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .rap-footer-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: ${THEME.textDim};
    }

    .rap-toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    .rap-toast {
      background: linear-gradient(135deg, rgba(11, 15, 25, 0.95), rgba(17, 24, 39, 0.95));
      backdrop-filter: blur(12px);
      border: 1px solid ${THEME.panelBorder};
      border-radius: 12px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: toastSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
      min-width: 240px;
      max-width: 300px;
    }

    .rap-toast.success { border-left: 3px solid #10b981; }
    .rap-toast.error { border-left: 3px solid #ef4444; }
    .rap-toast.warning { border-left: 3px solid #f59e0b; }
    .rap-toast.info { border-left: 3px solid #3b82f6; }

    .rap-toast-icon { font-size: 16px; flex-shrink: 0; }
    .rap-toast-content { flex: 1; }
    .rap-toast-title { font-size: 11px; font-weight: 700; color: ${THEME.textMain}; margin-bottom: 2px; }
    .rap-toast-message { font-size: 10px; color: ${THEME.textMuted}; line-height: 1.3; }

    .rap-toast-close {
      background: none;
      border: none;
      color: ${THEME.textDim};
      cursor: pointer;
      font-size: 12px;
      padding: 2px;
    }

    @keyframes panelSlideIn {
      from { opacity: 0; transform: translateY(-20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes headerScan {
      0% { left: -100%; }
      100% { left: 100%; }
    }

    @keyframes iconFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }

    @keyframes statusPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    @keyframes checkPop {
      0% { transform: scale(0); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }

    @keyframes checkSpin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes skeletonShimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateX(30px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes toastFadeOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(30px); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Inicialización del Panel ───
function initRewardsPanel() {
  const existing = document.getElementById('rewards-auto-panel');
  if (existing) existing.remove();

  injectStyles();

  const panel = document.createElement('div');
  panel.id = 'rewards-auto-panel';
  if (panelState.isMinimized) panel.classList.add('minimized');

  // Header
  const header = document.createElement('div');
  header.className = 'rap-header';
  header.innerHTML = `
    <div class="rap-header-brand">
      <div class="rap-header-icon">⭐</div>
      <div>
        <span class="rap-header-title">Rewards <span>Auto</span></span>
        <span class="rap-header-version">v3.1</span>
      </div>
    </div>
    <div class="rap-header-actions">
      <button class="rap-btn-icon minimize" title="Minimizar">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button class="rap-btn-icon close" title="Cerrar">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  // Status Bar
  const statusBar = document.createElement('div');
  statusBar.className = 'rap-status-bar info';
  statusBar.id = 'rap-status-bar';
  statusBar.innerHTML = `
    <span class="rap-status-dot"></span>
    <span id="rap-status-text">Escaneando tareas...</span>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'panel-body';
  body.id = 'rap-panel-body';

  // Footer
  const footer = document.createElement('div');
  footer.className = 'rap-footer';
  footer.innerHTML = `
    <button class="rap-claim-all-btn" id="rap-claim-all" disabled style="opacity: 0.5;">
      <span>🚀</span>
      <span>Reclamar Todo Automáticamente</span>
    </button>
    <div class="rap-footer-meta">
      <span id="rap-last-update">Último escaneo: --</span>
      <span>Rewards Auto v3.1</span>
    </div>
  `;

  panel.appendChild(header);
  panel.appendChild(statusBar);
  panel.appendChild(body);
  panel.appendChild(footer);

  document.body.appendChild(panel);

  // Toast Container
  let toastContainer = document.getElementById('rap-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'rap-toast-container';
    toastContainer.className = 'rap-toast-container';
    document.body.appendChild(toastContainer);
  }

  setupPanelEvents(panel, header);
  renderSections();

  // Iniciar escaneo de tareas
  runFullScan();
}

// ─── Eventos del Panel ───
function setupPanelEvents(panel, header) {
  let isDragging = false;
  let startX, startY, initialX, initialY;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.rap-btn-icon')) return;
    isDragging = true;
    panel.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newX = initialX + dx;
    let newY = initialY + dy;
    
    newX = Math.max(10, Math.min(newX, window.innerWidth - panel.offsetWidth - 10));
    newY = Math.max(10, Math.min(newY, window.innerHeight - panel.offsetHeight - 10));
    
    panel.style.left = newX + 'px';
    panel.style.top = newY + 'px';
    panel.style.right = 'auto';
    panelState.position = { x: newX, y: newY };
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    panel.classList.remove('dragging');
  });

  panel.querySelector('.rap-btn-icon.minimize').addEventListener('click', () => {
    panelState.isMinimized = !panelState.isMinimized;
    panel.classList.toggle('minimized', panelState.isMinimized);
  });

  panel.querySelector('.rap-btn-icon.close').addEventListener('click', () => {
    panel.style.opacity = '0';
    panel.style.transform = 'scale(0.9)';
    setTimeout(() => {
      panel.remove();
      panelState.isOpen = false;
    }, 300);
  });

  panel.querySelector('#rap-claim-all').addEventListener('click', runClaimAll);
}

// ─── Mostrar Notificación Toast ───
function showToast(title, message, type = 'info', duration = 4000) {
  const container = document.getElementById('rap-toast-container');
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `rap-toast ${type}`;
  toast.innerHTML = `
    <span class="rap-toast-icon">${icons[type]}</span>
    <div class="rap-toast-content">
      <div class="rap-toast-title">${title}</div>
      <div class="rap-toast-message">${message}</div>
    </div>
    <button class="rap-toast-close">✕</button>
  `;

  toast.querySelector('.rap-toast-close').addEventListener('click', () => {
    toast.style.animation = 'toastFadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'toastFadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

// ─── Renderizado de Secciones ───
function renderSections() {
  const body = document.getElementById('rap-panel-body');
  if (!body) return;

  body.innerHTML = '';

  // Daily Set
  body.appendChild(createSection('dailySet', {
    icon: '🎯',
    title: 'Conjunto Diario',
    color: THEME.daily.color,
    glow: THEME.daily.glow,
    bg: THEME.daily.bg
  }));

  // More Activities
  body.appendChild(createSection('moreActivities', {
    icon: '🎁',
    title: 'Más Actividades',
    color: THEME.more.color,
    glow: THEME.more.glow,
    bg: THEME.more.bg
  }));

  // Punch Cards
  body.appendChild(createSection('punchCards', {
    icon: '🃏',
    title: 'Punch Cards',
    color: THEME.punch.color,
    glow: THEME.punch.glow,
    bg: THEME.punch.bg
  }));

  // Streak Bonus
  body.appendChild(createStreakSection());
}

// Crear Sección Común
function createSection(key, config) {
  const sectionData = panelState.sections[key];
  const isExpanded = sectionData.expanded;
  const tasks = sectionData.tasks || [];
  const isLoading = sectionData.loading;
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  const section = document.createElement('div');
  section.className = `rap-section ${isExpanded ? 'expanded' : ''}`;
  section.style.setProperty('--section-color', config.color);
  section.style.setProperty('--section-glow', config.glow);
  section.style.setProperty('--section-bg', config.bg);

  // Header
  const header = document.createElement('div');
  header.className = 'rap-section-header';
  header.innerHTML = `
    <div class="rap-section-header-left">
      <div class="rap-section-icon">${config.icon}</div>
      <span class="rap-section-title">${config.title}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="rap-section-badge ${allDone ? 'done' : ''}">${completedCount}/${totalCount || 0}</span>
      <svg class="rap-section-toggle" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
  `;

  header.addEventListener('click', () => {
    section.classList.toggle('expanded');
    panelState.sections[key].expanded = !panelState.sections[key].expanded;
  });

  // Body
  const body = document.createElement('div');
  body.className = 'rap-section-body';

  const content = document.createElement('div');
  content.className = 'rap-section-content';

  // Progress Bar
  if (totalCount > 0) {
    const progress = document.createElement('div');
    progress.className = 'rap-section-progress';
    progress.innerHTML = `
      <div class="rap-section-progress-fill" style="width: ${(completedCount / totalCount) * 100}%"></div>
    `;
    content.appendChild(progress);
  }

  // Content rendering
  if (isLoading) {
    content.innerHTML += `
      <div class="rap-skeleton rap-skeleton-text"></div>
      <div class="rap-skeleton rap-skeleton-text" style="width:50%"></div>
      <div class="rap-skeleton rap-skeleton-text" style="width:80%"></div>
    `;
  } else if (tasks.length === 0) {
    content.innerHTML += `
      <div class="rap-empty-state">
        <div class="rap-empty-state-icon">🔍</div>
        <div class="rap-empty-state-text">No detectadas</div>
        <div class="rap-empty-state-sub">Las tareas aparecerán al escanear</div>
      </div>
    `;
  } else {
    tasks.forEach((task, index) => {
      const item = document.createElement('div');
      item.className = `rap-task-item ${task.completed ? 'completed' : 'pending'} ${task.processing ? 'processing' : ''}`;
      
      const checkContent = task.completed ? `
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ` : '';
      
      item.innerHTML = `
        <div class="rap-task-check">${checkContent}</div>
        <div class="rap-task-info">
          <div class="rap-task-title" title="${task.title}">${task.title}</div>
          ${task.meta ? `<div class="rap-task-meta">${task.meta}</div>` : ''}
        </div>
        <div class="rap-task-points">${task.points}</div>
      `;
      
      item.addEventListener('click', () => {
        if (!task.completed && !task.processing) {
          claimTask(key, index);
        }
      });
      
      content.appendChild(item);
    });
  }

  body.appendChild(content);
  section.appendChild(header);
  section.appendChild(body);

  return section;
}

// Crear Sección de Racha
function createStreakSection() {
  const streakData = panelState.sections.streakBonus.data;
  const isLoading = panelState.sections.streakBonus.loading;
  const isExpanded = panelState.sections.streakBonus.expanded;

  const section = document.createElement('div');
  section.className = `rap-section ${isExpanded ? 'expanded' : ''}`;
  section.style.setProperty('--section-color', THEME.streak.color);
  section.style.setProperty('--section-glow', THEME.streak.glow);
  section.style.setProperty('--section-bg', THEME.streak.bg);

  const header = document.createElement('div');
  header.className = 'rap-section-header';
  header.innerHTML = `
    <div class="rap-section-header-left">
      <div class="rap-section-icon">🔥</div>
      <span class="rap-section-title">Bono de Racha</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="rap-section-badge ${streakData && !streakData.bonusAvailable ? 'done' : ''}">
        ${streakData ? streakData.streakDays : 0} días
      </span>
      <svg class="rap-section-toggle" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
  `;

  header.addEventListener('click', () => {
    section.classList.toggle('expanded');
    panelState.sections.streakBonus.expanded = !panelState.sections.streakBonus.expanded;
  });

  const body = document.createElement('div');
  body.className = 'rap-section-body';

  const content = document.createElement('div');
  content.className = 'rap-section-content';

  if (isLoading) {
    content.innerHTML = `
      <div class="rap-skeleton rap-skeleton-text" style="width:60%"></div>
      <div class="rap-skeleton rap-skeleton-text" style="width:40%"></div>
    `;
  } else if (!streakData) {
    content.innerHTML = `
      <div class="rap-empty-state">
        <div class="rap-empty-state-icon">🔥</div>
        <div class="rap-empty-state-text">No detectado</div>
        <div class="rap-empty-state-sub">Inicia sesión en Rewards</div>
      </div>
    `;
  } else {
    const isClaimed = !streakData.bonusAvailable;
    content.innerHTML = `
      <div class="rap-streak-card">
        <div class="rap-streak-info">
          <div class="rap-streak-days">${streakData.streakDays}🔥</div>
          <div class="rap-streak-label">Días de racha</div>
        </div>
        <button class="rap-streak-claim-btn ${isClaimed ? 'claimed' : ''}" 
                ${isClaimed ? 'disabled' : ''}
                id="rap-streak-claim-btn">
          ${isClaimed ? `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ` : '🎁'}
        </button>
      </div>
    `;
    
    setTimeout(() => {
      const btn = content.querySelector('#rap-streak-claim-btn');
      if (btn && !isClaimed) {
        btn.addEventListener('click', claimStreakBonus);
      }
    }, 0);
  }

  body.appendChild(content);
  section.appendChild(header);
  section.appendChild(body);

  return section;
}

// ─── Modificar Estado del Status Bar ───
function updateStatus(text, type = 'info') {
  const bar = document.getElementById('rap-status-bar');
  const textEl = document.getElementById('rap-status-text');
  if (bar && textEl) {
    bar.className = `rap-status-bar ${type}`;
    textEl.textContent = text;
  }
}

// ─── Sincronizar Barra de Status General ───
function updateStatusBar() {
  const sections = panelState.sections;
  const totalTasks = Object.values(sections).reduce((sum, s) => sum + (s.tasks?.length || 0), 0);
  const completedTasks = Object.values(sections).reduce((sum, s) => 
    sum + (s.tasks?.filter(t => t.completed).length || 0), 0);
  
  const claimAllBtn = document.getElementById('rap-claim-all');

  if (totalTasks === 0) {
    updateStatus('Escaneando tareas...', 'info');
    if (claimAllBtn) {
      claimAllBtn.disabled = true;
      claimAllBtn.style.opacity = '0.5';
    }
  } else if (completedTasks === totalTasks) {
    updateStatus('¡Todas las tareas completadas!', 'success');
    if (claimAllBtn) {
      claimAllBtn.disabled = true;
      claimAllBtn.style.opacity = '0.5';
      claimAllBtn.innerHTML = '<span>✅</span><span>Todo Completado</span>';
    }
  } else {
    const pending = totalTasks - completedTasks;
    updateStatus(`${completedTasks}/${totalTasks} tareas completadas`, 'warning');
    if (claimAllBtn) {
      claimAllBtn.disabled = false;
      claimAllBtn.style.opacity = '1';
      claimAllBtn.innerHTML = `<span>🚀</span><span>Reclamar ${pending} Tarea(s)</span>`;
    }
  }
  
  const meta = document.getElementById('rap-last-update');
  if (meta) {
    meta.textContent = `Último escaneo: ${new Date().toLocaleTimeString()}`;
  }
}

// ─── Guardar en Local Storage para Popup ───
function saveScannedTasksToStorage() {
  try {
    const dailySet = panelState.sections.dailySet.tasks || [];
    const moreActivities = panelState.sections.moreActivities.tasks || [];
    const punchCards = panelState.sections.punchCards.tasks || [];
    const streakBonus = panelState.sections.streakBonus.data;

    const serializable = {
      dailySet: dailySet.map(t => ({ title: t.title, points: t.points, completed: t.completed, type: t.type, url: t.url })),
      moreActivities: moreActivities.map(t => ({ title: t.title, points: t.points, completed: t.completed, type: t.type, url: t.url })),
      punchCards: punchCards.map(t => ({ title: t.title, points: t.points, completed: t.completed, currentStep: t.currentStep, totalSteps: t.totalSteps, type: t.type, url: t.url })),
      streakBonus: streakBonus ? { streakDays: streakBonus.streakDays, bonusAvailable: streakBonus.bonusAvailable, bonusAmount: streakBonus.bonusAmount } : null,
      lastUpdated: Date.now()
    };
    chrome.storage.local.set({ scannedTasks: serializable });
  } catch (e) {
    console.log("[RewardsBot] Error saving scanned tasks to local storage:", e);
  }
}

// ─── Contar Tareas Pendientes para el Escáner ───
function countPendingTasks() {
  let count = 0;
  count += (panelState.sections.dailySet.tasks || []).filter(t => !t.completed).length;
  count += (panelState.sections.moreActivities.tasks || []).filter(t => !t.completed).length;
  count += (panelState.sections.punchCards.tasks || []).filter(t => !t.completed).length;
  const streak = panelState.sections.streakBonus.data;
  if (streak && streak.bonusAvailable) count++;
  return count;
}

// ─── Escaneo Completo de Tareas ───
async function runFullScan() {
  let scanAttempts = 0;
  const maxAttempts = 6;

  const doScan = async () => {
    scanAttempts++;
    console.log(`[RewardsBot] Escaneo #${scanAttempts}...`);

    const isDashboard = window.location.pathname.includes('/dashboard') || window.location.pathname === "/";
    const isEarn = window.location.pathname.includes('/earn');

    // 1. Daily Set
    if (!isEarn) {
      try {
        if (window.RewardsWorkers && window.RewardsWorkers.DailySet) {
          const tasks = await window.RewardsWorkers.DailySet.scan();
          panelState.sections.dailySet.tasks = tasks;
        }
      } catch (e) { console.log("[RewardsBot] Error escaneando Daily Set:", e); }
    }
    panelState.sections.dailySet.loading = false;

    // 2. Punch Cards
    if (!isEarn) {
      try {
        if (window.RewardsWorkers && window.RewardsWorkers.PunchCards) {
          const tasks = await window.RewardsWorkers.PunchCards.scan();
          panelState.sections.punchCards.tasks = tasks;
        }
      } catch (e) { console.log("[RewardsBot] Error escaneando Punch Cards:", e); }
    }
    panelState.sections.punchCards.loading = false;

    // 3. More Activities
    if (!isDashboard) {
      try {
        if (window.RewardsWorkers && window.RewardsWorkers.MoreActivities) {
          const tasks = await window.RewardsWorkers.MoreActivities.scan();
          panelState.sections.moreActivities.tasks = tasks;
        }
      } catch (e) { console.log("[RewardsBot] Error escaneando More Activities:", e); }
    }
    panelState.sections.moreActivities.loading = false;

    // 4. Streak Bonus
    if (!isDashboard) {
      try {
        if (window.RewardsWorkers && window.RewardsWorkers.StreakBonus) {
          const data = await window.RewardsWorkers.StreakBonus.scan();
          if (data) {
            panelState.sections.streakBonus.data = data;
          }
        }
      } catch (e) { console.log("[RewardsBot] Error escaneando Streak Bonus:", e); }
    }
    panelState.sections.streakBonus.loading = false;

    saveScannedTasksToStorage();
    renderSections();
    updateStatusBar();

    const totalPending = countPendingTasks();
    if (totalPending === 0 && scanAttempts < maxAttempts) {
      setTimeout(doScan, 2000);
    }
  };

  await doScan();
}

// ─── Reclamar Tarea Individual ───
async function claimTask(sectionKey, taskIndex) {
  const task = panelState.sections[sectionKey].tasks[taskIndex];
  if (!task || task.completed || task.processing) return;

  task.processing = true;
  renderSections();
  updateStatus(`Abriendo pestaña: ${task.title}...`, 'info');

  try {
    await claimSingleTask(task);
    
    // Esperar a que se resuelva secuencialmente
    await waitForTaskTabClose(65000);
    
    await new Promise(r => setTimeout(r, 2000));
    
    const completed = isCardCompleted(task);
    if (completed) {
      task.completed = true;
      showToast('Tarea completada', `"${task.title}" — completada con éxito`, 'success');
    } else {
      showToast('Tarea no completada', `El dashboard no registró la tarea. Reinténtalo.`, 'warning');
    }
  } catch (err) {
    showToast('Error', `No se pudo procesar: ${err.message}`, 'error');
  } finally {
    task.processing = false;
    runFullScan();
  }
}

// ─── Reclamar Bono de Racha ───
async function claimStreakBonus() {
  const btn = document.getElementById('rap-streak-claim-btn');
  if (!btn || btn.disabled) return;

  btn.innerHTML = '⏳';
  btn.style.animation = 'checkSpin 1s linear infinite';

  try {
    if (window.RewardsWorkers && window.RewardsWorkers.StreakBonus) {
      await window.RewardsWorkers.StreakBonus.claim();
      panelState.sections.streakBonus.data.bonusAvailable = false;
      showToast('¡Bono de racha reclamado!', 'Bonificación de racha obtenida', 'success');
    }
  } catch (err) {
    showToast('Error', 'No se pudo reclamar el bono: ' + err.message, 'error');
  }
  
  renderSections();
  updateStatusBar();
}

// ─── Reclamar Todo (Secuencial) ───
async function runClaimAll() {
  const btn = document.getElementById('rap-claim-all');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span><span>Procesando tareas...</span>';
  
  updateStatus('Procesando todas las tareas...', 'info');

  const pendingTasks = [];
  
  // 1. Daily Set
  (panelState.sections.dailySet.tasks || []).filter(t => !t.completed).forEach(t => {
    pendingTasks.push({ ...t, sectionKey: 'dailySet' });
  });
  
  // 2. More Activities
  (panelState.sections.moreActivities.tasks || []).filter(t => !t.completed).forEach(t => {
    pendingTasks.push({ ...t, sectionKey: 'moreActivities' });
  });

  // 3. Punch Cards
  (panelState.sections.punchCards.tasks || []).filter(t => !t.completed).forEach(t => {
    pendingTasks.push({ ...t, sectionKey: 'punchCards' });
  });

  // 4. Streak
  const streak = panelState.sections.streakBonus.data;
  const hasStreakBonus = streak && streak.bonusAvailable;

  const total = pendingTasks.length + (hasStreakBonus ? 1 : 0);
  let completedCount = 0;
  const maxRetries = 2;
  const taskRetryCount = new Map();

  while (pendingTasks.length > 0) {
    const task = pendingTasks.shift();
    const currentTaskIndex = panelState.sections[task.sectionKey].tasks.findIndex(t => t.title === task.title);

    if (currentTaskIndex !== -1) {
      panelState.sections[task.sectionKey].tasks[currentTaskIndex].processing = true;
      renderSections();
    }

    updateStatus(`[${completedCount + 1}/${total}] Procesando: ${task.title || "Actividad"}`, 'info');
    console.log(`[RewardsBot] Procesando: ${task.title}`);

    try {
      await claimSingleTask(task);
      await waitForTaskTabClose(65000);
      await new Promise(r => setTimeout(r, 2000));

      const isCompleted = isCardCompleted(task);
      console.log(`[RewardsBot] Verificación para "${task.title}": ${isCompleted ? "COMPLETADA" : "NO COMPLETADA"}`);

      if (isCompleted) {
        completedCount++;
        if (currentTaskIndex !== -1) {
          panelState.sections[task.sectionKey].tasks[currentTaskIndex].completed = true;
        }
        showToast('Tarea completada', `"${task.title}" completado con éxito`, 'success');
      } else {
        const retries = taskRetryCount.get(task.url) || 0;
        if (retries < maxRetries) {
          taskRetryCount.set(task.url, retries + 1);
          console.log(`[RewardsBot] Tarea no completada. Reintentando (${retries + 1}/${maxRetries}): ${task.title}`);
          pendingTasks.push(task);
        } else {
          console.log(`[RewardsBot] Tarea falló tras alcanzar el máximo de reintentos: ${task.title}`);
          completedCount++;
        }
      }
    } catch (e) {
      console.log(`[RewardsBot] Error procesando tarea "${task.title}":`, e);
      completedCount++;
    } finally {
      if (currentTaskIndex !== -1) {
        panelState.sections[task.sectionKey].tasks[currentTaskIndex].processing = false;
        renderSections();
        updateStatusBar();
      }
    }

    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
  }

  // Bono de Racha
  if (hasStreakBonus) {
    updateStatus(`[${total}/${total}] Procesando: Bono de Racha`, 'info');
    try {
      if (window.RewardsWorkers && window.RewardsWorkers.StreakBonus) {
        await window.RewardsWorkers.StreakBonus.claim();
        panelState.sections.streakBonus.data.bonusAvailable = false;
        completedCount++;
        showToast('¡Bono de racha reclamado!', 'Bono procesado con éxito', 'success');
      }
    } catch (e) {
      console.log(`[RewardsBot] Error procesando Bono de Racha:`, e);
    }
    renderSections();
    updateStatusBar();
  }

  updateStatus('¡Todas las tareas procesadas!', 'success');
  showToast('Proceso finalizado', `${completedCount} tareas procesadas`, 'success');

  try {
    chrome.runtime.sendMessage({
      action: "tasksClaimed",
      count: completedCount
    });
  } catch (e) {}

  btn.disabled = false;
  btn.innerHTML = '<span>🚀</span><span>Reclamar Todo Automáticamente</span>';

  // Redirigir/Recargar
  const isDashboard = window.location.pathname.includes("dashboard") || window.location.pathname === "/";
  setTimeout(() => {
    if (isDashboard) {
      window.location.href = "https://rewards.bing.com/earn";
    } else {
      window.location.reload();
    }
  }, 3000);
}

// ============================================================
// RECLAMAR UNA TAREA INDIVIDUAL
// ============================================================

async function claimSingleTask(task) {
  // Notificar al background que se abrirá una nueva pestaña de tarea para que empiece a trackearla
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "prepareForTaskTab" }, () => {
      resolve();
    });
  });

  if (task.element) {
    // Forzar apertura en nueva pestaña
    task.element.setAttribute("target", "_blank");

    // Usar simulación humana si está disponible
    if (window.RewardsUtils && window.RewardsUtils.Human) {
      await window.RewardsUtils.Human.click(task.element);
    } else {
      // Fallback: clic simulado con eventos
      const clickEvent = new MouseEvent("click", {
        view: window, bubbles: true, cancelable: true, ctrlKey: true
      });
      task.element.dispatchEvent(clickEvent);

      // Fallback nativo
      setTimeout(() => { try { task.element.click(); } catch (e) {} }, 100);
    }
  } else if (task.url) {
    // Si no hay elemento pero sí URL, abrir directamente
    window.open(task.url, "_blank");
  }
}

// ============================================================
// AUTO-SOLVER DE QUIZZES/POLLS EN PÁGINAS DE BÚSQUEDA
// ============================================================

function solveActiveTasks() {
  console.log("[RewardsBot] Verificando widgets de búsqueda...");

  // 1. Detectar Daily Poll
  const pollOptions = document.querySelectorAll(
    ".btOption, .btoption, [class*='btOption'], [id*='btoption'], [id*='poll'] button, .option-card, .bt_optionCard"
  );
  if (pollOptions.length > 0) {
    console.log(`[RewardsBot] Poll detectado. ${pollOptions.length} opciones.`);

    // Esperar un poco antes de "responder" (simular lectura)
    const readTime = 2000 + Math.random() * 3000;
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * pollOptions.length);
      const chosen = pollOptions[randomIndex];
      console.log("[RewardsBot] Seleccionando opción:", chosen.innerText);
      window.lastRewardsActionTime = Date.now();

      if (window.RewardsUtils && window.RewardsUtils.Human) {
        window.RewardsUtils.Human.click(chosen);
      } else {
        chosen.click();
      }
    }, readTime);
    return;
  }

  // 2. Detectar inicio de Quiz
  const startQuizBtn = document.getElementById("rqStartQuiz")
    || document.querySelector("[id*='startquiz' i]")
    || document.querySelector(".rqStartQuiz")
    || document.querySelector("#quizWelcomeContainer input[type='button']")
    || document.querySelector(".rw_btn[value*='Start' i], .rw_btn[value*='Comenzar' i], .wk_button[value*='Start' i]");

  if (startQuizBtn && startQuizBtn.style.display !== "none" && !startQuizBtn.classList.contains("rqHdn")) {
    console.log("[RewardsBot] Botón de inicio de Quiz encontrado.");
    setTimeout(() => {
      window.lastRewardsActionTime = Date.now();
      startQuizBtn.click();
      setTimeout(solveActiveTasks, 2500);
    }, 1500 + Math.random() * 2000);
    return;
  }

  // 3. Quiz en progreso — seleccionar opciones
  const quizOptions = Array.from(document.querySelectorAll(
    ".rqOption, .rqOptionCard, [id*='rqOption'], #rqAnswerOption0, #rqAnswerOption1, " +
    ".wk_OptionClickClass, [data-option], .btOption, #bt_option0, #bt_option1, #bt_option2, #bt_option3, " +
    ".rw_btn, .rw_option, .b_cards[iscorrectoption], .b_Cards[iscorrectoption], .b_ans"
  ));

  if (quizOptions.length > 0) {
    console.log(`[RewardsBot] Quiz en progreso. ${quizOptions.length} opciones.`);

    // Filtrar opciones ya usadas o incorrectas
    const active = quizOptions.filter(opt => {
      const isWrong = opt.classList.contains("rqWrong") || opt.classList.contains("wrong")
        || opt.getAttribute("disabled") !== null || opt.style.pointerEvents === "none";
      const isCorrect = opt.classList.contains("rqCorrect") || opt.classList.contains("correct")
        || opt.classList.contains("btOptionCardSelected");
      return !isWrong && !isCorrect;
    });

    if (active.length > 0) {
      // Delay de "lectura" antes de responder
      const thinkTime = 1500 + Math.random() * 3000;
      setTimeout(() => {
        const target = active[0];
        console.log("[RewardsBot] Seleccionando opción de quiz:", target.innerText?.substring(0, 30));
        window.lastRewardsActionTime = Date.now();

        if (window.RewardsUtils && window.RewardsUtils.Human) {
          window.RewardsUtils.Human.click(target);
        } else {
          target.click();
        }

        // Verificar si hay más preguntas
        setTimeout(solveActiveTasks, 2500);
      }, thinkTime);
    } else {
      console.log("[RewardsBot] No hay opciones activas. Esperando siguiente pregunta...");
      setTimeout(solveActiveTasks, 2000);
    }
    return;
  }

  // 4. Detectar "This or That" (supersonic quiz)
  const totOptions = document.querySelectorAll(
    "#rqAnswerOption0, #rqAnswerOption1, .btOptionCard, .rqOption, .wk_OptionClickClass, .b_cards[iscorrectoption]"
  );
  if (totOptions.length >= 2) {
    console.log("[RewardsBot] 'This or That' detectado.");
    const readDelay = 2000 + Math.random() * 2000;
    setTimeout(() => {
      const pick = totOptions[Math.floor(Math.random() * totOptions.length)];
      console.log("[RewardsBot] Eligiendo:", pick.innerText?.substring(0, 30));
      window.lastRewardsActionTime = Date.now();

      if (window.RewardsUtils && window.RewardsUtils.Human) {
        window.RewardsUtils.Human.click(pick);
      } else {
        pick.click();
      }
      setTimeout(solveActiveTasks, 2500);
    }, readDelay);
    return;
  }

  // 5. Detectar botones de "completar" genéricos
  const completeBtn = document.querySelector(
    "#bnp_btn_accept, .cico_closeBtn, #reward-close-btn, .actionLink, " +
    "input[value='Claim'], input[value='Take'], button.wk_OptionClickClass"
  );
  if (completeBtn) {
    console.log("[RewardsBot] Botón de completar encontrado:", completeBtn.innerText || completeBtn.value);
    setTimeout(() => {
      window.lastRewardsActionTime = Date.now();
      completeBtn.click();
    }, 1000 + Math.random() * 1500);
    return;
  }

  console.log("[RewardsBot] No se detectaron widgets activos en esta página.");
}
