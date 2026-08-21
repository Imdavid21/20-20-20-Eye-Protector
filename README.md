# 20-20-20 Eye Protector

A focused Chrome extension for the 20-20-20 eye-rest routine.

## How it works

1. Chrome starts a 20-minute work timer automatically.
2. When the timer ends, a notification and repeating alarm request a break.
3. The alarm continues until you open the extension and select **Start break**.
4. A 20-second countdown begins with quiet one-second audio cues.
5. The next 20-minute cycle starts automatically when the break ends.

Pausing the extension stops all timers and sounds. A paused timer stays paused when Chrome restarts.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose this repository folder.

The first work cycle starts immediately.

## Controls

- **Pause / Resume** controls the work cycle.
- **Break now** starts an immediate break.
- **Start break** acknowledges a scheduled alarm.
- **Settings** changes the work interval, break duration, and sound preference.

## Privacy

The extension is fully local. It has no analytics, network requests, accounts, or external dependencies.

Chrome permissions:

- `alarms` schedules the work interval.
- `notifications` displays break reminders.
- `storage` saves settings and daily break count.
- `offscreen` provides reliable short-break timing and audio.

## Development

No build step is required. Validate the repository with:

```sh
npm test
```

After changing files, reload the extension from `chrome://extensions/`.
