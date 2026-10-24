/** Minimal coachEarnings stubs — full engine can be restored later */
const DEFAULT_SHARE_PERCENT = 50;
const normalizeSportName = (s) => String(s || '').trim();
const canonicalSport = normalizeSportName;
const coachesForSport = () => [];
const isoDate = (d) => (d ? String(d).slice(0, 10) : null);
const periodOf = () => null;
const earnFromSession = () => null;
const revokeSessionEarnings = () => null;
const accrueMonthlySalary = () => null;
const summarizeCoach = () => ({});
const setSessionSplits = () => null;
const getSessionSplits = () => [];
const addAdjustment = () => null;
const deleteAdjustment = () => null;
const listAdjustments = () => [];
const settleCoach = () => null;
const settlementDetail = () => null;
const cancelSettlement = () => null;
const coachProfitability = () => ({});
const sportProfitability = () => ({});
const forecastMonth = () => ({});
const planUtilization = () => ({});

module.exports = {
  DEFAULT_SHARE_PERCENT,
  normalizeSportName,
  canonicalSport,
  coachesForSport,
  isoDate,
  periodOf,
  earnFromSession,
  revokeSessionEarnings,
  accrueMonthlySalary,
  summarizeCoach,
  setSessionSplits,
  getSessionSplits,
  addAdjustment,
  deleteAdjustment,
  listAdjustments,
  settleCoach,
  settlementDetail,
  cancelSettlement,
  coachProfitability,
  sportProfitability,
  forecastMonth,
  planUtilization,
};
