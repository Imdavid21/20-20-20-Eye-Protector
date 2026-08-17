# 20-20-20 Eye Rest Reminder

A local Chrome extension that reminds you every 20 minutes to look at
something 20 feet away for 20 seconds, to reduce digital eye strain.

## Install (unpacked, for your own Chrome)

1. Unzip this folder somewhere permanent (don't delete it after — Chrome
   loads the extension directly from these files).
2. Open Chrome and go to `chrome://extensions/`
3. Turn on **Developer mode** (toggle, top right)
4. Click **Load unpacked**
5. Select the `eye-rest-20-20-20` folder
6. Done — the timer starts automatically.

## What it does

- Runs a 20-minute countdown in the background (fully local, no network
  calls, no data collection).
- At 0:00, fires a desktop notification + short chime telling you to look
  20 feet away, and starts a 20-second break countdown.
- When the break ends, notifies you and restarts the 20-minute cycle.
- Click the extension icon anytime to see the live countdown ring, current
  mode (working / break / paused), and today's break count.

## Controls (in the popup)

- **Pause / Resume** — stop or restart the whole cycle.
- **Take break now** — skip straight to a 20-second break.
- **Settings** — customize the work interval (default 20 min), break
  duration (default 20 sec), and whether a sound plays.

## Notes

- The timer keeps running even if you close the popup — it's driven by
  Chrome's alarm scheduler in the background, not the popup window.
- If you reload/update the extension files, go back to
  `chrome://extensions/` and click the refresh icon on the extension card.
- To remove it, click **Remove** on the extension card in
  `chrome://extensions/`.
