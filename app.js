/**
 * GreenHouse Water Monitor — app.js
 * Firebase Realtime Database · modular SDK v10
 */

import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ── Firebase ─────────────────────────────────────────────────────
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

// ── State ─────────────────────────────────────────────────────────
let prev = { level: null, low: null, high: null, pumpActive: null, pumpOverride: null };
let logs = [];

// ── DOM ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  navTime:      $("navTime"),
  navDate:      $("navDate"),
  liveBadge:    $("liveBadge"),

  heroStatus:   $("heroStatus"),
  heroDesc:     $("heroDesc"),

  tank:         $("tank"),
  tankWater:    $("tankWater"),
  tankPct:      $("tankPct"),
  tankError:    $("tankError"),

  pillLow:      $("pillLow"),
  pillLowVal:   $("pillLowVal"),
  pillHigh:     $("pillHigh"),
  pillHighVal:  $("pillHighVal"),

  levelVal:     $("levelVal"),
  levelBadge:   $("levelBadge"),

  lowVal:       $("lowVal"),
  lowBadge:     $("lowBadge"),

  highVal:      $("highVal"),
  highBadge:    $("highBadge"),

  updatedVal:   $("updatedVal"),

  connVal:      $("connVal"),
  connBadge:    $("connBadge"),
  connBadgeTxt: $("connBadgeTxt"),

  // Pump UI
  pumpActiveVal:   $("pumpActiveVal"),
  pumpActiveBadge: $("pumpActiveBadge"),
  pumpToggleBtn:   $("pumpToggleBtn"),
  pumpModeLabel:   $("pumpModeLabel"),

  feed:         $("feed"),
  clearBtn:     $("clearBtn"),
  footerDot:    $("footerDot"),
  footerTxt:    $("footerTxt"),
};

// ── Clock ─────────────────────────────────────────────────────────
function tick() {
  const n = new Date();
  dom.navTime.textContent = n.toLocaleTimeString("en-GB", { hour12: false });
  dom.navDate.textContent = n.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long",
  });
}
tick();
setInterval(tick, 1000);

// ── Helpers ───────────────────────────────────────────────────────
const timeStr = (d = new Date()) => d.toLocaleTimeString("en-GB", { hour12: false });

function pop(el) {
  if (!el) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
  el.addEventListener("animationend", () => el.classList.remove("pop"), { once: true });
}

// ── Level config ──────────────────────────────────────────────────
// Mirrors firmware:
//   !low && !high → EMPTY
//    low && !high → HALF
//    low &&  high → FULL
//    high && !low → ERROR  (impossible electrically, but firmware catches it)
const LEVELS = {
  FULL:  { pct: 100, heroTxt: "Full",  heroCls: "s-full",  badgeTxt: "Full",    badgeCls: "b-yes",  desc: "Your tank is completely full. 💧" },
  HALF:  { pct: 50,  heroTxt: "Half",  heroCls: "s-half",  badgeTxt: "Half",    badgeCls: "b-warn", desc: "Your tank is halfway. Consider refilling soon." },
  EMPTY: { pct: 0,   heroTxt: "Empty", heroCls: "s-empty", badgeTxt: "Empty",   badgeCls: "b-no",   desc: "Your tank is empty. Please refill as soon as possible." },
  ERROR: { pct: 0,   heroTxt: "Error", heroCls: "s-error", badgeTxt: "Problem", badgeCls: "b-err",  desc: "Something needs attention — check your sensors." },
};

const HERO_CLS_ALL = ["s-full","s-half","s-empty","s-error"];
const TANK_CLS_ALL = ["v-full","v-error"];

// ── Render level ──────────────────────────────────────────────────
function renderLevel(levelRaw) {
  const key = (levelRaw ?? "").toUpperCase();
  const cfg = LEVELS[key];
  if (!cfg) return;

  dom.heroStatus.textContent = cfg.heroTxt;
  dom.heroStatus.classList.remove(...HERO_CLS_ALL);
  dom.heroStatus.classList.add(cfg.heroCls);
  dom.heroDesc.textContent = cfg.desc;
  pop(dom.heroStatus);

  dom.tankWater.style.height = cfg.pct + "%";
  dom.tankPct.textContent    = cfg.pct + "%";
  dom.tank.classList.remove(...TANK_CLS_ALL);
  if (key === "FULL")  dom.tank.classList.add("v-full");
  if (key === "ERROR") dom.tank.classList.add("v-error");

  if (key === "ERROR") dom.tankError.classList.add("show");
  else                 dom.tankError.classList.remove("show");

  dom.levelVal.textContent = cfg.heroTxt;
  dom.levelBadge.className = "info-card__badge " + cfg.badgeCls;
  dom.levelBadge.innerHTML = `<span>${cfg.badgeTxt}</span>`;
  pop(dom.levelVal);
}

// ── Render sensor ─────────────────────────────────────────────────
// Firmware now uses analog reads + threshold (> 250), still writes bool to Firebase.
function renderSensor({ val, valEl, badgeEl, pillEl, pillValEl, activeLabel, inactiveLabel, pillLabel }) {
  const isActive = val === true;
  const unknown  = val === null;

  const dispTxt  = unknown ? "Waiting…" : (isActive ? activeLabel : inactiveLabel);
  const pillTxt  = unknown ? "—" : (isActive ? "Yes" : "No");
  const badgeCls = unknown ? "" : (isActive ? "b-yes" : "b-no");
  const pillCls  = unknown ? "" : (isActive ? "p-active" : "p-inactive");

  valEl.textContent     = dispTxt;
  badgeEl.className     = "info-card__badge " + badgeCls;
  badgeEl.innerHTML     = `<span>${pillTxt}</span>`;
  pillEl.className      = "pill " + pillCls;
  pillEl.querySelector(".pill-label").textContent = pillLabel;
  pillValEl.textContent = pillTxt;
  pop(valEl);
}

// ── Render pump ───────────────────────────────────────────────────
// pumpActive  = PumpActiveState  (firmware-reported relay state, read-only)
// pumpOverride = PumpOverride    (dashboard writes this to command the pump)
// When tank is FULL the firmware forces PumpOverride → false automatically.
function renderPump(pumpActive, pumpOverride, level) {
  const unknown  = pumpActive === null;
  const isFull   = (level ?? "").toUpperCase() === "FULL";

  // Status display (actual relay state from firmware)
  if (dom.pumpActiveVal) {
    dom.pumpActiveVal.textContent = unknown ? "Waiting…" : (pumpActive ? "Running" : "Idle");
    pop(dom.pumpActiveVal);
  }
  if (dom.pumpActiveBadge) {
    dom.pumpActiveBadge.className = "info-card__badge " + (unknown ? "" : pumpActive ? "b-yes" : "b-no");
    dom.pumpActiveBadge.innerHTML = `<span>${unknown ? "—" : pumpActive ? "On" : "Off"}</span>`;
  }

  // Toggle button — disabled when tank is FULL (firmware overrides anyway)
  if (dom.pumpToggleBtn) {
    dom.pumpToggleBtn.disabled = isFull;
    dom.pumpToggleBtn.textContent = pumpOverride ? "Turn Pump Off" : "Turn Pump On";
    dom.pumpToggleBtn.className =
      "pump-btn " + (pumpOverride ? "pump-btn--on" : "pump-btn--off") + (isFull ? " pump-btn--disabled" : "");
  }

  // Mode label
  if (dom.pumpModeLabel) {
    dom.pumpModeLabel.textContent = isFull
      ? "Auto shut-off active — tank is full"
      : "Manual control";
  }
}

// ── Pump toggle handler ───────────────────────────────────────────
// Writes only PumpOverride. Firmware reads it and decides whether to act.
let pumpOverrideState = false;
let currentLevel      = null;

if (dom.pumpToggleBtn) {
  dom.pumpToggleBtn.addEventListener("click", async () => {
    const isFull = (currentLevel ?? "").toUpperCase() === "FULL";
    if (isFull) return; // safety guard, button should already be disabled

    const next = !pumpOverrideState;
    try {
      await set(ref(db, "/WaterTank/PumpOverride"), next);
      addLog(next ? "Pump turned ON manually 🚿" : "Pump turned OFF manually", next ? "green" : "amber");
    } catch (e) {
      addLog("Failed to send pump command — check connection", "red");
      console.error(e);
    }
  });
}

// ── Activity log ──────────────────────────────────────────────────
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

// ── Connection UI ─────────────────────────────────────────────────
function setConnected(on) {
  dom.liveBadge.classList.toggle("off", !on);
  dom.connVal.textContent      = on ? "Connected" : "Disconnected";
  dom.connBadge.className      = "info-card__badge " + (on ? "b-yes" : "b-no");
  dom.connBadgeTxt.textContent = on ? "Online" : "Offline";
  dom.footerDot.classList.toggle("on", on);
  dom.footerTxt.textContent    = on
    ? "Live — receiving updates from your greenhouse"
    : "Reconnecting to your greenhouse…";
}

// ── Firebase listeners ────────────────────────────────────────────

// Connection state
onValue(ref(db, ".info/connected"), snap => {
  const on = snap.val() === true;
  setConnected(on);
  addLog(on ? "Connected — your greenhouse is online 🌿" : "Connection lost — retrying…", on ? "green" : "red");
});

// WaterTank — firmware refreshes every 2 s
onValue(ref(db, "WaterTank"), snap => {
  const data = snap.val();
  if (!data) { addLog("Waiting for sensor data…", "blue"); return; }

  const level        = data.Level          ?? null;  // "FULL"|"HALF"|"EMPTY"|"ERROR"
  const low          = data.LowSensor      ?? null;  // bool — analog > 250 threshold
  const high         = data.HighSensor     ?? null;  // bool — analog > 250 threshold
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