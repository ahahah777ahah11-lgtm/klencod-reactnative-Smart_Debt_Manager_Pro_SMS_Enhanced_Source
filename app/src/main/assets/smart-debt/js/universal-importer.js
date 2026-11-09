/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Universal Accounting Importer (مستورد الحسابات والبيانات الشامل)
 * Supports:
 *  1. Excel & Spreadsheets (.xlsx, .xls, .csv, .tsv)
 *  2. Database & Backup Files (.db, .sqlite, .sql, .json) from Smart Accountant Pro (المحاسب الذكي برو), Accounts Book Pro (دفتر الحسابات برو), Daftara, etc.
 *  3. PDF Account Statements (.pdf)
 */

const UniversalImporter = (function() {
  'use strict';

  // ==========================================
  // 1. CSV / TSV Text Parser
  // ==========================================
  function parseCsvText(csvText, delimiter = null) {
    if (!csvText) return [];

    let cleanText = csvText;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.substr(1);
    }

    // Auto-detect delimiter if not specified
    if (!delimiter) {
      const firstLine = cleanText.split('\n')[0] || '';
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
      else if (semiCount > commaCount) delimiter = ';';
      else delimiter = ',';
    }

    const lines = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell !== '' || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c !== '')) {
        lines.push(currentRow);
      }
    }

    return lines;
  }

  // ==========================================
  // 2. Excel XLSX (ZIP/XML) Unpacker
  // ==========================================
  async function parseXlsxBuffer(arrayBuffer) {
    // Pure JS mini-ZIP unpacker for XLSX files
    const bytes = new Uint8Array(arrayBuffer);
    const files = {};

    let pos = 0;
    while (pos < bytes.length - 30) {
      // Local file header signature 0x04034b50 ('PK\x03\x04')
      if (bytes[pos] === 0x50 && bytes[pos+1] === 0x4b && bytes[pos+2] === 0x03 && bytes[pos+3] === 0x04) {
        const compressionMethod = bytes[pos+8] | (bytes[pos+9] << 8);
        const compressedSize = bytes[pos+18] | (bytes[pos+19] << 8) | (bytes[pos+20] << 16) | (bytes[pos+21] << 24);
        const uncompressedSize = bytes[pos+22] | (bytes[pos+23] << 8) | (bytes[pos+24] << 16) | (bytes[pos+25] << 24);
        const fileNameLength = bytes[pos+26] | (bytes[pos+27] << 8);
        const extraFieldLength = bytes[pos+28] | (bytes[pos+29] << 8);

        const fileNameBytes = bytes.slice(pos + 30, pos + 30 + fileNameLength);
        const fileName = new TextDecoder('utf-8').decode(fileNameBytes);
        const dataStart = pos + 30 + fileNameLength + extraFieldLength;
        const dataEnd = dataStart + compressedSize;

        if (dataEnd <= bytes.length) {
          const compData = bytes.slice(dataStart, dataEnd);
          try {
            if (compressionMethod === 0) {
              // Store (uncompressed)
              files[fileName] = new TextDecoder('utf-8').decode(compData);
            } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
              // Deflate
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(compData);
              writer.close();
              const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
              files[fileName] = new TextDecoder('utf-8').decode(decompressedBuffer);
            }
          } catch (e) {
            // Decompression error on single entry, continue scanning
          }
        }
        pos = dataStart + compressedSize;
      } else {
        pos++;
      }
    }

    // Extract sharedStrings
    const sharedStrings = [];
    const ssXml = files['xl/sharedStrings.xml'] || files['xl/sharedstrings.xml'];
    if (ssXml) {
      const siMatches = ssXml.match(/<si>[\s\S]*?<\/si>/g) || [];
      siMatches.forEach(si => {
        const tMatches = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        const text = tMatches.map(t => t.replace(/<[^>]+>/g, '')).join('');
        sharedStrings.push(decodeXmlEntities(text));
      });
    }

    // Extract Sheet 1 rows
    const sheetXml = files['xl/worksheets/sheet1.xml'] || files['xl/worksheets/sheet.xml'];
    if (!sheetXml) {
      throw new Error('لم يتم العثور على أوراق بيانات صالحة داخل ملف Excel.');
    }

    const rows = [];
    const rowMatches = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];

    rowMatches.forEach(rowStr => {
      const cells = [];
      const cellMatches = rowStr.match(/<c\b[^>]*>([\s\S]*?)<\/c>|<c\b[^>]*\/>/g) || [];

      cellMatches.forEach(cStr => {
        const typeMatch = cStr.match(/t="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : '';
        const vMatch = cStr.match(/<v>([\s\S]*?)<\/v>/);
        const rawVal = vMatch ? vMatch[1] : '';

        let cellValue = rawVal;
        if (cellType === 's') {
          // Shared string index
          const idx = parseInt(rawVal, 10);
          cellValue = sharedStrings[idx] !== undefined ? sharedStrings[idx] : rawVal;
        } else if (cellType === 'inlineStr') {
          const tMatch = cStr.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          cellValue = tMatch ? decodeXmlEntities(tMatch[1]) : '';
        }
        cells.push(cellValue.trim());
      });

      if (cells.some(c => c !== '')) {
        rows.push(cells);
      }
    });

    return rows;
  }

  function decodeXmlEntities(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  // ==========================================
  // 3. Database (.db, .sqlite, .sql, .json) Parsers
  // ==========================================
  function parseJsonBackup(jsonText) {
    const data = JSON.parse(jsonText);
    const results = [];

    // Detect array of customers/accounts
    const accounts = Array.isArray(data) 
      ? data 
      : (data.customers || data.accounts || data.clients || data.tb_customer || data.tb_account || data.records || []);

    if (!Array.isArray(accounts) || accounts.length === 0) {
      // Check object values
      if (typeof data === 'object') {
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key]) && data[key].length > 0 && typeof data[key][0] === 'object') {
            return mapObjectRecords(data[key]);
          }
        }
      }
      throw new Error('لم يتم العثور على سجلات عملاء أو حسابات صالحة في ملف JSON.');
    }

    return mapObjectRecords(accounts);
  }

  function mapObjectRecords(records) {
    return records.map(rec => {
      const name = rec.name || rec.customerName || rec.account_name || rec.cust_name || rec.client_name || rec.الاسم || rec.اسم_العميل || rec.الحساب || '';
      const phone = rec.phone || rec.mobile || rec.tel || rec.customerPhone || rec.الهاتف || rec.الجوال || '';
      const notes = rec.notes || rec.description || rec.details || rec.address || rec.ملاحظات || rec.البيان || '';
      const currency = rec.currency || rec.currency_code || rec.العملة || '';

      let balance = 0;
      if (rec.balance !== undefined) balance = ValidationService.parseAmount(rec.balance);
      else if (rec.current_balance !== undefined) balance = ValidationService.parseAmount(rec.current_balance);
      else if (rec.remaining !== undefined) balance = ValidationService.parseAmount(rec.remaining);
      else if (rec.الرصيد !== undefined) balance = ValidationService.parseAmount(rec.الرصيد);
      else if (rec.debts !== undefined || rec.payments !== undefined) {
        const d = ValidationService.parseAmount(rec.debts || rec.total_debt || rec.له || rec.مدين || 0);
        const p = ValidationService.parseAmount(rec.payments || rec.total_payment || rec.عليه || rec.دائن || 0);
        balance = d - p;
      }

      return {
        name: String(name).trim(),
        phone: String(phone).trim(),
        balance: Math.round(balance * 100) / 100,
        notes: String(notes).trim(),
        currency: String(currency).trim()
      };
    }).filter(r => r.name !== '');
  }

  // Helper: Normalize date formats (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
  function normalizeDate(dateStr) {
    if (!dateStr) return ValidationService.formatDate();
    const str = String(dateStr).trim();
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return str;
  }

  // Convert ArrayBuffer to Base64 in pure JavaScript
  function bufferToBase64(buffer) {
    if (typeof Buffer !== 'undefined') return Buffer.from(buffer).toString('base64');
    if (typeof window === 'undefined' || typeof window.btoa !== 'function') return '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return window.btoa(binary);
  }

  // Process structured Market DB SQLite data (from ٢٠٢٦١٠٢٠٢١١٠٠٣-market(2).db schema)
  function processMarketDbData(data) {
    const rawCustomers = data.customers || [];
    const rawTransactions = data.transactions || [];
    const rawCurrencies = data.currencies || [];
    const rawGroups = data.groups || [];
    const rawCusTypes = data.cusTypes || [];
    const rawSearchTmp = data.searchTmp || [];

    // Currency map: 0: محلي (ر.ي), 1: دولار ($), 2: سعودي (ر.س)
    const currMap = {
      0: 'ر.ي',
      1: '$',
      2: 'ر.س'
    };
    rawCurrencies.forEach(c => {
      const cName = (c.name || '').trim();
      if (cName.includes('دولار') || cName.includes('$')) currMap[c.id] = '$';
      else if (cName.includes('سعودي') || cName.includes('ر.س') || cName.includes('SAR')) currMap[c.id] = 'ر.س';
      else if (cName.includes('محلي') || cName.includes('يمني') || cName.includes('ر.ي')) currMap[c.id] = 'ر.ي';
      else if (cName) currMap[c.id] = cName;
    });

    // Customer Type map: 0 = عميل, 1 = مورد
    const cusTypeMap = { 0: 'عميل', 1: 'مورد' };
    rawCusTypes.forEach(t => { cusTypeMap[t.id] = (t.name || '').trim(); });

    // Index transactions by cus_id and transfer target t_cus_id
    const txByCusId = {};
    rawTransactions.forEach(t => {
      const cId = String(t.cus_id || '').trim();
      const tId = String(t.t_cus_id || '').trim();
      if (cId) {
        if (!txByCusId[cId]) txByCusId[cId] = [];
        txByCusId[cId].push({ ...t, isTransferTarget: false });
      }
      if (tId && tId !== cId && tId !== '0') {
        if (!txByCusId[tId]) txByCusId[tId] = [];
        txByCusId[tId].push({ ...t, isTransferTarget: true });
      }
    });

    // Index searchTmp if available
    const searchTmpMap = {};
    rawSearchTmp.forEach(s => {
      searchTmpMap[String(s.id)] = s;
    });

    const candidates = [];

    rawCustomers.forEach(cust => {
      const cIdStr = String(cust.id);
      const custTxs = txByCusId[cIdStr] || [];

      // Determine customer currency from group or first transaction
      let customerCurr = currMap[cust.g_id] || '';
      if (!customerCurr && custTxs.length > 0) {
        customerCurr = currMap[custTxs[0].curr_id] || 'ر.ي';
      }
      if (!customerCurr) customerCurr = 'ر.ي';

      // Accounting calculation strictly matching SQLite view `cus_curr`:
      // sum(case when in == 1 then out else 0 end) as db (ديون)
      // sum(case when not(in == 1) then out else 0 end) as cr (مدفوعات)
      // balance = db - cr
      let totalDebts = 0;
      let totalPayments = 0;

      custTxs.forEach(tx => {
        const amt = Math.abs(parseFloat(tx.out) || 0);
        const inSign = parseFloat(tx.in);

        if (tx.isTransferTarget) {
          totalPayments += amt;
        } else {
          if (inSign === 1) {
            totalDebts += amt;
          } else {
            totalPayments += amt;
          }
        }
      });

      totalDebts = Math.round(totalDebts * 100) / 100;
      totalPayments = Math.round(totalPayments * 100) / 100;
      let computedBalance = Math.round((totalDebts - totalPayments) * 100) / 100;

      // If searchTmp precalculated record exists and no txs were parsed, use it
      if (searchTmpMap[cIdStr] && searchTmpMap[cIdStr].balance !== undefined && custTxs.length === 0) {
        computedBalance = Math.round(parseFloat(searchTmpMap[cIdStr].balance) * 100) / 100;
      }

      // Classification
      let category = 'عميل عادي';
      if (cust.cus_type_id === 1) {
        category = 'مورد';
      } else if (cust.g_id === 1 || customerCurr === '$') {
        category = 'عميل VIP ($)';
      } else if (cust.g_id === 2 || customerCurr === 'ر.س') {
        category = 'عميل VIP (سعودي)';
      }

      // Normalized transaction objects
      const formattedTxs = custTxs.map(t => {
        const amt = Math.abs(parseFloat(t.out) || 0);
        const isDebt = !t.isTransferTarget && parseFloat(t.in) === 1;
        return {
          id: t.id,
          type: isDebt ? 'debt' : 'payment',
          amount: amt,
          date: normalizeDate(t.date),
          reference: t.online_ref || (t.id ? `سند-${t.id}` : ''),
          notes: t.remarks || (isDebt ? 'فاتورة مشتريات' : 'دفعة نقدية'),
          currency: currMap[t.curr_id] || customerCurr
        };
      });

      candidates.push({
        id: cust.id,
        name: (cust.name || '').trim(),
        phone: (cust.gsm || '').trim(),
        category: category,
        currency: customerCurr,
        balance: computedBalance,
        debts: totalDebts,
        payments: totalPayments,
        txCount: custTxs.length,
        transactions: formattedTxs,
        notes: `مستورد من قاعدة بيانات السوق (Market DB ID: ${cust.id})`
      });
    });

    return candidates;
  }

  // Parse SQL Text Dumps (.sql) including Market DB dump
  function parseSqlDump(sqlText) {
    const rawCustomers = [];
    const rawTransactions = [];
    const rawCurrencies = [];
    const rawGroups = [];
    const rawCusTypes = [];
    const rawSearchTmp = [];
    const genericRows = [];

    // Regex for INSERT INTO statements
    const insertRegex = /INSERT\s+INTO\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]*?);/gi;
    let match;

    while ((match = insertRegex.exec(sqlText)) !== null) {
      const tableName = match[1].toLowerCase();
      const colNames = match[2] ? match[2].split(',').map(c => c.trim().replace(/[`"']/g, '').toLowerCase()) : [];
      const valuesBlock = match[3];

      const tupleRegex = /\(([^)]+)\)/g;
      let tupleMatch;

      while ((tupleMatch = tupleRegex.exec(valuesBlock)) !== null) {
        const rawVals = parseSqlTuple(tupleMatch[1]);
        const obj = {};
        if (colNames.length > 0 && colNames.length === rawVals.length) {
          colNames.forEach((col, idx) => { obj[col] = rawVals[idx]; });
        }

        if (tableName === 'customers') {
          rawCustomers.push({
            id: obj.id || rawVals[0],
            name: obj.name || rawVals[1],
            gsm: obj.gsm || rawVals[2],
            g_id: parseInt(obj.g_id || rawVals[3] || '0', 10),
            cus_type_id: parseInt(obj.cus_type_id || rawVals[9] || '0', 10)
          });
        } else if (tableName === 'transactions') {
          rawTransactions.push({
            id: obj.id || rawVals[0],
            cus_id: obj.cus_id || rawVals[1],
            in: obj.in || rawVals[2],
            out: obj.out || rawVals[3],
            date: obj.date_ || rawVals[4],
            remarks: obj.remarks || rawVals[5],
            t_cus_id: parseInt(obj.t_cus_id || rawVals[9] || '0', 10),
            curr_id: parseInt(obj.curr_id || rawVals[13] || '0', 10),
            online_ref: obj.online_ref || rawVals[15] || ''
          });
        } else if (tableName === 'currency') {
          rawCurrencies.push({
            id: parseInt(obj.id || rawVals[0], 10),
            name: obj.name || rawVals[1]
          });
        } else if (tableName === 'groups') {
          rawGroups.push({
            id: parseInt(obj.id || rawVals[0], 10),
            name: obj.name || rawVals[1]
          });
        } else if (tableName === 'cus_type') {
          rawCusTypes.push({
            id: parseInt(obj.id || rawVals[0], 10),
            name: obj.name || rawVals[1]
          });
        } else if (tableName === 'cus_search_tmp') {
          rawSearchTmp.push({
            id: obj.id || rawVals[0],
            name: obj.name || rawVals[9],
            gsm: obj.gsm || rawVals[10],
            balance: parseFloat(obj.balance || rawVals[14] || '0')
          });
        } else if (tableName.includes('cust') || tableName.includes('account') || tableName.includes('client')) {
          genericRows.push({
            name: rawVals[1] || rawVals[0] || '',
            phone: rawVals[2] || '',
            balance: rawVals[3] || 0,
            notes: rawVals[4] || ''
          });
        }
      }
    }

    // If Market DB tables were parsed
    if (rawCustomers.length > 0) {
      return processMarketDbData({
        customers: rawCustomers,
        transactions: rawTransactions,
        currencies: rawCurrencies,
        groups: rawGroups,
        cusTypes: rawCusTypes,
        searchTmp: rawSearchTmp
      });
    }

    if (genericRows.length > 0) {
      return mapObjectRecords(genericRows);
    }

    throw new Error('لم يتم العثور على أوامر إدراج (INSERT INTO) خاصة بالعملاء أو الحسابات في ملف SQL.');
  }

  function parseSqlTuple(tupleStr) {
    const vals = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < tupleStr.length; i++) {
      const c = tupleStr[i];
      if (c === "'") {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        vals.push(cleanSqlVal(cur));
        cur = '';
      } else {
        cur += c;
      }
    }
    vals.push(cleanSqlVal(cur));
    return vals;
  }

  function cleanSqlVal(val) {
    let s = val.trim();
    if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
    if (s.toLowerCase() === 'null') return '';
    return s.replace(/\\'/g, "'").replace(/''/g, "'");
  }

  // Parse Binary SQLite Database (.db, .sqlite)
  function parseSqliteDbBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const headerStr = new TextDecoder('ascii').decode(bytes.slice(0, 16));

    if (!headerStr.startsWith('SQLite format 3')) {
      throw new Error('الملف المحدد ليس قاعدة بيانات SQLite صالحة.');
    }

    // Native Android SQLite engine performs real schema inspection and row extraction.
    if (typeof window !== 'undefined' && window.AndroidNativeBridge && typeof window.AndroidNativeBridge.extractSqliteDatabase === 'function') {
      const base64 = bufferToBase64(arrayBuffer);
      if (!base64) throw new Error('تعذر تجهيز ملف SQLite للتحليل.');
      const inspected = JSON.parse(window.AndroidNativeBridge.extractSqliteDatabase(base64));
      if (!inspected.success) throw new Error(inspected.error || 'فشل تحليل قاعدة SQLite.');
      if (!Array.isArray(inspected.tables) || !inspected.rowsByTable) throw new Error('نتيجة تحليل قاعدة البيانات غير مكتملة.');
      return processGenericSqliteData(inspected);
    }

    throw new Error('قراءة SQLite الحقيقية تتطلب تشغيل التطبيق على Android؛ لا يتم تخمين الأسماء أو الأرصدة من النصوص الثنائية.');
  }

  function normalizeSchemaName(value) {
    return String(value || '').toLowerCase().normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670]/g, '').replace(/[\s_\-\.]+/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
  }

  function findColumn(columns, aliases) {
    const normalized = columns.map(c => ({ raw: c.name, key: normalizeSchemaName(c.name) }));
    for (const alias of aliases) {
      const key = normalizeSchemaName(alias);
      const found = normalized.find(c => c.key === key);
      if (found) return found.raw;
    }
    for (const alias of aliases) {
      const key = normalizeSchemaName(alias);
      const found = normalized.find(c => c.key.includes(key) || key.includes(c.key));
      if (found) return found.raw;
    }
    return null;
  }

  function processGenericSqliteData(inspected) {
    const tables = inspected.tables || [];
    const rowsByTable = inspected.rowsByTable || {};

    // Dedicated adapter for the previously supported Market DB schema.
    const marketCustomers = tables.find(t => normalizeSchemaName(t.name) === 'customers');
    const marketTransactions = tables.find(t => normalizeSchemaName(t.name) === 'transactions');
    if (marketCustomers && marketTransactions) {
      const ccols = marketCustomers.columns || [];
      const tcols = marketTransactions.columns || [];
      const cId = findColumn(ccols, ['id']);
      const cName = findColumn(ccols, ['name']);
      const cPhone = findColumn(ccols, ['gsm','phone','mobile']);
      const tId = findColumn(tcols, ['id']);
      const tCustomer = findColumn(tcols, ['cus_id','customer_id']);
      const tIn = findColumn(tcols, ['in']);
      const tOut = findColumn(tcols, ['out']);
      if (cId && cName && tCustomer && tIn && tOut) {
        const mapped = {
          customers: (rowsByTable[marketCustomers.name] || []).map(r => ({ id:r[cId], name:r[cName], gsm:cPhone ? r[cPhone] : '', g_id:r.g_id || 0, cus_type_id:r.cus_type_id || 0 })),
          transactions: (rowsByTable[marketTransactions.name] || []).map(r => ({ id:tId ? r[tId] : '', cus_id:r[tCustomer], in:r[tIn], out:r[tOut], date:r.date_ || r.date || '', remarks:r.remarks || '', curr_id:r.curr_id || 0, t_cus_id:r.t_cus_id || 0, online_ref:`SQLite:${inspected.sourceHash || 'unknown'}:transactions:${tId ? r[tId] : ''}` })),
          currencies: rowsByTable.currency || [], groups: rowsByTable.groups || [],
          cusTypes: rowsByTable.cus_type || [], searchTmp: rowsByTable.cus_search_tmp || []
        };
        const marketRecords = processMarketDbData(mapped);
        marketRecords.schemaReport = { sourceHash:inspected.sourceHash || '', tableCount:tables.length, customerTable:marketCustomers.name, customerCount:marketRecords.length,
          transactionTables:[marketTransactions.name], rowsRead:inspected.totalRowsRead || 0, truncated:!!inspected.truncated,
          integrityCheck:inspected.integrityCheck || [], foreignKeyViolations:inspected.foreignKeyViolations || [],
          mapping:{ customerId:cId, customerName:cName, phone:cPhone, transactionCustomerId:tCustomer, direction:tIn, amount:tOut }, warnings:[] };
        return marketRecords;
      }
    }
    const customerAliases = ['customer_name','client_name','account_name','name','customer','client','الاسم','اسم العميل','اسم_العميل','العميل','الحساب'];
    const phoneAliases = ['phone','mobile','phone_number','gsm','telephone','tel','الهاتف','الجوال','رقم الهاتف','رقم_الهاتف'];
    const idAliases = ['id','customer_id','client_id','account_id','cus_id','cust_id','party_key','person_id','معرف العميل','رقم العميل'];
    const balanceAliases = ['balance','current_balance','remaining','outstanding','الرصيد','المتبقي','الرصيد الحالي'];
    const debtAliases = ['debt','debts','debit','total_debt','مدين','الديون','اجمالي الديون','له'];
    const paymentAliases = ['payment','payments','paid','credit','total_paid','total_payment','دائن','المدفوع','المدفوعات','عليه'];
    const amountAliases = ['amount','value','total','sum','out','in_amount','transaction_amount','value_amount','المبلغ','القيمة'];
    const dateAliases = ['date','date_','created_at','transaction_date','entry_date','time','التاريخ','تاريخ الحركة'];
    const typeAliases = ['type','transaction_type','operation','direction','kind','entry_kind','نوع الحركة','نوع العملية'];
    const descriptionAliases = ['description','notes','remarks','details','memo','البيان','الوصف','ملاحظات'];

    const tableMeta = tables.map(t => {
      const cols = t.columns || [];
      const rows = rowsByTable[t.name] || [];
      const nameCol = findColumn(cols, customerAliases);
      const phoneCol = findColumn(cols, phoneAliases);
      const idCol = findColumn(cols, idAliases) || ((cols.find(c => Number(c.primaryKeyPosition) > 0) || {}).name || null);
      const balanceCol = findColumn(cols, balanceAliases);
      const debtCol = findColumn(cols, debtAliases);
      const paymentCol = findColumn(cols, paymentAliases);
      let score = (nameCol ? 5 : 0) + (phoneCol ? 2 : 0) + (idCol ? 1 : 0) + (balanceCol || debtCol || paymentCol ? 2 : 0);
      return { meta: t, rows, nameCol, phoneCol, idCol, balanceCol, debtCol, paymentCol, score };
    });

    const customerTable = tableMeta.filter(t => t.nameCol && t.rows.length)
      .sort((a,b) => b.score - a.score)[0];
    if (!customerTable) throw new Error('لم يتم العثور على جدول عملاء واضح. راجع الجداول والأعمدة في قاعدة البيانات.');

    const customerIdCol = customerTable.idCol;
    const transactionTables = tableMeta.filter(t => t.meta.name !== customerTable.meta.name && t.rows.length)
      .map(t => {
        const cols = t.meta.columns || [];
        return {
          ...t,
          customerRef: findColumn(cols, ['customer_id','client_id','account_id','cus_id','cust_id','customerid','clientid','party_key','person_id','معرف العميل','رقم العميل']) || ((t.meta.foreignKeys || []).find(fk => fk.referencedTable === customerTable.meta.name)?.from || null),
          amountCol: findColumn(cols, amountAliases),
          debtCol: findColumn(cols, debtAliases),
          paymentCol: findColumn(cols, paymentAliases),
          dateCol: findColumn(cols, dateAliases),
          typeCol: findColumn(cols, typeAliases),
          descriptionCol: findColumn(cols, descriptionAliases),
          txIdCol: findColumn(cols, ['id','transaction_id','movement_id','entry_key','رقم الحركة','معرف الحركة'])
        };
      }).filter(t => t.customerRef && (t.amountCol || t.debtCol || t.paymentCol));

    const txByCustomer = new Map();
    const warnings = [];
    transactionTables.forEach(table => {
      table.rows.forEach(row => {
        const cid = String(row[table.customerRef] ?? '');
        if (!cid) return;
        const rawType = String(table.typeCol ? row[table.typeCol] ?? '' : '').toLowerCase();
        const amount = Math.abs(ValidationService.parseAmount(row[table.amountCol] ?? row[table.debtCol] ?? row[table.paymentCol] ?? 0));
        if (!amount) return;
        let type = '';
        if (table.debtCol && row[table.debtCol] !== null && row[table.debtCol] !== undefined && ValidationService.parseAmount(row[table.debtCol]) !== 0) type = 'debt';
        else if (table.paymentCol && row[table.paymentCol] !== null && row[table.paymentCol] !== undefined && ValidationService.parseAmount(row[table.paymentCol]) !== 0) type = 'payment';
        else if (/debt|debit|sale|invoice|charge|مدين|دين|فاتور|بيع/.test(rawType)) type = 'debt';
        else if (table.typeCol && normalizeSchemaName(table.typeCol) === 'in' && Number(row[table.typeCol]) === 1) type = 'debt';
        else if (/payment|paid|credit|receipt|pay|سداد|دفع|قبض|دائن/.test(rawType)) type = 'payment';
        else if (table.typeCol && normalizeSchemaName(table.typeCol) === 'in' && Number(row[table.typeCol]) !== 1) type = 'payment';
        if (!type) {
          warnings.push(`تعذر تحديد اتجاه الحركة في جدول ${table.meta.name}؛ لم تُرحّل هذه الحركة.`);
          return;
        }
        const tx = {
          id: table.txIdCol ? String(row[table.txIdCol] ?? '') : '',
          type, amount,
          date: table.dateCol && row[table.dateCol] ? normalizeDate(row[table.dateCol]) : '',
          reference: `SQLite:${inspected.sourceHash || 'unknown'}:${table.meta.name}:${table.txIdCol ? row[table.txIdCol] : ''}`,
          notes: `${table.descriptionCol ? String(row[table.descriptionCol] ?? '') : `حركة مستوردة من ${table.meta.name}`}${table.dateCol && row[table.dateCol] ? '' : ' | تاريخ المصدر غير متوفر'}`
        };
        if (!txByCustomer.has(cid)) txByCustomer.set(cid, []);
        txByCustomer.get(cid).push(tx);
      });
    });

    const records = customerTable.rows.map(row => {
      const id = customerIdCol ? String(row[customerIdCol] ?? '') : '';
      const name = String(row[customerTable.nameCol] ?? '').trim();
      const phone = customerTable.phoneCol ? String(row[customerTable.phoneCol] ?? '').trim() : '';
      const transactions = id ? (txByCustomer.get(id) || []) : [];
      const debts = transactions.filter(t => t.type === 'debt').reduce((sum,t) => sum + t.amount, 0);
      const payments = transactions.filter(t => t.type === 'payment').reduce((sum,t) => sum + t.amount, 0);
      let balance = debts - payments;
      let hasDetailed = transactions.length > 0;
      let openingBalance = false;
      if (!hasDetailed && customerTable.debtCol && customerTable.paymentCol) {
        balance = ValidationService.parseAmount(row[customerTable.debtCol]) - ValidationService.parseAmount(row[customerTable.paymentCol]);
        openingBalance = true;
      } else if (!hasDetailed && customerTable.balanceCol) {
        balance = ValidationService.parseAmount(row[customerTable.balanceCol]);
        openingBalance = true;
      } else if (hasDetailed && customerTable.balanceCol) {
        const sourceBalance = ValidationService.parseAmount(row[customerTable.balanceCol]);
        if (Math.abs(sourceBalance - balance) > 0.01) warnings.push(`اختلاف رصيد للعميل ${name}: المصدر ${sourceBalance} والمحتسب ${balance}.`);
      }
      return {
        id, sourceId: id, name, phone, balance: Math.round(balance * 100) / 100,
        debts: Math.round(debts * 100) / 100, payments: Math.round(payments * 100) / 100,
        transactions, importDetailedTransactions: hasDetailed,
        notes: openingBalance ? `رصيد افتتاحي موثق من جدول ${customerTable.meta.name}` : `مستورد من SQLite: ${customerTable.meta.name}`,
        currency: '', mappingConfidence: customerTable.score >= 9 ? 'high' : 'medium'
      };
    }).filter(r => r.name);

    records.schemaReport = {
      sourceHash: inspected.sourceHash || '',
      tableCount: tables.length,
      customerTable: customerTable.meta.name,
      customerCount: records.length,
      transactionTables: transactionTables.map(t => t.meta.name),
      mapping: { customerName: customerTable.nameCol, customerId: customerIdCol, phone: customerTable.phoneCol, balance: customerTable.balanceCol, debt: customerTable.debtCol, payment: customerTable.paymentCol, transactionTables: transactionTables.map(t => ({ table: t.meta.name, customerRef: t.customerRef, amount: t.amountCol, debt: t.debtCol, payment: t.paymentCol, type: t.typeCol, date: t.dateCol, description: t.descriptionCol, id: t.txIdCol })) },
      rowsRead: inspected.totalRowsRead || 0,
      truncated: !!inspected.truncated,
      integrityCheck: inspected.integrityCheck || [],
      foreignKeyViolations: inspected.foreignKeyViolations || [],
      warnings: [...new Set(warnings)].slice(0, 100)
    };
    return records;
  }

  // ==========================================
  // 4. PDF Account Statement Parser (.pdf)
  // ==========================================
  async function parsePdfBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const pdfStr = new TextDecoder('latin1').decode(bytes);

    if (!pdfStr.startsWith('%PDF-')) {
      throw new Error('الملف المحدد ليس مستند PDF صالحاً.');
    }

    // Extract stream contents
    let extractedText = '';
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let streamMatch;

    while ((streamMatch = streamRegex.exec(pdfStr)) !== null) {
      const rawStream = streamMatch[1];
      // Try text representation
      const plainTextMatches = rawStream.match(/\(([^)]+)\)\s*Tj|\[([^\]]+)\]\s*TJ/g);
      if (plainTextMatches) {
        plainTextMatches.forEach(t => {
          extractedText += ' ' + t.replace(/\\([()\\])/g, '$1');
        });
      }
    }

    // If streams are deflated, search for readable chunks
    if (extractedText.length < 20) {
      // Decode unicode hex / octal or UTF-8 chunks
      const textDecoder = new TextDecoder('utf-8', { fatal: false });
      extractedText = textDecoder.decode(bytes);
    }

    const candidates = [];
    const seenNames = new Set();

    // Scan lines for Customer Name + Phone + Balance
    const lines = extractedText.split(/[\r\n]+/);
    for (const line of lines) {
      const nameMatch = line.match(/[\u0621-\u064A]{3,}(?:\s+[\u0621-\u064A]{2,}){1,4}/);
      if (!nameMatch) continue;

      const name = nameMatch[0].trim();
      if (name.includes('كشف حساب') || name.includes('المجموع') || name.includes('الإجمالي') || name.length < 5 || seenNames.has(name)) {
        continue;
      }

      const phoneMatch = line.match(/(?:7[01378]\d{7}|05\d{8}|01\d{7,8})/);
      const phone = phoneMatch ? phoneMatch[0] : '';

      const numMatches = line.match(/[-+]?\b\d+(?:[\.,]\d{1,2})?\b/g) || [];
      let balance = 0;
      for (const n of numMatches) {
        const val = parseFloat(n.replace(/,/g, ''));
        if (val > 0 && val !== parseFloat(phone) && val < 10000000) {
          balance = val;
          break;
        }
      }

      seenNames.add(name);
      candidates.push({
        name,
        phone,
        balance,
        notes: 'مستورد من كشف حساب PDF',
        currency: ''
      });
    }

    if (candidates.length === 0) {
      throw new Error('لم يتمكن النظام من استخراج أسماء عملاء وأرصدة بصيغة نصية من ملف PDF. يرجى التأكد أن ملف PDF يحتوي على نصوص وليس صوراً ممسوحة ضوئياً.');
    }

    return candidates;
  }

  // ==========================================
  // 5. Header / Column Auto-Detection for Tables
  // ==========================================
  function detectColumns(headers) {
    const mapping = {
      nameIdx: -1,
      phoneIdx: -1,
      balanceIdx: -1,
      debtIdx: -1,
      paymentIdx: -1,
      currencyIdx: -1,
      notesIdx: -1
    };

    headers.forEach((h, idx) => {
      const lower = String(h).trim().toLowerCase();
      if (lower.includes('اسم') || lower.includes('عميل') || lower.includes('حساب') || lower.includes('name') || lower.includes('customer') || lower.includes('account')) {
        if (mapping.nameIdx === -1) mapping.nameIdx = idx;
      } else if (lower.includes('هاتف') || lower.includes('جوال') || lower.includes('تلفون') || lower.includes('phone') || lower.includes('mobile') || lower.includes('tel')) {
        if (mapping.phoneIdx === -1) mapping.phoneIdx = idx;
      } else if (lower.includes('رصيد') || lower.includes('balance') || lower.includes('متبقي') || lower.includes('صافي')) {
        if (mapping.balanceIdx === -1) mapping.balanceIdx = idx;
      } else if (lower.includes('دين') || lower.includes('ديون') || lower.includes('debt') || lower.includes('له') || lower.includes('مدين')) {
        if (mapping.debtIdx === -1) mapping.debtIdx = idx;
      } else if (lower.includes('دفع') || lower.includes('سداد') || lower.includes('payment') || lower.includes('عليه') || lower.includes('دائن')) {
        if (mapping.paymentIdx === -1) mapping.paymentIdx = idx;
      } else if (lower.includes('عملة') || lower.includes('currency') || lower.includes('رمز')) {
        if (mapping.currencyIdx === -1) mapping.currencyIdx = idx;
      } else if (lower.includes('ملاحظ') || lower.includes('note') || lower.includes('بيان') || lower.includes('عنوان')) {
        if (mapping.notesIdx === -1) mapping.notesIdx = idx;
      }
    });

    return mapping;
  }

  // ==========================================
  // 6. Pre-analysis & Validation (with Duplicates Check)
  // ==========================================
  function analyzeCandidates(recordsList) {
    const existingCustomers = AppDatabase.getCustomers();
    const validRows = [];
    const invalidRows = [];
    const potentialDuplicates = [];
    const flaggedNegativeBalances = [];

    recordsList.forEach((item, index) => {
      const rowIndex = index + 1;
      const name = (item.name || '').trim();
      const phone = (item.phone || '').trim();

      if (!name) {
        invalidRows.push({ rowIndex, reason: 'اسم العميل غير موجود' });
        return;
      }

      // Check duplicate against existing DB
      const normPhone = ValidationService.normalizePhone(phone);
      const isDup = existingCustomers.some(ec => {
        if (normPhone && ValidationService.normalizePhone(ec.phone) === normPhone) return true;
        return ValidationService.normalizeArabicText(ec.name) === ValidationService.normalizeArabicText(name);
      });

      const balance = Math.round((parseFloat(item.balance) || 0) * 100) / 100;
      if (balance < 0) {
        flaggedNegativeBalances.push({ rowIndex, name, balance });
      }

      const candidateObj = {
        rowIndex,
        name,
        phone,
        notes: item.notes || '',
        currency: item.currency || '',
        balance,
        isDuplicate: isDup,
        sourceId: item.sourceId || item.id || '',
        debts: Number(item.debts || 0),
        payments: Number(item.payments || 0),
        transactions: Array.isArray(item.transactions) ? item.transactions : [],
        importDetailedTransactions: !!item.importDetailedTransactions,
        mappingConfidence: item.mappingConfidence || 'unknown'
      };

      if (isDup) {
        potentialDuplicates.push(candidateObj);
      }

      validRows.push(candidateObj);
    });

    return {
      totalRows: recordsList.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount: potentialDuplicates.length,
      negativeBalanceCount: flaggedNegativeBalances.length,
      validRows,
      invalidRows,
      potentialDuplicates
    };
  }

  // ==========================================
  // 7. Universal File Dispatcher
  // ==========================================
  async function parseFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'csv' || extension === 'txt' || extension === 'tsv') {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length < 2) throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات كافية.');
      const colMapping = detectColumns(rows[0]);
      if (colMapping.nameIdx === -1) colMapping.nameIdx = 0; // fallback to col 0

      const records = rows.slice(1).map(r => {
        const name = colMapping.nameIdx >= 0 ? r[colMapping.nameIdx] : '';
        const phone = colMapping.phoneIdx >= 0 ? r[colMapping.phoneIdx] : '';
        const notes = colMapping.notesIdx >= 0 ? r[colMapping.notesIdx] : '';
        const currency = colMapping.currencyIdx >= 0 ? r[colMapping.currencyIdx] : '';

        let balance = 0;
        if (colMapping.balanceIdx >= 0 && r[colMapping.balanceIdx] !== undefined) {
          balance = ValidationService.parseAmount(r[colMapping.balanceIdx]);
        } else if (colMapping.debtIdx >= 0 || colMapping.paymentIdx >= 0) {
          const d = colMapping.debtIdx >= 0 ? ValidationService.parseAmount(r[colMapping.debtIdx]) : 0;
          const p = colMapping.paymentIdx >= 0 ? ValidationService.parseAmount(r[colMapping.paymentIdx]) : 0;
          balance = d - p;
        }

        return { name, phone, notes, currency, balance };
      });

      return { fileType: 'CSV / Excel نصي', records: analyzeCandidates(records) };
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const buffer = await file.arrayBuffer();
      const rows = await parseXlsxBuffer(buffer);
      if (rows.length < 2) throw new Error('ملف Excel لا يحتوي على بيانات كافية.');
      const colMapping = detectColumns(rows[0]);
      if (colMapping.nameIdx === -1) colMapping.nameIdx = 0;

      const records = rows.slice(1).map(r => {
        const name = colMapping.nameIdx >= 0 ? r[colMapping.nameIdx] : '';
        const phone = colMapping.phoneIdx >= 0 ? r[colMapping.phoneIdx] : '';
        const notes = colMapping.notesIdx >= 0 ? r[colMapping.notesIdx] : '';
        const currency = colMapping.currencyIdx >= 0 ? r[colMapping.currencyIdx] : '';

        let balance = 0;
        if (colMapping.balanceIdx >= 0 && r[colMapping.balanceIdx] !== undefined) {
          balance = ValidationService.parseAmount(r[colMapping.balanceIdx]);
        } else if (colMapping.debtIdx >= 0 || colMapping.paymentIdx >= 0) {
          const d = colMapping.debtIdx >= 0 ? ValidationService.parseAmount(r[colMapping.debtIdx]) : 0;
          const p = colMapping.paymentIdx >= 0 ? ValidationService.parseAmount(r[colMapping.paymentIdx]) : 0;
          balance = d - p;
        }

        return { name, phone, notes, currency, balance };
      });

      return { fileType: 'Excel (.xlsx)', records: analyzeCandidates(records) };
    }

    if (extension === 'json') {
      const text = await file.text();
      const rawRecords = parseJsonBackup(text);
      return { fileType: 'نسخة احتياطية JSON', records: analyzeCandidates(rawRecords) };
    }

    if (extension === 'sql') {
      const text = await file.text();
      const rawRecords = parseSqlDump(text);
      return { fileType: 'تفريغ قاعدة بيانات SQL', records: analyzeCandidates(rawRecords) };
    }

    if (extension === 'db' || extension === 'sqlite') {
      const buffer = await file.arrayBuffer();
      const rawRecords = parseSqliteDbBuffer(buffer);
      const analyzed = analyzeCandidates(rawRecords);
      analyzed.schemaReport = rawRecords.schemaReport || null;
      return { fileType: 'قاعدة بيانات SQLite (تحليل Schema فعلي)', records: analyzed };
    }

    if (extension === 'pdf') {
      const buffer = await file.arrayBuffer();
      const rawRecords = await parsePdfBuffer(buffer);
      return { fileType: 'كشف حساب PDF', records: analyzeCandidates(rawRecords) };
    }

    throw new Error(`صيغة الملف (.${extension}) غير مدعومة. الصيغ المدعومة هي: .xlsx, .xls, .csv, .db, .sqlite, .sql, .json, .pdf`);
  }

  // ==========================================
  // 7.1 Deterministic Market DB Demo Generator
  // Matches exact schema of ٢٠٢٦١٠٢٠٢١١٠٠٣-market(2).db
  // (188 customers, 1,327 transactions, 3 currencies, 4 groups, 2 cus_types)
  // ==========================================
  function generateMarketDbDemoData() {
    const rawCurrencies = [
      { id: 0, name: 'محلي' },
      { id: 1, name: 'دولار' },
      { id: 2, name: 'سعودي' }
    ];

    const rawGroups = [
      { id: 0, name: 'عام' },
      { id: 1, name: 'دولار' },
      { id: 2, name: 'سعودي' },
      { id: 3, name: '' }
    ];

    const rawCusTypes = [
      { id: 0, name: 'عميل' },
      { id: 1, name: 'مورد' }
    ];

    let seed = 20261020;
    function rnd() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    const firstNames = [
      'محمد', 'أحمد', 'عبدالله', 'علي', 'صالح', 'يحيى', 'حسين', 'حسن', 'عبدالرحمن', 'ناصر',
      'خالد', 'عمر', 'سالم', 'إبراهيم', 'محسن', 'سعيد', 'ماجد', 'فؤاد', 'جمال', 'طارق',
      'وليد', 'منصور', 'صادق', 'بشير', 'عادل', 'قاسم', 'مقبل', 'عصام', 'نبيل', 'هاني'
    ];
    const familyNames = [
      'الأحمر', 'السنيدار', 'العولقي', 'الحداد', 'الحاشدي', 'الخولاني', 'الزبيدي', 'الهمداني',
      'اليافعي', 'الوزير', 'السامعي', 'الريمي', 'الصنعاني', 'العدني', 'التعزي', 'المتوكل',
      'الضبيبي', 'الكبسي', 'البعداني', 'الشامي', 'الذماري', 'البيحاني', 'الجبلي', 'البيضاني'
    ];
    const supplierNames = [
      'مؤسسة البركة للمواد الغذائية',
      'شركة النجم للتوريدات والتجارة',
      'وكالة الاتحاد للاستيراد والتصدير',
      'مجموعة السعيد للتجارة العامة',
      'مستودعات الأمل المركزية',
      'شركة الهلال للتوزيع',
      'مطاحن ومصانع صنعاء الوطنية',
      'مؤسسة الوفاق للأدوية والمستلزمات',
      'شركة الخليج للمعدات والآلات',
      'مؤسسة التيسير للزيوت والتموين'
    ];

    const rawCustomers = [];

    // 188 Customers
    for (let i = 1; i <= 188; i++) {
      let name = '';
      let cusTypeId = 0;
      let gId = 0;

      if (i <= 10) {
        name = supplierNames[i - 1];
        cusTypeId = 1;
        gId = (i % 3 === 0) ? 2 : (i % 2 === 0 ? 1 : 0);
      } else {
        const fn = firstNames[Math.floor(rnd() * firstNames.length)];
        const sn = firstNames[Math.floor(rnd() * firstNames.length)];
        const ln = familyNames[Math.floor(rnd() * familyNames.length)];
        name = `${fn} ${sn} ${ln}`;
        cusTypeId = 0;
        const gRoll = rnd();
        if (gRoll < 0.70) gId = 0;
        else if (gRoll < 0.85) gId = 1;
        else gId = 2;
      }

      const phonePrefix = ['77', '73', '71', '70', '78'][Math.floor(rnd() * 5)];
      const phoneDigits = Math.floor(1000000 + rnd() * 9000000);
      const gsm = `${phonePrefix}${phoneDigits}`;

      rawCustomers.push({
        id: i,
        name: name,
        gsm: gsm,
        g_id: gId,
        cus_type_id: cusTypeId
      });
    }

    // 1,327 Transactions
    const rawTransactions = [];
    const dateStarts = [
      '2026-01-05', '2026-01-12', '2026-01-20', '2026-01-28',
      '2026-02-03', '2026-02-14', '2026-02-22', '2026-03-01',
      '2026-03-10', '2026-03-18', '2026-03-25', '2026-04-02'
    ];

    const debtRemarks = [
      'فاتورة مشتريات بضاعة',
      'قيد فاتورة رقم ',
      'مشتريات بالآجل',
      'طلب توريد رقم ',
      'بضاعة مرسلة للمحل',
      'حساب سلع تموينية'
    ];

    const paymentRemarks = [
      'سداد دفعة نقدية',
      'دفعة عبر الكريمي',
      'سند قبض نقدي رقم ',
      'حوالة شبكة النجم',
      'تسديد جزء من الحساب',
      'دفعة شيك مصرفي'
    ];

    for (let t = 1; t <= 1327; t++) {
      const custIdx = Math.floor(Math.pow(rnd(), 1.5) * 188);
      const cust = rawCustomers[custIdx];
      const cusId = cust.id;
      const currId = cust.g_id === 1 ? 1 : (cust.g_id === 2 ? 2 : 0);

      const isDebt = rnd() < 0.62;
      const inSign = isDebt ? 1 : 0;

      let amount = 0;
      if (currId === 1) {
        amount = Math.round((20 + rnd() * 1200) * 10) / 10;
      } else if (currId === 2) {
        amount = Math.round(100 + rnd() * 6500);
      } else {
        amount = Math.round((2000 + rnd() * 180000) / 50) * 50;
      }

      const txDate = dateStarts[t % dateStarts.length];
      const remarks = isDebt 
        ? `${debtRemarks[t % debtRemarks.length]}${1000 + (t % 500)}` 
        : `${paymentRemarks[t % paymentRemarks.length]}${2000 + (t % 300)}`;

      rawTransactions.push({
        id: t,
        cus_id: cusId,
        in: inSign,
        out: amount,
        date: txDate,
        remarks: remarks,
        t_cus_id: 0,
        curr_id: currId,
        online_ref: `REF-${10000 + t}`
      });
    }

    return {
      customers: rawCustomers,
      transactions: rawTransactions,
      currencies: rawCurrencies,
      groups: rawGroups,
      cusTypes: rawCusTypes,
      searchTmp: []
    };
  }

  // ==========================================
  // 8. Execute Import into Database
  // ==========================================
  function executeImport(itemsToImport, options = {}) {
    const {
      importDate = ValidationService.formatDate(),
      defaultCurrency = '',
      duplicateHandling = 'skip', // 'skip', 'merge', 'create_new'
      importDetailedTransactions = false
    } = options;

    const existingCustomers = AppDatabase.getCustomers();
    let importedCustomers = 0;
    let mergedCustomers = 0;
    let skippedDuplicates = 0;
    let createdTransactions = 0;
    let duplicateTransactions = 0;
    const existingSourceRefs = new Set(AppDatabase.getTransactions().map(tx => String(tx.reference || '')).filter(Boolean));

    itemsToImport.forEach(item => {
      // Ensure custom currency is recognized in settings
      if (item.currency) {
        try {
          const s = AppDatabase.getSettings();
          const currList = s.currencies || [];
          const exists = currList.some(c => (c.code || '').toLowerCase() === item.currency.toLowerCase() || (c.symbol || '').toLowerCase() === item.currency.toLowerCase());
          if (!exists) {
            SettingsService.addCustomCurrency({ name: item.currency, symbol: item.currency });
          }
        } catch (e) {
          // already registered or silent skip
        }
      }

      // Customer icon & category mapping
      let icon = item.icon || '👤';
      let category = item.category || 'عميل عادي';
      if (category === 'مورد' || (item.notes && item.notes.includes('مورد'))) {
        category = 'مورد';
        icon = '🏢';
      } else if (category.includes('VIP')) {
        icon = '👑';
      }

      const normPhone = ValidationService.normalizePhone(item.phone);
      const existing = existingCustomers.find(ec => {
        if (normPhone && ValidationService.normalizePhone(ec.phone) === normPhone) return true;
        return ValidationService.normalizeArabicText(ec.name) === ValidationService.normalizeArabicText(item.name);
      });

      let targetCustomer = null;

      if (existing) {
        if (duplicateHandling === 'skip') {
          skippedDuplicates++;
          return;
        } else if (duplicateHandling === 'merge') {
          targetCustomer = existing;
          mergedCustomers++;
        } else if (duplicateHandling === 'create_new') {
          targetCustomer = CustomerService.addCustomer({
            name: `${item.name} (${item.currency || 'جديد'})`,
            phone: item.phone,
            notes: item.notes ? `[مستورد] ${item.notes}` : 'مستورد من ملف خارجي',
            icon: icon,
            category: category,
            currency: item.currency || defaultCurrency
          });
          importedCustomers++;
        }
      } else {
        targetCustomer = CustomerService.addCustomer({
          name: item.name,
          phone: item.phone,
          notes: item.notes ? `[مستورد] ${item.notes}` : 'مستورد من ملف خارجي',
          icon: icon,
          category: category,
          currency: item.currency || defaultCurrency
        });
        importedCustomers++;
      }

      if (!targetCustomer) return;

      // Import Transactions
      if (importDetailedTransactions && item.transactions && item.transactions.length > 0) {
        item.transactions.forEach(tx => {
          const sourceReference = tx.reference || (tx.id ? `سند-${tx.id}` : 'حركة مستوردة');
          if (existingSourceRefs.has(String(sourceReference))) {
            duplicateTransactions++;
            return;
          }
          TransactionService.recordTransaction({
            customerId: targetCustomer.id,
            type: tx.type === 'debt' ? 'debt' : 'payment',
            amount: tx.amount,
            date: tx.date || importDate,
            reference: sourceReference,
            notes: `${tx.notes || (tx.type === 'debt' ? 'قيد مشتريات' : 'سداد دفعة')} | المصدر: ${item.sourceId || 'غير محدد'} | الحركة الأصلية: ${tx.id || 'بدون معرف'}` || (tx.type === 'debt' ? 'قيد مشتريات' : 'سداد دفعة'),
            bypassOverpaymentCheck: true
          });
          existingSourceRefs.add(String(sourceReference));
          createdTransactions++;
        });
      } else if (item.balance !== 0) {
        // Record documented opening balance transaction
        TransactionService.recordTransaction({
          customerId: targetCustomer.id,
          type: 'opening',
          amount: Math.abs(item.balance),
          date: importDate,
          reference: 'قيد افتتاحي مستورد',
          notes: item.balance > 0 
            ? `رصيد مدين موثق مستورد بقيمة ${item.balance}` 
            : `رصيد دائن موثق مستورد بقيمة ${Math.abs(item.balance)}`,
          bypassOverpaymentCheck: true
        });
        createdTransactions++;
      }
    });

    return {
      importedCustomers,
      mergedCustomers,
      skippedDuplicates,
      createdTransactions,
      duplicateTransactions
    };
  }

  return {
    parseCsvText,
    parseXlsxBuffer,
    parseJsonBackup,
    parseSqlDump,
    parseSqliteDbBuffer,
    processGenericSqliteData,
    parsePdfBuffer,
    detectColumns,
    analyzeCandidates,
    processMarketDbData,
    generateMarketDbDemoData,
    parseFile,
    executeImport
  };
})();

window.UniversalImporter = UniversalImporter;
