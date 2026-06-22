/**
 * GreenHouse Water Monitor — app.js
 * Firebase Realtime Database · modular SDK v10
 */

import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ── Firebase Configuration ───────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyALBmd_8LYo15JPQgnhTKDn_5UGd8sNNKQ",
  authDomain:        "green-house-firmware.firebaseapp.com",
  databaseURL:       "https://green-house-firmware-default-rtdb.firebaseio.com",
  projectId:         "green-house-firmware",
  storageBucket:     "green-house-firmware.firebasestorage.app",
  messagingSenderId: "882471532450",
  appId:             "1:882471532450:web:551019086b7fd3194224fb",
  measurementId:     "G-5EEW1TTEVN",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── State Management ─────────────────────────────────────────────
let prev = { level: null, pumpActive: null, pumpOverride: null };
let logs = [];
let pumpOverrideState = false;
let currentLevel      = null;

// ── DOM Engine Selection ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  navTime:                $("navTime"),
  navDate:                $("navDate"),
  liveBadge:              $("liveBadge"),

  heroStatus:             $("heroStatus"),
  heroDesc:               $("heroDesc"),

  tank:                   $("tank"),
  tankWater:              $("tankWater"),
  tankPct:                $("tankPct"),
  tankError:              $("tankError"),

  // Unified Status Element
  waterStatusWrapper:     $("waterStatusWrapper"),
  waterStatusText:        $("waterStatusText"),

  // Pump Elements
  pumpActiveVal:          $("pumpActiveVal"),
  pumpActiveBadge:        $("pumpActiveBadge"),
  pumpToggleBtn:          $("pumpToggleBtn"),
  pumpModeLabel:          $("pumpModeLabel"),

  // General Notification Engine Hub
  generalNotificationMsg: $("generalNotificationMsg"),
  notifTypeLabel:         $("notifTypeLabel"),
  notifStatusTag:         $("notifStatusTag"),
  notifTimeTag:           $("notifTimeTag"),

  feed:                   $("feed"),
  clearBtn:               $("clearBtn"),
  footerDot:              $("footerDot"),
  footerTxt:              $("footerTxt"),
};

// ── Clock Loop ───────────────────────────────────────────────────
function tick() {
  const n = new Date();
  dom.navTime.textContent = n.toLocaleTimeString("en-GB", { hour12: false });
  dom.navDate.textContent = n.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long",
  });
}
tick();
setInterval(tick, 1000);

// ── Animation Helpers ────────────────────────────────────────────
const timeStr = (d = new Date()) => d.toLocaleTimeString("en-GB", { hour12: false });

function pop(el) {
  if (!el) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
  el.addEventListener("animationend", () => el.classList.remove("pop"), { once: true });
}

// ── Tank Configuration Map ───────────────────────────────────────
const LEVELS = {
  FULL:  { pct: 100, heroTxt: "Full",  heroCls: "s-full",  wrapperCls: "is-full",  desc: "Your tank is completely full. 💧" },
  HALF:  { pct: 50,  heroTxt: "Half Full", heroCls: "s-half", wrapperCls: "is-half",  desc: "Your tank is halfway. Consider refilling soon." },
  EMPTY: { pct: 0,   heroTxt: "Empty", heroCls: "s-empty", wrapperCls: "is-empty", desc: "Your tank is empty. Please refill as soon as possible." },
  ERROR: { pct: 0,   heroTxt: "Error", heroCls: "s-error", wrapperCls: "is-empty", desc: "Something needs attention — check your sensors." },
};

const HERO_CLS_ALL  = ["s-full", "s-half", "s-empty", "s-error"];
const TANK_CLS_ALL  = ["v-full", "v-error"];
const WRAP_CLS_ALL  = ["is-full", "is-half", "is-empty"];

// ── Unified Level Renderer ───────────────────────────────────────
function renderLevel(levelRaw) {
  const key = (levelRaw ?? "").toUpperCase();
  const cfg = LEVELS[key];
  if (!cfg) return;

  // Hero section updates
  dom.heroStatus.textContent = cfg.heroTxt;
  dom.heroStatus.classList.remove(...HERO_CLS_ALL);
  dom.heroStatus.classList.add(cfg.heroCls);
  dom.heroDesc.textContent = cfg.desc;
  pop(dom.heroStatus);

  // Dynamic physical tank vessel adjustments
  dom.tankWater.style.height = cfg.pct + "%";
  dom.tankPct.textContent    = cfg.pct + "%";
  dom.tank.classList.remove(...TANK_CLS_ALL);
  if (key === "FULL")  dom.tank.classList.add("v-full");
  if (key === "ERROR") dom.tank.classList.add("v-error");

  if (key === "ERROR") dom.tankError.classList.add("show");
  else                 dom.tankError.classList.remove("show");

  // Single water status display engine mapping
  dom.waterStatusText.textContent = cfg.heroTxt;
  dom.waterStatusWrapper.classList.remove(...WRAP_CLS_ALL);
  dom.waterStatusWrapper.classList.add(cfg.wrapperCls);
  pop(dom.waterStatusWrapper);
}

// ── General Alert/Broadcast Channel ──────────────────────────────
function broadcastMessage(message, type = "General Broadcast", statusTag = "Online") {
  if (!dom.generalNotificationMsg) return;
  dom.generalNotificationMsg.textContent = message;
  dom.notifTypeLabel.textContent = type;
  dom.notifStatusTag.textContent = statusTag;
  dom.notifTimeTag.textContent = timeStr();
  pop(dom.generalNotificationMsg);
}

// ── Pump Actuator Controls ───────────────────────────────────────
function renderPump(pumpActive, pumpOverride, level) {
  const unknown = pumpActive === null;
  const isFull  = (level ?? "").toUpperCase() === "FULL";

  // System tracking status updates
  if (dom.pumpActiveVal) {
    dom.pumpActiveVal.textContent = unknown ? "Waiting…" : (pumpActive ? "Running" : "Idle");
    pop(dom.pumpActiveVal);
  }
  if (dom.pumpActiveBadge) {
    dom.pumpActiveBadge.className = "info-card__badge " + (unknown ? "" : pumpActive ? "b-yes" : "b-no");
    dom.pumpActiveBadge.innerHTML = `<span>${unknown ? "—" : pumpActive ? "On" : "Off"}</span>`;
  }

  // Auto safety override control layout updates
  if (dom.pumpToggleBtn) {
    dom.pumpToggleBtn.disabled = isFull;
    dom.pumpToggleBtn.textContent = pumpOverride ? "Turn Pump Off" : "Turn Pump On";
    dom.pumpToggleBtn.className =
      "pump-btn " + (pumpOverride ? "pump-btn--on" : "pump-btn--off") + (isFull ? " pump-btn--disabled" : "");
  }

  if (dom.pumpModeLabel) {
    dom.pumpModeLabel.textContent = isFull
      ? "Auto shut-off active — tank is full"
      : "Manual control";
  }
}

// ── Pump Toggle Click Handlers ────────────────────────────────────
if (dom.pumpToggleBtn) {
  dom.pumpToggleBtn.addEventListener("click", async () => {
    const isFull = (currentLevel ?? "").toUpperCase() === "FULL";
    if (isFull) return;

    const next = !pumpOverrideState;
    try {
      await set(ref(db, "/WaterTank/PumpOverride"), next);
      addLog(next ? "Pump turned ON manually 🚿" : "Pump turned OFF manually", next ? "green" : "amber");
      broadcastMessage(next ? "User triggered water loop pump." : "User shut down water loop pump manual line.", "Manual Pump Override", "Active");
    } catch (e) {
      addLog("Failed to send pump command", "red");
      broadcastMessage("Transmission error executing command on node link.", "System Error", "Fault");
      console.error(e);
    }
  });
}

// ── Historical Logging Hub ───────────────────────────────────────
function addLog(msg, pip = "green") {
  logs.unshift({ msg, pip, t: timeStr() });
  if (logs.length > 40) logs.pop();
  renderFeed();
}

function renderFeed() {
  if (!logs.length) {
    dom.feed.innerHTML = '<div class="feed-empty">Waiting for updates from your greenhouse…</div>';
    return;
  }
  dom.feed.innerHTML = logs.map(l => `
    <div class="log-row">
      <span class="log-time">${l.t}</span>
      <span class="log-pip pip-${l.pip}"></span>
      <span class="log-text">${l.msg}</span>
    </div>
  `).join("");
}

dom.clearBtn.addEventListener("click", () => { logs = []; renderFeed(); });

// ── Core Network Indicators ──────────────────────────────────────
function setConnected(on) {
  dom.liveBadge.classList.toggle("off", !on);
  dom.footerDot.classList.toggle("on", on);
  dom.footerTxt.textContent = on
    ? "Live — receiving updates from your greenhouse"
    : "Reconnecting to your greenhouse…";
}

// ── Firebase Pipeline Realtime Stream ────────────────────────────

// Connection Listeners
onValue(ref(db, ".info/connected"), snap => {
  const on = snap.val() === true;
  setConnected(on);
  if (on) {
    addLog("Connected — your greenhouse is online 🌿", "green");
    broadcastMessage("System network handshake successful. All streams reporting online.", "System Broadcast", "Online");
  } else {
    addLog("Connection lost — retrying…", "red");
    broadcastMessage("Lost connection to satellite system terminal hub.", "Telemetry Outage", "Offline");
  }
});

// Central Data Processing Loop
onValue(ref(db, "WaterTank"), snap => {
  const data = snap.val();
  if (!data) { addLog("Waiting for sensor data…", "blue"); return; }

  const level        = data.Level           ?? null;  // "FULL"|"HALF"|"EMPTY"|"ERROR"
  const pumpActive   = data.PumpActiveState ?? null;  // bool: physical configuration feedback
  const pumpOverride = data.PumpOverride    ?? false; // bool: manually defined execution path

  currentLevel      = level;
  pumpOverrideState = pumpOverride;

  // Level Changes Engine
  if (level !== prev.level) {
    if (prev.level !== null) {
      const pip = level === "FULL" ? "green" : level === "HALF" ? "amber" : level === "ERROR" ? "red" : "blue";
      const txt =
        level === "FULL"  ? "Tank is now full 💧" :
        level === "HALF"  ? "Tank is at half capacity" :
        level === "EMPTY" ? "Tank is now empty — time to refill!" :
        level === "ERROR" ? "Sensor check needed — something's off" :
        `Level shifted to ${level}`;
      addLog(txt, pip);
      broadcastMessage(`Tank volume tracking reports context shifted to: ${level ?? "Unknown State"}.`, "Storage Matrix Alert", level === "ERROR" ? "Attention" : "Nominal");
    }
    prev.level = level;
    renderLevel(level);
  }

  // Actuator Telemetry Pipeline Updates
  if (pumpActive !== prev.pumpActive) {
    if (prev.pumpActive !== null) {
      addLog(
        pumpActive ? "Pump relay engaged — water is flowing 🚿" : "Pump relay released — water stopped",
        pumpActive ? "green" : "blue"
      );
      broadcastMessage(pumpActive ? "Flow sensor validation success. Hydration active." : "Flow circuit disconnected. Loop idling.", "Hardware Broadcast", "Nominal");
    }
    prev.pumpActive = pumpActive;
  }
  
  if (pumpOverride !== prev.pumpOverride) {
    if (prev.pumpOverride === true && pumpOverride === false && level === "FULL") {
      addLog("Pump override reset automatically — tank is full", "amber");
      broadcastMessage("Automatic overspill prevention protocol triggered termination of manual runtime loop.", "Firmware Safety Guard", "Protected");
    }
    prev.pumpOverride = pumpOverride;
  }
  
  renderPump(pumpActive, pumpOverride, level);
  setConnected(true);

}, err => {
  setConnected(false);
  addLog("Unable to read sensor data — check your connection", "red");
  broadcastMessage("Failed database operations pipeline sequence completely.", "System Fault", "Failure");
  console.error(err);
});h         = data.HighSensor     ?? null;  // bool — analog > 250 threshold
  const pumpActive   = data.PumpActiveState ?? null; // bool — actual relay state (firmware writes)
  const pumpOverride = data.PumpOverride   ?? false; // bool — dashboard command (we write)

  // Keep local state in sync for the toggle button
  currentLevel      = level;
  pumpOverrideState = pumpOverride;

  // Timestamp
  dom.updatedVal.textContent = timeStr();
  pop(dom.updatedVal);

  // ── Level ──
  if (level !== prev.level) {
    if (prev.level !== null) {
      const pip = level === "FULL" ? "green" : level === "HALF" ? "amber" : level === "ERROR" ? "red" : "blue";
      const txt =
        level === "FULL"  ? "Tank is now full 💧" :
        level === "HALF"  ? "Tank is at half capacity" :
        level === "EMPTY" ? "Tank is now empty — time to refill!" :
        level === "ERROR" ? "Sensor check needed — something's off" :
        `Level changed to ${level}`;
      addLog(txt, pip);
    }
    prev.level = level;
    renderLevel(level);
  }

  // ── Low sensor ──
  if (low !== prev.low) {
    if (prev.low !== null) {
      addLog(
        low ? "Water detected at the bottom of the tank" : "No water at the bottom of the tank",
        low ? "green" : "amber"
      );
    }
    prev.low = low;
  }
  renderSensor({
    val: low, valEl: dom.lowVal, badgeEl: dom.lowBadge,
    pillEl: dom.pillLow, pillValEl: dom.pillLowVal,
    activeLabel: "Water Present", inactiveLabel: "No Water",
    pillLabel: "Bottom",
  });

  // ── High sensor ──
  if (high !== prev.high) {
    if (prev.high !== null) {
      addLog(
        high ? "Water has reached the top — tank is full!" : "Water level dropped below the top",
        high ? "green" : "amber"
      );
    }
    prev.high = high;
  }
  renderSensor({
    val: high, valEl: dom.highVal, badgeEl: dom.highBadge,
    pillEl: dom.pillHigh, pillValEl: dom.pillHighVal,
    activeLabel: "Water Present", inactiveLabel: "No Water",
    pillLabel: "Top",
  });

  // ── Pump ──
  if (pumpActive !== prev.pumpActive) {
    if (prev.pumpActive !== null) {
      addLog(
        pumpActive ? "Pump relay engaged — water is flowing 🚿" : "Pump relay released — water stopped",
        pumpActive ? "green" : "blue"
      );
    }
    prev.pumpActive = pumpActive;
  }
  if (pumpOverride !== prev.pumpOverride) {
    // Log only firmware-forced resets (tank went FULL), not user-initiated ones
    if (prev.pumpOverride === true && pumpOverride === false && level === "FULL") {
      addLog("Pump override reset automatically — tank is full", "amber");
    }
    prev.pumpOverride = pumpOverride;
  }
  renderPump(pumpActive, pumpOverride, level);

  setConnected(true);

}, err => {
  setConnected(false);
  addLog("Unable to read sensor data — check your connection", "red");
  console.error(err);
});
