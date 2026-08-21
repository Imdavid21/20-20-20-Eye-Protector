"use strict";

const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const byId = (id) => document.getElementById(id);
const elements = {
  mode: byId("modeLabel"),
  time: byId("timeLabel"),
  hint: byId("hint"),
  stat: byId("stat"),
  ring: byId("ringProgress"),
  pause: byId("pauseBtn"),
  break: byId("skipBtn"),
  settingsToggle: byId("settingsToggle"),
  settings: byId("settingsBody"),
  workMinutes: byId("workMinutes"),
  breakSeconds: byId("breakSeconds"),
  sound: byId("soundEnabled"),
  save: byId("saveBtn"),
  error: byId("errorMessage"),
};

let currentState = null;
elements.ring.style.strokeDasharray = RING_CIRCUMFERENCE;

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getView(state) {
  if (state.mode === "ready") {
    return {
      mode: "Break ready",
      hint: "Start when ready",
      time: "--:--",
      progress: 0,
    };
  }
  if (state.mode === "paused") {
    return { mode: "Paused", hint: "Timer paused", time: "--:--", progress: 0 };
  }

  const total =
    state.mode === "break"
      ? state.breakSeconds * 1_000
      : state.workMinutes * 60_000;
  const remaining = Math.max(0, state.nextEventAt - Date.now());
  return {
    mode: state.mode === "break" ? "Look away" : "Working",
    hint: state.mode === "break" ? "Focus 20 feet away" : "Next break",
    time: formatDuration(remaining),
    progress: Math.max(0, Math.min(1, 1 - remaining / total)),
  };
}

function render(state) {
  currentState = state;
  const view = getView(state);
  elements.mode.textContent = view.mode;
  elements.hint.textContent = view.hint;
  elements.time.textContent = view.time;
  elements.ring.style.strokeDashoffset =
    RING_CIRCUMFERENCE * (1 - view.progress);
  elements.ring.style.stroke =
    state.mode === "paused" ? "var(--muted)" : "var(--text)";
  elements.pause.textContent = state.mode === "paused" ? "Resume" : "Pause";
  elements.break.textContent =
    state.mode === "ready" ? "Start break" : "Break now";
  elements.stat.textContent = `${state.breaksTakenToday || 0} today`;
  elements.workMinutes.value = state.workMinutes;
  elements.breakSeconds.value = state.breakSeconds;
  elements.sound.checked = Boolean(state.soundEnabled);
}

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError)
        return reject(new Error(chrome.runtime.lastError.message));
      if (!response || response.error)
        return reject(new Error(response?.error || "Timer unavailable"));
      resolve(response);
    });
  });
}

function showError(error) {
  elements.error.textContent = error?.message || "Something went wrong.";
  elements.error.classList.remove("hidden");
}

async function run(action) {
  try {
    render(await action());
    elements.error.classList.add("hidden");
  } catch (error) {
    showError(error);
  }
}

async function refresh() {
  await run(() => send({ type: "get-state" }));
}

elements.pause.addEventListener("click", () => {
  run(() =>
    send({ type: currentState?.mode === "paused" ? "resume" : "pause" }),
  );
});

elements.break.addEventListener("click", () => {
  run(() =>
    send({
      type: currentState?.mode === "ready" ? "start-break" : "skip-to-break",
    }),
  );
});

elements.settingsToggle.addEventListener("click", () => {
  const hidden = elements.settings.classList.toggle("hidden");
  elements.settingsToggle.setAttribute("aria-expanded", String(!hidden));
});

elements.save.addEventListener("click", async () => {
  const workMinutes = Math.max(
    1,
    Math.min(120, Number.parseInt(elements.workMinutes.value, 10) || 20),
  );
  const breakSeconds = Math.max(
    5,
    Math.min(120, Number.parseInt(elements.breakSeconds.value, 10) || 20),
  );
  await run(() =>
    send({
      type: "update-settings",
      workMinutes,
      breakSeconds,
      soundEnabled: elements.sound.checked,
    }),
  );
  elements.save.textContent = "Saved";
  setTimeout(() => {
    elements.save.textContent = "Save";
  }, 1_200);
});

refresh();
const refreshTimer = setInterval(refresh, 1_000);
window.addEventListener("unload", () => clearInterval(refreshTimer));
