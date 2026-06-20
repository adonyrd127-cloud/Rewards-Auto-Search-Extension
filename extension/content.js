// Content Script for Microsoft Rewards Auto-Claimer

const isRewardsPage = window.location.hostname === "rewards.bing.com" || window.location.pathname.includes("/rewards/");
const isSearchPage = window.location.hostname.includes("bing.com") && window.location.pathname.includes("/search");

// --- REWARDS DASHBOARD AUTOMATION ---
if (isRewardsPage) {
  console.log("Rewards Auto Claimer: Loaded on Rewards page.");
  initRewardsPanel();
}

// --- BING SEARCH QUIZ/POLL AUTO-SOLVER ---
if (isSearchPage) {
  console.log("Rewards Auto Claimer: Loaded on Bing Search page. Checking for active tasks...");
  // Run solver logic after a delay to ensure widgets load
  setTimeout(solveActiveTasks, 2500);
}

// Initialize floating dashboard panel on rewards.bing.com
function initRewardsPanel() {
  // Remove existing panel if any
  const oldPanel = document.getElementById("rewards-auto-panel");
  if (oldPanel) oldPanel.remove();

  // Create panel container
  const panel = document.createElement("div");
  panel.id = "rewards-auto-panel";
  
  // Custom styles for floating panel (emerald glassmorphism)
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "280px",
    backgroundColor: "rgba(17, 24, 35, 0.95)",
    border: "2px solid #10b981",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(16, 185, 129, 0.2)",
    color: "#fff",
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
    padding: "14px",
    zIndex: "999999",
    backdropFilter: "blur(10px)",
    transition: "transform 0.3s ease"
  });

  // Header area
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignStyle: "center",
    marginBottom: "10px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: "6px"
  });

  const title = document.createElement("strong");
  title.innerText = "Rewards Auto Assistant";
  title.style.color = "#34d399";
  title.style.fontSize = "13px";

  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  Object.assign(closeBtn.style, {
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "bold",
    color: "#94a3b8"
  });
  closeBtn.addEventListener("click", () => panel.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Status and detected items
  const statusContainer = document.createElement("div");
  statusContainer.id = "panel-status-text";
  statusContainer.innerText = "Scanning for daily tasks...";
  statusContainer.style.marginBottom = "10px";
  panel.appendChild(statusContainer);

  const listContainer = document.createElement("div");
  listContainer.id = "detected-tasks-list";
  Object.assign(listContainer.style, {
    maxHeight: "120px",
    overflowY: "auto",
    marginBottom: "12px",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: "6px",
    padding: "6px"
  });
  panel.appendChild(listContainer);

  // Action button
  const claimBtn = document.createElement("button");
  claimBtn.id = "btn-claim-tasks";
  claimBtn.innerText = "Reclamar Tareas Auto.";
  Object.assign(claimBtn.style, {
    width: "100%",
    backgroundColor: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    transition: "background-color 0.2s"
  });
  claimBtn.disabled = true;

  claimBtn.addEventListener("mouseover", () => {
    if (!claimBtn.disabled) claimBtn.style.backgroundColor = "#059669";
  });
  claimBtn.addEventListener("mouseout", () => {
    if (!claimBtn.disabled) claimBtn.style.backgroundColor = "#10b981";
  });

  panel.appendChild(claimBtn);
  document.body.appendChild(panel);

  // Scan page for tasks periodically to wait for Angular/React to render them
  let scanAttempts = 0;
  const scanInterval = setInterval(() => {
    scanAttempts++;
    const cardsFound = scanForTasks(panel, listContainer, claimBtn, statusContainer);
    if (cardsFound > 0 || scanAttempts >= 5) {
      clearInterval(scanInterval);
    }
  }, 2000);
}

// Scrape page to find points tasks that are not completed
function scanForTasks(panel, listContainer, claimBtn, statusContainer) {
  const uncompletedTasks = [];
  const uniqueUrls = new Set();

  function traverseForCards(node, elements = []) {
    if (!node) return elements;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (
        tag.includes("card") || 
        tag.includes("item-content") ||
        (typeof node.className === "string" && node.className.match(/\b(c-card|f-card|m-card|ds-card-sec)\b/)) ||
        node.hasAttribute("data-bi-id")
      ) {
        elements.push(node);
      }
      if (node.shadowRoot) traverseForCards(node.shadowRoot, elements);
    }
    for (const child of node.childNodes) traverseForCards(child, elements);
    return elements;
  }

  let cards = traverseForCards(document.body);

  function containsDeep(parent, child) {
     if (parent === child) return false;
     let curr = child;
     while (curr && curr !== document.body) {
        if (curr.parentNode) curr = curr.parentNode;
        else if (curr.host) curr = curr.host;
        else break;
        if (curr === parent) return true;
     }
     return false;
  }

  // Conservar solo las tarjetas más internas (elimina los grids y contenedores padre)
  cards = cards.filter(c => !cards.some(other => containsDeep(c, other)));

  function getDeepLink(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node.tagName === "A" && node.hasAttribute("href")) || node.hasAttribute("data-href")) return node;
      if (node.shadowRoot) {
        const found = getDeepLink(node.shadowRoot);
        if (found) return found;
      }
    }
    for (const child of node.childNodes) {
      const found = getDeepLink(child);
      if (found) return found;
    }
    return null;
  }

  function getDeepText(node) {
    let text = "";
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent + " ";
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.shadowRoot) text += getDeepText(node.shadowRoot) + " ";
    }
    for (const child of node.childNodes) text += getDeepText(child);
    return text;
  }

  function hasCheckmarkDeep(node) {
    let found = false;
    function check(n) {
      if (found || !n) return;
      if (n.nodeType === Node.ELEMENT_NODE) {
         if (typeof n.className === "string" && n.className.match(/checkmark|complete|done/i)) found = true;
         if (n.tagName === "svg" || n.tagName === "SVG") {
             if (n.innerHTML && (n.innerHTML.includes("16.17") || n.innerHTML.includes("CheckMark"))) found = true;
         }
         if (n.shadowRoot) check(n.shadowRoot);
      }
      for (const c of n.childNodes) check(c);
    }
    check(node);
    return found;
  }

  cards.forEach(card => {
    const linkEl = getDeepLink(card);
    if (!linkEl) return;
    
    const href = linkEl.href || linkEl.getAttribute("data-href");
    if (!href) return;

    const lowerUrl = href.toLowerCase();
    if (lowerUrl.includes("redeem") || lowerUrl.includes("canjear") || lowerUrl.includes("signin") || lowerUrl.includes("welcome") || lowerUrl.includes("profile") || lowerUrl.includes("dashboard") || lowerUrl.includes("javascript:")) {
      return;
    }

    const text = getDeepText(card).replace(/\s+/g, " ");

    const hasDoneText = text.match(/\b(completad[oa]s?|listo|hecho)\b/i) !== null || text.includes("✓") || text.includes("✔");
    const hasCheckmark = hasCheckmarkDeep(card);

    if (hasCheckmark || hasDoneText) return;

    let points = "";
    const ptsMatch = text.match(/\+\s*(\d+)/);
    if (ptsMatch) {
      points = "+" + ptsMatch[1];
    } else {
      const looseMatch = text.match(/\b(5|10|15|20|30|40|50|100)\b/);
      if (looseMatch) points = "+" + looseMatch[1];
    }
    
    if (!points) return; // Si no da puntos, no nos interesa

    const cleanUrl = href.split("?")[0];
    if (!uniqueUrls.has(cleanUrl) && !uniqueUrls.has(href)) {
      uniqueUrls.add(href);
      
      let title = text.replace(/\+\s*\d+/, "").trim();
      if (title.length > 40) title = title.split(".")[0];
      if (!title || title.length < 2) title = linkEl.title || linkEl.getAttribute("aria-label") || "Actividad";

      uncompletedTasks.push({
        title: title.length > 40 ? title.substring(0, 37) + "..." : title,
        url: href,
        points: points,
        element: linkEl
      });
    }
  });

  listContainer.innerHTML = "";
  if (uncompletedTasks.length === 0) {
    statusContainer.innerText = "¡Todas las tareas listas! 🎉";
    
    let debugHtml = `Cards aisladas: ${cards.length}<br>`;
    if (cards.length > 0) {
       debugHtml += `E.g.: ${getDeepText(cards[0]).substring(0,35)}...`;
    }
    listContainer.innerHTML = `<div style="padding: 10px; text-align: left; color: #94a3b8; font-size: 10px;">${debugHtml}</div>`;
    claimBtn.disabled = true;
    claimBtn.innerText = "Reclamar Tareas Auto.";
    return cards.length;
  }

  statusContainer.innerText = `Detectadas ${uncompletedTasks.length} tareas pendientes:`;
  
  uncompletedTasks.forEach(task => {
    const item = document.createElement("div");
    Object.assign(item.style, {
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      fontSize: "11px"
    });

    const label = document.createElement("span");
    label.innerText = task.title;
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.whiteSpace = "nowrap";
    label.style.maxWidth = "180px";

    const ptsBadge = document.createElement("span");
    ptsBadge.innerText = task.points;
    ptsBadge.style.color = "#10b981";
    ptsBadge.style.fontWeight = "bold";

    item.appendChild(label);
    item.appendChild(ptsBadge);
    listContainer.appendChild(item);
  });

  claimBtn.disabled = false;
  claimBtn.innerText = `Reclamar ${uncompletedTasks.length} Tareas`;
  
  claimBtn.onclick = () => runClaimRunner(uncompletedTasks, claimBtn, statusContainer);
  
  return cards.length;
}

// Sequence click tasks one-by-one
function runClaimRunner(tasks, btn, statusTxt) {
  btn.disabled = true;
  btn.style.backgroundColor = "#4b5563";
  btn.innerText = "Reclamando...";
  
  let currentIndex = 0;
  
  function claimNext() {
    if (currentIndex >= tasks.length) {
      statusTxt.innerText = "¡Tareas procesadas! Actualizando página...";
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      return;
    }

    const task = tasks[currentIndex];
    statusTxt.innerText = `Reclamando [${currentIndex + 1}/${tasks.length}]: ${task.points}`;
    
    // Simular un clic REAL en la tarjeta para activar los rastreadores Javascript de Microsoft
    if (task.element) {
      // Forzar que se abra en una nueva pestaña para no salir de esta página
      task.element.setAttribute("target", "_blank");
      
      // Simular un click con el botón izquierdo (burbujea para activar onClick)
      const clickEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      });
      task.element.dispatchEvent(clickEvent);
      
      // Fallback si el dispatchEvent fue bloqueado, usar click nativo
      setTimeout(() => {
         try { task.element.click(); } catch(e){}
      }, 100);
    } else {
      window.open(task.url, "_blank");
    }

    currentIndex++;
    
    // Esperar 8 segundos entre tareas (tiempo suficiente si se abre en otra pestaña)
    setTimeout(claimNext, 8000);
  }

  claimNext();
}


// --- BING SEARCH QUIZ/POLL AUTO-SOLVER ---
function solveActiveTasks() {
  console.log("Checking search widgets...");

  // 1. Detect Daily Poll
  // Polls are typically on Bing search pages, containing option buttons with class .btOption or .btOptionCard
  const pollOptions = document.querySelectorAll(".btOption, .btoption, [class*='btOption'], [id*='btoption'], [id*='poll'] button");
  if (pollOptions.length > 0) {
    console.log(`Poll detected! Options found: ${pollOptions.length}`);
    
    // Choose a random option to look natural
    const randomIndex = Math.floor(Math.random() * pollOptions.length);
    const chosenOption = pollOptions[randomIndex];
    
    console.log("Auto-clicking poll option: " + chosenOption.innerText);
    chosenOption.click();
    return; // Stop here if we did a poll
  }

  // 2. Detect Daily Quiz
  // Quizzes usually have buttons with IDs like 'rqStartQuiz', options with class '.rqOption', etc.
  const startQuizBtn = document.getElementById("rqStartQuiz") || document.querySelector("[id*='startquiz']") || document.querySelector(".rqStartQuiz");
  if (startQuizBtn && startQuizBtn.style.display !== "none" && !startQuizBtn.classList.contains("rqHdn")) {
    console.log("Start Quiz button found. Clicking it...");
    startQuizBtn.click();
    // Re-run solver after a short delay
    setTimeout(solveActiveTasks, 2000);
    return;
  }

  // If quiz is already running, click options
  // Options typically have class `.rqOption` or `#bt_option1`, etc.
  const quizOptions = Array.from(document.querySelectorAll(".rqOption, .rqOptionCard, [id*='rqOption'], #bt_option1, #bt_option2, #bt_option3, #bt_option4"));
  if (quizOptions.length > 0) {
    console.log(`Quiz detected! Option buttons found: ${quizOptions.length}`);
    
    // Filter out options that are already disabled, completed, or marked incorrect
    const activeOptions = quizOptions.filter(opt => {
      const isIncorrect = opt.classList.contains("rqWrong") || opt.classList.contains("wrong") || opt.getAttribute("disabled") !== null || opt.style.pointerEvents === "none";
      const isCorrect = opt.classList.contains("rqCorrect") || opt.classList.contains("correct");
      return !isIncorrect && !isCorrect;
    });

    if (activeOptions.length > 0) {
      // Pick the first active option (quiz auto-solver tries answers sequentially until it hits the right one)
      const targetOption = activeOptions[0];
      console.log("Auto-clicking quiz option: " + targetOption.innerText);
      targetOption.click();

      // Check again after a delay to keep solving
      setTimeout(solveActiveTasks, 2000);
    } else {
      console.log("No active/unclicked options found. Waiting...");
      setTimeout(solveActiveTasks, 2000);
    }
  }
}
