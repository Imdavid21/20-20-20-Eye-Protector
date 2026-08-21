"use strict";

const TARGET = "eye-rest-offscreen";
const ALERT_INTERVAL_MS = 5_000;
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

async function playTone(frequency, duration, volume) {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
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
  playTone(740, 0.25, 0.2).catch(() => {});
  setTimeout(() => playTone(988, 0.35, 0.22).catch(() => {}), 260);
}

function stopAll() {
  clearInterval(alertTimer);
  clearTimeout(breakTimer);
  clearInterval(breakBeepTimer);
  alertTimer = null;
  breakTimer = null;
  breakBeepTimer = null;
}

function startAlert() {
  stopAll();
  playAlarm();
  alertTimer = setInterval(playAlarm, ALERT_INTERVAL_MS);
}

function startBreak(seconds, playSound) {
  stopAll();
  let remaining = seconds;
  if (playSound) {
    playTone(520, 0.1, 0.08).catch(() => {});
    breakBeepTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) return;
      const finalCue = remaining <= 3;
      playTone(
        finalCue ? 700 : 520,
        finalCue ? 0.14 : 0.08,
        finalCue ? 0.14 : 0.07,
      ).catch(() => {});
    }, 1_000);
  }
  breakTimer = setTimeout(() => {
    clearInterval(breakBeepTimer);
    breakBeepTimer = null;
    if (playSound) playTone(880, 0.28, 0.16).catch(() => {});
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
