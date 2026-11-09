/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * CSV Importer & Arabic Parser with UTF-8 BOM Support
 * وحدة استيراد ملفات CSV ومعالجة الترميز العربي
 */

const ImportCsvService = (function() {
  'use strict';

  /**
   * Remove UTF-8 BOM (Byte Order Mark) if present
   * @param {string} text - Raw CSV text
   * @returns {string} Cleaned text without BOM
   */
  function stripBom(text) {
    if (!text) return '';
    // Check for UTF-8 BOM character (0xFEFF / \uFEFF)
    if (text.charCodeAt(0) === 0xFEFF) {
      return text.slice(1);
    }
    // Also check for EF BB BF as string representation
    if (text.startsWith('\xEF\xBB\xBF')) {
      return text.slice(3);
    }
    return text;
  }

  /**
   * Auto-detect CSV delimiter (comma, semicolon, tab, pipe)
   * Semicolon is very common in Arabic/Windows Excel environments
   * @param {string} text - Sample text
   * @returns {string} Detected delimiter
   */
  function detectDelimiter(text) {
    const firstLine = (text.split(/\r\n|\r|\n/)[0] || '');
    const delimiters = [',', ';', '\t', '|'];
    let bestDelimiter = ',';
    let maxCount = -1;

    for (const d of delimiters) {
      // Count occurrences outside quotes
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < firstLine.length; i++) {
        if (firstLine[i] === '"') inQuotes = !inQuotes;
        else if (firstLine[i] === d && !inQuotes) count++;
      }
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = d;
      }
    }

    return bestDelimiter;
  }

  /**
   * Parse CSV text respecting quotes, escaped quotes, multiline values,
   * Arabic UTF-8 text, and BOM.
   * @param {string} csvText - The raw CSV string
   * @param {string} [customDelimiter] - Optional custom delimiter
   * @returns {Array<Array<string>>} Array of parsed rows
   */
  function parseCsvText(csvText, customDelimiter) {
    if (!csvText) return [];

    const cleanText = stripBom(csvText);
    const delimiter = customDelimiter || detectDelimiter(cleanText);

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped double-quote inside quoted cell
          currentCell += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n in CRLF
        }
        currentRow.push(currentCell.trim());
        if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    // Flush last cell and row
    if (currentCell !== '' || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Read File with Arabic encoding support (UTF-8 with BOM, UTF-8, Windows-1256 fallback)
   * @param {File|Blob} file - The uploaded file
   * @param {Function} callback - Callback with (err, text)
   */
  function readFileWithArabicSupport(file, callback) {
    if (!file) {
      callback(new Error('لم يتم تحديد ملف.'), null);
      return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const buffer = e.target.result;
        let text = '';

        // Try standard UTF-8 decoder
        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
          text = utf8Decoder.decode(buffer);
        } catch (decErr) {
          // If UTF-8 fails (e.g. legacy Windows-1256 Arabic encoding from old accounting apps)
          try {
            const winDecoder = new TextDecoder('windows-1256');
            text = winDecoder.decode(buffer);
          } catch (winErr) {
            // Fallback to standard TextDecoder
            text = new TextDecoder().decode(buffer);
          }
        }

        // Clean UTF-8 BOM if present
        text = stripBom(text);
        callback(null, text);
      } catch (err) {
        callback(err, null);
      }
    };

    reader.onerror = function() {
      callback(new Error('حدث خطأ أثناء قراءة الملف من الجهاز.'), null);
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * Detect column indices automatically from header row
   * Supports standard English and popular Arabic accounting nomenclature
   * @param {Array<string>} headers - Header row values
   * @returns {Object} Column index mappings
   */
  function detectColumns(headers) {
    const mapping = {
      nameIdx: -1,
      phoneIdx: -1,
      balanceIdx: -1,
      debtIdx: -1,
      paymentIdx: -1,
      currencyIdx: -1,
      categoryIdx: -1,
      notesIdx: -1
    };

    headers.forEach((h, idx) => {
      const lower = (h || '').trim().toLowerCase();
      // Remove diacritics and normalize
      const norm = lower.replace(/[\u064B-\u065F]/g, '');

      if (norm.includes('اسم') || norm.includes('عميل') || norm.includes('حساب') || norm.includes('name') || norm.includes('customer')) {
        if (mapping.nameIdx === -1) mapping.nameIdx = idx;
      } else if (norm.includes('هاتف') || norm.includes('جوال') || norm.includes('تلفون') || norm.includes('موبايل') || norm.includes('phone') || norm.includes('mobile')) {
        if (mapping.phoneIdx === -1) mapping.phoneIdx = idx;
      } else if (norm.includes('رصيد') || norm.includes('صافي') || norm.includes('متبقي') || norm.includes('balance')) {
        if (mapping.balanceIdx === -1) mapping.balanceIdx = idx;
      } else if (norm.includes('دين') || norm.includes('مدين') || norm.includes('له') || norm.includes('debt')) {
        if (mapping.debtIdx === -1) mapping.debtIdx = idx;
      } else if (norm.includes('دفع') || norm.includes('سداد') || norm.includes('مدفوع') || norm.includes('دائن') || norm.includes('عليه') || norm.includes('payment')) {
        if (mapping.paymentIdx === -1) mapping.paymentIdx = idx;
      } else if (norm.includes('عملة') || norm.includes('currency')) {
        if (mapping.currencyIdx === -1) mapping.currencyIdx = idx;
      } else if (norm.includes('تصنيف') || norm.includes('فئة') || norm.includes('category')) {
        if (mapping.categoryIdx === -1) mapping.categoryIdx = idx;
      } else if (norm.includes('ملاحظ') || norm.includes('بيان') || norm.includes('تفاصيل') || norm.includes('note') || norm.includes('notes') || norm.includes('details')) {
        if (mapping.notesIdx === -1) mapping.notesIdx = idx;
      }
    });

    return mapping;
  }

  /**
   * Pre-analyze CSV data rows and return diagnostics for preview modal
   * @param {Array<Array<string>>} parsedRows - Parsed rows from CSV
   * @param {Object} colMapping - Column index mapping
   * @returns {Object} Analysis metrics and classified rows
   */
  function analyzeCsv(parsedRows, colMapping) {
    if (!parsedRows || parsedRows.length <= 1) {
      throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات.');
    }

    const dataRows = parsedRows.slice(1);
    const existingCustomers = typeof AppDatabase !== 'undefined' ? AppDatabase.getCustomers() : [];

    const validRows = [];
    const invalidRows = [];
    const potentialDuplicates = [];
    const flaggedNegativeBalances = [];

    dataRows.forEach((row, index) => {
      const rowIndex = index + 2; // Row number in file
      const rawName = colMapping.nameIdx >= 0 ? row[colMapping.nameIdx] : '';
      const rawPhone = colMapping.phoneIdx >= 0 ? row[colMapping.phoneIdx] : '';
      const rawBalance = colMapping.balanceIdx >= 0 ? row[colMapping.balanceIdx] : '';
      const rawDebt = colMapping.debtIdx >= 0 ? row[colMapping.debtIdx] : '';
      const rawPayment = colMapping.paymentIdx >= 0 ? row[colMapping.paymentIdx] : '';
      const rawCurrency = colMapping.currencyIdx >= 0 ? row[colMapping.currencyIdx] : '';
      const rawCategory = colMapping.categoryIdx >= 0 ? row[colMapping.categoryIdx] : '';
      const notes = colMapping.notesIdx >= 0 ? row[colMapping.notesIdx] : '';

      if (!rawName || !rawName.trim()) {
        invalidRows.push({ rowIndex, reason: 'اسم العميل غير موجود أو فارغ' });
        return;
      }

      const name = rawName.trim();
      const phone = (rawPhone || '').trim();

      // Check duplicates
      let isDup = false;
      let matchedCustomer = null;
      if (typeof ValidationService !== 'undefined') {
        const normPhone = ValidationService.normalizePhone(phone);
        const normName = ValidationService.normalizeArabicText(name);

        matchedCustomer = existingCustomers.find(ec => {
          if (normPhone && ValidationService.normalizePhone(ec.phone) === normPhone) return true;
          return ValidationService.normalizeArabicText(ec.name) === normName;
        });
        isDup = !!matchedCustomer;
      }

      if (isDup) {
        potentialDuplicates.push({ rowIndex, name, phone, existingId: matchedCustomer ? matchedCustomer.id : null });
      }

      // Calculate initial balance
      let balance = 0;
      if (typeof ValidationService !== 'undefined') {
        if (rawBalance !== '') {
          balance = ValidationService.parseAmount(rawBalance);
        } else if (rawDebt !== '' || rawPayment !== '') {
          const d = ValidationService.parseAmount(rawDebt);
          const p = ValidationService.parseAmount(rawPayment);
          balance = d - p;
        }
      } else {
        balance = parseFloat(rawBalance) || 0;
      }

      if (balance < 0) {
        flaggedNegativeBalances.push({ rowIndex, name, balance });
      }

      validRows.push({
        rowIndex,
        name,
        phone,
        notes,
        balance,
        currency: rawCurrency ? rawCurrency.trim() : null,
        category: rawCategory ? rawCategory.trim() : null,
        isDuplicate: isDup,
        matchedCustomer
      });
    });

    return {
      totalRows: dataRows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount: potentialDuplicates.length,
      negativeBalanceCount: flaggedNegativeBalances.length,
      validRows,
      invalidRows,
      potentialDuplicates
    };
  }

  /**
   * Execute import of validated rows into the local database
   * Creates customers and records certified opening balance entries
   * @param {Array<Object>} validRows - Validated items
   * @param {Object} [options] - Optional import configuration
   * @returns {Object} Import results count
   */
  function executeImport(validRows, options = {}) {
    const importDate = options.date || (typeof ValidationService !== 'undefined' ? ValidationService.formatDate() : new Date().toISOString().split('T')[0]);
    const duplicateHandling = options.duplicateHandling || 'skip'; // skip, merge, create_new
    const defaultCurrency = options.defaultCurrency || null;

    let importedCustomers = 0;
    let mergedCustomers = 0;
    let createdTransactions = 0;

    validRows.forEach(item => {
      let targetCustomer = null;

      if (item.isDuplicate && item.matchedCustomer) {
        if (duplicateHandling === 'skip') {
          return; // Skip duplicate customer
        } else if (duplicateHandling === 'merge') {
          targetCustomer = item.matchedCustomer;
          mergedCustomers++;
        }
      }

      if (!targetCustomer) {
        // Create new customer
        targetCustomer = CustomerService.addCustomer({
          name: item.name,
          phone: item.phone,
          category: item.category || 'regular',
          currency: item.currency || defaultCurrency || null,
          notes: item.notes ? `[مستورد من CSV] ${item.notes}` : 'مستورد من ملف CSV'
        });
        importedCustomers++;
      }

      // Record documented Opening Balance if balance !== 0
      if (item.balance !== 0 && typeof TransactionService !== 'undefined') {
        const isDebt = item.balance > 0;
        TransactionService.recordTransaction({
          customerId: targetCustomer.id,
          type: 'opening',
          amount: Math.abs(item.balance),
          date: importDate,
          reference: 'قيد افتتاحي مستورد (CSV)',
          notes: isDebt 
            ? `رصيد افتتاحي مدين مستورد من CSV بقيمة ${item.balance}` 
            : `رصيد افتتاحي دائن مستورد من CSV بقيمة ${Math.abs(item.balance)}`
        });
        createdTransactions++;
      }
    });

    return {
      importedCustomers,
      mergedCustomers,
      createdTransactions
    };
  }

  return {
    stripBom,
    detectDelimiter,
    parseCsvText,
    readFileWithArabicSupport,
    detectColumns,
    analyzeCsv,
    executeImport
  };
})();

// Export globally for browser and Node.js test environment
if (typeof window !== 'undefined') {
  window.ImportCsvService = ImportCsvService;
}
if (typeof global !== 'undefined') {
  global.ImportCsvService = ImportCsvService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImportCsvService;
}
