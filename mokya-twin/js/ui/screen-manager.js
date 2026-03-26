/**
 * ScreenManager — Page navigation with LVGL-style transitions
 *
 * Mirrors LVGL lv_scr_load_anim(scr, LV_SCR_LOAD_ANIM_FADE_IN, 200, 0, true)
 *
 * Transition types:
 *   'fade'    — cross-fade (lv_SCR_LOAD_ANIM_FADE_IN)
 *   'slide_l' — slide from right (lv_SCR_LOAD_ANIM_MOVE_LEFT)
 *   'slide_r' — slide from left
 *   'none'    — instant switch
 */

export class ScreenManager {
  /** @param {import('./renderer.js').MokyaRenderer} renderer */
  constructor(renderer) {
    this.r = renderer;
    /** @type {Map<string, BaseScreen>} */
    this._screens = new Map();
    this._current = null;
    this._history = [];
    this._animating = false;
    this._animFrame = null;
  }

  /**
   * Register a screen instance.
   * @param {string}     name    unique screen identifier
   * @param {BaseScreen} screen  screen instance
   */
  register(name, screen) {
    screen._name = name;
    screen._manager = this;
    this._screens.set(name, screen);
  }

  /**
   * Navigate to a named screen.
   * Equivalent to: lv_scr_load_anim(screen, anim_type, duration, 0, true)
   * @param {string} name
   * @param {'fade'|'slide_l'|'slide_r'|'none'} transition
   */
  navigateTo(name, transition = 'fade') {
    const next = this._screens.get(name);
    if (!next) { console.warn('[ScreenManager] Unknown screen:', name); return; }
    if (this._current?._name === name) return;
    if (this._animating) return;

    const prev = this._current;
    if (prev) this._history.push(prev._name);
    this._current = next;
    next.onEnter(prev?._name);

    if (transition === 'none' || !prev) {
      this._render();
      return;
    }
    this._playTransition(transition, prev, next);
  }

  /** Go back to previous screen */
  goBack(transition = 'slide_r') {
    const prevName = this._history.pop();
    if (!prevName) return;
    const prev = this._current;
    const next = this._screens.get(prevName);
    if (!next) return;
    this._current = next;
    next.onEnter(prev?._name);
    this._playTransition(transition, prev, next);
  }

  /** Render current screen (called by app's rAF loop) */
  render(now) {
    if (this._animating) return; // transition handles its own rendering
    if (this._current) this._current.render(now);
  }

  /** Forward key events to current screen */
  handleKeyDown(keyEvent) {
    if (this._current) this._current.handleKeyDown(keyEvent);
  }
  handleKeyTap(keyEvent) {
    if (this._current) this._current.handleKeyTap(keyEvent);
  }

  /** ── Transition engine ─────────────────────────────────────── */
  _playTransition(type, from, to) {
    this._animating = true;
    const DURATION = 180; // ms — matches LVGL default 200ms
    const startTime = performance.now();
    const W = this.r.W, H = this.r.H;

    // Capture "from" screen to offscreen canvas
    const fromCanvas = document.createElement('canvas');
    fromCanvas.width = W; fromCanvas.height = H;
    const fromCtx = fromCanvas.getContext('2d');
    fromCtx.drawImage(this.r.d.canvas, 0, 0);

    // Render "to" screen to offscreen canvas
    const toCanvas = document.createElement('canvas');
    toCanvas.width = W; toCanvas.height = H;
    const toCtx = toCanvas.getContext('2d');
    const savedCtx = this.r.ctx;
    // Temporarily redirect drawing to offscreen
    // (We re-render to the real canvas during animation)
    to.render(performance.now());
    toCtx.drawImage(this.r.d.canvas, 0, 0);

    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / DURATION);
      const ease = this._easeInOut(t);

      this.r.d.clear();

      if (type === 'fade') {
        this.r.ctx.globalAlpha = 1 - ease;
        this.r.ctx.drawImage(fromCanvas, 0, 0);
        this.r.ctx.globalAlpha = ease;
        this.r.ctx.drawImage(toCanvas, 0, 0);
        this.r.ctx.globalAlpha = 1;

      } else if (type === 'slide_l') {
        // "to" slides in from right
        this.r.ctx.drawImage(fromCanvas, -W * ease, 0);
        this.r.ctx.drawImage(toCanvas,   W * (1 - ease), 0);

      } else if (type === 'slide_r') {
        // "to" slides in from left
        this.r.ctx.drawImage(fromCanvas,  W * ease, 0);
        this.r.ctx.drawImage(toCanvas,   -W * (1 - ease), 0);
      }

      if (t < 1) {
        this._animFrame = requestAnimationFrame(animate);
      } else {
        this.r.ctx.globalAlpha = 1;
        this._animating = false;
        this._render(); // Final clean render
      }
    };
    this._animFrame = requestAnimationFrame(animate);
  }

  _render() {
    if (this._current) this._current.render(performance.now());
  }

  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  get currentName() { return this._current?._name; }
}

/**
 * BaseScreen — abstract base for all screens.
 * Subclass and override render(), handleKeyTap(), handleKeyDown().
 */
export class BaseScreen {
  constructor(renderer, mie, serial) {
    this.r      = renderer;   // MokyaRenderer
    this.mie    = mie;        // MIE_Bridge
    this.serial = serial;     // MeshtasticSerial
    this._name     = '';
    this._manager  = null;
    this._scrollY  = 0;
    this._entered  = false;
  }

  /** Called when entering this screen. Override to init state. */
  onEnter(fromScreen) {
    this._entered = true;
    this._scrollY = 0;
  }

  /** Called every rAF. Must call r.drawStatusBar() + r.drawTabBar(). */
  render(now) { /* override */ }

  /** Called on key:tap event */
  handleKeyTap({ key, tapCount }) { /* override */ }

  /** Called on key:down (immediate, before tap timer) */
  handleKeyDown({ key }) { /* override */ }

  /** Navigate helper */
  goto(name, transition) { this._manager?.navigateTo(name, transition); }
  goBack()               { this._manager?.goBack(); }
}
