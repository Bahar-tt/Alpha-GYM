const sms = require('./smsService');

/* =========================
   CORE EVENT WRAPPER
========================= */

function emit(eventName, handler) {
  try {
    return handler();
  } catch (err) {
    console.error(`[EVENT ERROR] ${eventName}`, err);
  }
}

/* =========================
   MEMBER EVENTS
========================= */

function onMemberCreated(member) {
  return emit('onMemberCreated', () => {
    sms.sendWelcome(member);
  });
}

function onMemberRenewed(member, newDate) {
  return emit('onMemberRenewed', () => {
    sms.sendRenewal(member, newDate);
  });
}

function onMemberExpiringSoon(member) {
  return emit('onMemberExpiringSoon', () => {
    sms.sendExpiryWarning(member);
  });
}

/* =========================
   SYSTEM EVENTS
========================= */

function sendAnnouncement(members, message) {
  return emit('sendAnnouncement', () => {
    sms.sendAnnouncement(members, message);
  });
}

module.exports = {
  onMemberCreated,
  onMemberRenewed,
  onMemberExpiringSoon,
  sendAnnouncement,
};