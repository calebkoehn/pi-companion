const { Notification, shell } = require('electron');
const { PI_APP_URL } = require('./config');
const logger = require('./logger');

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function attendeeNames(attendees) {
  return attendees
    .filter(a => !a.self)
    .map(a => a.displayName || a.email.split('@')[0])
    .slice(0, 2).join(' & ');
}

function notifyMeetingStarting(event, { onRecord, onSkip }) {
  if (!Notification.isSupported()) return;
  const names = attendeeNames(event.attendees);
  const n = new Notification({
    title: event.title,
    body: names ? `with ${names} \u2014 starting at ${fmtTime(event.start)}` : `Starting at ${fmtTime(event.start)}`,
    subtitle: 'Record this meeting?',
    actions: [{ type: 'button', text: 'Record' }, { type: 'button', text: 'Skip' }],
    closeButtonText: 'Dismiss',
  });
  n.on('action', (_e, i) => { if (i === 0) onRecord(event); else onSkip(event); });
  n.show();
  logger.info('Meeting notification shown', { title: event.title });
}

function notifyRecordingStarted(event) {
  if (!Notification.isSupported()) return;
  new Notification({ title: 'Recording started', body: event.title, silent: true }).show();
}

function notifyRecordingComplete(event) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: 'Meeting recorded \u2713', body: `${event.title} \u2014 view in Performance IQ`, silent: true });
  n.on('click', () => shell.openExternal(`${PI_APP_URL}/meetings`));
  n.show();
}

module.exports = { notifyMeetingStarting, notifyRecordingStarted, notifyRecordingComplete };
