/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Accounting & Storage Automated Test Suite (اختبارات المحاسبة والتخزين)
 */

const AccountingTestSuite = (function() {
  'use strict';

  function runAllTests() {
    const results = [];

    // Save actual state to restore afterwards (sandbox protection)
    const backupState = {
      customers: JSON.parse(JSON.stringify(AppDatabase.getCustomers())),
      transactions: JSON.parse(JSON.stringify(AppDatabase.getTransactions())),
      remittances: JSON.parse(JSON.stringify(AppDatabase.getRemittances())),
      templates: JSON.parse(JSON.stringify(AppDatabase.getTemplates())),
      smsLogs: JSON.parse(JSON.stringify(AppDatabase.getSmsLogs())),
      settings: JSON.parse(JSON.stringify(AppDatabase.getSettings()))
    };

    try {
      // Clear database for clean deterministic tests
      AppDatabase.resetAll();

      // ==========================================
      // Test 1: Add Ahmed, Debt 1000, Payment 300
      // ==========================================
      (function() {
        const testName = 'الحالة 1: تسجيل دين 1000 ودفعة 300 للعميل أحمد';
        const steps = 'إضافة العميل أحمد، تسجيل دين بقيمة 1000، تسجيل دفعة بقيمة 300';
        const expected = 'إجمالي الديون = 1000، إجمالي المدفوعات = 300، الرصيد المتبقي = 700';
        let actual = '';
        let passed = false;

        try {
          const cust = CustomerService.addCustomer({ name: 'أحمد', phone: '777111222' });
          TransactionService.recordTransaction({ customerId: cust.id, type: 'debt', amount: 1000 });
          TransactionService.recordTransaction({ customerId: cust.id, type: 'payment', amount: 300 });

          const m = CustomerService.getCustomerMetrics(cust.id);
          actual = `إجمالي الديون = ${m.totalDebts}، إجمالي المدفوعات = ${m.totalPayments}، الرصيد المتبقي = ${m.balance}`;
          passed = (m.totalDebts === 1000 && m.totalPayments === 300 && m.balance === 700);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 1, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 2: Add payment 700 -> balance becomes 0
      // ==========================================
      (function() {
        const testName = 'الحالة 2: سداد كامل الرصيد المتبقي (700)';
        const steps = 'تسجيل دفعة إضافية بقيمة 700 للعميل أحمد بعد وصول الرصيد إلى 700';
        const expected = 'إجمالي الديون = 1000، إجمالي المدفوعات = 1000، الرصيد المتبقي = 0';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers().find(c => c.name === 'أحمد');
          TransactionService.recordTransaction({ customerId: cust.id, type: 'payment', amount: 700 });

          const m = CustomerService.getCustomerMetrics(cust.id);
          actual = `إجمالي الديون = ${m.totalDebts}، إجمالي المدفوعات = ${m.totalPayments}، الرصيد المتبقي = ${m.balance}`;
          passed = (m.totalDebts === 1000 && m.totalPayments === 1000 && m.balance === 0);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 2, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 3: Reject payment on zero balance
      // ==========================================
      (function() {
        const testName = 'الحالة 3: محاولة تسجيل دفعة بقيمة 100 بعد وصول الرصيد لصفر';
        const steps = 'محاولة تسجيل دفعة 100 للعميل أحمد ورصيده الحالي 0 مع تفعيل منع السداد الزائد';
        const expected = 'رفض العملية افتراضيًا وإظهار رسالة توضح عدم وجود رصيد مستحق';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers().find(c => c.name === 'أحمد');
          TransactionService.recordTransaction({ customerId: cust.id, type: 'payment', amount: 100 });
          actual = 'تم قبول العملية بالخطأ!';
          passed = false;
        } catch (e) {
          actual = 'تم الرفض بنجاح برسالة: ' + e.message;
          passed = e.message.includes('لا يوجد رصيد مستحق');
        }

        results.push({ id: 3, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 4: Add debt 500, edit customer name
      // ==========================================
      (function() {
        const testName = 'الحالة 4: إضافة دين وتعديل اسم العميل دون المساس بالعمليات';
        const steps = 'إضافة دين 500 ثم تعديل اسم العميل من أحمد إلى أحمد محمد علي';
        const expected = 'تظل العملية المالية موجودة، ويظل الرصيد صحيحاً (500)';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers().find(c => c.name === 'أحمد');
          TransactionService.recordTransaction({ customerId: cust.id, type: 'debt', amount: 500 });
          CustomerService.updateCustomer(cust.id, { name: 'أحمد محمد علي', phone: cust.phone, notes: 'محدث' });

          const updatedCust = CustomerService.getCustomerById(cust.id);
          const m = CustomerService.getCustomerMetrics(cust.id);
          actual = `الاسم الجديد: ${updatedCust.name}، الرصيد: ${m.balance}، العمليات: ${m.txCount}`;
          passed = (updatedCust.name === 'أحمد محمد علي' && m.balance === 500 && m.txCount === 4);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 4, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 5: Confirm remittance 250 as payment & guard repeat
      // ==========================================
      (function() {
        const testName = 'الحالة 5: تأكيد حوالة 250 كدفعة ومنع تكرار التسجيل';
        const steps = 'تسجيل حوالة برقم مرجعي ت/8000011، تأكيدها كدفعة، ثم إعادة محاولة التأكيد';
        const expected = 'تُسجل الدفعة مرة واحدة فقط، ويتم رفض المحاولة الثانية';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers()[0];
          const remit = RemittanceService.addRemittance({
            company: 'النجم',
            reference: 'ت/8000011',
            amount: 250,
            customerId: cust.id,
            senderName: 'محمد سالم'
          });

          // Confirm first time
          const res1 = RemittanceService.confirmAsPayment(remit.id);
          
          // Attempt second time
          let secondAttemptRejected = false;
          try {
            RemittanceService.confirmAsPayment(remit.id);
          } catch (err2) {
            secondAttemptRejected = true;
          }

          const txsForRemit = AppDatabase.getTransactions().filter(t => t.reference && t.reference.includes('ت/8000011'));
          actual = `عدد الدفعات المسجلة للحوالة: ${txsForRemit.length}، تم رفض المحاولة الثانية: ${secondAttemptRejected}`;
          passed = (txsForRemit.length === 1 && secondAttemptRejected);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 5, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 6: Import customer with opening balance 450
      // ==========================================
      (function() {
        const testName = 'الحالة 6: استيراد عميل برصيد افتتاحي 450';
        const steps = 'استيراد عميل خالد برصيد 450 دون تفاصيل ديون ومدفوعات سابقة';
        const expected = 'تسجيل قيد افتتاحي موثق بقيمة 450 دون إنشاء تاريخ ديون وهمي';
        let actual = '';
        let passed = false;

        try {
          const importData = [
            { rowIndex: 2, name: 'خالد صالح', phone: '770000000', notes: 'افتتاحي', balance: 450 }
          ];
          const res = ImportCsvService.executeImport(importData);

          const importedCust = AppDatabase.getCustomers().find(c => c.name === 'خالد صالح');
          const m = CustomerService.getCustomerMetrics(importedCust.id);
          const custTxs = AppDatabase.getTransactions().filter(t => t.customerId === importedCust.id);

          const hasOnlyOpening = custTxs.length === 1 && custTxs[0].type === 'opening';
          actual = `عدد العمليات: ${custTxs.length}، نوع العملية: ${custTxs[0] ? custTxs[0].type : 'لا يوجد'}، الرصيد: ${m.balance}`;
          passed = (hasOnlyOpening && m.balance === 450);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 6, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 7: Export backup and restore
      // ==========================================
      (function() {
        const testName = 'الحالة 7: تصدير نسخة احتياطية واستعادتها بالكامل';
        const steps = 'تصدير بيانات الاختبار ككائن نسخة، تفريغ البيانات، ثم استعادتها وفحص التطابق';
        const expected = 'تظل بيانات العملاء والعمليات والأرصدة متوافقة تماماً';
        let actual = '';
        let passed = false;

        try {
          const preBackupCustCount = AppDatabase.getCustomers().length;
          const preBackupTxCount = AppDatabase.getTransactions().length;

          const snapshot = {
            formatVersion: '1.0.0',
            appName: 'SmartDebtManagerProSMS',
            exportedAt: new Date().toISOString(),
            customers: AppDatabase.getCustomers(),
            transactions: AppDatabase.getTransactions(),
            remittances: AppDatabase.getRemittances(),
            templates: AppDatabase.getTemplates(),
            smsLogs: AppDatabase.getSmsLogs(),
            settings: AppDatabase.getSettings()
          };

          // Reset
          AppDatabase.resetAll();

          // Restore
          BackupService.restoreBackup(snapshot, 'full');

          const postCustCount = AppDatabase.getCustomers().length;
          const postTxCount = AppDatabase.getTransactions().length;

          actual = `قبل النسخ: ${preBackupCustCount} عملاء و ${preBackupTxCount} عمليات. بعد الاستعادة: ${postCustCount} عملاء و ${postTxCount} عمليات.`;
          passed = (preBackupCustCount === postCustCount && preBackupTxCount === postTxCount && postCustCount > 0);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 7, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 8: Duplicate Remittance Reference Rejection
      // ==========================================
      (function() {
        const testName = 'الحالة 8: اكتشاف ومنع تكرار الحوالات لنفس الشركة';
        const steps = 'تسجيل حوالة لنفس الشركة برقم مرجعي مستخدم مسبقاً (ت/8000011)';
        const expected = 'رفض تسجيل الحوالة المكررة برسالة تحذير واضحة';
        let actual = '';
        let passed = false;

        try {
          RemittanceService.addRemittance({
            company: 'النجم',
            reference: 'ت/8000011',
            amount: 500
          });
          actual = 'تم قبول الحوالة المكررة بالخطأ!';
          passed = false;
        } catch (e) {
          actual = 'تم رفض الحوالة بنجاح: ' + e.message;
          passed = e.message.includes('حوالة مكررة');
        }

        results.push({ id: 8, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 9: Corrupted Backup File Safety Protection
      // ==========================================
      (function() {
        const testName = 'الحالة 9: أمان البيانات عند محاولة استعادة ملف تالف';
        const steps = 'محاولة استعادة كائن ملف غير مكتمل لا يحتوي على إصدار أو سجل عملاء';
        const expected = 'رفض الاستعادة والحفاظ التام على البيانات الحالية دون فقدان أي سجل';
        let actual = '';
        let passed = false;

        try {
          const preCount = AppDatabase.getCustomers().length;
          let failedGracefully = false;
          try {
            BackupService.restoreBackup({ corrupt: true });
          } catch (err) {
            failedGracefully = true;
          }
          const postCount = AppDatabase.getCustomers().length;
          actual = `تم رفض الملف التالف: ${failedGracefully}، عدد العملاء بعد المحاولة: ${postCount} (كان: ${preCount})`;
          passed = (failedGracefully && preCount === postCount);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 9, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 10: Prevention of customer hard deletion with transactions
      // ==========================================
      (function() {
        const testName = 'الحالة 10: حماية السجل المحاسبي عند محاولة حذف عميل لديه عمليات';
        const steps = 'محاولة حذف العميل خالد ولديه قيد افتتاحي';
        const expected = 'منع الحذف المباشر وعرض توجيه بالأرشفة للحفاظ على السجل المحاسبي';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers().find(c => c.name === 'خالد صالح');
          CustomerService.deleteCustomer(cust.id);
          actual = 'تم الحذف بالخطأ!';
          passed = false;
        } catch (e) {
          actual = 'تم منع الحذف بنجاح: ' + e.message;
          passed = e.message.includes('حفاظاً على سلامة السجل المحاسبي');
        }

        results.push({ id: 10, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 11: Customer Icon & Category Classification
      // ==========================================
      (function() {
        const testName = 'الحالة 11: تخصيص أيقونة العميل وتصنيفه وتصفية العملاء حسب التصنيف';
        const steps = 'إضافة عميل بأيقونة 👑 وتصنيف عميل VIP، وآخر بأيقونة 🏢 وتصنيف تاجر جملة، والتحقق من التصفية';
        const expected = 'حفظ الأيقونة والتصنيف بنجاح وإرجاع نتائج مطابقة عند التصفية';
        let actual = '';
        let passed = false;

        try {
          const vipCust = CustomerService.addCustomer({
            name: 'سالم التاجر',
            phone: '777555111',
            icon: '👑',
            category: 'عميل VIP'
          });

          const regularCust = CustomerService.addCustomer({
            name: 'فارس اليماني',
            phone: '777666222',
            icon: '🏢',
            category: 'تاجر جملة'
          });

          const vipOnly = CustomerService.getCustomers('all', '', 'balance_desc', 'عميل VIP');
          const wholesalerOnly = CustomerService.getCustomers('all', '', 'balance_desc', 'تاجر جملة');

          actual = `VIP: ${vipOnly.length} (اسم: ${vipOnly[0]?.name}, أيقونة: ${vipOnly[0]?.icon})، تاجر جملة: ${wholesalerOnly.length}`;
          passed = (vipOnly.length === 1 && vipOnly[0].icon === '👑' && wholesalerOnly.length === 1 && wholesalerOnly[0].category === 'تاجر جملة');
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 11, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 12: Record Debt with Due Date
      // ==========================================
      (function() {
        const testName = 'الحالة 12: تسجيل دين مع تحديد تاريخ استحقاق مستقبلي';
        const steps = 'تسجيل دين بقيمة 1500 وتاريخ استحقاق 2026-12-31 والتحقق من حفظ تاريخ الاستحقاق في القيد';
        const expected = 'حفظ القيد المحاسبي مع تاريخ الاستحقاق المحدد وربطه بكشف الحساب';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers()[0];
          const txRes = TransactionService.recordTransaction({
            customerId: cust.id,
            type: 'debt',
            amount: 1500,
            dueDate: '2026-12-31',
            notes: 'دين مؤجل'
          });

          const recordedTx = AppDatabase.getTransactions().find(t => t.id === txRes.transaction.id);
          actual = `القيد: ${recordedTx?.id}، المبلغ: ${recordedTx?.amount}، تاريخ الاستحقاق: ${recordedTx?.dueDate}`;
          passed = (recordedTx && recordedTx.dueDate === '2026-12-31' && recordedTx.amount === 1500);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 12, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 13: Smart Assistant Overdue Debts Detection
      // ==========================================
      (function() {
        const testName = 'الحالة 13: المساعد الذكي واكتشاف الديون المتجاوزة لتاريخ استحقاقها';
        const steps = 'تسجيل دين بتاريخ استحقاق قديم (2025-01-01) واختبار دالة getOverdueDebts وتنبيهات المساعد الذكي';
        const expected = 'اكتشاف الدين المتأخر بدقة، وحساب إجمالي المبالغ المستحقة المتأخرة، وإدراجه في التدقيق المحاسبي';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers()[0];
          TransactionService.recordTransaction({
            customerId: cust.id,
            type: 'debt',
            amount: 800,
            dueDate: '2025-01-01',
            notes: 'دين قديم متأخر'
          });

          // Reference date 2026-01-01
          const overdueReport = AssistantService.getOverdueDebts('2026-01-01');
          const audit = AssistantService.runAudit();
          const hasOverdueInsight = audit.some(item => item.title.includes('تنبيه: ديون متجاوزة لتاريخ الاستحقاق'));

          actual = `عدد المتأخرات: ${overdueReport.overdueCount}، إجمالي المتأخرات: ${overdueReport.overdueTotal}، ظهور التنبيه: ${hasOverdueInsight}`;
          passed = (overdueReport.overdueCount >= 1 && overdueReport.overdueTotal >= 800 && hasOverdueInsight);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 13, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 14: Custom Currencies & Per-Customer Currency
      // ==========================================
      (function() {
        const testName = 'الحالة 14: إضافة عملة جديدة مخصصة وتحديد عملة مستقلة للعميل';
        const steps = 'إضافة عملة مخصصة (دينار تونسي / د.ت)، تعيينها لعميل جديد، والتحقق من استخدامها في حساباته';
        const expected = 'إضافة العملة بنجاح، وظهورها في قائمة العملات، وتنسيق رصيد العميل بالعملة المختارة';
        let actual = '';
        let passed = false;

        try {
          const addedCurr = SettingsService.addCustomCurrency({ name: 'دينار تونسي', symbol: 'د.ت' });
          const currencies = SettingsService.getCurrencies();
          const hasCurrency = currencies.some(c => c.code === 'د.ت');

          const cust = CustomerService.addCustomer({
            name: 'طارق التونسي',
            phone: '778899112',
            currency: 'د.ت'
          });

          TransactionService.recordTransaction({
            customerId: cust.id,
            type: 'debt',
            amount: 250
          });

          const enrichedCust = CustomerService.getCustomerById(cust.id);
          const formatted = ValidationService.formatMoney(enrichedCust.balance, enrichedCust.effectiveCurrency);

          actual = `إضافة العملة: ${hasCurrency}، عملة العميل: ${enrichedCust.effectiveCurrency}، الرصيد المنسق: ${formatted}`;
          passed = (hasCurrency && enrichedCust.effectiveCurrency === 'د.ت' && formatted.includes('د.ت') && enrichedCust.balance === 250);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 14, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 15: Device Calendar Notification Scheduler (.ics)
      // ==========================================
      (function() {
        const testName = 'الحالة 15: جدولة تنبيهات تقويم الجهاز (Notification Scheduler)';
        const steps = 'توليد ملف تقويم iCalendar (.ics) لدين مستحق والتحقق من مطابقة معايير RFC 5545 والتنبيه VALARM';
        const expected = 'توليد كود تقويم سليم يحتوي على VCALENDAR، VEVENT، VALARM، وتاريخ الاستحقاق الدقيق';
        let actual = '';
        let passed = false;

        try {
          const icsString = NotificationScheduler.generateIcs([{
            customerName: 'فيصل',
            amount: 500,
            currency: 'ر.س',
            dueDate: '2026-11-15',
            notes: 'فاتورة مؤجلة'
          }]);

          const hasVcal = icsString.includes('BEGIN:VCALENDAR') && icsString.includes('END:VCALENDAR');
          const hasVevent = icsString.includes('BEGIN:VEVENT') && icsString.includes('END:VEVENT');
          const hasValarm = icsString.includes('BEGIN:VALARM') && icsString.includes('TRIGGER:-PT15M');
          const hasCustomer = icsString.includes('فيصل');

          actual = `VCALENDAR: ${hasVcal}، VEVENT: ${hasVevent}، VALARM: ${hasValarm}، العميل: ${hasCustomer}`;
          passed = (hasVcal && hasVevent && hasValarm && hasCustomer);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 15, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 16: Universal Accounting Importer (.json / .sql / excel candidates)
      // ==========================================
      (function() {
        const testName = 'الحالة 16: مستورد الحسابات الشامل وقواعد البيانات';
        const steps = 'تحليل سجلات مستوردة من تطبيق محاسبي خارجي وتنفيذ الاستيراد الآلي مع القيود الافتتاحية';
        const expected = 'استيراد العملاء بنجاح، منع تكرار الأرقام، وتوليد القيود الافتتاحية الموثقة';
        let actual = '';
        let passed = false;

        try {
          const sampleRecords = [
            { name: 'تاجر المحاسب الذكي', phone: '779911223', balance: 1200, notes: 'مستورد من المحاسب الذكي برو' },
            { name: 'عميل دفتر الحسابات', phone: '779911224', balance: 350, notes: 'مستورد من دفتر الحسابات' }
          ];

          const analysis = UniversalImporter.analyzeCandidates(sampleRecords);
          const importRes = UniversalImporter.executeImport(analysis.validRows, { defaultCurrency: '$' });

          const newCust = AppDatabase.getCustomers().find(c => c.name === 'تاجر المحاسب الذكي');
          const metrics = newCust ? CustomerService.getCustomerMetrics(newCust.id) : null;

          actual = `المستوردين: ${importRes.importedCustomers}، القيود: ${importRes.createdTransactions}، رصيد العميل: ${metrics ? metrics.balance : 0}`;
          passed = (importRes.importedCustomers === 2 && importRes.createdTransactions === 2 && metrics && metrics.balance === 1200);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 16, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 17: Arabic CSV with UTF-8 BOM
      // ==========================================
      (function() {
        const testName = 'الحالة 17: استيراد ملف CSV عربي بترميز UTF-8 مع علامة BOM ومعالجة الأرصدة';
        const steps = 'توليد نص CSV مسبوق بـ BOM عربي وفواصل منقوطة، تحليله، إنشاء الحسابات والقيود الافتتاحية';
        const expected = 'إزالة BOM بنجاح، استيراد 2 عملاء، تسجيل قيدين افتتاحيين بقيمة 850 و 1400';
        let actual = '';
        let passed = false;

        try {
          const csvWithBom = '\uFEFFاسم العميل;رقم الهاتف;الرصيد المتبقي;ملاحظات\r\n' +
            '"سالم الكندي";"773344556";"850";"حساب قديم"\r\n' +
            '"مؤسسة الأمل للتجارة";"774455667";"1400";"توريد بضاعة"\r\n';

          const parsedRows = ImportCsvService.parseCsvText(csvWithBom);
          const mapping = ImportCsvService.detectColumns(parsedRows[0]);
          const analysis = ImportCsvService.analyzeCsv(parsedRows, mapping);
          const res = ImportCsvService.executeImport(analysis.validRows);

          const cust1 = AppDatabase.getCustomers().find(c => c.name === 'سالم الكندي');
          const cust2 = AppDatabase.getCustomers().find(c => c.name === 'مؤسسة الأمل للتجارة');

          const m1 = cust1 ? CustomerService.getCustomerMetrics(cust1.id) : null;
          const m2 = cust2 ? CustomerService.getCustomerMetrics(cust2.id) : null;

          actual = `المستوردين: ${res.importedCustomers}، القيود: ${res.createdTransactions}، رصيد1: ${m1 ? m1.balance : 0}، رصيد2: ${m2 ? m2.balance : 0}`;
          passed = (res.importedCustomers === 2 && res.createdTransactions === 2 && m1 && m1.balance === 850 && m2 && m2.balance === 1400);
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 17, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 18: Partial Payment linked to specific debt
      // ==========================================
      (function() {
        const testName = 'الحالة 18: تسجيل دفعة جزئية (Partial Payment) وربطها بدين محدد';
        const steps = 'إضافة عميل، قيد دين 1000، تسجيل دفعة جزئية بقيمة 400 مرتبطة بالدين';
        const expected = 'حالة الدين: مسدد جزئياً، المدفوع منه: 400، المتبقي: 600، رصيد العميل الإجمالي: 600';
        let actual = '';
        let passed = false;

        try {
          const cust = CustomerService.addCustomer({ name: 'فيصل المطري', phone: '779911223' });
          const debtRes = TransactionService.recordTransaction({
            customerId: cust.id,
            type: 'debt',
            amount: 1000,
            reference: 'فاتورة 901'
          });
          const debtId = debtRes.transaction.id;

          const payRes = TransactionService.recordTransaction({
            customerId: cust.id,
            type: 'payment',
            amount: 400,
            linkedDebtId: debtId,
            reference: 'سند قبض جزئي 11'
          });

          const settlement = TransactionService.getDebtSettlement(debtId);
          const metrics = CustomerService.getCustomerMetrics(cust.id);

          actual = `الحالة: ${settlement.settlementStatus}، مدفوع: ${settlement.paidAmount}، متبقي: ${settlement.remainingAmount}، رصيد: ${metrics.balance}`;
          passed = (
            settlement &&
            settlement.settlementStatus === 'partially_paid' &&
            settlement.paidAmount === 400 &&
            settlement.remainingAmount === 600 &&
            metrics.balance === 600
          );
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 18, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 19: Full settlement of linked debt & prevention of overpayment
      // ==========================================
      (function() {
        const testName = 'الحالة 19: استكمال سداد الدين المرتبط بالكامل ومنع السداد الزائد عليه';
        const steps = 'تسجيل دفعة تكميلية 600 على نفس الدين ليصل رصيد الدين إلى 0، ومحاولة دفع زائد يتم رفضها';
        const expected = 'حالة الدين: مسدد بالكامل، المدفوع: 1000، المتبقي: 0، رصيد العميل: 0، ورفض الدفع الإضافي';
        let actual = '';
        let passed = false;

        try {
          const cust = AppDatabase.getCustomers().find(c => c.name === 'فيصل المطري');
          const debtTx = AppDatabase.getTransactions().find(t => t.customerId === cust.id && t.type === 'debt');

          // Pay remaining 600
          TransactionService.recordTransaction({
            customerId: cust.id,
            type: 'payment',
            amount: 600,
            linkedDebtId: debtTx.id,
            reference: 'سند تكميلي 12'
          });

          const settlement = TransactionService.getDebtSettlement(debtTx.id);
          const metrics = CustomerService.getCustomerMetrics(cust.id);

          let rejectedExtra = false;
          try {
            // Attempting to pay more on settled debt
            TransactionService.recordTransaction({
              customerId: cust.id,
              type: 'payment',
              amount: 50,
              linkedDebtId: debtTx.id
            });
          } catch (err) {
            rejectedExtra = true;
          }

          actual = `الحالة: ${settlement.settlementStatus}، مدفوع: ${settlement.paidAmount}، متبقي: ${settlement.remainingAmount}، رصيد: ${metrics.balance}، رفض الزيادة: ${rejectedExtra}`;
          passed = (
            settlement &&
            settlement.settlementStatus === 'fully_paid' &&
            settlement.paidAmount === 1000 &&
            settlement.remainingAmount === 0 &&
            metrics.balance === 0 &&
            rejectedExtra === true
          );
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 19, name: testName, steps, expected, actual, passed });
      })();

      // ==========================================
      // Test 20: Market DB SQLite Processing (188 Customers, 1,327 Txs, 3 Currencies, Suppliers)
      // ==========================================
      (function() {
        const testName = 'الحالة 20: استيراد ومعالجة قاعدة بيانات السوق (Market DB: 188 عميل • 1,327 حركة • 3 عملات)';
        const steps = 'توليد ومعالجة بيانات قاعدة بيانات السوق (Market DB)، والتحقق من حساب الأرصدة والعملات وفصل الموردين واستيراد الحركات التفصيلية';
        const expected = '188 عميل مستخرج، 1327 حركة موزعة بدقة، 3 عملات مستقلة، وتطابق المعادلة المحاسبية (الديون - المسدد = الرصيد)';
        let actual = '';
        let passed = false;

        try {
          // 1. Generate & Process Market DB Data
          const rawDb = UniversalImporter.generateMarketDbDemoData();
          const candidates = UniversalImporter.processMarketDbData(rawDb);

          // Check counts
          const custCount = candidates.length;
          let totalTxs = 0;
          let supplierCount = 0;
          const currenciesSeen = new Set();

          candidates.forEach(c => {
            totalTxs += (c.transactions ? c.transactions.length : 0);
            if (c.category === 'مورد') supplierCount++;
            if (c.currency) currenciesSeen.add(c.currency);
          });

          // Check accounting balance on customer #1
          const c1 = candidates[0];
          const mathValid = (Math.round((c1.debts - c1.payments) * 100) / 100 === c1.balance);

          // Test detailed import on a subset of 3 customers
          const sample = candidates.slice(0, 3);
          const sampleTxsCount = sample.reduce((sum, c) => sum + c.transactions.length, 0);

          const importRes = UniversalImporter.executeImport(sample, {
            importDetailedTransactions: true,
            duplicateHandling: 'create_new'
          });

          // Verify imported customer metrics match candidates
          const importedCust = AppDatabase.getCustomers().find(c => c.name === sample[0].name);
          const metrics = importedCust ? CustomerService.getCustomerMetrics(importedCust.id) : null;
          const balanceMatched = metrics && (metrics.balance === sample[0].balance);

          actual = `العملاء: ${custCount}، الحركات: ${totalTxs}، الموردين: ${supplierCount}، العملات: ${Array.from(currenciesSeen).join('/')}، دقة الحساب: ${mathValid}، حركات مستوردة: ${importRes.createdTransactions} (المتوقع: ${sampleTxsCount})، تطابق الرصيد: ${balanceMatched}`;

          passed = (
            custCount === 188 &&
            totalTxs === 1327 &&
            supplierCount === 10 &&
            currenciesSeen.has('ر.ي') &&
            currenciesSeen.has('$') &&
            currenciesSeen.has('ر.س') &&
            mathValid === true &&
            importRes.createdTransactions === sampleTxsCount &&
            balanceMatched === true
          );
        } catch (e) {
          actual = 'خطأ غير متوقع: ' + e.message;
        }

        results.push({ id: 20, name: testName, steps, expected, actual, passed });
      })();

      // Test 21: Generic SQLite schema-driven mapping and accounting
      (function() {
        const testName = 'الحالة 21: تحليل SQLite عام واكتشاف الجداول والأعمدة والعلاقات دون أسماء ثابتة';
        const steps = 'تحليل مخطط افتراضي بأسماء جداول وأعمدة غير قياسية وربط حركات العملاء وحساب الرصيد';
        const expected = 'اكتشاف العميل وحركتين وحساب رصيد 700 من دين 1000 ودفعة 300';
        let actual = ''; let passed = false;
        try {
          const inspected = {
            tables: [
              { name:'party_cards', columns:[{name:'party_key'},{name:'display_name'},{name:'mobile_no'}], foreignKeys:[], indexes:[] },
              { name:'ledger_entries', columns:[{name:'entry_key'},{name:'party_key'},{name:'entry_kind'},{name:'value_amount'},{name:'entry_date'},{name:'memo'}], foreignKeys:[{from:'party_key',to:'party_key',referencedTable:'party_cards'}], indexes:[] }
            ],
            rowsByTable: {
              party_cards:[{party_key:7,display_name:'عميل الاختبار',mobile_no:'777123456'}],
              ledger_entries:[
                {entry_key:101,party_key:7,entry_kind:'debt',value_amount:1000,entry_date:'2026-11-01',memo:'فاتورة'},
                {entry_key:102,party_key:7,entry_kind:'payment',value_amount:300,entry_date:'2026-11-02',memo:'دفعة'}
              ]
            }, totalRowsRead:3, truncated:false, integrityCheck:['ok'], foreignKeyViolations:[]
          };
          const candidates = UniversalImporter.processGenericSqliteData(inspected);
          const c = candidates[0];
          const analyzed = UniversalImporter.analyzeCandidates(candidates);
          const imported = UniversalImporter.executeImport(analyzed.validRows,{importDetailedTransactions:true,duplicateHandling:'create_new'});
          const saved = AppDatabase.getCustomers().find(x => x.name === 'عميل الاختبار');
          const metrics = saved ? CustomerService.getCustomerMetrics(saved.id) : null;
          const repeated = UniversalImporter.executeImport(analyzed.validRows,{importDetailedTransactions:true,duplicateHandling:'create_new'});
          actual = `عميل=${c.name}؛ حركات=${c.transactions.length}؛ رصيد=${c.balance}؛ مستورد=${imported.createdTransactions}؛ مكرر مرفوض=${repeated.duplicateTransactions}؛ رصيد محفوظ=${metrics ? metrics.balance : 'لا يوجد'}`;
          passed = candidates.length===1 && c.transactions.length===2 && c.balance===700 && imported.createdTransactions===2 && repeated.createdTransactions===0 && repeated.duplicateTransactions===2 && metrics && metrics.balance===700;
        } catch(e) { actual='خطأ غير متوقع: '+e.message; }
        results.push({id:21,name:testName,steps,expected,actual,passed});
      })();

    } finally {
      // Restore sandbox state to user's real state
      AppDatabase.setAllState(backupState);
    }

    return results;
  }

  return {
    runAllTests
  };
})();

window.AccountingTestSuite = AccountingTestSuite;
