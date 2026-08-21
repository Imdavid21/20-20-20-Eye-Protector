"use strict";

const WORK_ALARM = "eye-rest-work";
const OFFSCREEN_TARGET = "eye-rest-offscreen";
const MODES = Object.freeze({
  WORKING: "working",
  READY: "ready",
  BREAK: "break",
  PAUSED: "paused",
});
const DEFAULTS = Object.freeze({
  workMinutes: 20,
  breakSeconds: 20,
  soundEnabled: true,
  paused: false,
  mode: MODES.WORKING,
  nextEventAt: null,
  breaksTakenToday: 0,
  statsDate: "",
});

function todayString() {
  return new Date().toDateString();
}

async function getState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return {
    ...DEFAULTS,
    ...stored,
    statsDate: stored.statsDate || todayString(),
  };
}

async function updateState(partial) {
  await chrome.storage.local.set(partial);
}

async function resetDailyStats(state) {
  if (state.statsDate === todayString()) return state;
  const statsDate = todayString();
  await updateState({ breaksTakenToday: 0, statsDate });
  return { ...state, breaksTakenToday: 0, statsDate };
}

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play reminders and time the active 20-second eye break.",
  });
}

async function sendOffscreen(type, details = {}) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    type,
    ...details,
  });
}

async function stopOffscreenRuntime() {
  if (!(await hasOffscreenDocument())) return;
  await chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    type: "stop-all",
  });
}

async function startWork(workMinutes) {
  const minutes = workMinutes ?? (await getState()).workMinutes;
  await stopOffscreenRuntime();
  await chrome.alarms.clear(WORK_ALARM);
  const nextEventAt = Date.now() + minutes * 60_000;
  await chrome.alarms.create(WORK_ALARM, { when: nextEventAt });
  await updateState({ mode: MODES.WORKING, nextEventAt, paused: false });
}

async function markBreakReady() {
  const state = await getState();
  if (state.mode === MODES.READY) return;
  await chrome.alarms.clear(WORK_ALARM);
  await stopOffscreenRuntime();
  await updateState({ mode: MODES.READY, nextEventAt: null, paused: false });
  await chrome.notifications.create("eye-rest-break-ready", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Time for an eye break",
    message: "Open the extension and start your 20-second break.",
    priority: 2,
  });
  if (state.soundEnabled) await sendOffscreen("start-alert");
}

async function startBreak(breakSeconds) {
  const state = await getState();
  const seconds = breakSeconds ?? state.breakSeconds;
  await chrome.alarms.clear(WORK_ALARM);
  await chrome.notifications.clear("eye-rest-break-ready");
  await stopOffscreenRuntime();
  const nextEventAt = Date.now() + seconds * 1_000;
  await updateState({ mode: MODES.BREAK, nextEventAt, paused: false });
  await sendOffscreen("start-break", {
    seconds,
    playSound: state.soundEnabled,
  });
}

async function pause() {
  await chrome.alarms.clear(WORK_ALARM);
  await stopOffscreenRuntime();
  await updateState({ mode: MODES.PAUSED, nextEventAt: null, paused: true });
}

async function completeBreak() {
  const state = await resetDailyStats(await getState());
  if (state.mode !== MODES.BREAK || state.paused) return;
  const breaksTakenToday = state.breaksTakenToday + 1;
  await updateState({ breaksTakenToday });
  await chrome.notifications.clear("eye-rest-break-warning");
  await startWork(state.workMinutes);
}

async function warnBreakEnding(remainingSeconds) {
  const state = await getState();
  if (state.mode !== MODES.BREAK || state.paused) return;
  await chrome.notifications.create("eye-rest-break-warning", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `${remainingSeconds} seconds left`,
    message: "Keep looking away.",
    priority: 2,
  });
}

async function restoreRuntime() {
  const state = await resetDailyStats(await getState());
  if (state.paused || state.mode === MODES.PAUSED) return state;

  if (state.mode === MODES.READY) {
    if (state.soundEnabled && !(await hasOffscreenDocument()))
      await sendOffscreen("start-alert");
    return getState();
  }

  if (state.mode === MODES.BREAK) {
    const remainingSeconds = Math.ceil(
      (state.nextEventAt - Date.now()) / 1_000,
    );
    if (remainingSeconds <= 0) await completeBreak();
    else if (!(await hasOffscreenDocument())) {
      await sendOffscreen("start-break", {
        seconds: remainingSeconds,
        playSound: state.soundEnabled,
      });
    }
    return getState();
  }

  if (!state.nextEventAt) {
    await startWork(state.workMinutes);
    return getState();
  }
  if (state.nextEventAt <= Date.now()) {
    await markBreakReady();
    return getState();
  }
  if (!(await chrome.alarms.get(WORK_ALARM))) {
    await chrome.alarms.create(WORK_ALARM, { when: state.nextEventAt });
  }
  return getState();
}

async function updateSettings(message) {
  await updateState({
    workMinutes: message.workMinutes,
    breakSeconds: message.breakSeconds,
    soundEnabled: message.soundEnabled,
  });
  const state = await getState();
  if (state.paused) return state;
  if (state.mode === MODES.READY) {
    if (state.soundEnabled) await sendOffscreen("start-alert");
    else await stopOffscreenRuntime();
    return getState();
  }
  if (state.mode === MODES.BREAK) await startBreak(message.breakSeconds);
  else await startWork(message.workMinutes);
  return getState();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WORK_ALARM) markBreakReady().catch(console.error);
});
chrome.runtime.onInstalled.addListener(() =>
  restoreRuntime().catch(console.error),
);
chrome.runtime.onStartup.addListener(() =>
  restoreRuntime().catch(console.error),
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === OFFSCREEN_TARGET) return false;
  const handlers = {
    "break-complete": async () => {
      await completeBreak();
      return { ok: true };
    },
    "break-warning": async () => {
      await warnBreakEnding(message.remainingSeconds);
      return { ok: true };
    },
    "get-state": async () => resetDailyStats(await getState()),
    pause: async () => {
      await pause();
      return getState();
    },
    resume: async () => {
      await startWork((await getState()).workMinutes);
      return getState();
    },
    "start-break": async () => {
      await startBreak((await getState()).breakSeconds);
      return getState();
    },
    "skip-to-break": async () => {
      await startBreak((await getState()).breakSeconds);
      return getState();
    },
    "update-settings": async () => updateSettings(message),
  };
  const handler = handlers[message.type];
  if (!handler) {
    sendResponse({ error: "Unknown request" });
    return false;
  }
  handler()
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message || "Timer error" }));
  return true;
});
