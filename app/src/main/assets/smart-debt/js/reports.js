/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Financial Reports & Account Statement Generator + Offline Pie Chart
 */

const ReportService = (function() {
  'use strict';

  // Overall financial summary for dashboard
  function getDashboardSummary(period = 'all') {
    const customers = CustomerService.getCustomers('all');
    let transactions = AppDatabase.getTransactions().filter(t => t.status !== 'cancelled');
    const remittances = AppDatabase.getRemittances();

    // Filter by period
    if (period !== 'all') {
      const dates = getPeriodDateRange(period);
      if (dates.start) {
        transactions = transactions.filter(t => t.date >= dates.start && t.date <= dates.end);
      }
    }

    let totalDebts = 0;
    let totalPayments = 0;

    for (const tx of transactions) {
      const amt = ValidationService.parseAmount(tx.amount);
      if (tx.type === 'debt' || (tx.type === 'opening' && amt >= 0)) {
        totalDebts += Math.abs(amt);
      } else if (tx.type === 'payment' || (tx.type === 'opening' && amt < 0)) {
        totalPayments += Math.abs(amt);
      }
    }

    totalDebts = Math.round(totalDebts * 100) / 100;
    totalPayments = Math.round(totalPayments * 100) / 100;
    const totalRemaining = Math.round((totalDebts - totalPayments) * 100) / 100;

    let totalCustomers = customers.length;
    let debtorsCount = 0;
    let settledCount = 0;

    for (const c of customers) {
      if (c.balance > 0) debtorsCount++;
      else if (c.balance === 0 && c.totalDebts > 0) settledCount++;
    }

    return {
      totalDebts,
      totalPayments,
      totalRemaining,
      totalCustomers,
      debtorsCount,
      settledCount,
      recentTransactions: transactions.slice(0, 10),
      recentRemittances: remittances.slice(0, 5)
    };
  }

  // Helper for period dates with custom date range support
  function getPeriodDateRange(period, customStart = '', customEnd = '') {
    if (period === 'custom') {
      return { 
        start: customStart || '', 
        end: customEnd || '' 
      };
    }

    const today = new Date();
    const end = ValidationService.formatDate(today);
    let start = '';

    if (period === 'today') {
      start = end;
    } else if (period === 'week') {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      start = ValidationService.formatDate(d);
    } else if (period === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      start = ValidationService.formatDate(d);
    } else if (period === 'year') {
      const d = new Date(today.getFullYear(), 0, 1);
      start = ValidationService.formatDate(d);
    }

    return { start, end };
  }

  // Calculate balance distribution by customer category for Pie Chart
  function getCategoryBalanceDistribution() {
    const customers = CustomerService.getCustomers('debtors');
    const settings = AppDatabase.getSettings();
    const currency = settings.currency || 'ر.ي';

    const categoriesMap = {
      'عميل عادي': { label: 'عميل عادي', color: '#0284C7', balance: 0, count: 0 },
      'VIP': { label: 'عميل VIP', color: '#7C3AED', balance: 0, count: 0 },
      'متعثر': { label: 'عميل متعثر', color: '#DC2626', balance: 0, count: 0 }
    };

    let totalOutstanding = 0;

    for (const c of customers) {
      if (c.balance <= 0) continue;
      totalOutstanding += c.balance;

      let catKey = 'عميل عادي';
      const cCat = (c.category || '').trim();
      if (cCat === 'VIP' || cCat === 'عميل VIP' || cCat.toUpperCase() === 'VIP') {
        catKey = 'VIP';
      } else if (cCat === 'متعثر' || cCat === 'عميل متعثر' || cCat === 'ديون متعثرة') {
        catKey = 'متعثر';
      } else if (categoriesMap[cCat]) {
        catKey = cCat;
      } else if (cCat) {
        // Dynamic custom category
        categoriesMap[cCat] = { label: cCat, color: '#10B981', balance: 0, count: 0 };
        catKey = cCat;
      }

      categoriesMap[catKey].balance += c.balance;
      categoriesMap[catKey].count += 1;
    }

    totalOutstanding = Math.round(totalOutstanding * 100) / 100;

    const segments = [];
    for (const key of Object.keys(categoriesMap)) {
      const item = categoriesMap[key];
      const bal = Math.round(item.balance * 100) / 100;
      const pct = totalOutstanding > 0 ? Math.round((bal / totalOutstanding) * 1000) / 10 : 0;
      segments.push({
        id: key,
        label: item.label,
        color: item.color,
        balance: bal,
        count: item.count,
        percentage: pct
      });
    }

    return {
      totalOutstanding,
      currency,
      debtorsCount: customers.length,
      segments
    };
  }

  // Render SVG Pie / Donut Chart HTML component (100% offline vector graphics)
  function renderCategoryPieChartHtml() {
    const dist = getCategoryBalanceDistribution();
    const activeSegments = dist.segments.filter(s => s.balance > 0);

    if (dist.totalOutstanding <= 0 || activeSegments.length === 0) {
      return `
        <div class="card" style="margin-bottom: 16px; text-align: center; padding: 24px 16px;">
          <div style="font-size: 36px; margin-bottom: 8px;">📊</div>
          <h3 style="font-size: 15px; color: var(--color-primary-dark); margin-bottom: 4px;">توزيع الأرصدة حسب الفئة (Pie Chart)</h3>
          <p style="font-size: 13px; color: var(--color-text-muted); margin: 0;">لا توجد ديون أو أرصدة مستحقة حالياً لعرض الرسم البياني.</p>
        </div>
      `;
    }

    const cx = 110;
    const cy = 110;
    const rOuter = 90;
    const rInner = 52;
    let currentAngle = -Math.PI / 2; // Start from top 12 o'clock

    let pathsSvg = '';

    if (activeSegments.length === 1) {
      // Single category 100% donut ring
      const seg = activeSegments[0];
      pathsSvg = `
        <circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="${seg.color}" stroke-width="${rOuter - rInner}" />
      `;
    } else {
      for (const seg of activeSegments) {
        const sliceAngle = (seg.balance / dist.totalOutstanding) * (2 * Math.PI);
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        currentAngle = endAngle;

        const x1 = cx + rOuter * Math.cos(startAngle);
        const y1 = cy + rOuter * Math.sin(startAngle);
        const x2 = cx + rOuter * Math.cos(endAngle);
        const y2 = cy + rOuter * Math.sin(endAngle);

        const x3 = cx + rInner * Math.cos(endAngle);
        const y3 = cy + rInner * Math.sin(endAngle);
        const x4 = cx + rInner * Math.cos(startAngle);
        const y4 = cy + rInner * Math.sin(startAngle);

        const largeArc = sliceAngle > Math.PI ? 1 : 0;

        const pathData = [
          `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
          `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
          `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
          `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
          'Z'
        ].join(' ');

        pathsSvg += `
          <path d="${pathData}" fill="${seg.color}" stroke="#FFFFFF" stroke-width="2">
            <title>${seg.label}: ${ValidationService.formatMoney(seg.balance, dist.currency)} (${seg.percentage}%)</title>
          </path>
        `;
      }
    }

    const legendItemsHtml = dist.segments.map(s => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--color-divider); font-size: 13px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: ${s.color};"></span>
          <span style="font-weight: 600; color: var(--color-text-main);">${s.label}</span>
          <span class="badge" style="background: var(--color-bg); font-size: 11px; padding: 2px 6px;">${s.count} عميل</span>
        </div>
        <div style="text-align: left;">
          <span style="font-weight: 700; color: var(--color-primary-dark);">${ValidationService.formatMoney(s.balance, dist.currency)}</span>
          <span style="font-size: 11px; color: var(--color-text-muted); margin-right: 4px;">(${s.percentage}%)</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header" style="padding-bottom: 8px;">
          <div class="card-title">📊 توزيع الأرصدة والديون حسب فئة العملاء (Pie Chart)</div>
          <span class="badge badge-info">${dist.debtorsCount} عميل مدين</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: center; padding: 10px 0;">
          <!-- SVG Pie Chart Canvas -->
          <div style="display: flex; justify-content: center; align-items: center;">
            <svg width="220" height="220" viewBox="0 0 220 220" style="max-width: 100%; height: auto; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.08));">
              ${pathsSvg}
              <!-- Center Summary Text inside Donut -->
              <circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="#FFFFFF" />
              <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11" fill="#64748B" font-family="system-ui, sans-serif" font-weight="600">إجمالي الأرصدة</text>
              <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="13" fill="#103B59" font-family="system-ui, sans-serif" font-weight="800">${ValidationService.formatMoney(dist.totalOutstanding, dist.currency)}</text>
            </svg>
          </div>
          <!-- Legend Breakdown -->
          <div style="display: flex; flex-direction: column; justify-content: center;">
            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 600;">
              تفاصيل المستحقات المالية ونسبتها من إجمالي الديون:
            </div>
            ${legendItemsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Generate Customer Detailed Account Statement
  function generateCustomerStatement(customerId, startDate = null, endDate = null) {
    const customer = CustomerService.getCustomerById(customerId);
    if (!customer) throw new Error('العميل غير موجود.');

    let txs = AppDatabase.getTransactions()
      .filter(t => t.customerId === customerId && t.status !== 'cancelled');

    // Chronological sorting (oldest first for running balance)
    txs.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.createdAt || '').localeCompare(a.createdAt || '');
    });

    let runningBalance = 0;
    const statementRows = [];
    let periodDebts = 0;
    let periodPayments = 0;

    for (const tx of txs) {
      const amt = ValidationService.parseAmount(tx.amount);
      let debit = 0;
      let credit = 0;

      if (tx.type === 'debt' || (tx.type === 'opening' && amt >= 0)) {
        debit = Math.abs(amt);
        runningBalance += debit;
      } else if (tx.type === 'payment' || (tx.type === 'opening' && amt < 0)) {
        credit = Math.abs(amt);
        runningBalance -= credit;
      }

      runningBalance = Math.round(runningBalance * 100) / 100;

      // Check date bounds
      const inDateRange = (!startDate || tx.date >= startDate) && (!endDate || tx.date <= endDate);
      if (inDateRange) {
        periodDebts += debit;
        periodPayments += credit;

        let linkedDetail = null;
        if (tx.type === 'payment' && tx.linkedDebtId) {
          const target = txs.find(t => t.id === tx.linkedDebtId);
          if (target) {
            linkedDetail = {
              ref: target.reference || target.date,
              debtAmount: target.amount
            };
          }
        }

        statementRows.push({
          id: tx.id,
          date: tx.date,
          type: tx.type,
          typeLabel: tx.type === 'debt' ? 'دين' : (tx.type === 'payment' ? 'دفعة' : 'قيد افتتاحي'),
          debit: debit,
          credit: credit,
          balanceAfter: runningBalance,
          dueDate: tx.dueDate || null,
          reference: tx.reference || '-',
          notes: tx.notes || '-',
          linkedDebtId: tx.linkedDebtId || null,
          linkedDetail
        });
      }
    }

    return {
      customer,
      startDate: startDate || (txs.length ? txs[0].date : ValidationService.formatDate()),
      endDate: endDate || ValidationService.formatDate(),
      periodDebts,
      periodPayments,
      finalBalance: customer.balance,
      rows: statementRows
    };
  }

  // Export any tabular data to CSV with UTF-8 BOM (proper Arabic support in Excel)
  function exportToCsv(filename, headers, rows) {
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',') + '\r\n';

    for (const row of rows) {
      const rowLine = row.map(val => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
      csvContent += rowLine + '\r\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Native Bridge fallback or Web download
    if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.saveFile === 'function') {
      const reader = new FileReader();
      reader.onload = function() {
        const base64 = reader.result.split(',')[1];
        window.AndroidNativeBridge.saveFile(filename, base64, 'text/csv');
      };
      reader.readAsDataURL(blob);
      return;
    }

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 500);
  }

  return {
    getDashboardSummary,
    getPeriodDateRange,
    getCategoryBalanceDistribution,
    renderCategoryPieChartHtml,
    generateCustomerStatement,
    exportToCsv
  };
})();

if (typeof window !== 'undefined') {
  window.ReportService = ReportService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportService;
}
