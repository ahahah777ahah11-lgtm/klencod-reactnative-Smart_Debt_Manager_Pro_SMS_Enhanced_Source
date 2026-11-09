/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Customer Management & Accounting Balance Calculation
 */

const CustomerService = (function() {
  'use strict';

  // Compute accounting metrics for a specific customer
  function getCustomerMetrics(customerId) {
    const transactions = AppDatabase.getTransactions();
    let totalDebts = 0;
    let totalPayments = 0;
    let lastTxDate = null;
    let txCount = 0;

    for (const tx of transactions) {
      if (tx.customerId !== customerId) continue;
      if (tx.status === 'cancelled') continue; // Exclude cancelled transactions

      txCount++;
      const amount = ValidationService.parseAmount(tx.amount);

      if (tx.type === 'debt' || (tx.type === 'opening' && amount >= 0)) {
        totalDebts += Math.abs(amount);
      } else if (tx.type === 'payment') {
        totalPayments += amount;
      } else if (tx.type === 'opening' && amount < 0) {
        // Credit opening balance
        totalPayments += Math.abs(amount);
      }

      if (!lastTxDate || new Date(tx.date) > new Date(lastTxDate)) {
        lastTxDate = tx.date;
      }
    }

    totalDebts = Math.round(totalDebts * 100) / 100;
    totalPayments = Math.round(totalPayments * 100) / 100;
    const balance = Math.round((totalDebts - totalPayments) * 100) / 100;

    return {
      totalDebts,
      totalPayments,
      balance,
      lastTxDate,
      txCount,
      isDebtor: balance > 0,
      isSettled: balance === 0,
      isCreditor: balance < 0
    };
  }

  // Get all customers with their real computed metrics
  function getCustomers(filter = 'all', searchQuery = '', sortBy = 'balance_desc', categoryFilter = 'all') {
    const list = AppDatabase.getCustomers();
    const query = searchQuery ? ValidationService.normalizeArabicText(searchQuery) : '';
    const phoneQuery = searchQuery ? ValidationService.normalizeDigits(searchQuery) : '';

    const settings = AppDatabase.getSettings();
    const defaultCur = (settings && settings.currency) ? settings.currency : 'ر.ي';

    const enriched = list.map(c => {
      const metrics = getCustomerMetrics(c.id);
      return {
        ...c,
        icon: c.icon || '👤',
        category: c.category || 'عميل عادي',
        currency: c.currency || '',
        effectiveCurrency: c.currency || defaultCur,
        ...metrics
      };
    });

    // Filtering
    const filtered = enriched.filter(c => {
      // Archive filter
      if (filter === 'archived' && !c.archived) return false;
      if (filter !== 'archived' && c.archived) return false;

      // Status filters
      if (filter === 'debtors' && c.balance <= 0) return false;
      if (filter === 'settled' && (c.balance !== 0 || c.totalDebts === 0)) return false;
      if (filter === 'zero_debt' && c.totalDebts > 0 && c.balance > 0) return false;

      // Category filter
      if (categoryFilter && categoryFilter !== 'all' && c.category !== categoryFilter) return false;

      // Search
      if (query || phoneQuery) {
        const nameNorm = ValidationService.normalizeArabicText(c.name);
        const phoneNorm = ValidationService.normalizeDigits(c.phone);
        const matchesName = nameNorm.includes(query);
        const matchesPhone = phoneNorm.includes(phoneQuery);
        if (!matchesName && !matchesPhone) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'ar');
        case 'balance_asc':
          return a.balance - b.balance;
        case 'balance_desc':
        default:
          return b.balance - a.balance;
        case 'last_tx':
          if (!a.lastTxDate) return 1;
          if (!b.lastTxDate) return -1;
          return new Date(b.lastTxDate) - new Date(a.lastTxDate);
      }
    });

    return filtered;
  }

  // Find customer by ID
  function getCustomerById(customerId) {
    const customers = AppDatabase.getCustomers();
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return null;
    const settings = AppDatabase.getSettings();
    const defaultCur = (settings && settings.currency) ? settings.currency : 'ر.ي';
    const metrics = getCustomerMetrics(customerId);
    return {
      ...customer,
      icon: customer.icon || '👤',
      category: customer.category || 'عميل عادي',
      currency: customer.currency || '',
      effectiveCurrency: customer.currency || defaultCur,
      ...metrics
    };
  }

  // Check duplicate phone
  function checkDuplicatePhone(phone, excludeCustomerId = null) {
    if (!phone) return null;
    const cleaned = ValidationService.normalizePhone(phone);
    if (!cleaned) return null;

    const customers = AppDatabase.getCustomers();
    const existing = customers.find(c => {
      if (excludeCustomerId && c.id === excludeCustomerId) return false;
      return ValidationService.normalizePhone(c.phone) === cleaned;
    });

    return existing ? { isDuplicate: true, customer: existing } : null;
  }

  // Create new customer
  function addCustomer(data) {
    if (!data.name || !data.name.trim()) {
      throw new Error('يرجى إدخال اسم العميل.');
    }

    const settings = AppDatabase.getSettings();
    const defaultIcon = (settings && settings.defaultCustomerIcon) ? settings.defaultCustomerIcon : '👤';

    const customers = AppDatabase.getCustomers();
    const newCustomer = {
      id: ValidationService.generateId('cust'),
      name: data.name.trim(),
      phone: (data.phone || '').trim(),
      notes: (data.notes || '').trim(),
      icon: (data.icon || defaultIcon).trim(),
      category: (data.category || 'عميل عادي').trim(),
      currency: (data.currency || '').trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false
    };

    customers.push(newCustomer);
    AppDatabase.persist('customers');
    return newCustomer;
  }

  // Update existing customer (Preserves all historical transactions!)
  function updateCustomer(customerId, data) {
    const customers = AppDatabase.getCustomers();
    const index = customers.findIndex(c => c.id === customerId);
    if (index === -1) {
      throw new Error('العميل غير موجود.');
    }

    if (!data.name || !data.name.trim()) {
      throw new Error('يرجى إدخال اسم العميل.');
    }

    customers[index].name = data.name.trim();
    customers[index].phone = (data.phone || '').trim();
    customers[index].notes = (data.notes || '').trim();
    if (data.icon) customers[index].icon = data.icon.trim();
    if (data.category) customers[index].category = data.category.trim();
    if (data.currency !== undefined) customers[index].currency = (data.currency || '').trim();
    customers[index].updatedAt = new Date().toISOString();

    AppDatabase.persist('customers');
  }

  // Toggle archive status
  function toggleArchiveCustomer(customerId) {
    const customers = AppDatabase.getCustomers();
    const index = customers.findIndex(c => c.id === customerId);
    if (index === -1) throw new Error('العميل غير موجود.');

    customers[index].archived = !customers[index].archived;
    customers[index].updatedAt = new Date().toISOString();
    AppDatabase.persist('customers');
    return customers[index];
  }

  // Delete customer with strict accounting safeguards
  function deleteCustomer(customerId) {
    const metrics = getCustomerMetrics(customerId);
    if (metrics.txCount > 0) {
      throw new Error('لا يمكن حذف عميل لديه عمليات مالية حفاظاً على سلامة السجل المحاسبي. يمكنك أرشفة العميل بدلاً من حذفه.');
    }

    const customers = AppDatabase.getCustomers();
    const index = customers.findIndex(c => c.id === customerId);
    if (index === -1) throw new Error('العميل غير موجود.');

    customers.splice(index, 1);
    AppDatabase.persist('customers');
    return true;
  }

  return {
    getCustomerMetrics,
    getCustomers,
    getCustomerById,
    checkDuplicatePhone,
    addCustomer,
    updateCustomer,
    toggleArchiveCustomer,
    deleteCustomer
  };
})();

window.CustomerService = CustomerService;
