const { Notification, shell, dialog } = require('electron');
const { PI_APP_URL } = require('./config');
const logger = require('./logger');

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function attendeeNames(attendees) {
  return (attendees || [])
    .filter(a => !a.self)
    .map(a => a.displayName || a.email.split('@')[0])
    .slice(0, 2).join(' & ');
}

function getMeetingLink(event) {
  return event.meetingUrl || event.hangoutLink || event.meetLink || event.link || null;
}

function notifyMeetingStarting(event, { onRecord, onSkip, onOpen }) {
  const names = attendeeNames(event.attendees);
  const time = fmtTime(event.start);
  const title = event.title || event.summary || 'Meeting starting';
  const meetLink = getMeetingLink(event);

  // Send a notification for sound/visual alert (buttons don't work on macOS, so we use a dialog)
  if (Notification.isSupported()) {
    const notif = new Notification({
      title,
      body: names ? `with ${names} at ${time}` : `Starting at ${time}`,
      subtitle: 'Click for recording options',
      silent: false,
    });
    notif.on('click', () => {
      // If user clicks the notification banner, show the dialog again
      showMeetingDialog(event, title, names, time, meetLink, { onRecord, onSkip, onOpen });
    });
    notif.show();
  }

  // Immediately show a native dialog with working buttons
  showMeetingDialog(event, title, names, time, meetLink, { onRecord, onSkip, onOpen });

  logger.info('Meeting notification + dialog shown', { title, hasMeetLink: !!meetLink });
}

async function showMeetingDialog(event, title, names, time, meetLink, { onRecord, onSkip, onOpen }) {
  const detail = names
    ? `with ${names} at ${time}`
    : `Starting at ${time}`;

  // Build button list — macOS dialogs show buttons right-to-left, so order matters
  const buttons = [];
  if (meetLink) {
    buttons.push('Join & Record');  // index 0
    buttons.push('Record Only');    // index 1
    buttons.push('Skip');           // index 2
  } else {
    buttons.push('Record');         // index 0
    buttons.push('Skip');           // index 1
  }

  try {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Performance IQ',
      message: title,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      icon: null,
    });

    const clicked = result.response;
    logger.info('Meeting dialog response', { clicked, button: buttons[clicked], eventId: event.id });

    if (meetLink && buttons.length === 3) {
      if (clicked === 0) {
        // Join & Record
        shell.openExternal(meetLink);
        onRecord(event);
      } else if (clicked === 1) {
        // Record Only
        onRecord(event);
      } else {
        // Skip
        onSkip(event);
      }
    } else {
      if (clicked === 0) {
        // Record
        onRecord(event);
      } else {
        // Skip
        onSkip(event);
      }
    }
  } catch (err) {
    logger.warn('Meeting dialog error', { error: err.message });
  }
}

function notifyRecordingStarted(event) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Recording started',
    body: event.title || event.summary || 'Meeting',
    silent: true,
  }).show();
}

function notifyRecordingComplete(event) {
  if (!Notification.isSupported()) return;
  const title = event.title || event.summary || 'Meeting';
  const notif = new Notification({
    title: 'Meeting recorded \u2713',
    body: `${title} \u2014 view in Performance IQ`,
    silent: true,
  });
  notif.on('click', () => shell.openExternal(`${PI_APP_URL}/meetings`));
  notif.show();
}

module.exports = { notifyMeetingStarting, notifyRecordingStarted, notifyRecordingComplete };
