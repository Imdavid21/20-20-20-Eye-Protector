'use strict';
let breakTimer = null;

async function playChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  if (ctx.state === 'suspended') await ctx.resume();
  function tone(freq, start, duration) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(start); oscillator.stop(start + duration);
  }
  tone(740, ctx.currentTime, 0.22);
  tone(988, ctx.currentTime + 0.2, 0.32);
  setTimeout(() => ctx.close(), 750);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'offscreen') return;
  clearTimeout(breakTimer);
  breakTimer = null;
  if (msg.type === 'start-break') {
    if (msg.playSound) playChime().catch(() => {});
    breakTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'break-complete' });
      breakTimer = null;
    }, Math.max(1, Number(msg.seconds) || 20) * 1000);
  }
});
