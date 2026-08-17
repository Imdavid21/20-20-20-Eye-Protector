'use strict';

const WORK_ALARM = 'eyerest-work';
const DEFAULTS = {
  workMinutes: 20,
  breakSeconds: 20,
  soundEnabled: true,
  paused: false,
  mode: 'working',
  nextEventAt: null,
  breaksTakenToday: 0,
  statsDate: ''
};

function todayString() { return new Date().toDateString(); }

async function getState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const state = { ...DEFAULTS, ...stored };
  if (!state.statsDate) state.statsDate = todayString();
  return state;
}

async function setState(partial) { await chrome.storage.local.set(partial); }

async function resetStatsIfNewDay(state) {
  if (state.statsDate === todayString()) return state;
  const next = { ...state, breaksTakenToday: 0, statsDate: todayString() };
  await setState({ breaksTakenToday: 0, statsDate: next.statsDate });
  return next;
}

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play the reminder and reliably time the 20-second eye break.'
  });
}

async function sendOffscreen(message) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

async function startWorkTimer(workMinutes) {
  const minutes = workMinutes ?? (await getState()).workMinutes;
  await sendOffscreen({ type: 'cancel-break' }).catch(() => {});
  await chrome.alarms.clear(WORK_ALARM);
  const nextEventAt = Date.now() + minutes * 60 * 1000;
  await chrome.alarms.create(WORK_ALARM, { when: nextEventAt });
  await setState({ mode: 'working', nextEventAt, paused: false });
}

async function startBreakTimer(breakSeconds, announce = true) {
  const state = await getState();
  const seconds = breakSeconds ?? state.breakSeconds;
  await chrome.alarms.clear(WORK_ALARM);
  const nextEventAt = Date.now() + seconds * 1000;
  await setState({ mode: 'break', nextEventAt, paused: false });
  await sendOffscreen({ type: 'start-break', seconds, playSound: announce && state.soundEnabled });
  if (announce) await notifyBreakStart();
}

async function markBreakReady() {
  await chrome.alarms.clear(WORK_ALARM);
  await sendOffscreen({ type: 'cancel-break' }).catch(() => {});
  await setState({ mode: 'ready', nextEventAt: null, paused: false });
  await notifyBreakStart();
}

async function pauseTimer() {
  await chrome.alarms.clear(WORK_ALARM);
  await sendOffscreen({ type: 'cancel-break' }).catch(() => {});
  await setState({ mode: 'paused', paused: true, nextEventAt: null });
}

async function notifyBreakStart() {
  await chrome.notifications.create('eyerest-break-start', {
    type: 'basic', iconUrl: 'icons/icon128.png', title: 'Look away for 20 seconds',
    message: 'Focus on something at least 20 feet away.', priority: 2
  });
}

async function completeBreak() {
  let state = await resetStatsIfNewDay(await getState());
  if (state.mode !== 'break' || state.paused) return;
  const newCount = (state.breaksTakenToday || 0) + 1;
  await setState({ breaksTakenToday: newCount });
  await chrome.notifications.create('eyerest-break-end', {
    type: 'basic', iconUrl: 'icons/icon128.png', title: 'Break complete',
    message: `${newCount} eye break${newCount === 1 ? '' : 's'} today.`, priority: 1
  });
  await startWorkTimer(state.workMinutes);
}

async function reconcileTimer() {
  let state = await resetStatsIfNewDay(await getState());
  if (state.paused || state.mode === 'paused') return state;
  if (!state.nextEventAt) { await startWorkTimer(state.workMinutes); return getState(); }
  const remaining = state.nextEventAt - Date.now();
  if (state.mode === 'ready') {
    await chrome.alarms.clear(WORK_ALARM);
  } else if (state.mode === 'break') {
    if (remaining <= 0) await completeBreak();
    else await sendOffscreen({ type: 'start-break', seconds: Math.max(1, Math.ceil(remaining / 1000)), playSound: false });
  } else {
    const alarm = await chrome.alarms.get(WORK_ALARM);
    if (remaining <= 0) await markBreakReady();
    else if (!alarm) await chrome.alarms.create(WORK_ALARM, { when: state.nextEventAt });
  }
  return getState();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === WORK_ALARM) await markBreakReady();
});

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await setState({ statsDate: state.statsDate || todayString() });
  await reconcileTimer();
});

chrome.runtime.onStartup.addListener(reconcileTimer);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.target === 'offscreen') return false;
  (async () => {
    if (msg.type === 'break-complete') { await completeBreak(); return { ok: true }; }
    if (msg.type === 'get-state') return reconcileTimer();
    if (msg.type === 'pause') { await pauseTimer(); return getState(); }
    if (msg.type === 'resume') { await startWorkTimer((await getState()).workMinutes); return getState(); }
    if (msg.type === 'skip-to-break' || msg.type === 'start-break') { await startBreakTimer((await getState()).breakSeconds); return getState(); }
    if (msg.type === 'update-settings') {
      await setState({ workMinutes: msg.workMinutes, breakSeconds: msg.breakSeconds, soundEnabled: msg.soundEnabled });
      const state = await getState();
      if (!state.paused) {
        if (state.mode === 'break') await startBreakTimer(msg.breakSeconds, false);
        else if (state.mode !== 'ready') await startWorkTimer(msg.workMinutes);
      }
      return getState();
    }
    return {};
  })().then(sendResponse).catch((error) => sendResponse({ error: error.message || 'Timer error' }));
  return true;
});
