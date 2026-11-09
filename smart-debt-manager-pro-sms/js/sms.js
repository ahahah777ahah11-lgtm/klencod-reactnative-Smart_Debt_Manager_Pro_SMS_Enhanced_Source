/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * SMS Management & Template Engine
 */

const SmsService = (function() {
  'use strict';

  // Render template with customer real data
  function renderTemplate(templateContent, customer, customDate = null) {
    if (!templateContent || !customer) return '';

    const settings = AppDatabase.getSettings();
    const currency = customer.effectiveCurrency || customer.currency || settings.currency || 'ر.ي';
    const dateStr = customDate || ValidationService.formatDate();

    const formattedBalance = ValidationService.formatMoney(customer.balance, currency);
    const formattedDebts = ValidationService.formatMoney(customer.totalDebts, currency);
    const formattedPayments = ValidationService.formatMoney(customer.totalPayments, currency);

    return templateContent
      .replace(/\{اسم_العميل\}/g, customer.name || '')
      .replace(/\{الرصيد\}/g, formattedBalance)
      .replace(/\{إجمالي_الديون\}/g, formattedDebts)
      .replace(/\{إجمالي_المدفوعات\}/g, formattedPayments)
      .replace(/\{التاريخ\}/g, dateStr);
  }

  // Get SMS intent URL for web browser fallback
  function generateSmsLink(phone, body) {
    const cleanPhone = ValidationService.normalizeDigits(phone).replace(/[^\d+]/g, '');
    const encodedBody = encodeURIComponent(body);
    // iOS and Android modern browser compatibility
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const separator = isIOS ? '&' : '?';
    return `sms:${cleanPhone}${separator}body=${encodedBody}`;
  }

  // Dispatch SMS (via Android Native Bridge or SMS URI)
  function dispatchSms(customer, renderedMessage) {
    if (!customer.phone || !ValidationService.isValidPhone(customer.phone)) {
      throw new Error(`رقم هاتف العميل "${customer.name}" غير صالح أو غير مكتمل.`);
    }

    const cleanPhone = ValidationService.normalizeDigits(customer.phone).replace(/[^\d+]/g, '');

    // Record in SMS Log
    const logs = AppDatabase.getSmsLogs();
    const newLog = {
      id: ValidationService.generateId('sms'),
      customerId: customer.id,
      customerName: customer.name,
      phone: cleanPhone,
      renderedMessage: renderedMessage,
      preparedAt: new Date().toISOString(),
      status: 'dispatched'
    };
    logs.unshift(newLog);
    AppDatabase.persist('smsLogs');

    // 1. Check if running inside Android Native Bridge
    if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.openSmsApp === 'function') {
      window.AndroidNativeBridge.openSmsApp(cleanPhone, renderedMessage);
      return { success: true, via: 'native' };
    }

    // 2. Web fallback
    const smsUrl = generateSmsLink(cleanPhone, renderedMessage);
    const link = document.createElement('a');
    link.href = smsUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 500);

    return { success: true, via: 'web_uri' };
  }

  // Template CRUD
  function getTemplates() {
    return AppDatabase.getTemplates();
  }

  function addTemplate(name, content) {
    if (!name || !name.trim()) throw new Error('يرجى إدخال اسم القالب.');
    if (!content || !content.trim()) throw new Error('يرجى إدخال نص القالب.');

    const templates = AppDatabase.getTemplates();
    const newTpl = {
      id: ValidationService.generateId('tpl'),
      name: name.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    templates.push(newTpl);
    AppDatabase.persist('templates');
    return newTpl;
  }

  function updateTemplate(id, name, content) {
    if (!name || !name.trim()) throw new Error('يرجى إدخال اسم القالب.');
    if (!content || !content.trim()) throw new Error('يرجى إدخال نص القالب.');

    const templates = AppDatabase.getTemplates();
    const item = templates.find(t => t.id === id);
    if (!item) throw new Error('القالب غير موجود.');

    item.name = name.trim();
    item.content = content.trim();
    item.updatedAt = new Date().toISOString();
    AppDatabase.persist('templates');
    return item;
  }

  function deleteTemplate(id) {
    const templates = AppDatabase.getTemplates();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) throw new Error('القالب غير موجود.');

    if (templates.length <= 1) {
      throw new Error('يجب الاحتفاظ بقالب رسائل واحد على الأقل.');
    }

    templates.splice(index, 1);
    AppDatabase.persist('templates');
    return true;
  }

  function getLogs() {
    return AppDatabase.getSmsLogs();
  }

  function clearLogs() {
    const logs = AppDatabase.getSmsLogs();
    logs.length = 0;
    AppDatabase.persist('smsLogs');
    return true;
  }

  return {
    renderTemplate,
    generateSmsLink,
    dispatchSms,
    getTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getLogs,
    clearLogs
  };
})();

window.SmsService = SmsService;
