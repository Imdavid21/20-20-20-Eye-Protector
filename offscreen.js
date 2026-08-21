"use strict";

const TARGET = "eye-rest-offscreen";
const ALERT_INTERVAL_MS = 3_000;
const WARNING_SECONDS = 5;
let alertTimer = null;
let breakTimer = null;
let breakBeepTimer = null;
let audioContext = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext || audioContext.state === "closed")
    audioContext = new AudioContextClass();
  return audioContext;
}

async function playTone(frequency, duration, volume, waveform = "sine") {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = waveform;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(volume, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function playAlarm() {
  playTone(880, 0.16, 0.2, "square").catch(() => {});
  setTimeout(() => playTone(1_047, 0.16, 0.22, "square").catch(() => {}), 190);
  setTimeout(() => playTone(1_319, 0.24, 0.24, "square").catch(() => {}), 380);
}

function stopAll() {
  clearInterval(alertTimer);
  clearTimeout(breakTimer);
  clearTimeout(breakBeepTimer);
  alertTimer = null;
  breakTimer = null;
  breakBeepTimer = null;
}

function startAlert() {
  stopAll();
  playAlarm();
  alertTimer = setInterval(playAlarm, ALERT_INTERVAL_MS);
}

function getBeepInterval(remaining, total) {
  const progress = 1 - remaining / total;
  if (progress < 0.5) return 1_100;
  if (progress < 0.75) return 750;
  if (progress < 0.9) return 450;
  return 220;
}

function sendBreakWarning(remainingSeconds) {
  chrome.runtime.sendMessage({ type: "break-warning", remainingSeconds });
}

function startBreak(seconds, playSound) {
  stopAll();
  const endsAt = Date.now() + seconds * 1_000;
  let warningSent = false;

  function remainingSeconds() {
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000));
  }

  function scheduleBeep() {
    const remaining = remainingSeconds();
    if (remaining <= 0) return;
    if (!warningSent && remaining <= WARNING_SECONDS) {
      warningSent = true;
      sendBreakWarning(remaining);
    }
    const urgency = 1 - remaining / seconds;
    const frequency = 520 + Math.round(urgency * 520);
    const volume = 0.07 + urgency * 0.09;
    playTone(
      frequency,
      urgency > 0.85 ? 0.12 : 0.08,
      volume,
      urgency > 0.75 ? "square" : "sine",
    ).catch(() => {});
    breakBeepTimer = setTimeout(
      scheduleBeep,
      getBeepInterval(remaining, seconds),
    );
  }

  if (playSound) {
    scheduleBeep();
  } else if (seconds <= WARNING_SECONDS) {
    warningSent = true;
    sendBreakWarning(seconds);
  } else {
    breakBeepTimer = setTimeout(
      () => {
        warningSent = true;
        sendBreakWarning(WARNING_SECONDS);
      },
      (seconds - WARNING_SECONDS) * 1_000,
    );
  }

  breakTimer = setTimeout(() => {
    clearTimeout(breakBeepTimer);
    breakBeepTimer = null;
    if (playSound) playTone(1_176, 0.3, 0.18, "triangle").catch(() => {});
    chrome.runtime.sendMessage({ type: "break-complete" });
    breakTimer = null;
  }, seconds * 1_000);
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.target !== TARGET) return;
  if (message.type === "stop-all") stopAll();
  if (message.type === "start-alert") startAlert();
  if (message.type === "start-break") {
    startBreak(
      Math.max(1, Number(message.seconds) || 20),
      Boolean(message.playSound),
    );
  }
});
