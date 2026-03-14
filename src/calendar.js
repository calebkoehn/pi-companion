const { EventEmitter } = require('events');
const { PI_BACKEND_URL } = require('./config');
const { getJwt } = require('./tokenClient');
const logger = require('./logger');

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const NOTIFY_BEFORE_MS = 60 * 1000;

class CalendarManager extends EventEmitter {
  constructor() {
    super();
    this.events = [];
    this.notifiedIds = new Set();
    this.skippedIds = new Set();
    this.recordingIds = new Set();
    this._pollTimer = null;
    this._notifyTimer = null;
    this._calendarConnected = null;
  }

  async fetchEvents() {
    const jwt = getJwt();
    if (!jwt) return;
    try {
      const res = await fetch(`${PI_BACKEND_URL}/api/companion/calendar`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.status === 400) {
        this._calendarConnected = false;
        this.emit('no-calendar');
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      this._calendarConnected = true;
      this.events = data.events || [];
      this.emit('events-updated', this.events);
      logger.info('Calendar fetched', { count: this.events.length });
    } catch (err) {
      logger.warn('Calendar fetch failed', { error: err.message });
    }
  }

  checkUpcoming() {
    const now = Date.now();
    for (const event of this.events) {
      if (this.notifiedIds.has(event.id) || this.skippedIds.has(event.id)) continue;
      const startMs = new Date(event.start).getTime();
      const msUntil = startMs - now;
      if (msUntil > 0 && msUntil <= NOTIFY_BEFORE_MS) {
        this.notifiedIds.add(event.id);
        this.emit('meeting-starting', event);
      }
    }
  }

  start() {
    this.fetchEvents();
    this._pollTimer = setInterval(() => this.fetchEvents(), POLL_INTERVAL_MS);
    this._notifyTimer = setInterval(() => this.checkUpcoming(), 15000);
  }

  stop() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._notifyTimer) clearInterval(this._notifyTimer);
  }

  skipMeeting(id) { this.skippedIds.add(id); this.recordingIds.delete(id); }
  recordMeeting(id) { this.recordingIds.add(id); this.skippedIds.delete(id); }
  getEvents() { return this.events; }
  isCalendarConnected() { return this._calendarConnected; }
}

module.exports = new CalendarManager();
