import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test("site/index.html est une copie identique de dist/ia-arduino.html", () => {
  const dist = readFileSync(new URL('../dist/ia-arduino.html', import.meta.url));
  const site = readFileSync(new URL('../site/index.html', import.meta.url));
  assert.ok(site.length > 1_000_000);
  assert.ok(dist.equals(site));
});
