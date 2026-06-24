/* =============================================
   GREENHOUSE CONTROL CENTER — APP LOGIC
   ============================================= */

// ================= FIREBASE CONFIG =================
const firebaseConfig = {
  apiKey: "Hj7AujdCl1ZO3UiZsQ0Se0OxHDxCIhnPdG8i3Wpj",
  databaseURL: "https://green-house-firmware-default-rtdb.firebaseio.com",
  projectId: "green-house-firmware"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ================= STATE =================
let state = {
  tankLevel:    null,   // "EMPTY" | "HALF" | "FULL" | "ERROR"
  pumpActive:   false,
  pumpOverride: false,
  autoMode:     false,
  soilMoisture: null,
  soilStatus:   null,
  connected:    false
};

// ================= DOM REFS =================
const $ = id => document.getElementById(id);

// Header
const connectionPill = $('connectionPill');
const connectionText = $('connectionText');
const lastUpdate     = $('lastUpdate');

// Tank
const tankCard  = $('tankCard');
const tankBadge = $('tankBadge');
const tankFill  = $('tankFill');
const tankLabel = $('tankLabel');
const tankError = $('tankError');
const bubbles   = $('bubbles');

// Pump
const pumpCard       = $('pumpCard');
const pumpBadge      = $('pumpBadge');
const pumpIconWrap   = $('pumpIconWrap');
const pumpStatusText = $('pumpStatusText');
const pumpBtn        = $('pumpBtn');
const pumpBtnLabel   = $('pumpBtnLabel');
const pumpNote       = $('pumpNote');
const pumpLock       = $('pumpLock');
const modeToggle     = $('modeToggle');
const modeManual     = $('modeManual');
const modeAuto       = $('modeAuto');
const modeSlider     = $('modeSlider');

// Soil
const soilCard      = $('soilCard');
const soilBadge     = $('soilBadge');
const gaugeArc      = $('gaugeArc');
const soilPct       = $('soilPct');
const soilCondition = $('soilCondition');
const soilRec       = $('soilRec');
const soilError     = $('soilError');
const waterNeedVal  = $('waterNeedVal');
const waterNeedBar  = $('waterNeedBar');
const soilHealthVal = $('soilHealthVal');
const soilHealthBar = $('soilHealthBar');
const rootComfortVal= $('rootComfortVal');
const rootComfortBar= $('rootComfortBar');
const adviceText    = $('adviceText');
const toast         = $('toast');

// ================= TOAST =================
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ================= CONNECTION MONITOR =================
db.ref('.info/connected').on('value', snap => {
  state.connected = snap.val() === true;
  if (state.connected) {
    connectionPill.className = 'connection-pill live';
    connectionText.textContent = 'Live';
  } else {
    connectionPill.className = 'connection-pill error';
    connectionText.textContent = 'Offline';
  }
});

// ================= TANK LEVEL =================
const TANK_FILL_LEVELS = { EMPTY: '5%', HALF: '50%', FULL: '98%', ERROR: '0%' };
const TANK_FILL_COLORS = {
  EMPTY: 'rgba(250,204,21,0.4)',
  HALF:  'rgba(96,165,250,0.5)',
  FULL:  'rgba(74,222,128,0.5)',
  ERROR: 'rgba(248,113,113,0.3)'
};
const TANK_LABEL_MAP = {
  EMPTY: 'Tank is Empty',
  HALF:  'Tank is Half Full',
  FULL:  'Tank is Full',
  ERROR: 'Reading Error'
};
const TANK_BADGE_MAP  = { EMPTY:'empty', HALF:'half', FULL:'full', ERROR:'error' };

function updateTankUI(level) {
  const isError = level === 'ERROR';

  tankError.classList.toggle('hidden', !isError);
  if (isError) {
    tankBadge.textContent = 'Error';
    tankBadge.className   = 'badge error';
    tankLabel.textContent = 'Reading Error';
    tankFill.style.height = '0%';
    bubbles.classList.add('hidden');
    return;
  }

  tankBadge.textContent = level.charAt(0) + level.slice(1).toLowerCase();
  tankBadge.className   = 'badge ' + TANK_BADGE_MAP[level];
  tankFill.style.height = TANK_FILL_LEVELS[level];
  tankFill.style.background = TANK_FILL_COLORS[level];
  tankLabel.textContent = TANK_LABEL_MAP[level];

  // Bubbles only when water present & not full
  const hasBubbles = level === 'HALF';
  bubbles.classList.toggle('hidden', !hasBubbles);
}

db.ref('/WaterTank/Level').on('value', snap => {
  const level = snap.val();
  if (!level) return;
  state.tankLevel = level;
  updateTankUI(level);
  updatePumpUI();
  updateTimestamp();
});

// ================= PUMP STATE =================
db.ref('/WaterTank/PumpActiveState').on('value', snap => {
  state.pumpActive = snap.val() === true;
  updatePumpUI();
});

db.ref('/WaterTank/PumpOverride').on('value', snap => {
  state.pumpOverride = snap.val() === true;
  updatePumpUI();
});

function updatePumpUI() {
  const isFull   = state.tankLevel === 'FULL';
  const isError  = state.tankLevel === 'ERROR';
  const isOn     = state.pumpActive;
  const isAuto   = state.autoMode;

  // Lock overlay when full
  pumpLock.classList.toggle('hidden', !isFull);

  // Pump icon animation
  if (isOn) {
    pumpIconWrap.classList.add('active');
    pumpStatusText.textContent = 'Pump Running';
    pumpStatusText.classList.add('active');
    pumpBadge.textContent = 'On';
    pumpBadge.className = 'badge on';
  } else {
    pumpIconWrap.classList.remove('active');
    pumpStatusText.textContent = 'Pump Stopped';
    pumpStatusText.classList.remove('active');
    pumpBadge.textContent = 'Off';
    pumpBadge.className = 'badge off';
  }

  // Button state
  if (isFull || isError || isAuto) {
    pumpBtn.disabled = true;
  } else {
    pumpBtn.disabled = false;
  }

  // Button label & style (reflects current state — pressing will TOGGLE)
  if (isOn) {
    pumpBtnLabel.textContent = 'Turn Off Pump';
    pumpBtn.classList.add('on');
  } else {
    pumpBtnLabel.textContent = 'Turn On Pump';
    pumpBtn.classList.remove('on');
  }

  // Notes
  if (isFull) {
    pumpNote.textContent = 'Tank reached maximum. Pump turned off automatically.';
  } else if (isError) {
    pumpNote.textContent = 'Sensor conflict detected — pump controls paused.';
  } else if (isAuto) {
    pumpNote.textContent = 'Auto mode is active. Controls are handled automatically.';
  } else if (isOn) {
    pumpNote.textContent = 'Water is flowing. Tap to stop.';
  } else {
    pumpNote.textContent = 'Tap to start watering your plants.';
  }
}

// ================= PUMP BUTTON =================
pumpBtn.addEventListener('click', () => {
  if (pumpBtn.disabled) return;

  const newState = !state.pumpActive;
  db.ref('/WaterTank/PumpOverride').set(newState)
    .then(() => {
      showToast(newState ? '💧 Pump turned on' : '⛔ Pump turned off');
    })
    .catch(() => {
      showToast('⚠️ Could not reach the device. Check your connection.');
    });
});

// ================= MODE TOGGLE =================
function applyModeUI() {
  if (state.autoMode) {
    modeAuto.classList.add('active');
    modeManual.classList.remove('active');
    modeSlider.classList.add('auto');
  } else {
    modeManual.classList.add('active');
    modeAuto.classList.remove('active');
    modeSlider.classList.remove('auto');
  }
  updatePumpUI();
}

modeToggle.addEventListener('click', () => {
  state.autoMode = !state.autoMode;
  applyModeUI();
  showToast(state.autoMode ? '🤖 Auto mode on' : '🖐 Manual mode on');
});

// Init mode UI
applyModeUI();

// ================= SOIL GAUGE =================
// Arc total length for a semicircle of radius 90 at viewBox 200×120
const ARC_LENGTH = 283;

function getMoistureColor(pct) {
  if (pct < 30) return '#facc15';   // dry  → yellow
  if (pct < 70) return '#a3e635';   // moist → lime
  return '#4ade80';                  // wet  → green
}

function getSoilAdvice(status, pct) {
  if (status === 'DRY') return 'Soil needs water soon. Turn on the pump to water your plants before the roots dry out.';
  if (status === 'MOIST') return 'Soil moisture is at a good level. Plants are healthy and comfortable right now.';
  if (status === 'WET')  return 'Soil is well saturated. No watering needed — let the soil breathe for a while.';
  return 'Waiting for soil sensor readings…';
}

function getSoilConditionLabel(status) {
  if (status === 'DRY')   return 'Too Dry';
  if (status === 'MOIST') return 'Just Right';
  if (status === 'WET')   return 'Well Watered';
  return '—';
}

function getSoilRecommendation(status) {
  if (status === 'DRY')   return 'Water now';
  if (status === 'MOIST') return 'No action needed';
  if (status === 'WET')   return 'Skip watering';
  return '—';
}

function updateSoilGauge(pct) {
  const offset = ARC_LENGTH - (pct / 100) * ARC_LENGTH;
  gaugeArc.style.strokeDashoffset = offset;
  gaugeArc.style.stroke = getMoistureColor(pct);
  soilPct.textContent = pct + '%';
}

function updateHealthBars(pct, status) {
  // Water Need — inverse of moisture (high if dry)
  const waterNeed = Math.max(0, 100 - pct);
  waterNeedBar.style.width = waterNeed + '%';
  waterNeedVal.textContent = waterNeed + '%';

  // Soil Health — peaks at 50% moisture (moist is perfect)
  const health = Math.round(100 - Math.abs(pct - 50) * 1.4);
  soilHealthBar.style.width = Math.max(0, health) + '%';
  soilHealthVal.textContent = Math.max(0, health) + '%';

  // Root Comfort — follows moisture but drops above 85%
  const comfort = pct > 85 ? Math.round(100 - (pct - 85) * 3) : Math.round(pct * 1.1);
  rootComfortBar.style.width = Math.min(100, Math.max(0, comfort)) + '%';
  rootComfortVal.textContent = Math.min(100, Math.max(0, comfort)) + '%';
}

db.ref('/Soil').on('value', snap => {
  const data = snap.val();
  if (!data) {
    soilError.classList.remove('hidden');
    return;
  }

  const pct    = data.Moisture ?? null;
  const status = data.Status   ?? null;
  const raw    = data.RawValue ?? null;

  // Validate
  if (pct === null || pct < 0 || pct > 100 || raw === null) {
    soilError.classList.remove('hidden');
    soilBadge.textContent = 'Error';
    soilBadge.className   = 'badge error';
    return;
  }

  soilError.classList.add('hidden');
  state.soilMoisture = pct;
  state.soilStatus   = status;

  // Badge
  const badgeMap = { DRY: 'dry', MOIST: 'moist', WET: 'wet' };
  const badgeLbl = { DRY: 'Dry', MOIST: 'Moist', WET: 'Wet' };
  soilBadge.textContent = badgeLbl[status] || status;
  soilBadge.className   = 'badge ' + (badgeMap[status] || '');

  // Gauge
  updateSoilGauge(pct);

  // Status row
  soilCondition.textContent = getSoilConditionLabel(status);
  soilRec.textContent       = getSoilRecommendation(status);

  // Health bars
  updateHealthBars(pct, status);

  // Advice
  adviceText.textContent = getSoilAdvice(status, pct);

  updateTimestamp();
});

// ================= TIMESTAMP =================
function updateTimestamp() {
  const now = new Date();
  const h   = now.getHours().toString().padStart(2,'0');
  const m   = now.getMinutes().toString().padStart(2,'0');
  const s   = now.getSeconds().toString().padStart(2,'0');
  lastUpdate.textContent = `Updated ${h}:${m}:${s}`;
}
