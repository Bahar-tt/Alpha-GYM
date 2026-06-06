const Database = require('better-sqlite3');
const path = require('path');
const { toJalali } = require('../utils/date');

const db = new Database(path.join(__dirname, '../gym.db'));

/* =========================
   LOG LAYER (CORE)
========================= */

function sendSMS({
  member_id,
  name,
  phone,
  message,
  type = 'general',
  status = 'sent'
}) {
  try {
    if (member_id && type !== 'general' && hasSentToday(member_id, type)) {
      console.log(`[SKIP DUPLICATE SMS] ${type} -> ${name}`);
      return false;
    }

    db.prepare(`
      INSERT INTO sms_logs (
        member_id,
        name,
        phone,
        message,
        type,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      member_id || null,
      name || null,
      phone,
      message,
      type,
      status
    );

    console.log(`[SMS SENT - ${type}] -> ${phone}`);
    return true;

  } catch (err) {
    console.error('[SMS ERROR]', err);
    return false;
  }
}
/* =========================
   CORE SMS ENGINE (MOCK)
========================= */

function sendSMS({ member_id, name, phone, message, type = 'general', status = 'sent' }) {
  try {
    // 🔴 Anti Duplicate Check
    if (member_id && type !== 'general' && hasSentToday(member_id, type)) {
      console.log(`[SKIP DUPLICATE SMS] ${type} -> ${name}`);
      return false;
    }

    db.prepare(`
      INSERT INTO sms_logs (
        member_id,
        name,
        phone,
        message,
        type,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      member_id || null,
      name,
      phone,
      message,
      type,
      status
    );

    console.log(`
[SMS SENT - ${type}]
TO: ${phone}
-------------------------
${message}
-------------------------
    `);

    return true;
  } catch (err) {
    console.error('[SMS ERROR]', err);
    return false;
  }
}

/* =========================
   TEMPLATES
========================= */

function sendWelcome(member) {
  const message = `
سلام ${member.name} عزیز 🌿

به خانواده باشگاه آلفا خوش آمدی 💪

اینجا فقط تمرین نیست…
اینجا ساختن نسخه قوی‌تر خودته.

📅 پایان عضویت:
${toJalali(member.expiry_date)}

ما کنار تو هستیم تا آخر مسیر 🔥
  `.trim();

  return sendSMS({
    member_id: member.id,
    name: member.name,
    phone: member.phone,
    message,
    type: 'Welcome',
    status: 'mock',
  });
}

function sendRenewal(member, newDate) {
  const message = `
سلام ${member.name} عزیز 🌿

تمدیدت با موفقیت ثبت شد 👏

تو فقط عضویتت رو تمدید نکردی…
تو مسیر رشدتو ادامه دادی.

📅 تاریخ جدید پایان:
${toJalali(newDate)}

قدرت تو ادامه داره 💪
  `.trim();

  return sendSMS({
    member_id: member.id,
    name: member.name,
    phone: member.phone,
    message,
    type: 'SendRenewal',
    status: 'mock',
  });
}

function sendExpiryWarning(member) {
  const message = `
سلام ${member.name} عزیز ⚠️

عضویتت در حال پایان است.

این فقط یک تاریخ نیست…
این یک انتخابه بین توقف یا ادامه رشد 💪

باشگاه منتظر برگشت قوی‌تر توئه 🔥
  `.trim();

  return sendSMS({
    member_id: member.id,
    name: member.name,
    phone: member.phone,
    message,
    type: 'Exiry',
    status: 'mock',
  });
}

function sendBirthday(member) {
  const message = `
🎉 تولدت مبارک ${member.name} عزیز

امروز فقط یک روز نیست…
یادآور شروع یک مسیر بزرگه.

باشگاه آلفا برات آرزو می‌کنه:
انرژی 💪
سلامتی 🌿
و استمرار بی‌وقفه 🔥

امروز روز توئه 🌟
  `.trim();

  return sendSMS({
    member_id: member.id,
    name: member.name,
    phone: member.phone,
    message,
    type: 'birthday',
    status: 'mock',
  });
}

function sendAnnouncement(members, text) {
  members.forEach((m) => {
    const message = `
📢 اطلاعیه باشگاه آلفا

${text}

این فقط اطلاعیه نیست…
این بخشی از مسیر مشترک ماست 💪
    `.trim();

    sendSMS({
      member_id: m.id,
      name: m.name,
      phone: m.phone,
      message,
      status: 'mock',
    });
  });
}
function sendExpiryWarning(member, daysLeft) {
  const message = `
سلام ${member.name} عزیز 🌿

عضویت تو فقط ${daysLeft} روز دیگه تموم میشه.

این لحظه، لحظه تصمیمه...
ادامه دادن مسیر قدرت 💪 یا توقف؟

باشگاه آلفا منتظر ادامه مسیر رشد توئه.

📌 تاریخ پایان: ${toJalali(member.expiry_date)}

🔥 الان بهترین زمان تمدیده
`;

  return sendSMS({
    member_id: member.id,
    name: member.name,
    phone: member.phone,
    message,
    status: 'mock',
  });
}

/* =========================
   Anti-Duplicate Checker
========================= */
function hasSentToday(member_id, type) {
  const today = new Date().toISOString().split('T')[0];

  const row = db.prepare(`
    SELECT id FROM sms_logs
    WHERE member_id = ?
      AND type = ?
      AND date(created_at) = ?
    LIMIT 1
  `).get(member_id, type, today);

  return !!row;
}
/* =========================
   EXPORTS
========================= */

module.exports = {
  sendSMS,
  sendWelcome,
  sendRenewal,
  sendExpiryWarning,
  sendBirthday,
  sendAnnouncement,
};