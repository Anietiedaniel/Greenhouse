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
  tankLevel:        null,   // "EMPTY" | "HALF" | "FULL" | "ERROR"
  tankPumpActive:   false,  // Pump 1 State
  tankPumpOverride: false,  // Pump 1 Manual Request State
  tankAutoMode:     true,   // Pump 1 Mode

  soilMoisture:     null,   // 0 - 100 %
  soilStatus:       null,   // "DRY" | "MOIST" | "WET"
  soilPumpActive:   false,  // Pump 2 State
  soilPumpOverride: false,  // Pump 2 Manual Request State
  soilAutoMode:     true,   // Pump 2 Mode

  connected:        false
};

// ================= DOM REFS =================
const $ = id => document.getElementById(id);

// Header
const connectionPill = $('connectionPill');
const connectionText = $('connectionText');
const lastUpdate     = $('lastUpdate');

// Tank Card Elements
const tankBadge = $('tankBadge');
const tankFill  = $('tankFill');
const tankLabel = $('tankLabel');
const tankError = $('tankError');
const bubbles   = $('bubbles');

// Pump 1 Elements (Source -> Tank)
const tankPumpBadge      = $('tankPumpBadge');
const tankPumpIconWrap   = $('tankPumpIconWrap');
const tankPumpStatusText = $('tankPumpStatusText');
const tankPumpBtn        = $('tankPumpBtn');
const tankPumpBtnLabel   = $('tankPumpBtnLabel');
const tankPumpNote       = $('tankPumpNote');
const tankPumpLock       = $('tankPumpLock');
const tankModeToggle     = $('tankModeToggle');
const tankModeManual     = $('tankModeManual');
const tankModeAuto       = $('tankModeAuto');
const tankModeSlider     = $('tankModeSlider');

// Pump 2 Elements (Tank -> Soil)
const soilPumpBadge      = $('soilPumpBadge');
const soilPumpIconWrap   = $('soilPumpIconWrap');
const soilPumpStatusText = $('soilPumpStatusText');
const soilPumpBtn        = $('soilPumpBtn');
const soilPumpBtnLabel   = $('soilPumpBtnLabel');
const soilPumpNote       = $('soilPumpNote');
const soilPumpLock       = $('soilPumpLock');
const soilModeToggle     = $('soilModeToggle');
const soilModeManual     = $('soilModeManual');
const soilModeAuto       = $('soilModeAuto');
const soilModeSlider     = $('soilModeSlider');

// Soil Analytics Elements
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

// ================= WATER TANK UI =================
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

  // Bubbles present when half full
  bubbles.classList.toggle('hidden', level !== 'HALF');
}

// ================= PUMP 1: TANK FILL PUMP UI =================
function updateTankPumpUI() {
  const isFull  = state.tankLevel === 'FULL';
  const isError = state.tankLevel === 'ERROR';
  const isOn    = state.tankPumpActive;
  const isAuto  = state.tankAutoMode;

  tankPumpLock.classList.toggle('hidden', !isFull);

  if (isOn) {
    tankPumpIconWrap.classList.add('active');
    tankPumpStatusText.textContent = 'Filling Tank...';
    tankPumpStatusText.classList.add('active');
    tankPumpBadge.textContent = 'On';
    tankPumpBadge.className = 'badge on';
  } else {
    tankPumpIconWrap.classList.remove('active');
    tankPumpStatusText.textContent = 'Pump Stopped';
    tankPumpStatusText.classList.remove('active');
    tankPumpBadge.textContent = 'Off';
    tankPumpBadge.className = 'badge off';
  }

  tankPumpBtn.disabled = (isFull || isError || isAuto);

  if (isOn) {
    tankPumpBtnLabel.textContent = 'Turn Off Pump';
    tankPumpBtn.classList.add('on');
  } else {
    tankPumpBtnLabel.textContent = 'Turn On Pump';
    tankPumpBtn.classList.remove('on');
  }

  if (isFull) {
    tankPumpNote.textContent = 'Safety Cutoff: Tank is completely full.';
  } else if (isError) {
    tankPumpNote.textContent = 'Tank sensor error. Controls suspended.';
  } else if (isAuto) {
    tankPumpNote.textContent = 'Automation online. Managing storage levels.';
  } else {
    tankPumpNote.textContent = isOn ? 'Pumping water from source. Click to stop.' : 'Manual mode ready. Click to fill tank.';
  }
}

// ================= PUMP 2: SOIL WATERING PUMP UI =================
function updateSoilPumpUI() {
  const isTankEmpty = state.tankLevel === 'EMPTY';
  const isSoilWet   = state.soilStatus === 'WET';
  const isOn        = state.soilPumpActive;
  const isAuto      = state.soilAutoMode;

  // Interlock overlay conditions
  const isLocked = isTankEmpty || isSoilWet;
  soilPumpLock.classList.toggle('hidden', !isLocked);
  
  if (isLocked) {
    const lockText = soilPumpLock.querySelector('p');
    if (isTankEmpty) lockText.innerHTML = "Hardware Lock:<br/>Cannot water soil while tank is empty.";
    else if (isSoilWet) lockText.innerHTML = "Satiated Lock:<br/>Soil is wet enough. Prevented overwatering.";
  }

  if (isOn) {
    soilPumpIconWrap.classList.add('active');
    soilPumpStatusText.textContent = 'Watering Soil...';
    soilPumpStatusText.classList.add('active');
    soilPumpBadge.textContent = 'On';
    soilPumpBadge.className = 'badge on';
  } else {
    soilPumpIconWrap.classList.remove('active');
    soilPumpStatusText.textContent = 'Pump Stopped';
    soilPumpStatusText.classList.remove('active');
    soilPumpBadge.textContent = 'Off';
    soilPumpBadge.className = 'badge off';
  }

  soilPumpBtn.disabled = (isLocked || isAuto);

  if (isOn) {
    soilPumpBtnLabel.textContent = 'Stop Irrigation';
    soilPumpBtn.classList.add('on');
  } else {
    soilPumpBtnLabel.textContent = 'Start Irrigation';
    soilPumpBtn.classList.remove('on');
  }

  if (isTankEmpty) {
    soilPumpNote.textContent = 'Action Denied: Storage tank running dry.';
  } else if (isSoilWet) {
    soilPumpNote.textContent = 'Action Denied: Roots saturated to target thresholds.';
  } else if (isAuto) {
    soilPumpNote.textContent = 'Automation active. Regulating target root metrics.';
  } else {
    soilPumpNote.textContent = isOn ? 'Irrigation valve open. Click to stop.' : 'Manual access ready. Click to water soil.';
  }
}

// ================= CONTROL BUTTON INTERACTION =================
tankPumpBtn.addEventListener('click', () => {
  if (tankPumpBtn.disabled) return;
  const nextOverrideState = !state.tankPumpActive;
  db.ref('/WaterTank/PumpOverride').set(nextOverrideState)
    .then(() => showToast(nextOverrideState ? '💧 Source Pump turned on' : '⛔ Source Pump turned off'))
    .catch(() => showToast('⚠️ Connection error. Verification failed.'));
});

soilPumpBtn.addEventListener('click', () => {
  if (soilPumpBtn.disabled) return;
  const nextOverrideState = !state.soilPumpActive;
  db.ref('/Soil/PumpOverride').set(nextOverrideState)
    .then(() => showToast(nextOverrideState ? '🌱 Soil Irrigation started' : '⛔ Soil Irrigation stopped'))
    .catch(() => showToast('⚠️ Connection error. Verification failed.'));
});

// ================= AUTOMATION SLIDER TOGGLES =================
function renderModeUI(pumpType) {
  if (pumpType === 'tank') {
    if (state.tankAutoMode) {
      tankModeAuto.classList.add('active');
      tankModeManual.classList.remove('active');
      tankModeSlider.classList.add('auto');
    } else {
      tankModeManual.classList.add('active');
      tankModeAuto.classList.remove('active');
      tankModeSlider.classList.remove('auto');
    }
    updateTankPumpUI();
  } else if (pumpType === 'soil') {
    if (state.soilAutoMode) {
      soilModeAuto.classList.add('active');
      soilModeManual.classList.remove('active');
      soilModeSlider.classList.add('auto');
    } else {
      soilModeManual.classList.add('active');
      soilModeAuto.classList.remove('active');
      soilModeSlider.classList.remove('auto');
    }
    updateSoilPumpUI();
  }
}

tankModeToggle.addEventListener('click', () => {
  const nextModeState = !state.tankAutoMode;
  db.ref('/WaterTank/AutoMode').set(nextModeState)
    .then(() => showToast(nextModeState ? '🤖 Tank Loop: Auto Mode' : '🖐 Tank Loop: Manual Mode'));
});

soilModeToggle.addEventListener('click', () => {
  const nextModeState = !state.soilAutoMode;
  db.ref('/Soil/AutoMode').set(nextModeState)
    .then(() => showToast(nextModeState ? '🤖 Soil Loop: Auto Mode' : '🖐 Soil Loop: Manual Mode'));
});

// ================= FIREBASE DATABASE SYNC LISTENERS =================

// Water Tank Listeners
db.ref('/WaterTank/Level').on('value', snap => {
  state.tankLevel = snap.val() || 'ERROR';
  updateTankUI(state.tankLevel);
  updateTankPumpUI();
  updateSoilPumpUI();
  updateTimestamp();
});

db.ref('/WaterTank/PumpActiveState').on('value', snap => {
  state.tankPumpActive = snap.val() === true;
  updateTankPumpUI();
});

db.ref('/WaterTank/AutoMode').on('value', snap => {
  state.tankAutoMode = snap.val() !== false; // Default true if absent
  renderModeUI('tank');
});

// Soil Monitor Listeners
db.ref('/Soil/Moisture').on('value', snap => {
  const val = snap.val();
  state.soilMoisture = (val !== null && val >= 0 && val <= 100) ? val : null;
  if(state.soilMoisture !== null) {
    soilError.classList.add('hidden');
    updateSoilGauge(state.soilMoisture);
    updateHealthBars(state.soilMoisture);
  } else {
    soilError.classList.remove('hidden');
  }
  updateTimestamp();
});

db.ref('/Soil/Status').on('value', snap => {
  state.soilStatus = snap.val() || '—';
  
  const badgeMap = { DRY: 'dry', MOIST: 'moist', WET: 'wet' };
  soilBadge.textContent = state.soilStatus.charAt(0) + state.soilStatus.slice(1).toLowerCase();
  soilBadge.className   = 'badge ' + (badgeMap[state.soilStatus] || 'error');

  soilCondition.textContent = state.soilStatus === 'DRY' ? 'Too Dry' : (state.soilStatus === 'WET' ? 'Well Saturated' : 'Just Right');
  soilRec.textContent       = state.soilStatus === 'DRY' ? 'Water Immediately' : (state.soilStatus === 'WET' ? 'Skip Cycle' : 'Optimal Level');
  
  // Update UI Warnings
  adviceText.textContent = state.soilStatus === 'DRY' ? 'Soil moisture dropped below health threshold. Initiating emergency root rehydration.' :
                           (state.soilStatus === 'WET' ? 'Saturation bounds maximum reached. Discontinuing additional system routing.' : 
                           'Soil chemistry context structurally stable. Photosynthetic delivery baseline clear.');
  
  updateSoilPumpUI();
});

db.ref('/Soil/PumpActiveState').on('value', snap => {
  state.soilPumpActive = snap.val() === true;
  updateSoilPumpUI();
});

db.ref('/Soil/AutoMode').on('value', snap => {
  state.soilAutoMode = snap.val() !== false; 
  renderModeUI('soil');
});

// ================= METRIC CONTEXT GRAPHICS =================
const ARC_LENGTH = 283;
function updateSoilGauge(pct) {
  const offset = ARC_LENGTH - (pct / 100) * ARC_LENGTH;
  gaugeArc.style.strokeDashoffset = offset;
  gaugeArc.style.stroke = pct < 30 ? '#facc15' : (pct < 70 ? '#a3e635' : '#4ade80');
  soilPct.textContent = pct + '%';
}

function updateHealthBars(pct) {
  const waterNeed = Math.max(0, 100 - pct);
  waterNeedBar.style.width = waterNeed + '%';
  waterNeedVal.textContent = waterNeed + '%';

  const health = Math.round(100 - Math.abs(pct - 50) * 1.4);
  soilHealthBar.style.width = Math.max(0, health) + '%';
  soilHealthVal.textContent = Math.max(0, health) + '%';

  const comfort = pct > 85 ? Math.round(100 - (pct - 85) * 3) : Math.round(pct * 1.1);
  rootComfortBar.style.width = Math.min(100, Math.max(0, comfort)) + '%';
  rootComfortVal.textContent = Math.min(100, Math.max(0, comfort)) + '%';
}

function updateTimestamp() {
  const now = new Date();
  lastUpdate.textContent = `Updated ${now.toTimeString().split(' ')[0]}`;
}
