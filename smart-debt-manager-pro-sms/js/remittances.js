/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Inward Remittances Service (إدارة الحوالات الواردة ومنع التكرار)
 */

const RemittanceService = (function() {
  'use strict';

  const REMITTANCE_COMPANIES = [
    'النجم',
    'الامتياز إكسبرس',
    'داديه',
    'الأكوع موني',
    'إتش بي',
    'شركة أخرى'
  ];

  let isProcessing = false;

  function getCompanies() {
    return [...REMITTANCE_COMPANIES];
  }

  // Detect duplicate remittance by normalized company & reference
  function findDuplicateRemittance(company, reference, excludeId = null) {
    if (!company || !reference) return null;
    const normRef = ValidationService.normalizeReference(reference);
    if (!normRef) return null;

    const list = AppDatabase.getRemittances();
    return list.find(r => {
      if (excludeId && r.id === excludeId) return false;
      const sameCompany = r.company.trim() === company.trim();
      const sameRef = ValidationService.normalizeReference(r.reference) === normRef;
      return sameCompany && sameRef;
    });
  }

  // Register new remittance
  function addRemittance(data) {
    if (!data.company || !data.company.trim()) {
      throw new Error('يرجى اختيار شركة التحويل.');
    }

    if (!data.reference || !data.reference.trim()) {
      throw new Error('يرجى إدخال الرقم المرجعي للحوالة.');
    }

    // Reference validation: Ensure it's not confused with amount
    const cleanRef = data.reference.trim();

    // Check duplicate
    const duplicate = findDuplicateRemittance(data.company, cleanRef);
    if (duplicate) {
      throw new Error(`حوالة مكررة! توجد حوالة سابقة مسجلة لنفس الشركة (${data.company}) برقم مرجعي (${cleanRef}) بتاريخ ${duplicate.date}.`);
    }

    // Validate amount: MUST be positive valid number
    if (!ValidationService.isValidAmount(data.amount)) {
      throw new Error('المبلغ المالي غير صالح. يرجى إدخال مبلغ صحيح.');
    }
    const amount = ValidationService.parseAmount(data.amount);

    let matchingStatus = 'unmatched';
    if (data.customerId) {
      const customer = CustomerService.getCustomerById(data.customerId);
      if (customer) {
        matchingStatus = 'matched';
      }
    }

    const remittances = AppDatabase.getRemittances();
    const newRemittance = {
      id: ValidationService.generateId('remit'),
      company: data.company.trim(),
      senderName: (data.senderName || '').trim(),
      senderPhone: (data.senderPhone || '').trim(),
      amount: amount,
      date: data.date || ValidationService.formatDate(),
      reference: cleanRef,
      notes: (data.notes || '').trim(),
      customerId: data.customerId || null,
      matchingStatus: matchingStatus,
      paymentTransactionId: null,
      createdAt: new Date().toISOString()
    };

    remittances.push(newRemittance);
    AppDatabase.persist('remittances');
    return newRemittance;
  }

  // Link remittance to customer
  function linkCustomer(remittanceId, customerId) {
    const list = AppDatabase.getRemittances();
    const item = list.find(r => r.id === remittanceId);
    if (!item) throw new Error('الحوالة غير موجودة.');
    if (item.matchingStatus === 'recorded_as_payment') {
      throw new Error('لا يمكن تغيير العميل بعد تسجيل الحوالة كدفعة مالية.');
    }

    const customer = CustomerService.getCustomerById(customerId);
    if (!customer) throw new Error('العميل المحدد غير موجود.');

    item.customerId = customerId;
    item.matchingStatus = 'matched';
    AppDatabase.persist('remittances');
    return item;
  }

  // Confirm remittance and record it as a Payment transaction (Strict single execution guard!)
  function confirmAsPayment(remittanceId, customerIdOverride = null) {
    if (isProcessing) {
      throw new Error('جاري تنفيذ العملية، يرجى الانتظار.');
    }

    try {
      isProcessing = true;
      const list = AppDatabase.getRemittances();
      const remit = list.find(r => r.id === remittanceId);
      if (!remit) throw new Error('الحوالة غير موجودة.');

      // Check if already recorded as payment
      if (remit.paymentTransactionId || remit.matchingStatus === 'recorded_as_payment') {
        throw new Error(`تم تسجيل هذه الحوالة مسبقاً كدفعة مالية بالرقم المرجعي (${remit.paymentTransactionId}). لا يمكن تسجيلها مرة أخرى منعاً لتكرار الدفعة.`);
      }

      const targetCustomerId = customerIdOverride || remit.customerId;
      if (!targetCustomerId) {
        throw new Error('يرجى ربط الحوالة بعميل أولاً قبل تسجيلها كدفعة.');
      }

      const customer = CustomerService.getCustomerById(targetCustomerId);
      if (!customer) throw new Error('العميل المرتبط بالحوالة غير موجود.');

      // Record transaction via TransactionService
      const txResult = TransactionService.recordTransaction({
        customerId: targetCustomerId,
        type: 'payment',
        amount: remit.amount,
        date: remit.date,
        reference: `حوالة ${remit.company} - ر/م: ${remit.reference}`,
        notes: `دفعة محولة عبر ${remit.company} من المرسل: ${remit.senderName || 'غير محدد'}. ${remit.notes || ''}`
      });

      // Update remittance state atomically
      remit.customerId = targetCustomerId;
      remit.matchingStatus = 'recorded_as_payment';
      remit.paymentTransactionId = txResult.transaction.id;
      AppDatabase.persist('remittances');

      return {
        remittance: remit,
        transaction: txResult.transaction,
        newBalance: txResult.newBalance
      };
    } finally {
      isProcessing = false;
    }
  }

  // Get remittances with optional filters
  function getRemittances(statusFilter = 'all', companyFilter = 'all') {
    const list = AppDatabase.getRemittances();
    const customersMap = {};
    AppDatabase.getCustomers().forEach(c => {
      customersMap[c.id] = c.name;
    });

    let filtered = list.map(r => ({
      ...r,
      customerName: r.customerId ? (customersMap[r.customerId] || 'عميل محذوف') : 'غير مربوطة بعميل'
    }));

    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.matchingStatus === statusFilter);
    }

    if (companyFilter !== 'all') {
      filtered = filtered.filter(r => r.company === companyFilter);
    }

    filtered.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return filtered;
  }

  return {
    getCompanies,
    findDuplicateRemittance,
    addRemittance,
    linkCustomer,
    confirmAsPayment,
    getRemittances
  };
})();

window.RemittanceService = RemittanceService;
