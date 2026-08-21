"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, "background.js");
assert.deepEqual(manifest.permissions.sort(), [
  "alarms",
  "notifications",
  "offscreen",
  "storage",
]);

const requiredFiles = [
  "background.js",
  "offscreen.html",
  "offscreen.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

for (const relativePath of requiredFiles) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `Missing ${relativePath}`,
  );
}

for (const script of ["background.js", "offscreen.js", "popup.js"]) {
  const source = fs.readFileSync(path.join(root, script), "utf8");
  assert.doesNotThrow(() => new vm.Script(source, { filename: script }));
}

const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const offscreen = fs.readFileSync(path.join(root, "offscreen.js"), "utf8");
assert.match(background, /"break-warning"/);
assert.doesNotMatch(background, /eye-rest-break-complete/);
assert.match(offscreen, /ALERT_INTERVAL_MS = 3_000/);
assert.match(offscreen, /getBeepInterval/);

const popup = fs.readFileSync(path.join(root, "popup.html"), "utf8");
assert.match(popup, /id="pauseBtn"/);
assert.match(popup, /id="skipBtn"/);
assert.match(popup, /id="soundEnabled"/);

console.log("Extension validation passed.");
