/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Device Calendar & Notification Scheduler (جدولة تنبيهات التقويم المحلي)
 * Enables scheduling alarms & calendar reminders for debt due dates even if the app is closed.
 */

const NotificationScheduler = (function() {
  'use strict';

  // Format Date for iCalendar (YYYYMMDDTHHMMSSZ or YYYYMMDD)
  function formatIcsDate(dateObj) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = dateObj.getFullYear();
    const m = pad(dateObj.getMonth() + 1);
    const d = pad(dateObj.getDate());
    const h = pad(dateObj.getHours());
    const min = pad(dateObj.getMinutes());
    const s = pad(dateObj.getSeconds());
    return `${y}${m}${d}T${h}${min}${s}`;
  }

  // Generate standard RFC 5545 iCalendar (.ics) string with VALARM reminder
  function generateIcs(events) {
    const nowStr = formatIcsDate(new Date()) + 'Z';
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SmartDebtManagerProSMS//CalendarScheduler//AR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:مواعيد استحقاق ديون - مدير الديون الذكي برو'
    ];

    events.forEach(evt => {
      const uid = evt.id || ('debt-remind-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6));
      let startDate = new Date();
      if (evt.dueDate) {
        const parts = evt.dueDate.split('-');
        if (parts.length === 3) {
          startDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 9, 0, 0);
        }
      } else {
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(9, 0, 0, 0);
      }

      const endDate = new Date(startDate.getTime() + (60 * 60 * 1000)); // 1 hour duration
      const dtStart = formatIcsDate(startDate);
      const dtEnd = formatIcsDate(endDate);

      const summary = evt.title || `سداد دين: ${evt.customerName} (${evt.amount} ${evt.currency || 'ر.ي'})`;
      const description = [
        `تذكير بموعد استحقاق دين للعميل: ${evt.customerName}`,
        `المبلغ المستحق: ${evt.amount} ${evt.currency || 'ر.ي'}`,
        evt.phone ? `هاتف العميل: ${evt.phone}` : '',
        evt.notes ? `البيان: ${evt.notes}` : '',
        'تطبيق مدير الديون الذكي برو SMS'
      ].filter(Boolean).join('\\n');

      ics.push(
        'BEGIN:VEVENT',
        `UID:${uid}@smartdebtmanager.pro`,
        `DTSTAMP:${nowStr}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:تذكير بموعد سداد دين: ${evt.customerName}`,
        'END:VALARM',
        'END:VEVENT'
      );
    });

    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
  }

  // Trigger download / open of .ics file
  function openIcsFile(icsContent, filename = 'debt-reminder.ics') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  // Generate Google Calendar direct URL
  function getGoogleCalendarUrl(evt) {
    let startDate = new Date();
    if (evt.dueDate) {
      const parts = evt.dueDate.split('-');
      if (parts.length === 3) {
        startDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 9, 0, 0);
      }
    }
    const endDate = new Date(startDate.getTime() + (60 * 60 * 1000));
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    
    const title = encodeURIComponent(evt.title || `سداد دين: ${evt.customerName} (${evt.amount} ${evt.currency || 'ر.ي'})`);
    const details = encodeURIComponent(`العميل: ${evt.customerName}\nالمبلغ: ${evt.amount} ${evt.currency || 'ر.ي'}\n${evt.notes || ''}`);
    const dates = `${fmt(startDate)}/${fmt(endDate)}`;
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
  }

  // Schedule a single debt reminder in device calendar
  function scheduleDebtReminder(info) {
    const {
      customerName = 'عميل',
      amount = 0,
      currency = 'ر.ي',
      dueDate = '',
      notes = '',
      phone = '',
      title = ''
    } = info;

    if (!dueDate) {
      throw new Error('يرجى تحديد تاريخ استحقاق الدين لجدولته في تقويم الهاتف.');
    }

    // 1. Android Native Bridge integration
    if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.scheduleCalendarReminder === 'function') {
      try {
        const success = window.AndroidNativeBridge.scheduleCalendarReminder(
          title || `سداد دين: ${customerName}`,
          notes,
          dueDate,
          parseFloat(amount) || 0,
          currency,
          customerName
        );
        if (success) {
          return { method: 'android_calendar', success: true };
        }
      } catch (e) {
        console.warn('Native calendar intent failed, falling back to .ics', e);
      }
    }

    // 2. Web / Browser PWA: download .ics calendar file
    const icsContent = generateIcs([{
      customerName,
      amount,
      currency,
      dueDate,
      notes,
      phone,
      title
    }]);

    openIcsFile(icsContent, `تذكير_دين_${customerName}_${dueDate}.ics`);

    // Request notification permission if available
    requestNotificationPermission();

    return { method: 'ics_calendar', success: true };
  }

  // Schedule all upcoming/overdue debts at once
  function scheduleAllUpcomingDebts() {
    const overdueData = AssistantService.getOverdueDebts();
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    const events = [];
    const transactions = AppDatabase.getTransactions();
    const customers = CustomerService.getCustomers('all');
    const custMap = {};
    customers.forEach(c => { custMap[c.id] = c; });

    transactions.forEach(tx => {
      if (tx.status === 'cancelled' || tx.type !== 'debt' || !tx.dueDate) return;
      const c = custMap[tx.customerId];
      if (!c || c.balance <= 0) return;

      const custCur = c.effectiveCurrency || c.currency || cur;
      events.push({
        id: tx.id,
        customerName: c.name,
        phone: c.phone,
        amount: tx.amount,
        currency: custCur,
        dueDate: tx.dueDate,
        notes: tx.notes || tx.reference || '',
        title: `استحقاق دين: ${c.name} (${tx.amount} ${custCur})`
      });
    });

    if (events.length === 0) {
      throw new Error('لا توجد ديون مسجلة بتواريخ استحقاق نشطة لجدولتها حالياً.');
    }

    const icsContent = generateIcs(events);
    openIcsFile(icsContent, `كافة_مواعيد_استحقاق_الديون_${events.length}.ics`);
    return { count: events.length, success: true };
  }

  // Request browser local notification permission
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (_) {}
    }
  }

  return {
    generateIcs,
    scheduleDebtReminder,
    scheduleAllUpcomingDebts,
    getGoogleCalendarUrl,
    requestNotificationPermission
  };
})();

window.NotificationScheduler = NotificationScheduler;
