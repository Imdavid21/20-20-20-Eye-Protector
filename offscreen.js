'use strict';
let breakTimer = null;
let breakBeepTimer = null;
let alertTimer = null;

async function playTone(frequency, duration, volume) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  if (ctx.state === 'suspended') await ctx.resume();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
  setTimeout(() => ctx.close(), Math.ceil((duration + 0.1) * 1000));
}

function playAlarm() {
  playTone(740, 0.25, 0.2).catch(() => {});
  setTimeout(() => playTone(988, 0.35, 0.22).catch(() => {}), 260);
}

function stopBreakAudio() {
  clearTimeout(breakTimer);
  clearInterval(breakBeepTimer);
  breakTimer = null;
  breakBeepTimer = null;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'stop-alert') {
    clearInterval(alertTimer);
    alertTimer = null;
    return;
  }
  if (msg.type === 'start-alert') {
    clearInterval(alertTimer);
    playAlarm();
    alertTimer = setInterval(playAlarm, 5000);
    return;
  }
  if (msg.type === 'cancel-break') {
    stopBreakAudio();
    return;
  }
  if (msg.type === 'start-break') {
    stopBreakAudio();
    const seconds = Math.max(1, Number(msg.seconds) || 20);
    let remaining = seconds;
    if (msg.playSound) {
      playTone(520, 0.1, 0.08).catch(() => {});
      breakBeepTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) return;
        const finalCue = remaining <= 3;
        playTone(finalCue ? 700 : 520, finalCue ? 0.14 : 0.08, finalCue ? 0.14 : 0.07).catch(() => {});
      }, 1000);
    }
    breakTimer = setTimeout(() => {
      clearInterval(breakBeepTimer);
      breakBeepTimer = null;
      if (msg.playSound) playTone(880, 0.28, 0.16).catch(() => {});
      chrome.runtime.sendMessage({ type: 'break-complete' });
      breakTimer = null;
    }, seconds * 1000);
  }
});
