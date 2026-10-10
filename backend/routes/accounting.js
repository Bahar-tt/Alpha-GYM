/**
 * حسابداری باشگاه — درآمد رشته‌ها، سهم مربی، پرداخت‌ها، هزینه‌ها، گردش حساب
 */

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function registerAccountingRoutes(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      direction TEXT NOT NULL DEFAULT 'in',
      member_id INTEGER,
      coach_id INTEGER,
      title TEXT,
      notes TEXT,
      paid_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      spent_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  function buildSummary() {
    const today = todayIso();
    const members = db.prepare('SELECT * FROM members').all();
    const coaches = db.prepare('SELECT * FROM coaches').all();
    const coachMap = new Map(coaches.map((c) => [c.id, c]));

    const activeMembers = members.filter((m) => m.expiry_date >= today);

    // درآمد بالقوه ماهانه از شهریه اعضا
    let totalMonthlyRevenue = 0;
    let totalCoachShare = 0;
    const bySpecialty = {};
    const byCoach = {};

    for (const m of activeMembers) {
      const fee = Number(m.monthly_fee) || 0;
      totalMonthlyRevenue += fee;

      const coach = m.coach_id ? coachMap.get(m.coach_id) : null;
      const specialty = (coach && coach.specialty) || 'بدون رشته';
      const pct =
        Number(m.coach_commission_percent) ||
        (coach ? Number(coach.commission_percent) : 0) ||
        0;
      const share = (fee * pct) / 100;
      totalCoachShare += share;

      if (!bySpecialty[specialty]) {
        bySpecialty[specialty] = { specialty, revenue: 0, members: 0, coach_share: 0 };
      }
      bySpecialty[specialty].revenue += fee;
      bySpecialty[specialty].members += 1;
      bySpecialty[specialty].coach_share += share;

      const cName = (coach && coach.full_name) || m.coach_name || 'بدون مربی';
      const cKey = coach ? String(coach.id) : 'none';
      if (!byCoach[cKey]) {
        byCoach[cKey] = {
          coach_id: coach ? coach.id : null,
          coach_name: cName,
          specialty: specialty,
          revenue: 0,
          members: 0,
          commission_percent: pct,
          coach_share: 0,
        };
      }
      byCoach[cKey].revenue += fee;
      byCoach[cKey].members += 1;
      byCoach[cKey].coach_share += share;
    }

    const payments = db.prepare('SELECT * FROM payments ORDER BY paid_at DESC, id DESC').all();
    const expenses = db.prepare('SELECT * FROM expenses ORDER BY spent_at DESC, id DESC').all();

    const paymentsIn = payments
      .filter((p) => p.direction === 'in')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paymentsOut = payments
      .filter((p) => p.direction === 'out')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // گردش حساب واقعی از پرداخت‌ها و هزینه‌ها
    const cashIn = paymentsIn;
    const cashOut = paymentsOut + totalExpenses;
    const netBalance = cashIn - cashOut;

    // سود بالقوه ماهانه = درآمد شهریه − سهم مربیان
    const potentialNet = totalMonthlyRevenue - totalCoachShare;

    // گردش ترکیبی: لیست زمانی
    const ledger = [];
    payments.forEach((p) => {
      ledger.push({
        id: `p-${p.id}`,
        kind: 'payment',
        direction: p.direction,
        amount: Number(p.amount) || 0,
        title: p.title || (p.type === 'coach_payout' ? 'پرداخت سهم مربی' : p.type),
        date: p.paid_at,
        meta: p,
      });
    });
    expenses.forEach((e) => {
      ledger.push({
        id: `e-${e.id}`,
        kind: 'expense',
        direction: 'out',
        amount: Number(e.amount) || 0,
        title: e.title,
        date: e.spent_at,
        meta: e,
      });
    });
    ledger.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return {
      totals: {
        monthly_revenue: totalMonthlyRevenue,
        coach_share: totalCoachShare,
        potential_net: potentialNet,
        payments_in: paymentsIn,
        payments_out: paymentsOut,
        expenses: totalExpenses,
        cash_in: cashIn,
        cash_out: cashOut,
        net_balance: netBalance,
        active_members: activeMembers.length,
      },
      by_specialty: Object.values(bySpecialty).sort((a, b) => b.revenue - a.revenue),
      by_coach: Object.values(byCoach).sort((a, b) => b.coach_share - a.coach_share),
      payments,
      expenses,
      ledger: ledger.slice(0, 100),
    };
  }

  app.get('/accounting/summary', (_req, res) => {
    try {
      res.json(buildSummary());
    } catch (err) {
      console.error('GET /accounting/summary', err);
      res.status(500).json({ error: 'Failed to build accounting summary' });
    }
  });

  app.get('/accounting/payments', (_req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM payments ORDER BY paid_at DESC, id DESC').all());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list payments' });
    }
  });

  app.post('/accounting/payments', (req, res) => {
    const { type, amount, direction, member_id, coach_id, title, notes, paid_at } = req.body || {};
    if (!type || amount == null) {
      return res.status(400).json({ error: 'type و amount الزامی است' });
    }
    const dir = direction === 'out' ? 'out' : 'in';
    try {
      const result = db
        .prepare(`
          INSERT INTO payments (type, amount, direction, member_id, coach_id, title, notes, paid_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          String(type).trim(),
          Number(amount) || 0,
          dir,
          member_id != null ? Number(member_id) : null,
          coach_id != null ? Number(coach_id) : null,
          title ? String(title).trim() : null,
          notes ? String(notes).trim() : null,
          paid_at ? String(paid_at).trim() : todayIso(),
        );
      const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  app.delete('/accounting/payments/:id', (req, res) => {
    try {
      const r = db.prepare('DELETE FROM payments WHERE id = ?').run(Number(req.params.id));
      if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete payment' });
    }
  });

  app.get('/accounting/expenses', (_req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM expenses ORDER BY spent_at DESC, id DESC').all());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list expenses' });
    }
  });

  app.post('/accounting/expenses', (req, res) => {
    const { category, title, amount, notes, spent_at } = req.body || {};
    if (!title || amount == null) {
      return res.status(400).json({ error: 'title و amount الزامی است' });
    }
    try {
      const result = db
        .prepare(`
          INSERT INTO expenses (category, title, amount, notes, spent_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          category ? String(category).trim() : 'عمومی',
          String(title).trim(),
          Number(amount) || 0,
          notes ? String(notes).trim() : null,
          spent_at ? String(spent_at).trim() : todayIso(),
        );
      const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  });

  app.delete('/accounting/expenses/:id', (req, res) => {
    try {
      const r = db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
      if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });
}

module.exports = { registerAccountingRoutes };
