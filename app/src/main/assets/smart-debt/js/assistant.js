/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Smart Local Assistant (المساعد الذكي المحلي)
 * Purely local, rule-based accounting & data integrity diagnostics.
 */

const AssistantService = (function() {
  'use strict';

  function runAudit() {
    const customers = CustomerService.getCustomers('all');
    const transactions = AppDatabase.getTransactions();
    const remittances = AppDatabase.getRemittances();

    const insights = [];

    // 1. Phone number diagnostics
    const phoneMap = {};
    const duplicatePhones = [];
    const invalidPhones = [];

    customers.forEach(c => {
      if (!c.phone) {
        // missing phone
      } else {
        const norm = ValidationService.normalizePhone(c.phone);
        if (!ValidationService.isValidPhone(c.phone)) {
          invalidPhones.push({ customer: c, phone: c.phone });
        }

        if (norm) {
          if (!phoneMap[norm]) phoneMap[norm] = [];
          phoneMap[norm].push(c);
        }
      }
    });

    for (const [normPhone, list] of Object.entries(phoneMap)) {
      if (list.length > 1) {
        duplicatePhones.push({ phone: normPhone, list });
      }
    }

    if (duplicatePhones.length > 0) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: `اكتشاف أرقام هواتف مكررة (${duplicatePhones.length})`,
        description: `يوجد أكثر من عميل مسجلين بنفس رقم الهاتف. يرجى مراجعة بياناتهم والتأكد من تمييز كل عميل.`,
        details: duplicatePhones.map(d => `${d.list.map(c => c.name).join(' و ')} (هاتف: ${d.phone})`)
      });
    }

    if (invalidPhones.length > 0) {
      insights.push({
        type: 'info',
        icon: '📱',
        title: `أرقام هواتف بحاجة لتصحيح (${invalidPhones.length})`,
        description: `توجد أرقام هواتف غير مطابقة للتنسيق القياسي (أقل من 7 أرقام أو تحتوي رموز غير مناسبة).`,
        details: invalidPhones.map(i => `${i.customer.name}: ${i.phone}`)
      });
    }

    // 2. Overdue Debts check (ديون متجاوزة لتاريخ الاستحقاق)
    const overdueDebtsData = getOverdueDebts();
    if (overdueDebtsData.count > 0) {
      const settings = AppDatabase.getSettings();
      insights.push({
        type: 'danger',
        icon: '⏰',
        title: `تنبيه: ديون متجاوزة لتاريخ الاستحقاق (${overdueDebtsData.count})`,
        description: `توجد ${overdueDebtsData.count} ديون تجاوزت موعد سدادها المحدد بإجمالي قدره ${ValidationService.formatMoney(overdueDebtsData.totalOverdueAmount, settings.currency)}. يرجى المتابعة العاجلة.`,
        details: overdueDebtsData.items.map(o => `${o.customerIcon} ${o.customerName}: دين قدره ${ValidationService.formatMoney(o.debtAmount, settings.currency)} (استحق بتاريخ ${o.dueDate} - متأخر ${o.overdueDays} يوم)`)
      });
    }

    // 3. Top Debtors ranking
    const debtors = customers.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance);
    if (debtors.length > 0) {
      const top3 = debtors.slice(0, 3);
      const settings = AppDatabase.getSettings();
      insights.push({
        type: 'highlight',
        icon: '💰',
        title: `أعلى العملاء مديونية (${debtors.length} عملاء)`,
        description: `يشكل كبار المدينين الحصة الأكبر من ديونك المستحقة. يُنصح بإرسال رسائل تذكير لطيفة لهم.`,
        details: top3.map(c => `${c.icon || '👤'} ${c.name}: ${ValidationService.formatMoney(c.balance, settings.currency)}`)
      });
    }

    // 4. Negative balances detection
    const creditors = customers.filter(c => c.balance < 0);
    if (creditors.length > 0) {
      insights.push({
        type: 'danger',
        icon: '🛑',
        title: `تنبيه: أرصدة دائنة / سالبة (${creditors.length})`,
        description: `يوجد عملاء لديهم رصيد سالب (مسدد أكثر من الدين أو قيد مستورد). يجب مراجعة سجل عملياتهم لتصحيح القيود.`,
        details: creditors.map(c => `${c.icon || '👤'} ${c.name}: رصيد ${c.balance}`)
      });
    }

    // 5. Remittances check
    const unrecordedRemittances = remittances.filter(r => r.matchingStatus !== 'recorded_as_payment');
    if (unrecordedRemittances.length > 0) {
      insights.push({
        type: 'info',
        icon: '💸',
        title: `حوالات واردة بانتظار التأكيد (${unrecordedRemittances.length})`,
        description: `توجد حوالات مسجلة لم يتم ترحيلها بعد كدفعات لحسابات العملاء.`,
        details: unrecordedRemittances.map(r => `${r.company} - ${r.amount} (${r.senderName || 'بدون اسم'})`)
      });
    }

    // 6. Collection Rate
    let totalD = 0;
    let totalP = 0;
    transactions.filter(t => t.status !== 'cancelled').forEach(t => {
      const amt = ValidationService.parseAmount(t.amount);
      if (t.type === 'debt' || (t.type === 'opening' && amt >= 0)) totalD += Math.abs(amt);
      else if (t.type === 'payment' || (t.type === 'opening' && amt < 0)) totalP += Math.abs(amt);
    });

    const collectionRate = totalD > 0 ? Math.round((totalP / totalD) * 100) : 100;
    insights.push({
      type: 'success',
      icon: '📊',
      title: `معدل التحصيل المالي: ${collectionRate}%`,
      description: `تم تحصيل ${collectionRate}% من إجمالي المبالغ المسجلة في النظام. كفاءة التحصيل الحالية ممتازة.`,
      details: [`إجمالي الديون: ${totalD}`, `إجمالي المحصل: ${totalP}`]
    });

    return insights;
  }

  // Discovers debts that have passed their due date
  function getOverdueDebts(refDate = null) {
    const todayStr = refDate || ValidationService.formatDate();
    const transactions = AppDatabase.getTransactions();
    const customersMap = {};
    AppDatabase.getCustomers().forEach(c => {
      customersMap[c.id] = c;
    });

    const overdueList = [];
    let totalOverdueAmount = 0;

    for (const tx of transactions) {
      if (tx.status === 'cancelled') continue;
      if (tx.type !== 'debt') continue;
      if (!tx.dueDate) continue;

      if (tx.dueDate < todayStr) {
        // Check if customer still has positive balance
        const customer = customersMap[tx.customerId];
        if (!customer) continue;
        const metrics = CustomerService.getCustomerMetrics(customer.id);
        if (metrics.balance > 0) {
          const diffMs = new Date(todayStr).getTime() - new Date(tx.dueDate).getTime();
          const overdueDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
          
          overdueList.push({
            transactionId: tx.id,
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerIcon: customer.icon || '👤',
            customerCategory: customer.category || 'عميل عادي',
            debtAmount: tx.amount,
            currentBalance: metrics.balance,
            txDate: tx.date,
            dueDate: tx.dueDate,
            overdueDays: overdueDays,
            reference: tx.reference || '-'
          });
          totalOverdueAmount += tx.amount;
        }
      }
    }

    // Sort by most overdue first
    overdueList.sort((a, b) => b.overdueDays - a.overdueDays);

    return {
      count: overdueList.length,
      overdueCount: overdueList.length,
      totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
      overdueTotal: Math.round(totalOverdueAmount * 100) / 100,
      items: overdueList
    };
  }

  // ==========================================
  // AI Financial Health Score & Cashflow Forecast
  // ==========================================
  function getFinancialHealthScore() {
    const customers = CustomerService.getCustomers('all');
    const transactions = AppDatabase.getTransactions().filter(t => t.status !== 'cancelled');
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    let totalDebts = 0;
    let totalPayments = 0;
    transactions.forEach(t => {
      const amt = ValidationService.parseAmount(t.amount);
      if (t.type === 'debt' || (t.type === 'opening' && amt >= 0)) totalDebts += Math.abs(amt);
      else if (t.type === 'payment' || (t.type === 'opening' && amt < 0)) totalPayments += Math.abs(amt);
    });

    const overdueData = getOverdueDebts();
    const totalOverdue = overdueData.totalOverdueAmount;

    // Metric 1: Collection efficiency (0 - 45 points)
    const collectionRate = totalDebts > 0 ? (totalPayments / totalDebts) : 1;
    const collectionPoints = Math.min(45, Math.round(collectionRate * 45));

    // Metric 2: Overdue ratio (0 - 35 points, less overdue is better)
    const remainingDebts = Math.max(0, totalDebts - totalPayments);
    const overdueRatio = remainingDebts > 0 ? (totalOverdue / remainingDebts) : 0;
    const overduePoints = Math.max(0, Math.round(35 * (1 - Math.min(1, overdueRatio))));

    // Metric 3: Customer diversification (0 - 20 points)
    const activeDebtors = customers.filter(c => c.balance > 0).length;
    const diversityPoints = Math.min(20, activeDebtors * 2);

    const totalScore = Math.min(100, Math.max(10, collectionPoints + overduePoints + diversityPoints));

    let level = 'ممتاز 🌟';
    let color = '#10B981';
    let badgeClass = 'badge-payment';
    if (totalScore < 50) {
      level = 'حرج بحاجة لتدخل ⚠️';
      color = '#EF4444';
      badgeClass = 'badge-debt';
    } else if (totalScore < 75) {
      level = 'جيد ومستقر ⚖️';
      color = '#F59E0B';
      badgeClass = 'badge-warning';
    }

    // Cashflow projection for upcoming 7, 14, 30 days
    const today = new Date();
    const forecast = {
      next7Days: 0,
      next14Days: 0,
      next30Days: 0
    };

    transactions.forEach(t => {
      if (t.type === 'debt' && t.dueDate) {
        const due = new Date(t.dueDate);
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) forecast.next7Days += t.amount;
        if (diffDays >= 0 && diffDays <= 14) forecast.next14Days += t.amount;
        if (diffDays >= 0 && diffDays <= 30) forecast.next30Days += t.amount;
      }
    });

    return {
      score: totalScore,
      level,
      color,
      badgeClass,
      collectionRate: Math.round(collectionRate * 100),
      totalOverdue,
      remainingDebts,
      activeDebtors,
      forecast
    };
  }

  // ==========================================
  // AI Customer Credit Risk Evaluation
  // ==========================================
  function getCustomerRiskProfile(customerId) {
    const customer = CustomerService.getCustomerById(customerId);
    if (!customer) return null;

    const txs = AppDatabase.getTransactions().filter(t => t.customerId === customerId && t.status !== 'cancelled');
    const balance = customer.balance;

    if (balance <= 0) {
      return {
        level: 'low',
        rating: 'منخفض المخاطر 🟢',
        score: 95,
        badgeClass: 'badge-payment',
        advice: 'عميل ملتزم ومسدد لكافة مستحقاته. مؤهل لمنحه تسهيلات ائتمانية إضافية.'
      };
    }

    let overdueCount = 0;
    const todayStr = ValidationService.formatDate();
    txs.forEach(t => {
      if (t.type === 'debt' && t.dueDate && t.dueDate < todayStr) overdueCount++;
    });

    const paymentRatio = customer.totalDebts > 0 ? (customer.totalPayments / customer.totalDebts) : 0;

    if (overdueCount > 0 || paymentRatio < 0.25) {
      return {
        level: 'high',
        rating: 'عالي المخاطر 🔴',
        score: 35,
        badgeClass: 'badge-debt',
        advice: 'تأخر متكرر في السداد أو تراكم ديون بدون دفعات منتظمة. يُنصح بوقف البيع الآجل وتحصيل الرصيد أولاً.'
      };
    }

    if (paymentRatio < 0.6) {
      return {
        level: 'medium',
        rating: 'متوسط المخاطر 🟡',
        score: 65,
        badgeClass: 'badge-warning',
        advice: 'يسدد دفعات جزئية بشكل متقطع. يُفضل المتابعة الودية وتحديد مواعيد استحقاق واضحة.'
      };
    }

    return {
      level: 'low',
      rating: 'منخفض المخاطر 🟢',
      score: 88,
      badgeClass: 'badge-payment',
      advice: 'حساب نشط وملتزم بالدفعات الدورية.'
    };
  }

  // ==========================================
  // AI Smart Reminder Text Generator
  // ==========================================
  function generateSmartReminder(customerId, tone = 'polite') {
    const customer = CustomerService.getCustomerById(customerId);
    if (!customer) return '';
    const settings = AppDatabase.getSettings();
    const cur = customer.currency || settings.currency || 'ر.ي';
    const formattedBalance = ValidationService.formatMoney(customer.balance, cur);
    const dateStr = ValidationService.formatDate();

    if (tone === 'urgent') {
      return `الأخ المحترم ${customer.name}، نود إحاطتكم بضرورة سرعة سداد الرصيد المستحق وقدره (${formattedBalance}) لتجاوز موعد الاستحقاق. شاكرين مبادرتكم الكريمة. - ${settings.appTitle}`;
    }

    if (tone === 'friendly') {
      return `مرحباً ${customer.name} 🌹، نذكركم بمحبة برصيد حسابكم الحالي وقدره (${formattedBalance}) حتى تاريخ ${dateStr}. يسعدنا دوماً التعامل معكم.`;
    }

    // Default: polite standard
    return `الأخ العزيز ${customer.name}، نود تذكيركم بأن الرصيد المتبقي بحسابكم هو (${formattedBalance}) حتى تاريخ ${dateStr}. نسعد بسدادكم في أقرب فرصة ودمتم بود.`;
  }

  return {
    runAudit,
    getOverdueDebts,
    getFinancialHealthScore,
    getCustomerRiskProfile,
    generateSmartReminder
  };
})();

window.AssistantService = AssistantService;
