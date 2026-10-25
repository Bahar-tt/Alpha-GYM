/** Public stats — no PII. Mount: require('./statsPublic')(app, db); */
module.exports = function registerPublicStats(app, db) {
  const cache = { value: null, at: 0 };
  const TTL = 60 * 1000;

  app.get('/stats/active-count', (_req, res) => {
    try {
      const now = Date.now();
      if (cache.value != null && now - cache.at < TTL) {
        return res.json({ active: cache.value });
      }
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM members WHERE date(expiry_date) >= date('now')")
        .get();
      const active = Number(row && row.n) || 0;
      cache.value = active;
      cache.at = now;
      res.json({ active });
    } catch (e) {
      console.error('[stats/active-count]', e);
      res.status(500).json({ active: 0 });
    }
  });
};
