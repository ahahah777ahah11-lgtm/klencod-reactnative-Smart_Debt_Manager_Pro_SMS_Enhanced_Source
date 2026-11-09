/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Transactions Service (Debts, Payments, Opening Balances, Partial Payments)
 */

const TransactionService = (function() {
  'use strict';

  let isProcessing = false;

  // Get settlement details for a specific debt transaction
  function getDebtSettlement(debtId) {
    const transactions = AppDatabase.getTransactions();
    const debt = transactions.find(t => t.id === debtId);
    if (!debt || (debt.type !== 'debt' && !(debt.type === 'opening' && debt.amount > 0))) {
      return null;
    }

    const linkedPayments = transactions.filter(t => 
      t.type === 'payment' && 
      t.linkedDebtId === debtId && 
      t.status !== 'cancelled'
    );

    let paidAmount = 0;
    for (const p of linkedPayments) {
      paidAmount += ValidationService.parseAmount(p.amount);
    }
    paidAmount = Math.round(paidAmount * 100) / 100;

    const originalAmount = ValidationService.parseAmount(debt.amount);
    const remainingAmount = Math.max(0, Math.round((originalAmount - paidAmount) * 100) / 100);

    let settlementStatus = 'unpaid';
    if (paidAmount >= originalAmount) {
      settlementStatus = 'fully_paid';
    } else if (paidAmount > 0) {
      settlementStatus = 'partially_paid';
    }

    return {
      debtId: debt.id,
      debt,
      originalAmount,
      paidAmount,
      remainingAmount,
      settlementStatus,
      isSettled: remainingAmount <= 0,
      partialPayments: linkedPayments
    };
  }

  // Get unsettled/open debts for a customer (debts with remaining balance > 0)
  function getUnsettledDebts(customerId) {
    if (!customerId) return [];
    const transactions = AppDatabase.getTransactions();
    const candidateDebts = transactions.filter(t => 
      t.customerId === customerId && 
      t.status !== 'cancelled' && 
      (t.type === 'debt' || (t.type === 'opening' && ValidationService.parseAmount(t.amount) > 0))
    );

    const unsettled = [];
    for (const debt of candidateDebts) {
      const settlement = getDebtSettlement(debt.id);
      if (settlement && settlement.remainingAmount > 0) {
        unsettled.push({
          id: debt.id,
          date: debt.date,
          amount: settlement.originalAmount,
          paidAmount: settlement.paidAmount,
          remainingAmount: settlement.remainingAmount,
          settlementStatus: settlement.settlementStatus,
          reference: debt.reference || '',
          notes: debt.notes || '',
          dueDate: debt.dueDate || null
        });
      }
    }

    // Sort by date desc (most recent first)
    unsettled.sort((a, b) => b.date.localeCompare(a.date));
    return unsettled;
  }

  // Record a new transaction (debt or payment with optional partial payment link)
  function recordTransaction(data) {
    if (isProcessing) {
      throw new Error('جاري معالجة عملية أخرى، يرجى الانتظار لحظات.');
    }

    try {
      isProcessing = true;

      // 1. Validate Customer
      if (!data.customerId) {
        throw new Error('يرجى اختيار العميل.');
      }
      const customer = CustomerService.getCustomerById(data.customerId);
      if (!customer) {
        throw new Error('العميل المحدد غير موجود.');
      }

      // 2. Validate Type
      const validTypes = ['debt', 'payment', 'opening', 'settlement'];
      if (!validTypes.includes(data.type)) {
        throw new Error('نوع العملية غير صالح.');
      }

      // 3. Validate Amount
      if (!ValidationService.isValidAmount(data.amount)) {
        throw new Error('المبلغ يجب أن يكون رقماً موجباً وأكبر من الصفر.');
      }
      const amount = ValidationService.parseAmount(data.amount);

      // 4. Validate Overpayment Policy and Linked Debt
      const settings = AppDatabase.getSettings();
      let linkedDebtSettlement = null;

      if (data.type === 'payment') {
        // If linked to a specific debt
        if (data.linkedDebtId) {
          linkedDebtSettlement = getDebtSettlement(data.linkedDebtId);
          if (!linkedDebtSettlement) {
            throw new Error('الدين المحدد للربط غير موجود أو غير صالح.');
          }
          if (linkedDebtSettlement.debt.customerId !== data.customerId) {
            throw new Error('الدين المحدد لا يخص هذا العميل.');
          }
          if (linkedDebtSettlement.debt.status === 'cancelled') {
            throw new Error('لا يمكن تسجيل دفعة على دين ملغي.');
          }
          if (linkedDebtSettlement.remainingAmount <= 0) {
            throw new Error('هذا الدين مسدد بالكامل مسبقاً.');
          }

          if (settings.preventOverpayment && amount > linkedDebtSettlement.remainingAmount) {
            throw new Error(
              `قيمة الدفعة (${ValidationService.formatMoney(amount, settings.currency)}) أكبر من المبلغ المتبقي على هذا الدين المحدد (${ValidationService.formatMoney(linkedDebtSettlement.remainingAmount, settings.currency)}). تم رفض العملية لمنع الزيادة.`
            );
          }
        }

        // Global overpayment validation (can be bypassed for historical imported ledgers)
        if (settings.preventOverpayment && !data.bypassOverpaymentCheck) {
          const currentBalance = customer.balance;
          if (currentBalance <= 0) {
            throw new Error(`لا يوجد رصيد مستحق على العميل "${customer.name}". الرصيد الحالي هو (${ValidationService.formatMoney(currentBalance, settings.currency)}). لا يمكن تسجيل دفعة.`);
          }
          if (amount > currentBalance) {
            throw new Error(`قيمة الدفعة (${ValidationService.formatMoney(amount, settings.currency)}) أكبر من الرصيد المستحق (${ValidationService.formatMoney(currentBalance, settings.currency)}). تم رفض العملية لمنع الأرصدة السالبة.`);
          }
        }
      }

      // 5. Construct Transaction
      const transactions = AppDatabase.getTransactions();
      const newTx = {
        id: ValidationService.generateId('tx'),
        customerId: data.customerId,
        type: data.type,
        amount: amount,
        date: data.date || ValidationService.formatDate(),
        dueDate: data.type === 'debt' && data.dueDate ? data.dueDate.trim() : null,
        notes: (data.notes || '').trim(),
        reference: (data.reference || '').trim(),
        linkedDebtId: data.type === 'payment' && data.linkedDebtId ? data.linkedDebtId : null,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      transactions.push(newTx);
      AppDatabase.persist('transactions');

      // 6. Return new transaction + updated metrics + debt settlement info
      const updatedMetrics = CustomerService.getCustomerMetrics(data.customerId);
      const postSettlement = newTx.linkedDebtId ? getDebtSettlement(newTx.linkedDebtId) : null;

      return {
        transaction: newTx,
        newBalance: updatedMetrics.balance,
        metrics: updatedMetrics,
        debtSettlement: postSettlement
      };
    } finally {
      isProcessing = false;
    }
  }

  // Cancel transaction (safely with audit trail, never deletes silently!)
  function cancelTransaction(txId, reason = '') {
    const transactions = AppDatabase.getTransactions();
    const tx = transactions.find(t => t.id === txId);
    if (!tx) {
      throw new Error('العملية غير موجودة.');
    }
    if (tx.status === 'cancelled') {
      throw new Error('العملية ملغاة مسبقاً.');
    }

    tx.status = 'cancelled';
    tx.cancelReason = (reason || '').trim();
    tx.cancelledAt = new Date().toISOString();

    AppDatabase.persist('transactions');

    const updatedMetrics = CustomerService.getCustomerMetrics(tx.customerId);
    const linkedSettlement = tx.linkedDebtId ? getDebtSettlement(tx.linkedDebtId) : null;

    return {
      transaction: tx,
      newBalance: updatedMetrics.balance,
      debtSettlement: linkedSettlement
    };
  }

  // Get transactions with filters and enrichment
  function getTransactions(filters = {}) {
    const list = AppDatabase.getTransactions();
    const customersMap = {};
    AppDatabase.getCustomers().forEach(c => {
      customersMap[c.id] = c.name;
    });

    let filtered = list.map(tx => {
      let settlementInfo = null;
      let linkedInfo = null;

      if (tx.type === 'debt' || (tx.type === 'opening' && ValidationService.parseAmount(tx.amount) > 0)) {
        settlementInfo = getDebtSettlement(tx.id);
      } else if (tx.type === 'payment' && tx.linkedDebtId) {
        const targetDebt = list.find(t => t.id === tx.linkedDebtId);
        if (targetDebt) {
          linkedInfo = {
            debtId: targetDebt.id,
            date: targetDebt.date,
            reference: targetDebt.reference || '',
            amount: targetDebt.amount
          };
        }
      }

      return {
        ...tx,
        customerName: customersMap[tx.customerId] || 'عميل غير معروف',
        settlement: settlementInfo,
        linkedDebtInfo: linkedInfo
      };
    });

    if (filters.customerId) {
      filtered = filtered.filter(tx => tx.customerId === filters.customerId);
    }

    if (filters.type && filters.type !== 'all') {
      filtered = filtered.filter(tx => tx.type === filters.type);
    }

    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(tx => tx.status === filters.status);
    }

    if (filters.startDate) {
      filtered = filtered.filter(tx => tx.date >= filters.startDate);
    }

    if (filters.endDate) {
      filtered = filtered.filter(tx => tx.date <= filters.endDate);
    }

    // Sort by date desc, then by createdAt desc
    filtered.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return filtered;
  }

  return {
    recordTransaction,
    cancelTransaction,
    getTransactions,
    getDebtSettlement,
    getUnsettledDebts
  };
})();

if (typeof window !== 'undefined') {
  window.TransactionService = TransactionService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransactionService;
}
