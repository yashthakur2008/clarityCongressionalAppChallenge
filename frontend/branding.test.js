import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// The final web-app merge deliberately replaced the earlier square PNG header
// with this animated eye. Protect that design rather than reverting partner UI.
test('main header preserves the final animated eye without duplicating its accessible name', () => {
  const header = read('./index.html').match(/<header>[\s\S]*?<\/header>/)?.[0];
  assert.match(header, /<span class="brand-logo-window" aria-hidden="true">/);
  assert.match(header, /<img src="icons\/eye_logo_smooth\.gif\?v=smooth-6" width="220" height="120" alt=""/);
  assert.match(header, />\s*Clarity\s*<\/div>/);
  assert.doesNotMatch(header, /<span class="logo">C<\/span>/);
  const asset = new URL('./icons/eye_logo_smooth.gif', import.meta.url);
  assert.ok(existsSync(asset), 'final animated header logo is shipped');
  assert.equal(createHash('sha256').update(readFileSync(asset)).digest('hex'), '0541a4b4b2ca3d15a8c7f6799b204d3cd4c1c5b42e105918775c95aac9cdbd7d');
});

test('animated header retains the partner layout and resolves its palette filter', () => {
  const css = read('./homePage.css');
  const windowRule = css.match(/\.brand-logo-window\s*\{([^}]+)\}/)?.[1];
  assert.match(windowRule, /width:\s*94px/);
  assert.match(windowRule, /height:\s*56px/);
  const imageRule = css.match(/\.brand-logo-window img\s*\{([^}]+)\}/)?.[1];
  assert.match(imageRule, /width:\s*220px/);
  assert.match(imageRule, /height:\s*auto/);
  assert.match(imageRule, /filter:\s*url\(#eye-palette-tint\)/);
  assert.match(read('./index.html'), /id="eye-palette-tint"/);
});
