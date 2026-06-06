const moment = require('jalali-moment');

function toJalali(date) {
  return moment(date, 'YYYY-MM-DD')
    .locale('fa')
    .format('YYYY/MM/DD');
}

function todayJalali() {
  return moment()
    .locale('fa')
    .format('YYYY/MM/DD');
}

module.exports = {
  toJalali,
  todayJalali,
};