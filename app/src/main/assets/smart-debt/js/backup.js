/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Backup & Restore Module (النسخ الاحتياطي والاستعادة الآمنة)
 */

const BackupService = (function() {
  'use strict';

  const BACKUP_FORMAT_VERSION = '1.0.0';

  // Export full JSON backup
  function exportFullBackup() {
    const backupData = {
      formatVersion: BACKUP_FORMAT_VERSION,
      appName: 'SmartDebtManagerProSMS',
      exportedAt: new Date().toISOString(),
      customers: AppDatabase.getCustomers(),
      transactions: AppDatabase.getTransactions(),
      remittances: AppDatabase.getRemittances(),
      templates: AppDatabase.getTemplates(),
      smsLogs: AppDatabase.getSmsLogs(),
      settings: AppDatabase.getSettings()
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const dateStr = ValidationService.formatDate().replace(/-/g, '');
    const filename = `SmartDebtManager-backup-${dateStr}.json`;

    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });

    if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.saveFile === 'function') {
      const reader = new FileReader();
      reader.onload = function() {
        const base64 = reader.result.split(',')[1];
        window.AndroidNativeBridge.saveFile(filename, base64, 'application/json');
      };
      reader.readAsDataURL(blob);
      return { success: true, filename };
    }

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 500);

    return { success: true, filename };
  }

  // Validate incoming backup file structure and integrity
  function validateBackupData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('ملف النسخة الاحتياطية غير صالح أو تالف.');
    }

    if (!data.formatVersion) {
      throw new Error('الملف لا يحتوي على رقم إصدار النسخة الاحتياطية.');
    }

    if (!Array.isArray(data.customers)) {
      throw new Error('سجل العملاء غير موجود أو تالف في ملف النسخة الاحتياطية.');
    }

    if (!Array.isArray(data.transactions)) {
      throw new Error('سجل العمليات المالية غير موجود أو تالف.');
    }

    // Verify IDs and Customer existence
    const customerIds = new Set();
    for (const c of data.customers) {
      if (!c.id || !c.name) {
        throw new Error('أحد سجلات العملاء يفتقد للمعرف أو الاسم.');
      }
      customerIds.add(c.id);
    }

    // Verify relational integrity
    let orphanedTxs = 0;
    for (const tx of data.transactions) {
      if (!tx.id || !tx.customerId || !tx.type || tx.amount === undefined) {
        throw new Error('أحد سجلات العمليات المالية يفتقد لبيانات أساسية.');
      }
      if (!customerIds.has(tx.customerId)) {
        orphanedTxs++;
      }
    }

    return {
      isValid: true,
      formatVersion: data.formatVersion,
      exportedAt: data.exportedAt,
      customersCount: data.customers.length,
      transactionsCount: data.transactions.length,
      remittancesCount: (data.remittances || []).length,
      orphanedTransactionsCount: orphanedTxs
    };
  }

  // Restore backup
  // Mode: 'full' (replace all after snapshot) or 'merge' (add new records)
  function restoreBackup(backupData, mode = 'full') {
    // 1. Validate
    const validation = validateBackupData(backupData);

    // 2. Take automatic safety snapshot of current DB before proceeding
    const safetySnapshot = {
      customers: [...AppDatabase.getCustomers()],
      transactions: [...AppDatabase.getTransactions()],
      remittances: [...AppDatabase.getRemittances()],
      templates: [...AppDatabase.getTemplates()],
      smsLogs: [...AppDatabase.getSmsLogs()],
      settings: { ...AppDatabase.getSettings() }
    };

    try {
      if (mode === 'full') {
        // Complete replacement
        AppDatabase.setAllState({
          customers: backupData.customers,
          transactions: backupData.transactions,
          remittances: backupData.remittances || [],
          templates: backupData.templates || AppDatabase.getTemplates(),
          smsLogs: backupData.smsLogs || [],
          settings: backupData.settings || AppDatabase.getSettings()
        });
      } else if (mode === 'merge') {
        // Merge mode
        const existingCustomers = AppDatabase.getCustomers();
        const existingCustomerIds = new Set(existingCustomers.map(c => c.id));
        const existingTxs = AppDatabase.getTransactions();
        const existingTxIds = new Set(existingTxs.map(t => t.id));
        const existingRemits = AppDatabase.getRemittances();
        const existingRemitIds = new Set(existingRemits.map(r => r.id));

        // Add non-duplicate customers
        let addedCustomers = 0;
        for (const c of backupData.customers) {
          if (!existingCustomerIds.has(c.id)) {
            existingCustomers.push(c);
            existingCustomerIds.add(c.id);
            addedCustomers++;
          }
        }

        // Add non-duplicate transactions
        let addedTxs = 0;
        for (const tx of backupData.transactions) {
          if (!existingTxIds.has(tx.id)) {
            existingTxs.push(tx);
            existingTxIds.add(tx.id);
            addedTxs++;
          }
        }

        // Add non-duplicate remittances
        let addedRemits = 0;
        for (const r of (backupData.remittances || [])) {
          if (!existingRemitIds.has(r.id)) {
            existingRemits.push(r);
            existingRemitIds.add(r.id);
            addedRemits++;
          }
        }

        AppDatabase.persistAll();
      }

      return {
        success: true,
        mode,
        validation
      };
    } catch (err) {
      // Rollback to safety snapshot immediately!
      AppDatabase.setAllState(safetySnapshot);
      throw new Error('فشلت عملية الاستعادة وتم استرجاع البيانات السابقة بأمان: ' + err.message);
    }
  }

  return {
    exportFullBackup,
    validateBackupData,
    restoreBackup
  };
})();

window.BackupService = BackupService;
