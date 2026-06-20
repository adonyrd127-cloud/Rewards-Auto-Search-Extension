// ============================================================
// Content Script Principal — Rewards Auto Search & Claimer v2
// Orquesta los workers y muestra el panel flotante en rewards.bing.com
// También maneja el auto-solver de quizzes/polls en páginas de búsqueda
// ============================================================

const isRewardsPage = window.location.hostname === "rewards.bing.com" || window.location.pathname.includes("/rewards/");
const isSearchPage = window.location.hostname.includes("bing.com") && window.location.pathname.includes("/search");

// --- REWARDS DASHBOARD AUTOMATION ---
if (isRewardsPage) {
  console.log("[RewardsBot] Cargado en página de Rewards.");
  // Esperar a que los Web Components de Microsoft se rendericen
  setTimeout(() => initRewardsPanel(), 2500);
}

// --- BING SEARCH QUIZ/POLL AUTO-SOLVER & HUMANIZATION ---
if (isSearchPage) {
  console.log("[RewardsBot] Cargado en Bing Search. Verificando quizzes/polls y simulando lectura...");
  setTimeout(solveActiveTasks, 2500);
  
  // Simular lectura aleatoria para parecer más humano (solo 50% de las veces)
  if (Math.random() > 0.5) {
    setTimeout(() => {
      if (window.RewardsUtils && window.RewardsUtils.Human && window.RewardsUtils.Human.simulateReading) {
        window.RewardsUtils.Human.simulateReading();
      }
    }, 1500);
  }
}

// ============================================================
// PANEL FLOTANTE MEJORADO
// ============================================================

function initRewardsPanel() {
  // Remover panel existente si hay
  const oldPanel = document.getElementById("rewards-auto-panel");
  if (oldPanel) oldPanel.remove();

  // Crear contenedor principal del panel
  const panel = document.createElement("div");
  panel.id = "rewards-auto-panel";

  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "310px",
    maxHeight: "520px",
    backgroundColor: "rgba(17, 24, 35, 0.97)",
    border: "2px solid #10b981",
    borderRadius: "14px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.15)",
    color: "#fff",
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
    padding: "16px",
    zIndex: "999999",
    backdropFilter: "blur(12px)",
    transition: "transform 0.3s ease, opacity 0.3s ease",
    overflowY: "auto",
    overflowX: "hidden"
  });

  // --- HEADER ---
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: "8px"
  });

  const title = document.createElement("div");
  title.innerHTML = `<strong style="color:#34d399;font-size:14px;">⭐ Rewards Auto</strong> <span style="color:#64748b;font-size:10px;">v2.0</span>`;

  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  Object.assign(closeBtn.style, {
    cursor: "pointer", fontSize: "18px", fontWeight: "bold",
    color: "#94a3b8", lineHeight: "1", padding: "2px 6px",
    borderRadius: "4px", transition: "background 0.2s"
  });
  closeBtn.addEventListener("mouseover", () => closeBtn.style.background = "rgba(255,255,255,0.1)");
  closeBtn.addEventListener("mouseout", () => closeBtn.style.background = "none");
  closeBtn.addEventListener("click", () => panel.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // --- STATUS GLOBAL ---
  const globalStatus = document.createElement("div");
  globalStatus.id = "panel-global-status";
  globalStatus.innerHTML = `<span style="color:#f59e0b;">⏳</span> Escaneando actividades...`;
  Object.assign(globalStatus.style, {
    marginBottom: "12px", padding: "8px 10px",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: "8px", border: "1px solid rgba(245,158,11,0.2)",
    fontSize: "11px"
  });
  panel.appendChild(globalStatus);

  // --- CONTENEDORES POR CATEGORÍA ---
  const categories = [
    { id: "daily-set", label: "🎯 Conjunto Diario", color: "#3b82f6" },
    { id: "more-activities", label: "🎁 Más Actividades", color: "#8b5cf6" },
    { id: "punch-cards", label: "🃏 Punch Cards", color: "#ec4899" },
    { id: "streak-bonus", label: "🔥 Bono de Racha", color: "#f59e0b" }
  ];

  categories.forEach(cat => {
    const section = document.createElement("div");
    section.id = `section-${cat.id}`;
    Object.assign(section.style, {
      marginBottom: "10px", padding: "10px",
      backgroundColor: "rgba(0,0,0,0.25)", borderRadius: "8px",
      border: `1px solid ${cat.color}33`
    });

    const sectionHeader = document.createElement("div");
    Object.assign(sectionHeader.style, {
      display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: "6px"
    });
    sectionHeader.innerHTML = `
      <span style="font-weight:600;font-size:11px;color:${cat.color}">${cat.label}</span>
      <span id="count-${cat.id}" style="font-size:10px;color:#64748b;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:10px;">...</span>
    `;

    const sectionList = document.createElement("div");
    sectionList.id = `list-${cat.id}`;
    sectionList.style.fontSize = "11px";

    section.appendChild(sectionHeader);
    section.appendChild(sectionList);
    panel.appendChild(section);
  });

  // --- BARRA DE PROGRESO GLOBAL ---
  const progressContainer = document.createElement("div");
  progressContainer.id = "claim-progress-container";
  progressContainer.style.display = "none";
  progressContainer.innerHTML = `
    <div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:10px;">
      <span id="claim-progress-text" style="color:#94a3b8;">Procesando...</span>
      <span id="claim-progress-pct" style="color:#10b981;font-weight:bold;">0%</span>
    </div>
    <div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
      <div id="claim-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:2px;transition:width 0.5s ease;"></div>
    </div>
  `;
  Object.assign(progressContainer.style, {
    marginBottom: "12px", padding: "8px 10px",
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: "8px", border: "1px solid rgba(16,185,129,0.15)"
  });
  panel.appendChild(progressContainer);

  // --- BOTÓN DE RECLAMAR TODO ---
  const claimAllBtn = document.createElement("button");
  claimAllBtn.id = "btn-claim-all";
  claimAllBtn.innerText = "🚀 Reclamar Todo";
  Object.assign(claimAllBtn.style, {
    width: "100%", backgroundColor: "#10b981", color: "white",
    border: "none", borderRadius: "8px", padding: "10px",
    cursor: "pointer", fontWeight: "bold", fontSize: "13px",
    transition: "all 0.2s", boxShadow: "0 4px 12px rgba(16,185,129,0.3)"
  });
  claimAllBtn.disabled = true;
  claimAllBtn.style.opacity = "0.5";

  claimAllBtn.addEventListener("mouseover", () => {
    if (!claimAllBtn.disabled) {
      claimAllBtn.style.backgroundColor = "#059669";
      claimAllBtn.style.transform = "translateY(-1px)";
    }
  });
  claimAllBtn.addEventListener("mouseout", () => {
    if (!claimAllBtn.disabled) {
      claimAllBtn.style.backgroundColor = "#10b981";
      claimAllBtn.style.transform = "translateY(0)";
    }
  });

  panel.appendChild(claimAllBtn);
  document.body.appendChild(panel);

  // --- INICIAR ESCANEO ---
  runFullScan(panel, globalStatus, claimAllBtn);
}

// ============================================================
// ESCANEO COMPLETO DE TODAS LAS CATEGORÍAS
// ============================================================

async function runFullScan(panel, globalStatus, claimAllBtn) {
  let scanAttempts = 0;
  const maxAttempts = 6;

  const doScan = async () => {
    scanAttempts++;
    console.log(`[RewardsBot] Escaneo #${scanAttempts}...`);

    const results = {
      dailySet: [],
      moreActivities: [],
      punchCards: [],
      streakBonus: null
    };

    // Escanear cada categoría usando los workers disponibles
    try {
      if (window.RewardsWorkers && window.RewardsWorkers.DailySet) {
        results.dailySet = await window.RewardsWorkers.DailySet.scan();
      }
    } catch (e) { console.warn("[RewardsBot] Error escaneando Daily Set:", e); }

    try {
      if (window.RewardsWorkers && window.RewardsWorkers.MoreActivities) {
        results.moreActivities = await window.RewardsWorkers.MoreActivities.scan();
      }
    } catch (e) { console.warn("[RewardsBot] Error escaneando More Activities:", e); }

    try {
      if (window.RewardsWorkers && window.RewardsWorkers.PunchCards) {
        results.punchCards = await window.RewardsWorkers.PunchCards.scan();
      }
    } catch (e) { console.warn("[RewardsBot] Error escaneando Punch Cards:", e); }

    try {
      if (window.RewardsWorkers && window.RewardsWorkers.StreakBonus) {
        results.streakBonus = await window.RewardsWorkers.StreakBonus.scan();
      }
    } catch (e) { console.warn("[RewardsBot] Error escaneando Streak Bonus:", e); }

    // Actualizar la UI del panel con los resultados
    updatePanelUI(results, claimAllBtn, globalStatus, panel);

    // Si no encontramos nada y aún nos quedan intentos, reintentar
    const totalPending = countPendingTasks(results);
    if (totalPending === 0 && scanAttempts < maxAttempts) {
      setTimeout(doScan, 2500);
    }
  };

  await doScan();
}

// ============================================================
// ACTUALIZAR UI DEL PANEL
// ============================================================

function countPendingTasks(results) {
  let count = 0;
  count += results.dailySet.filter(t => !t.completed).length;
  count += results.moreActivities.filter(t => !t.completed).length;
  count += results.punchCards.filter(t => !t.completed).length;
  if (results.streakBonus && results.streakBonus.bonusAvailable) count++;
  return count;
}

function updatePanelUI(results, claimAllBtn, globalStatus, panel) {
  // --- Daily Set ---
  renderCategoryList("daily-set", results.dailySet);

  // --- More Activities ---
  renderCategoryList("more-activities", results.moreActivities);

  // --- Punch Cards ---
  renderPunchCards("punch-cards", results.punchCards);

  // --- Streak Bonus ---
  renderStreakBonus("streak-bonus", results.streakBonus);

  // --- Status global ---
  const totalPending = countPendingTasks(results);
  const totalCompleted = results.dailySet.filter(t => t.completed).length +
                         results.moreActivities.filter(t => t.completed).length +
                         results.punchCards.filter(t => t.completed).length;

  if (totalPending > 0) {
    globalStatus.innerHTML = `<span style="color:#10b981;">✅</span> ${totalPending} tarea(s) pendiente(s) · ${totalCompleted} completada(s)`;
    globalStatus.style.borderColor = "rgba(16,185,129,0.2)";
    globalStatus.style.backgroundColor = "rgba(16,185,129,0.08)";
    claimAllBtn.disabled = false;
    claimAllBtn.style.opacity = "1";
    claimAllBtn.innerText = `🚀 Reclamar ${totalPending} Tarea(s)`;
    claimAllBtn.onclick = () => runClaimAll(results, claimAllBtn, globalStatus);
  } else {
    globalStatus.innerHTML = `<span style="color:#10b981;">🎉</span> ¡Todas las tareas completadas!`;
    globalStatus.style.borderColor = "rgba(16,185,129,0.2)";
    globalStatus.style.backgroundColor = "rgba(16,185,129,0.08)";
    claimAllBtn.disabled = true;
    claimAllBtn.style.opacity = "0.5";
    claimAllBtn.innerText = "✅ Todo Completado";
  }
}

function renderCategoryList(categoryId, tasks) {
  const list = document.getElementById(`list-${categoryId}`);
  const count = document.getElementById(`count-${categoryId}`);
  if (!list || !count) return;

  const pending = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed);

  count.innerText = `${pending.length} pendiente(s)`;
  count.style.color = pending.length > 0 ? "#f59e0b" : "#10b981";

  if (tasks.length === 0) {
    list.innerHTML = `<div style="color:#475569;font-size:10px;padding:4px 0;">No detectadas</div>`;
    return;
  }

  list.innerHTML = "";
  tasks.forEach(task => {
    const item = document.createElement("div");
    Object.assign(item.style, {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)"
    });

    const statusIcon = task.completed ? "✅" : "⬜";
    const titleColor = task.completed ? "#475569" : "#e2e8f0";
    const pointsColor = task.completed ? "#475569" : "#10b981";

    item.innerHTML = `
      <span style="color:${titleColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">
        ${statusIcon} ${task.title || "Actividad"}
      </span>
      <span style="color:${pointsColor};font-weight:600;font-size:10px;">
        ${task.points || ""}
      </span>
    `;
    list.appendChild(item);
  });
}

function renderPunchCards(categoryId, tasks) {
  const list = document.getElementById(`list-${categoryId}`);
  const count = document.getElementById(`count-${categoryId}`);
  if (!list || !count) return;

  const pending = tasks.filter(t => !t.completed);
  count.innerText = `${pending.length} pendiente(s)`;
  count.style.color = pending.length > 0 ? "#f59e0b" : "#10b981";

  if (tasks.length === 0) {
    list.innerHTML = `<div style="color:#475569;font-size:10px;padding:4px 0;">No detectadas</div>`;
    return;
  }

  list.innerHTML = "";
  tasks.forEach(task => {
    const item = document.createElement("div");
    Object.assign(item.style, {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)"
    });

    const statusIcon = task.completed ? "✅" : "⬜";
    const progress = task.currentStep !== undefined ? `${task.currentStep}/${task.totalSteps}` : "";

    item.innerHTML = `
      <span style="color:${task.completed ? '#475569' : '#e2e8f0'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">
        ${statusIcon} ${task.title || "Punch Card"}
      </span>
      <span style="color:#ec4899;font-weight:600;font-size:10px;">
        ${progress} ${task.points || ""}
      </span>
    `;
    list.appendChild(item);
  });
}

function renderStreakBonus(categoryId, streakData) {
  const list = document.getElementById(`list-${categoryId}`);
  const count = document.getElementById(`count-${categoryId}`);
  if (!list || !count) return;

  if (!streakData) {
    count.innerText = "—";
    count.style.color = "#64748b";
    list.innerHTML = `<div style="color:#475569;font-size:10px;padding:4px 0;">No detectado</div>`;
    return;
  }

  count.innerText = `${streakData.streakDays || 0} días`;
  count.style.color = "#f59e0b";

  const bonusStatus = streakData.bonusAvailable
    ? `<span style="color:#10b981;">⬜ Bono disponible: +${streakData.bonusAmount || "?"} pts</span>`
    : `<span style="color:#475569;">✅ Bono reclamado</span>`;

  list.innerHTML = `
    <div style="padding:3px 0;">
      <div style="color:#e2e8f0;margin-bottom:2px;">🔥 Racha actual: <strong>${streakData.streakDays || 0}</strong> días</div>
      <div style="font-size:10px;">${bonusStatus}</div>
    </div>
  `;
}

// ============================================================
// EJECUTAR RECLAMACIÓN DE TODO
// ============================================================

async function runClaimAll(results, claimBtn, globalStatus) {
  claimBtn.disabled = true;
  claimBtn.style.opacity = "0.6";
  claimBtn.innerText = "⏳ Procesando...";

  const progressContainer = document.getElementById("claim-progress-container");
  const progressText = document.getElementById("claim-progress-text");
  const progressPct = document.getElementById("claim-progress-pct");
  const progressBar = document.getElementById("claim-progress-bar");

  if (progressContainer) progressContainer.style.display = "block";

  // Combinar todas las tareas pendientes
  const allTasks = [];

  // 1. Daily Set (prioridad más alta)
  results.dailySet.filter(t => !t.completed).forEach(t => allTasks.push({ ...t, category: "Daily Set" }));

  // 2. More Activities
  results.moreActivities.filter(t => !t.completed).forEach(t => allTasks.push({ ...t, category: "Más Actividades" }));

  // 3. Punch Cards
  results.punchCards.filter(t => !t.completed).forEach(t => allTasks.push({ ...t, category: "Punch Card" }));

  // 4. Streak Bonus al final
  if (results.streakBonus && results.streakBonus.bonusAvailable) {
    allTasks.push({
      title: "Bono de Racha",
      category: "Streak",
      type: "streak",
      streakData: results.streakBonus
    });
  }

  const total = allTasks.length;
  let completed = 0;

  for (const task of allTasks) {
    // Actualizar progreso
    if (progressText) progressText.innerText = `[${completed + 1}/${total}] ${task.category}: ${task.title || "..."}`;
    const pct = Math.round(((completed) / total) * 100);
    if (progressPct) progressPct.innerText = `${pct}%`;
    if (progressBar) progressBar.style.width = `${pct}%`;

    console.log(`[RewardsBot] Procesando [${completed + 1}/${total}]: ${task.category} - ${task.title}`);

    try {
      if (task.type === "streak") {
        // Reclamar bono de racha
        if (window.RewardsWorkers && window.RewardsWorkers.StreakBonus) {
          await window.RewardsWorkers.StreakBonus.claim();
        }
      } else {
        // Para todas las demás tareas: simular clic humano
        await claimSingleTask(task);
      }
    } catch (e) {
      console.warn(`[RewardsBot] Error procesando tarea "${task.title}":`, e);
    }

    completed++;

    // Esperar entre tareas (8-12 segundos para que Microsoft registre)
    if (completed < total) {
      const waitMs = 8000 + Math.random() * 4000;
      console.log(`[RewardsBot] Esperando ${Math.round(waitMs / 1000)}s antes de la siguiente tarea...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  // Completado
  if (progressText) progressText.innerText = `¡${total} tarea(s) procesada(s)!`;
  if (progressPct) progressPct.innerText = "100%";
  if (progressBar) progressBar.style.width = "100%";

  globalStatus.innerHTML = `<span style="color:#10b981;">🎉</span> ¡Todas las tareas procesadas! Navegando...`;

  claimBtn.innerText = "✅ Completado";

  // Notificar al background para que envíe notificación
  try {
    chrome.runtime.sendMessage({
      action: "tasksClaimed",
      count: total
    });
  } catch (e) { /* popup may be closed */ }

  // Determinar si estamos en dashboard o earn
  const isDashboard = window.location.pathname.includes("dashboard") || window.location.pathname === "/";
  const isEarn = window.location.pathname.includes("earn");

  // Recargar o cambiar de página después de un momento
  setTimeout(() => {
    if (isDashboard) {
      window.location.href = "https://rewards.bing.com/earn";
    } else {
      window.location.reload();
    }
  }, 4000);
}

// ============================================================
// RECLAMAR UNA TAREA INDIVIDUAL
// ============================================================

async function claimSingleTask(task) {
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

  // Dar tiempo para que Microsoft registre la visita
  const visitTime = 8000 + Math.random() * 4000;
  await new Promise(r => setTimeout(r, visitTime));
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
      completeBtn.click();
    }, 1000 + Math.random() * 1500);
    return;
  }

  console.log("[RewardsBot] No se detectaron widgets activos en esta página.");
}
