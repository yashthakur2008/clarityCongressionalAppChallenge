import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual standalone HTML navigation/reveal block, not site.js's
// separate controller. Full DOM/animation/focus behavior is also checked in Chrome.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const start = html.indexOf('const screens =');
const end = html.indexOf('function showToast(', start);
assert.ok(start >= 0 && end > start, 'Standalone navigation block must be available');
const navigation = html.slice(start, end);

function fixture({ reducedMotion, hash = '' }) {
  const timers = new Map();
  let timerId = 0;
  const node = (id, screen, top = 10) => {
    const classes = new Set(), attrs = new Map(), styles = new Map(), listeners = new Map();
    return { id, dataset: {}, offsetWidth: 100, listeners, attrs,
      classList: { add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value),
        toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); } },
      style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
      setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key),
      addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name),
      getBoundingClientRect: () => ({ top, bottom: top + 50, left: 0, width: 100 }),
      closest: selector => selector === '#settings' && screen === 'settings' ? screens[2] : null,
    };
  };
  const screens = ['home', 'camera', 'settings'].map(id => node(id));
  screens.forEach(screen => screen.classList.add('screen'));
  screens[1].classList.add('active');
  const nav = screens.map(screen => { const button = node(`nav-${screen.id}`); button.dataset.screen = screen.id; return button; });
  nav[1].setAttribute('aria-current', 'page');
  const targets = [node('home-title', 'home'), node('camera-controls', 'camera'),
    node('settings-intro', 'settings'), node('settings-visible', 'settings', 200), node('settings-below', 'settings', 900)];
  const nodes = new Map([...screens, ...targets].map(element => [element.id, element]));
  for (const id of ['camera-video', 'camera-start', 'camera-stop', 'detection-status-light']) nodes.set(id, node(id));
  const observed = [];
  class IntersectionObserver {
    observe(element) { observed.push(element); }
  }
  const schedule = callback => { timers.set(++timerId, callback); return timerId; };
  const platform = { location: { hash }, innerHeight: 800, IntersectionObserver,
    matchMedia: () => ({ matches: reducedMotion }), addEventListener() {}, scrollTo() {}, setTimeout: schedule };
  runInNewContext(navigation, { window: platform, IntersectionObserver,
    clearTimeout: id => timers.delete(id),
    document: { getElementById: id => nodes.get(id), querySelectorAll(selector) {
      if (selector === '.screen') return screens;
      if (selector === '.nav-btn') return nav;
      if (selector.startsWith('#home > .eyebrow')) return targets;
      if (selector.startsWith('#home .page-intro-card')) return [];
      throw new Error(`Unexpected navigation selector: ${selector}`);
    } },
  });
  return { screens, nav, targets, observed, timers,
    navigate(id) { nav.find(button => button.dataset.screen === id).listeners.get('click')(); },
    finishTransition() { for (const callback of [...timers.values()]) callback(); },
  };
}

for (const reducedMotion of [true, false]) {
  test(`Settings reveal stays scoped and repeated navigation completes (${reducedMotion ? 'reduced' : 'normal'} motion)`, () => {
    const f = fixture({ reducedMotion });
    for (const id of ['settings', 'home', 'settings', 'camera', 'settings']) {
      f.navigate(id);
      assert.deepEqual(f.screens.filter(screen => screen.classList.contains('active')).map(screen => screen.id), [id]);
      assert.deepEqual(f.nav.filter(button => button.attrs.get('aria-current') === 'page').map(button => button.dataset.screen), [id]);
      f.finishTransition();
      assert.ok(f.screens.every(screen => !screen.classList.contains('page-fade-in') && !screen.classList.contains('page-fade-out')));
      assert.equal(f.timers.size, 0);
    }
    for (const target of f.targets.slice(0, 2)) assert.equal(target.classList.contains('is-initially-visible'), false);
    for (const target of f.targets.slice(2, 4)) {
      assert.equal(target.classList.contains('is-initially-visible'), true);
      assert.equal(target.classList.contains('is-visible'), true);
    }
    assert.equal(f.targets[4].classList.contains('is-initially-visible'), false, 'Offscreen Settings content remains eligible for scroll reveal');
    if (reducedMotion) assert.ok(f.targets.every(target => target.classList.contains('is-visible')));
    else assert.deepEqual(f.observed, f.targets, 'Normal-motion observer still owns all original reveal targets');
  });

  test(`direct Settings hash initializes after reveal collection (${reducedMotion ? 'reduced' : 'normal'} motion)`, () => {
    const f = fixture({ reducedMotion, hash: '#settings' });
    assert.equal(f.screens[2].classList.contains('active'), true);
    assert.equal(f.nav[2].attrs.get('aria-current'), 'page');
    f.finishTransition();
    assert.equal(f.timers.size, 0);
  });
}
