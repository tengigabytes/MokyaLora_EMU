/**
 * MIE_Timer — Simulates RP2350 Hardware Timer Alarms
 *
 * Mirrors the RP2350 Pico SDK timer API used in firmware/mie/:
 *   add_alarm_in_ms(delay_ms, callback, user_data, fire_if_past)
 *   cancel_alarm(alarm_id)
 *   add_repeating_timer_ms(period_ms, callback, user_data, out)
 *   cancel_repeating_timer(timer)
 *
 * Used by MIE_Processor for:
 *   - Multi-tap confirmation timeout  (~800ms, configurable)
 *   - Candidate selection auto-commit (~3s idle)
 *   - Key debounce timer              (~20ms)
 *   - Repeating status-bar clock tick (1000ms)
 *
 * Phase 4 note: when WASM loads, JS timers stay as the host-side
 * implementation; WASM calls back through env.get_tick_ms() and
 * env.set_alarm() imported functions.
 */
export class MIE_Timer {
  constructor() {
    /** @type {Map<number, ReturnType<typeof setTimeout>>} */
    this._alarms = new Map();

    /** @type {Map<number, ReturnType<typeof setInterval>>} */
    this._repeating = new Map();

    this._nextId = 1;

    // Performance baseline — matches RP2350 time_us_64() / 1000
    this._epoch = performance.now();
  }

  /**
   * Equivalent to: alarm_id_t add_alarm_in_ms(int64_t ms, alarm_callback_t cb, void *ud, bool fip)
   * @param {number} delayMs
   * @param {function(number, *): void} callback  (alarmId, userData)
   * @param {*} userData
   * @returns {number} alarmId (> 0 on success, -1 on error)
   */
  addAlarmInMs(delayMs, callback, userData = null) {
    if (delayMs < 0) return -1;
    const id = this._nextId++;
    const handle = setTimeout(() => {
      this._alarms.delete(id);
      callback(id, userData);
    }, delayMs);
    this._alarms.set(id, handle);
    return id;
  }

  /**
   * Equivalent to: bool cancel_alarm(alarm_id_t alarm_id)
   * @param {number} alarmId
   * @returns {boolean}
   */
  cancelAlarm(alarmId) {
    const handle = this._alarms.get(alarmId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this._alarms.delete(alarmId);
      return true;
    }
    return false;
  }

  /**
   * Equivalent to: bool add_repeating_timer_ms(int32_t delay_ms, repeating_timer_callback_t cb, void *ud, repeating_timer_t *out)
   * @param {number} periodMs
   * @param {function(number): boolean} callback  return false to cancel
   * @returns {number} timerId
   */
  addRepeatingTimer(periodMs, callback) {
    const id = this._nextId++;
    const handle = setInterval(() => {
      const keepRunning = callback(id);
      if (keepRunning === false) this.cancelRepeatingTimer(id);
    }, periodMs);
    this._repeating.set(id, handle);
    return id;
  }

  /**
   * Equivalent to: bool cancel_repeating_timer(repeating_timer_t *timer)
   * @param {number} timerId
   * @returns {boolean}
   */
  cancelRepeatingTimer(timerId) {
    const handle = this._repeating.get(timerId);
    if (handle !== undefined) {
      clearInterval(handle);
      this._repeating.delete(timerId);
      return true;
    }
    return false;
  }

  /**
   * Current milliseconds since boot — mirrors get_absolute_time() / us_to_ms()
   * @returns {number}
   */
  getTickMs() {
    return Math.floor(performance.now() - this._epoch);
  }

  /** Cancel all pending timers (for cleanup/reset) */
  cancelAll() {
    for (const h of this._alarms.values())   clearTimeout(h);
    for (const h of this._repeating.values()) clearInterval(h);
    this._alarms.clear();
    this._repeating.clear();
  }
}
