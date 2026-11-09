/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Main Application Controller (UI Routing, Modals, Event Listeners)
 */

document.addEventListener('DOMContentLoaded', function() {
  'use strict';

  // Initialize DB
  AppDatabase.init();
  SettingsService.applyTheme(AppDatabase.getSettings());

  // Application State
  const appState = {
    currentScreen: 'dashboard',
    activeCustomerId: null,
    historyStack: ['dashboard'],
    smsQueue: [],
    smsQueueIndex: 0,
    csvPreviewData: null,
    universalImportData: null,
    backupPreviewData: null
  };

  // Toast Notification System
  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (container.contains(toast)) container.removeChild(toast);
      }, 300);
    }, duration);
  }

  // Navigation Router
  function navigateTo(screenId, params = {}) {
    // Hide all screens
    const screens = document.querySelectorAll('.app-screen');
    screens.forEach(s => s.classList.remove('active'));

    const target = document.getElementById('screen-' + screenId);
    if (!target) {
      console.error('Screen not found:', screenId);
      return;
    }

    target.classList.add('active');
    appState.currentScreen = screenId;
    if (params.customerId) {
      appState.activeCustomerId = params.customerId;
    }

    // Update bottom nav highlights
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const navTarget = item.getAttribute('data-screen');
      if (navTarget === screenId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update sub nav tabs highlights
    const tabChips = document.querySelectorAll('.tab-chip');
    tabChips.forEach(chip => {
      const chipTarget = chip.getAttribute('data-screen');
      if (chipTarget === screenId) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Render screen contents
    renderScreen(screenId, params);
  }

  // Render dynamic screen contents
  function renderScreen(screenId, params) {
    switch (screenId) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'customers':
        renderCustomersList();
        break;
      case 'customer_detail':
        renderCustomerDetail(appState.activeCustomerId);
        break;
      case 'transactions':
        renderTransactionsList();
        break;
      case 'remittances':
        renderRemittancesList();
        break;
      case 'sms_management':
        renderSmsManagement();
        break;
      case 'sms_templates':
        renderSmsTemplates();
        break;
      case 'sms_logs':
        renderSmsLogs();
        break;
      case 'reports':
        renderReports();
        break;
      case 'import_csv':
        renderImportScreen();
        break;
      case 'assistant':
        renderAssistant();
        break;
      case 'settings':
        renderSettings();
        break;
      case 'about':
        renderAbout();
        break;
    }
  }

  // ==========================================
  // 1. Dashboard
  // ==========================================
  // Helper: Category badge renderer
  function getCategoryBadgeHtml(category) {
    const cat = category || 'عميل عادي';
    switch (cat) {
      case 'عميل VIP':
        return `<span class="badge badge-vip">👑 VIP</span>`;
      case 'عميل جديد':
        return `<span class="badge badge-new">🆕 جديد</span>`;
      case 'عميل متعثر':
        return `<span class="badge badge-overdue">⚠️ متعثر</span>`;
      case 'تاجر جملة':
        return `<span class="badge badge-wholesaler">🏢 جملة</span>`;
      case 'عميل تجزئة':
        return `<span class="badge badge-retail">🛒 تجزئة</span>`;
      default:
        return `<span class="badge badge-regular">${cat}</span>`;
    }
  }

  // Helper: Icon Picker renderer
  function renderIconPicker(containerId, hiddenInputId, selectedIcon) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container || !hiddenInput) return;

    const settings = AppDatabase.getSettings();
    const icons = (settings && settings.availableIcons) 
      ? settings.availableIcons 
      : ['👤', '👑', '🏪', '🛒', '🏢', '💼', '⭐', '🚗', '📱', '🛠️', '🌾', '📦', '🤝', '💎', '👨‍💼', '👩‍💼'];
    const active = selectedIcon || hiddenInput.value || '👤';
    hiddenInput.value = active;

    container.innerHTML = icons.map(icon => `
      <button type="button" class="icon-picker-btn ${icon === active ? 'active' : ''}" data-icon="${icon}" onclick="App.selectIconPicker('${containerId}', '${hiddenInputId}', '${icon}')">
        ${icon}
      </button>
    `).join('');
  }

  // ==========================================
  // 1. Dashboard
  // ==========================================
  function renderDashboard() {
    const summary = ReportService.getDashboardSummary();
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    // 1. Smart Assistant: Overdue Debts Alert Banner
    const overdueContainer = document.getElementById('dash-overdue-alert-container');
    if (overdueContainer) {
      const overdue = AssistantService.getOverdueDebts();
      if (overdue.count > 0) {
        overdueContainer.innerHTML = `
          <div class="overdue-alert-banner">
            <div class="overdue-alert-content">
              <span class="overdue-alert-icon">⏰</span>
              <div class="overdue-alert-text">
                <h4>تنبيه ذكي: لديك (${overdue.count}) ديون متجاوزة لتاريخ الاستحقاق!</h4>
                <p>إجمالي المبالغ المستحقة المتأخرة: <strong>${ValidationService.formatMoney(overdue.totalOverdueAmount, cur)}</strong> لـ ${overdue.items.length} عملاء.</p>
              </div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-danger btn-sm" onclick="App.navigateTo('sms_management')">مطالبة SMS 💬</button>
              <button class="btn btn-outline btn-sm" onclick="App.navigateTo('assistant')">التفاصيل 🧠</button>
            </div>
          </div>
        `;
      } else {
        overdueContainer.innerHTML = '';
      }
    }

    // Update numbers
    document.getElementById('dash-total-debts').textContent = ValidationService.formatMoney(summary.totalDebts, cur);
    document.getElementById('dash-total-payments').textContent = ValidationService.formatMoney(summary.totalPayments, cur);
    document.getElementById('dash-total-balance').textContent = ValidationService.formatMoney(summary.totalRemaining, cur);

    document.getElementById('dash-customers-count').textContent = summary.totalCustomers;
    document.getElementById('dash-debtors-count').textContent = summary.debtorsCount;
    document.getElementById('dash-settled-count').textContent = summary.settledCount;

    // Recent Transactions
    const recentTxsContainer = document.getElementById('dash-recent-txs');
    if (!recentTxsContainer) return;

    if (summary.recentTransactions.length === 0) {
      recentTxsContainer.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <div class="empty-icon">📝</div>
          <div class="empty-title">لا توجد عمليات مسجلة بعد</div>
          <div class="empty-desc">ابدأ بإضافة أول عميل ثم سجل الديون والمدفوعات بسهولة.</div>
          <button class="btn btn-primary btn-sm" onclick="App.openAddCustomerModal()">+ إضافة أول عميل</button>
        </div>
      `;
    } else {
      const customersMap = {};
      AppDatabase.getCustomers().forEach(c => customersMap[c.id] = c);

      recentTxsContainer.innerHTML = summary.recentTransactions.map(tx => {
        const isDebt = tx.type === 'debt' || (tx.type === 'opening' && tx.amount >= 0);
        const typeBadge = isDebt 
          ? `<span class="badge badge-debt">دين</span>` 
          : `<span class="badge badge-payment">دفعة</span>`;
        const cust = customersMap[tx.customerId];
        const cName = cust ? cust.name : 'عميل محذوف';
        const cIcon = cust ? (cust.icon || '👤') : '👤';

        return `
          <div class="tx-item" onclick="App.viewCustomer('${tx.customerId}')" style="cursor: pointer;">
            <div class="tx-info" style="display: flex; flex-direction: row; align-items: center; gap: 8px;">
              <span class="customer-avatar-icon">${cIcon}</span>
              <div>
                <div class="tx-title">${typeBadge} <strong>${cName}</strong></div>
                <div class="tx-meta">${tx.date} ${tx.dueDate ? '• ⏰ الاستحقاق: ' + tx.dueDate : ''} ${tx.reference ? '• ر/م: ' + tx.reference : ''}</div>
              </div>
            </div>
            <div class="tx-amount ${isDebt ? 'debt' : 'payment'}">
              ${isDebt ? '+' : '-'}${ValidationService.formatMoney(tx.amount, cur)}
            </div>
          </div>
        `;
      }).join('');
    }

    // Recent Remittances
    const recentRemitsContainer = document.getElementById('dash-recent-remittances');
    if (recentRemitsContainer) {
      if (summary.recentRemittances.length === 0) {
        recentRemitsContainer.innerHTML = `<p class="form-hint" style="text-align:center; padding: 10px;">لا توجد حوالات مسجلة مؤخراً.</p>`;
      } else {
        recentRemitsContainer.innerHTML = summary.recentRemittances.map(r => {
          const statusBadge = r.matchingStatus === 'recorded_as_payment'
            ? `<span class="badge badge-payment">مسجلة كدفعة</span>`
            : `<span class="badge badge-warning">بانتظار التأكيد</span>`;
          return `
            <div class="tx-item">
              <div class="tx-info">
                <div class="tx-title"><strong>${r.company}</strong> ${statusBadge}</div>
                <div class="tx-meta">المرسل: ${r.senderName || '-'} • ر/م: ${r.reference} • ${r.date}</div>
              </div>
              <div class="tx-amount payment">
                ${ValidationService.formatMoney(r.amount, cur)}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // ==========================================
  // 2. Customers List
  // ==========================================
  function renderCustomersList() {
    const searchInput = document.getElementById('customers-search-input');
    const filterSelect = document.getElementById('customers-filter-select');
    const sortSelect = document.getElementById('customers-sort-select');
    const categorySelect = document.getElementById('customers-category-select');

    const query = searchInput ? searchInput.value : '';
    const filter = filterSelect ? filterSelect.value : 'all';
    const sort = sortSelect ? sortSelect.value : 'balance_desc';
    const category = categorySelect ? categorySelect.value : 'all';

    const customers = CustomerService.getCustomers(filter, query, sort, category);
    const container = document.getElementById('customers-list-container');
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    if (!container) return;

    if (customers.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">لا يوجد عملاء مطابقون للبحث والتصنيف</div>
          <div class="empty-desc">يمكنك إضافة عميل جديد أو تغيير معايير البحث والتصفية.</div>
          <button class="btn btn-primary" onclick="App.openAddCustomerModal()">+ إضافة عميل جديد</button>
        </div>
      `;
      return;
    }

    container.innerHTML = customers.map(c => {
      const isDebtor = c.balance > 0;
      const statusBadge = isDebtor 
        ? `<span class="badge badge-debt">مدين</span>` 
        : (c.balance === 0 ? `<span class="badge badge-settled">مسدد</span>` : `<span class="badge badge-info">دائن</span>`);
      const custCur = c.effectiveCurrency || c.currency || cur;

      return `
        <div class="customer-card">
          <div class="customer-card-header">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <span class="customer-avatar-icon" title="أيقونة العميل">${c.icon || '👤'}</span>
              <div>
                <div class="customer-name" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span>${c.name}</span>
                  ${getCategoryBadgeHtml(c.category)}
                  ${c.currency ? `<span class="badge" style="background:#E0F2FE; color:#0369A1; font-size:10px;">${c.currency}</span>` : ''}
                  ${statusBadge}
                  ${c.archived ? '<span class="badge" style="background:#64748B;color:#fff;">مؤرشف</span>' : ''}
                </div>
                <div class="customer-phone">${c.phone ? '📞 ' + c.phone : '<span style="color:#94a3b8">بدون هاتف</span>'}</div>
              </div>
            </div>
            <div class="customer-balance-box">
              <div style="font-size: 11px; color: var(--color-text-muted);">الرصيد المتبقي</div>
              <div class="customer-balance-amount ${isDebtor ? 'debt' : 'settled'}">
                ${ValidationService.formatMoney(c.balance, custCur)}
              </div>
            </div>
          </div>

          <div class="customer-stats-row">
            <div class="item">
              <span class="lbl">إجمالي الديون:</span>
              <span class="val text-danger" style="color:var(--color-debt);">${ValidationService.formatMoney(c.totalDebts, custCur)}</span>
            </div>
            <div class="item">
              <span class="lbl">إجمالي المسدد:</span>
              <span class="val text-success" style="color:var(--color-payment);">${ValidationService.formatMoney(c.totalPayments, custCur)}</span>
            </div>
          </div>

          <div class="customer-actions-row">
            <button class="btn btn-outline btn-sm" onclick="App.viewCustomer('${c.id}')">👁️ التفاصيل والكشف</button>
            <button class="btn btn-danger btn-sm" onclick="App.openRecordDebtModal('${c.id}')">+ دين</button>
            <button class="btn btn-success btn-sm" onclick="App.openRecordPaymentModal('${c.id}')">+ دفعة</button>
            ${isDebtor ? `<button class="btn btn-primary btn-sm" onclick="App.openSendSmsModal('${c.id}')">💬 SMS</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // 3. Customer Detail & Statement
  // ==========================================
  function renderCustomerDetail(customerId) {
    if (!customerId) {
      navigateTo('customers');
      return;
    }

    const customer = CustomerService.getCustomerById(customerId);
    if (!customer) {
      showToast('العميل غير موجود.', 'error');
      navigateTo('customers');
      return;
    }

    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';
    const custCur = customer.effectiveCurrency || customer.currency || cur;

    document.getElementById('detail-customer-name').innerHTML = `
      <span class="customer-avatar-icon" style="width: 36px; height: 36px; font-size: 20px; vertical-align: middle; margin-left: 8px;">${customer.icon || '👤'}</span>
      <span>${customer.name}</span>
      ${getCategoryBadgeHtml(customer.category)}
      <span class="badge" style="background:#E0F2FE; color:#0369A1; font-size:11px;">عملة الحساب: ${custCur}</span>
    `;
    document.getElementById('detail-customer-phone').textContent = customer.phone || 'غير مسجل';
    document.getElementById('detail-customer-notes').textContent = customer.notes || 'لا توجد ملاحظات';

    document.getElementById('detail-balance').textContent = ValidationService.formatMoney(customer.balance, custCur);
    document.getElementById('detail-total-debts').textContent = ValidationService.formatMoney(customer.totalDebts, custCur);
    document.getElementById('detail-total-payments').textContent = ValidationService.formatMoney(customer.totalPayments, custCur);

    // Setup action buttons with current ID
    document.getElementById('btn-cust-add-debt').onclick = () => App.openRecordDebtModal(customerId);
    document.getElementById('btn-cust-add-payment').onclick = () => App.openRecordPaymentModal(customerId);
    document.getElementById('btn-cust-edit').onclick = () => App.openEditCustomerModal(customerId);
    document.getElementById('btn-cust-statement').onclick = () => App.printCustomerStatement(customerId);
    document.getElementById('btn-cust-sms').onclick = () => App.openSendSmsModal(customerId);
    document.getElementById('btn-cust-archive').onclick = () => App.toggleArchiveCustomer(customerId);
    document.getElementById('btn-cust-delete').onclick = () => App.deleteCustomer(customerId);

    // Statement / Transactions history
    const statement = ReportService.generateCustomerStatement(customerId);
    const tableBody = document.getElementById('detail-tx-table-body');
    if (!tableBody) return;

    if (statement.rows.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748B;">لا توجد عمليات مسجلة لهذا العميل حتى الآن.</td></tr>`;
      return;
    }

    const todayStr = ValidationService.formatDate();
    tableBody.innerHTML = statement.rows.map(row => {
      const isDebt = row.type === 'debt' || (row.type === 'opening' && row.debit > 0);
      const isOverdue = row.dueDate && row.dueDate < todayStr && customer.balance > 0;
      const debtSettlement = isDebt ? TransactionService.getDebtSettlement(row.id) : null;

      let settlementBadge = '';
      if (debtSettlement && debtSettlement.paidAmount > 0) {
        if (debtSettlement.isSettled) {
          settlementBadge = `<br><span class="badge" style="background:#DCFCE7; color:#188754; font-size:10px; margin-top:2px;">✓ مسدد بالكامل</span>`;
        } else {
          settlementBadge = `
            <br><span class="badge" style="background:#FEF3C7; color:#B45309; font-size:10px; margin-top:2px;">مسدد جزئياً: مدفوع ${ValidationService.formatMoney(debtSettlement.paidAmount, custCur)} (المتبقي: ${ValidationService.formatMoney(debtSettlement.remainingAmount, custCur)})</span>
            <button class="btn btn-outline btn-sm" style="padding:1px 6px; font-size:10px; margin-top:2px;" onclick="App.openRecordPaymentModal('${customer.id}', '${row.id}')" title="تسجيل دفعة تكميلية لهذا الدين">سداد دفعة 💳</button>
          `;
        }
      }

      let linkedBadge = '';
      if (row.type === 'payment' && row.linkedDetail) {
        linkedBadge = `<br><span class="badge" style="background:#E0F2FE; color:#0284C7; font-size:10px; margin-top:2px;">🔗 دفعة جزئية عن: ${row.linkedDetail.ref}</span>`;
      }

      return `
        <tr>
          <td>${row.date}</td>
          <td>
            <span class="badge ${isDebt ? 'badge-debt' : 'badge-payment'}">${row.typeLabel}</span>
            ${settlementBadge}
            ${linkedBadge}
          </td>
          <td class="amount text-danger" style="color:var(--color-debt);">${row.debit > 0 ? ValidationService.formatMoney(row.debit, custCur) : '-'}</td>
          <td class="amount text-success" style="color:var(--color-payment);">${row.credit > 0 ? ValidationService.formatMoney(row.credit, custCur) : '-'}</td>
          <td class="amount" style="font-weight:800;">${ValidationService.formatMoney(row.balanceAfter, custCur)}</td>
          <td>
            ${row.notes || '-'}
            ${row.reference && row.reference !== '-' ? `<br><small style="color:#64748B">ر/م: ${row.reference}</small>` : ''}
            ${row.dueDate ? `
              <br><small style="color:${isOverdue ? 'var(--color-debt)' : '#0284C7'}; font-weight:700;">⏰ استحقاق: ${row.dueDate} ${isOverdue ? '<span class="badge badge-overdue" style="font-size:10px; padding:1px 5px;">متأخر ⚠️</span>' : ''}</small>
              <br><button class="btn btn-outline btn-sm" style="padding: 1px 6px; font-size: 11px; margin-top: 3px;" onclick="App.scheduleSingleDebtReminder('${customer.id}', '${row.id}', '${row.debit}', '${row.dueDate}')" title="جدولة تذكير بالتقويم">📅 تذكير بالتقويم</button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  // ==========================================
  // 4. Transactions List
  // ==========================================
  function renderTransactionsList() {
    const typeFilter = document.getElementById('tx-filter-type') ? document.getElementById('tx-filter-type').value : 'all';
    const txs = TransactionService.getTransactions({ type: typeFilter });
    const container = document.getElementById('tx-list-container');
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    if (!container) return;

    if (txs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💳</div>
          <div class="empty-title">لا توجد عمليات مطابقة</div>
          <div class="empty-desc">يمكنك تسجيل دين أو دفعة جديدة من الأزرار السريعة.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = txs.map(tx => {
      const isDebt = tx.type === 'debt' || (tx.type === 'opening' && tx.amount >= 0);
      const isCancelled = tx.status === 'cancelled';
      const cust = CustomerService.getCustomerById(tx.customerId);
      const custCur = cust ? (cust.effectiveCurrency || cust.currency || cur) : cur;

      let settlementTag = '';
      if (tx.settlement && tx.settlement.paidAmount > 0) {
        if (tx.settlement.isSettled) {
          settlementTag = '<span class="badge" style="background:#DCFCE7; color:#188754; font-size:10px; margin-right:4px;">✓ مسدد بالكامل</span>';
        } else {
          settlementTag = `<span class="badge" style="background:#FEF3C7; color:#B45309; font-size:10px; margin-right:4px;">مسدد جزئياً (متبقي: ${ValidationService.formatMoney(tx.settlement.remainingAmount, custCur)})</span>`;
        }
      }

      let linkedTag = '';
      if (tx.linkedDebtInfo) {
        linkedTag = `<span class="badge" style="background:#E0F2FE; color:#0284C7; font-size:10px; margin-right:4px;">🔗 دفعة عن دين: ${tx.linkedDebtInfo.reference || tx.linkedDebtInfo.date}</span>`;
      }

      return `
        <div class="tx-item" style="${isCancelled ? 'opacity: 0.5; background: #FFF1F2;' : ''}">
          <div class="tx-info">
            <div class="tx-title">
              <span class="badge ${isDebt ? 'badge-debt' : 'badge-payment'}">
                ${tx.type === 'debt' ? 'دين' : (tx.type === 'payment' ? 'دفعة' : 'قيد افتتاحي')}
              </span>
              <strong>${tx.customerName}</strong>
              ${settlementTag}
              ${linkedTag}
              ${isCancelled ? '<span class="badge" style="background:#EF4444;color:#fff;">ملغاة</span>' : ''}
            </div>
            <div class="tx-meta">
              📅 ${tx.date} ${tx.reference ? '• ر/م: ' + tx.reference : ''}
              ${tx.notes ? '• ' + tx.notes : ''}
            </div>
          </div>
          <div style="text-align: left;">
            <div class="tx-amount ${isDebt ? 'debt' : 'payment'}">
              ${isDebt ? '+' : '-'}${ValidationService.formatMoney(tx.amount, custCur)}
            </div>
            ${!isCancelled ? `
              <button class="btn btn-outline btn-sm" style="margin-top: 4px; padding: 2px 8px; font-size: 11px; color: var(--color-debt);" onclick="App.cancelTransactionPrompt('${tx.id}')">إلغاء العملية</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // 5. Inward Remittances
  // ==========================================
  function renderRemittancesList() {
    const list = RemittanceService.getRemittances();
    const container = document.getElementById('remittances-list-container');
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📨</div>
          <div class="empty-title">لا توجد حوالات واردة مسجلة</div>
          <div class="empty-desc">سجل الحوالات الواردة من شركات الصرافة واربطها بالعملاء لترحيلها كدفعات معتمدة.</div>
          <button class="btn btn-primary" onclick="App.openAddRemittanceModal()">+ تسجيل حوالة جديدة</button>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(r => {
      const isRecorded = r.matchingStatus === 'recorded_as_payment';
      const statusBadge = isRecorded 
        ? `<span class="badge badge-payment">مسجلة كدفعة</span>` 
        : (r.customerId ? `<span class="badge badge-info">مطابقة لعميل</span>` : `<span class="badge badge-warning">غير مطابقة</span>`);

      return `
        <div class="card" style="margin-bottom: 12px;">
          <div class="card-header" style="margin-bottom: 8px; padding-bottom: 6px;">
            <div class="card-title" style="font-size: 14px;">
              <span>🏢 ${r.company}</span>
              ${statusBadge}
            </div>
            <div style="font-size: 16px; font-weight: 800; color: var(--color-payment);" class="amount">
              ${ValidationService.formatMoney(r.amount, cur)}
            </div>
          </div>
          <div style="font-size: 13px; color: var(--color-text-main); margin-bottom: 8px; line-height: 1.6;">
            <div><strong>المرسل:</strong> ${r.senderName || 'غير مسجل'} ${r.senderPhone ? '(' + r.senderPhone + ')' : ''}</div>
            <div><strong>الرقم المرجعي للحوالة:</strong> <span style="font-family:monospace; font-weight:700;">${r.reference}</span></div>
            <div><strong>العميل المرتبط:</strong> <span style="color:var(--color-primary-dark); font-weight:700;">${r.customerName}</span></div>
            <div><strong>تاريخ الحوالة:</strong> ${r.date} ${r.notes ? '• ' + r.notes : ''}</div>
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px dashed var(--color-border); padding-top: 8px;">
            ${!isRecorded ? `
              <button class="btn btn-outline btn-sm" onclick="App.openLinkRemittanceModal('${r.id}')">🔗 ربط بعميل</button>
              <button class="btn btn-success btn-sm" onclick="App.confirmRemittanceAsPayment('${r.id}')">✅ تأكيد وترحيل كدفعة</button>
            ` : `
              <span style="font-size: 12px; color: #16A34A; font-weight: 700;">تم ترحيلها بنجاح للدفاتر (رقم العملية: ${r.paymentTransactionId})</span>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // 6. SMS Management
  // ==========================================
  function renderSmsManagement() {
    const debtors = CustomerService.getCustomers('debtors');
    const container = document.getElementById('sms-debtors-list-container');
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    // Populate templates dropdown
    const tplSelect = document.getElementById('sms-template-select');
    if (tplSelect) {
      const templates = SmsService.getTemplates();
      tplSelect.innerHTML = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    if (!container) return;

    if (debtors.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎉</div>
          <div class="empty-title">لا يوجد عملاء مدينون حالياً!</div>
          <div class="empty-desc">جميع ديون العملاء مسددة بالكامل. لا حاجة لإرسال أي تذكيرات.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #fff; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--color-border);">
        <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; cursor: pointer;">
          <input type="checkbox" id="sms-select-all-checkbox" onchange="App.toggleSelectAllDebtors(this)">
          تحديد جميع العملاء المدينين (${debtors.length})
        </label>
        <button class="btn btn-primary btn-sm" onclick="App.prepareBulkSmsQueue()">تجهيز رسائل المحددين 💬</button>
      </div>
      <div class="debtors-checkbox-list">
        ${debtors.map(c => `
          <div class="customer-card" style="margin-bottom: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;">
                <input type="checkbox" class="debtor-checkbox" value="${c.id}" data-phone="${c.phone || ''}" data-name="${c.name}">
                <div>
                  <div style="font-weight: 700;">${c.name}</div>
                  <div style="font-size: 12px; color: var(--color-text-muted); direction: ltr; display: inline-block;">
                    ${c.phone ? '📞 ' + c.phone : '<span style="color:var(--color-debt)">⚠️ لا يوجد هاتف</span>'}
                  </div>
                </div>
              </label>
              <div style="text-align: left;">
                <div class="amount text-danger" style="font-weight: 800; color: var(--color-debt);">${ValidationService.formatMoney(c.balance, cur)}</div>
                <button class="btn btn-outline btn-sm" style="margin-top: 4px; padding: 2px 8px; font-size: 11px;" onclick="App.openSendSmsModal('${c.id}')">إرسال فردي</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ==========================================
  // 7. SMS Templates & Logs
  // ==========================================
  function renderSmsTemplates() {
    const list = SmsService.getTemplates();
    const container = document.getElementById('sms-templates-container');
    if (!container) return;

    container.innerHTML = list.map(t => `
      <div class="card" style="margin-bottom: 12px;">
        <div class="card-header">
          <div class="card-title">📝 ${t.name}</div>
          <div>
            <button class="btn btn-outline btn-sm" onclick="App.openEditTemplateModal('${t.id}')">تعديل</button>
            <button class="btn btn-outline btn-sm" style="color: var(--color-debt);" onclick="App.deleteTemplatePrompt('${t.id}')">حذف</button>
          </div>
        </div>
        <div style="font-size: 13px; line-height: 1.6; background: var(--color-bg); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); white-space: pre-wrap;">${t.content}</div>
        <div class="form-hint" style="margin-top: 8px;">
          المتغيرات المدعومة: {اسم_العميل} ، {الرصيد} ، {إجمالي_الديون} ، {إجمالي_المدفوعات} ، {التاريخ}
        </div>
      </div>
    `).join('');
  }

  function renderSmsLogs() {
    const list = SmsService.getLogs();
    const container = document.getElementById('sms-logs-container');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📨</div>
          <div class="empty-title">سجل الرسائل فارغ</div>
          <div class="empty-desc">سيتم أرشفة أي رسالة ترسلها أو تجهزها هنا للرجوع إليها مستقبلاً.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
        <button class="btn btn-outline btn-sm" style="color: var(--color-debt);" onclick="App.clearSmsLogsPrompt()">مسح السجل</button>
      </div>
      ${list.map(log => `
        <div class="tx-item" style="margin-bottom: 8px; flex-direction: column; align-items: flex-start; gap: 6px;">
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <strong>👤 ${log.customerName} (📞 ${log.phone})</strong>
            <span class="badge badge-payment">جاهزة/مرسلة</span>
          </div>
          <div style="font-size: 13px; color: var(--color-text-main); background: var(--color-bg); padding: 8px; border-radius: 6px; width: 100%;">
            ${log.renderedMessage}
          </div>
          <div class="tx-meta">📅 ${new Date(log.preparedAt).toLocaleString('ar-EG')}</div>
        </div>
      `).join('')}
    `;
  }

  // ==========================================
  // 8. Financial Reports
  // ==========================================
  function renderReports() {
    const reportType = document.getElementById('report-type-select') ? document.getElementById('report-type-select').value : 'all_balances';
    const periodSelect = document.getElementById('report-period-select') ? document.getElementById('report-period-select').value : 'all';
    const customStart = document.getElementById('report-start-date') ? document.getElementById('report-start-date').value : '';
    const customEnd = document.getElementById('report-end-date') ? document.getElementById('report-end-date').value : '';

    const container = document.getElementById('report-output-container');
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    if (!container) return;

    // Build data according to report type
    let title = '';
    let headers = [];
    let rows = [];
    let totalsHtml = '';

    // Calculate dates from period select or custom date inputs
    const dates = periodSelect !== 'custom' 
      ? ReportService.getPeriodDateRange(periodSelect, customStart, customEnd) 
      : { start: customStart, end: customEnd };

    if (reportType === 'all_balances' || reportType === 'debtors' || reportType === 'settled') {
      let filter = 'all';
      if (reportType === 'debtors') filter = 'debtors';
      if (reportType === 'settled') filter = 'settled';

      const customers = CustomerService.getCustomers(filter);
      title = reportType === 'debtors' ? 'تقرير العملاء المدينين' : (reportType === 'settled' ? 'تقرير العملاء المسددين' : 'تقرير الأرصدة المتبقية لكافة العملاء');
      headers = ['اسم العميل', 'رقم الهاتف', 'إجمالي الديون', 'إجمالي المدفوعات', 'الرصيد المتبقي'];

      let sumDebts = 0;
      let sumPayments = 0;
      let sumBalance = 0;

      rows = customers.map(c => {
        sumDebts += c.totalDebts;
        sumPayments += c.totalPayments;
        sumBalance += c.balance;
        return [
          c.name,
          c.phone || '-',
          ValidationService.formatMoney(c.totalDebts, cur),
          ValidationService.formatMoney(c.totalPayments, cur),
          ValidationService.formatMoney(c.balance, cur)
        ];
      });

      totalsHtml = `
        <div class="stats-grid" style="margin-top: 14px;">
          <div class="stat-card debt-border">
            <div class="stat-label">مجموع الديون</div>
            <div class="stat-value">${ValidationService.formatMoney(sumDebts, cur)}</div>
          </div>
          <div class="stat-card payment-border">
            <div class="stat-label">مجموع المدفوعات</div>
            <div class="stat-value">${ValidationService.formatMoney(sumPayments, cur)}</div>
          </div>
          <div class="stat-card balance-border">
            <div class="stat-label">صافي الأرصدة المستحقة</div>
            <div class="stat-value">${ValidationService.formatMoney(sumBalance, cur)}</div>
          </div>
        </div>
      `;
    } else if (reportType === 'transactions') {
      const txs = TransactionService.getTransactions({
        startDate: dates.start,
        endDate: dates.end
      });

      title = 'تقرير العمليات المالية';
      headers = ['التاريخ', 'اسم العميل', 'نوع العملية', 'المبلغ', 'الرقم المرجعي', 'البيان والملاحظات'];

      let sumD = 0;
      let sumP = 0;

      rows = txs.map(t => {
        const isDebt = t.type === 'debt' || (t.type === 'opening' && t.amount >= 0);
        if (t.status !== 'cancelled') {
          if (isDebt) sumD += t.amount;
          else sumP += t.amount;
        }
        return [
          t.date,
          t.customerName,
          t.type === 'debt' ? 'دين' : (t.type === 'payment' ? 'دفعة' : 'افتتاحي'),
          ValidationService.formatMoney(t.amount, cur),
          t.reference || '-',
          t.notes || '-'
        ];
      });

      totalsHtml = `
        <div class="stats-grid" style="margin-top: 14px;">
          <div class="stat-card debt-border">
            <div class="stat-label">إجمالي الديون بالفترة</div>
            <div class="stat-value">${ValidationService.formatMoney(sumD, cur)}</div>
          </div>
          <div class="stat-card payment-border">
            <div class="stat-label">إجمالي المسدد بالفترة</div>
            <div class="stat-value">${ValidationService.formatMoney(sumP, cur)}</div>
          </div>
          <div class="stat-card balance-border">
            <div class="stat-label">صافي حركة الفترة</div>
            <div class="stat-value">${ValidationService.formatMoney(sumD - sumP, cur)}</div>
          </div>
        </div>
      `;
    } else if (reportType === 'remittances') {
      let remits = RemittanceService.getRemittances();
      if (dates.start) {
        remits = remits.filter(r => r.date >= dates.start);
      }
      if (dates.end) {
        remits = remits.filter(r => r.date <= dates.end);
      }

      title = 'تقرير الحوالات الواردة';
      headers = ['التاريخ', 'الشركة', 'المرسل', 'الرقم المرجعي', 'المبلغ', 'العميل', 'الحالة'];
      let totalRemitAmount = 0;

      rows = remits.map(r => {
        totalRemitAmount += r.amount;
        return [
          r.date,
          r.company,
          r.senderName || '-',
          r.reference,
          ValidationService.formatMoney(r.amount, cur),
          r.customerName,
          r.matchingStatus === 'recorded_as_payment' ? 'مسجلة كدفعة' : 'بانتظار التأكيد'
        ];
      });

      totalsHtml = `
        <div class="stat-card payment-border" style="margin-top: 14px;">
          <div class="stat-label">إجمالي مبالغ الحوالات الواردة بالفترة</div>
          <div class="stat-value">${ValidationService.formatMoney(totalRemitAmount, cur)}</div>
        </div>
      `;
    }

    // Determine period description label
    let periodDesc = 'كافة الفترات';
    if (dates.start && dates.end) {
      periodDesc = `من ${dates.start} إلى ${dates.end}`;
    } else if (dates.start) {
      periodDesc = `من ${dates.start} فصاعداً`;
    } else if (dates.end) {
      periodDesc = `حتى ${dates.end}`;
    }
    const pieChartHtml = ReportService.renderCategoryPieChartHtml();

    container.innerHTML = `
      ${pieChartHtml}
      <div class="statement-sheet">
        <div class="statement-header">
          <div>
            <div class="statement-title">${title}</div>
            <div class="statement-meta">
              <span>تاريخ الاستخراج: ${ValidationService.formatDate()}</span>
              <span> • الفترة المحددة: <strong>${periodDesc}</strong></span>
              <span> • التطبيق: ${settings.appTitle}</span>
            </div>
          </div>
          <div class="no-print">
            <button class="btn btn-outline btn-sm" onclick="App.exportCurrentReportCsv()">تصدير CSV 📥</button>
            <button class="btn btn-primary btn-sm" onclick="window.print()">طباعة 🖨️</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="app-table">
            <thead>
              <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.length === 0 
                ? `<tr><td colspan="${headers.length}" style="text-align: center; padding: 20px;">لا توجد بيانات مطابقة لهذا التقرير خلال الفترة المحددة.</td></tr>` 
                : rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>

        ${totalsHtml}
      </div>
    `;

    // Save for CSV export
    appState.currentReport = { title, headers, rows };
  }

  // ==========================================
  // 9. Smart Local Assistant & AI Financial Intelligence
  // ==========================================
  function renderAssistant() {
    const insights = AssistantService.runAudit();
    const health = AssistantService.getFinancialHealthScore();
    const settings = AppDatabase.getSettings();
    const cur = settings.currency || 'ر.ي';

    const container = document.getElementById('assistant-insights-container');
    if (!container) return;

    container.innerHTML = `
      <!-- AI Intelligence Header -->
      <div style="background: linear-gradient(135deg, #103B59 0%, #087FA8 100%); color: #fff; padding: 18px; border-radius: var(--radius-md); margin-bottom: 16px; box-shadow: 0 4px 15px rgba(16, 59, 89, 0.25);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 28px;">🧠</span>
            <div>
              <h3 style="font-size: 17px; font-weight: 700; margin: 0;">المساعد المالي والذكاء الاصطناعي المحلي</h3>
              <div style="font-size: 11px; opacity: 0.9;">يعمل محلياً بالكامل 100% دون إنترنت مع أعلى معايير أمان البيانات</div>
            </div>
          </div>
          <span class="badge" style="background: rgba(255,255,255,0.2); color: #fff; font-size: 12px; padding: 6px 12px; border-radius: 20px;">
            مؤشر الصحة المالية: ${health.score}/100
          </span>
        </div>

        <!-- AI Health Score Card -->
        <div style="background: rgba(255,255,255,0.12); padding: 14px; border-radius: 10px; backdrop-filter: blur(4px);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 600;">تقييم السيولة والمخاطر:</span>
            <span style="font-weight: 700; color: #00D5D9;">${health.level}</span>
          </div>
          <div style="height: 8px; background: rgba(255,255,255,0.25); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
            <div style="height: 100%; width: ${health.score}%; background: ${health.color}; border-radius: 4px; transition: width 0.6s ease;"></div>
          </div>

          <!-- Mini Metrics -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; text-align: center; font-size: 11px;">
            <div style="background: rgba(0,0,0,0.18); padding: 6px; border-radius: 6px;">
              <div style="opacity: 0.8;">نسبة التحصيل</div>
              <strong style="font-size: 13px;">${health.collectionRate}%</strong>
            </div>
            <div style="background: rgba(0,0,0,0.18); padding: 6px; border-radius: 6px;">
              <div style="opacity: 0.8;">الديون المتأخرة</div>
              <strong style="font-size: 13px; color: #FECACA;">${ValidationService.formatMoney(health.totalOverdue, cur)}</strong>
            </div>
            <div style="background: rgba(0,0,0,0.18); padding: 6px; border-radius: 6px;">
              <div style="opacity: 0.8;">العملاء المدينون</div>
              <strong style="font-size: 13px;">${health.activeDebtors} عميل</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- AI Cashflow Projections -->
      <div class="card" style="margin-bottom: 16px; border-color: #BAE6FD; background: #F0F9FF;">
        <div class="card-header" style="border-bottom-color: #E0F2FE;">
          <div class="card-title" style="color: #0369A1;">📈 التنبؤ الذكي بالتدفقات النقدية القادمة (Cashflow Forecast)</div>
          <span class="badge badge-info">تحليل تلقائي</span>
        </div>
        <p style="font-size: 12px; color: #0369A1; margin-bottom: 12px;">
          تقديرات المبالغ المجدولة للتحصيل خلال الفترات القادمة بناءً على تواريخ استحقاق فواتير العملاء:
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
          <div style="background: #FFFFFF; border: 1px solid #BAE6FD; padding: 10px; border-radius: 8px; text-align: center;">
            <div style="font-size: 11px; color: var(--color-text-muted);">خلال 7 أيام</div>
            <div style="font-size: 15px; font-weight: 700; color: #0284C7; margin-top: 4px;">
              ${ValidationService.formatMoney(health.forecast.next7Days, cur)}
            </div>
          </div>
          <div style="background: #FFFFFF; border: 1px solid #BAE6FD; padding: 10px; border-radius: 8px; text-align: center;">
            <div style="font-size: 11px; color: var(--color-text-muted);">خلال 14 يوماً</div>
            <div style="font-size: 15px; font-weight: 700; color: #0284C7; margin-top: 4px;">
              ${ValidationService.formatMoney(health.forecast.next14Days, cur)}
            </div>
          </div>
          <div style="background: #FFFFFF; border: 1px solid #BAE6FD; padding: 10px; border-radius: 8px; text-align: center;">
            <div style="font-size: 11px; color: var(--color-text-muted);">خلال 30 يوماً</div>
            <div style="font-size: 15px; font-weight: 700; color: #0284C7; margin-top: 4px;">
              ${ValidationService.formatMoney(health.forecast.next30Days, cur)}
            </div>
          </div>
        </div>
      </div>

      <!-- AI Insights and Recommendations List -->
      <h4 style="font-size: 14px; color: var(--color-primary-dark); margin-bottom: 12px; font-weight: 700;">
        💡 توصيات الفحص المحاسبي والرقابة الذكية:
      </h4>
      <div>
        ${insights.map(item => `
          <div class="insight-item">
            <div class="insight-icon">${item.icon}</div>
            <div class="insight-content" style="flex: 1;">
              <h4>${item.title}</h4>
              <p>${item.description}</p>
              ${item.details && item.details.length ? `
                <ul style="margin: 6px 16px 0 0; font-size: 12px; color: var(--color-text-main);">
                  ${item.details.map(d => `<li>${d}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ==========================================
  // 10. Settings & Customization
  // ==========================================
  function renderSettings() {
    const settings = AppDatabase.getSettings();
    const currencies = SettingsService.getCurrencies();

    const appTitleInput = document.getElementById('setting-app-title');
    const currencySelect = document.getElementById('setting-currency');
    const overpaymentCheck = document.getElementById('setting-overpayment');
    const themeSelect = document.getElementById('setting-theme');
    const accentSelect = document.getElementById('setting-accent');

    if (appTitleInput) appTitleInput.value = settings.appTitle;
    if (overpaymentCheck) overpaymentCheck.checked = settings.preventOverpayment;
    if (themeSelect) themeSelect.value = settings.theme;
    if (accentSelect) accentSelect.value = settings.accentColor;

    if (currencySelect) {
      currencySelect.innerHTML = currencies.map(c => 
        `<option value="${c.code}" ${c.code === settings.currency ? 'selected' : ''}>${c.name || c.code} ${c.isCustom ? '⭐ مخصصة' : ''}</option>`
      ).join('');
      currencySelect.value = settings.currency || 'ر.ي';
    }

    // Render default icon picker in settings
    renderIconPicker('settings-default-icon-picker', 'setting-default-icon', settings.defaultCustomerIcon || '👤');

    // Render custom currencies chips & badges
    const countBadge = document.getElementById('settings-currencies-count');
    if (countBadge) countBadge.textContent = `${currencies.length} عملة`;

    const chipsContainer = document.getElementById('settings-currencies-chips');
    if (chipsContainer) {
      chipsContainer.innerHTML = currencies.map(c => `
        <span class="badge" style="background: ${c.code === settings.currency ? 'var(--color-primary-dark)' : '#F1F5F9'}; color: ${c.code === settings.currency ? '#FFFFFF' : '#334155'}; font-size: 13px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--color-border);">
          <span>${c.name || c.code}</span>
          ${c.code === settings.currency ? '<span style="font-size: 11px; opacity: 0.9;">(الافتراضية)</span>' : ''}
          ${c.isCustom && c.code !== settings.currency ? `
            <button type="button" onclick="App.deleteCustomCurrencySubmit('${c.code}')" style="background:none; border:none; color:#EF4444; font-size:16px; cursor:pointer; padding:0 2px; line-height:1;" title="حذف هذه العملة المخصصة">&times;</button>
          ` : ''}
        </span>
      `).join('');
    }
  }

  // ==========================================
  // 11. Universal Importer Screen
  // ==========================================
  function renderImportScreen() {
    const defaultCurrSelect = document.getElementById('import-default-currency');
    if (defaultCurrSelect) {
      const settings = AppDatabase.getSettings();
      const currencies = SettingsService.getCurrencies();
      defaultCurrSelect.innerHTML = currencies.map(c => 
        `<option value="${c.code}" ${c.code === settings.currency ? 'selected' : ''}>${c.name || c.code} ${c.isCustom ? '⭐' : ''}</option>`
      ).join('');
    }
  }

  // ==========================================
  // 11. About & Test Runner
  // ==========================================
  function renderAbout() {
    // Info view
  }

  // ==========================================
  // Modals & User Actions (Exported to window.App)
  // ==========================================
  window.App = {
    navigateTo,
    showToast,

    // Icon Picker Selector
    selectIconPicker: function(containerId, hiddenInputId, icon) {
      const hiddenInput = document.getElementById(hiddenInputId);
      if (hiddenInput) hiddenInput.value = icon;
      const container = document.getElementById(containerId);
      if (container) {
        const btns = container.querySelectorAll('.icon-picker-btn');
        btns.forEach(b => {
          if (b.getAttribute('data-icon') === icon) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      }
    },

    // Customer Actions
    openAddCustomerModal: function() {
      document.getElementById('modal-customer-title').textContent = 'إضافة عميل جديد';
      document.getElementById('cust-form-id').value = '';
      document.getElementById('cust-form-name').value = '';
      document.getElementById('cust-form-phone').value = '';
      document.getElementById('cust-form-notes').value = '';
      document.getElementById('cust-form-category').value = 'عميل عادي';
      const settings = AppDatabase.getSettings();
      const defaultIcon = (settings && settings.defaultCustomerIcon) ? settings.defaultCustomerIcon : '👤';
      document.getElementById('cust-form-icon').value = defaultIcon;
      renderIconPicker('cust-icon-picker-grid', 'cust-form-icon', defaultIcon);
      
      // Populate customer currency dropdown
      const currSelect = document.getElementById('cust-form-currency');
      if (currSelect) {
        const currencies = SettingsService.getCurrencies();
        currSelect.innerHTML = `<option value="">العملة الافتراضية للنظام (${settings.currency || 'ر.ي'})</option>` +
          currencies.map(c => `<option value="${c.code}">${c.name || c.code} ${c.isCustom ? '⭐' : ''}</option>`).join('');
        currSelect.value = '';
      }

      document.getElementById('phone-duplicate-warning').style.display = 'none';
      App.openModal('modal-customer');
    },

    openEditCustomerModal: function(customerId) {
      const c = CustomerService.getCustomerById(customerId);
      if (!c) return;
      document.getElementById('modal-customer-title').textContent = 'تعديل بيانات العميل';
      document.getElementById('cust-form-id').value = c.id;
      document.getElementById('cust-form-name').value = c.name;
      document.getElementById('cust-form-phone').value = c.phone || '';
      document.getElementById('cust-form-notes').value = c.notes || '';
      document.getElementById('cust-form-category').value = c.category || 'عميل عادي';
      document.getElementById('cust-form-icon').value = c.icon || '👤';
      renderIconPicker('cust-icon-picker-grid', 'cust-form-icon', c.icon || '👤');

      // Populate customer currency dropdown
      const currSelect = document.getElementById('cust-form-currency');
      if (currSelect) {
        const settings = AppDatabase.getSettings();
        const currencies = SettingsService.getCurrencies();
        currSelect.innerHTML = `<option value="">العملة الافتراضية للنظام (${settings.currency || 'ر.ي'})</option>` +
          currencies.map(curr => `<option value="${curr.code}">${curr.name || curr.code} ${curr.isCustom ? '⭐' : ''}</option>`).join('');
        currSelect.value = c.currency || '';
      }

      document.getElementById('phone-duplicate-warning').style.display = 'none';
      App.openModal('modal-customer');
    },

    saveCustomerSubmit: function() {
      const id = document.getElementById('cust-form-id').value;
      const name = document.getElementById('cust-form-name').value;
      const phone = document.getElementById('cust-form-phone').value;
      const notes = document.getElementById('cust-form-notes').value;
      const category = document.getElementById('cust-form-category').value;
      const icon = document.getElementById('cust-form-icon').value;
      const currInput = document.getElementById('cust-form-currency');
      const currency = currInput ? currInput.value : '';

      try {
        if (id) {
          CustomerService.updateCustomer(id, { name, phone, notes, category, icon, currency });
          showToast('تم تحديث بيانات وتصنيف وعملة العميل بنجاح مع الاحتفاظ بكافة العمليات.', 'success');
        } else {
          CustomerService.addCustomer({ name, phone, notes, category, icon, currency });
          showToast('تمت إضافة العميل بنجاح.', 'success');
        }
        App.closeModal('modal-customer');
        renderScreen(appState.currentScreen, { customerId: id });
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    checkPhoneDuplicateInput: function(input) {
      const phone = input.value;
      const id = document.getElementById('cust-form-id').value;
      const warningBox = document.getElementById('phone-duplicate-warning');
      const dup = CustomerService.checkDuplicatePhone(phone, id);

      if (dup) {
        warningBox.textContent = `تنبيه: هذا الرقم مسجل مسبقاً للعميل "${dup.customer.name}".`;
        warningBox.style.display = 'block';
      } else {
        warningBox.style.display = 'none';
      }
    },

    viewCustomer: function(customerId) {
      appState.activeCustomerId = customerId;
      navigateTo('customer_detail', { customerId });
    },

    toggleArchiveCustomer: function(customerId) {
      try {
        const c = CustomerService.toggleArchiveCustomer(customerId);
        showToast(c.archived ? 'تم أرشفة العميل.' : 'تم إلغاء أرشفة العميل.', 'info');
        renderScreen(appState.currentScreen, { customerId });
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    deleteCustomer: function(customerId) {
      const customer = CustomerService.getCustomerById(customerId);
      if (!customer) return;

      if (customer.txCount > 0) {
        if (confirm(`لا يمكن حذف العميل "${customer.name}" لوجود (${customer.txCount}) عمليات مالية مسجلة.\n\nهل ترغب في أرشفته بدلاً من ذلك لإخفائه من القوائم النشطة مع الحفاظ على العمليات؟`)) {
          App.toggleArchiveCustomer(customerId);
        }
        return;
      }

      if (confirm(`هل أنت متأكد من حذف العميل "${customer.name}" نهائياً؟`)) {
        try {
          CustomerService.deleteCustomer(customerId);
          showToast('تم حذف العميل بنجاح.', 'success');
          navigateTo('customers');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    },

    // Transaction Actions
    openRecordDebtModal: function(customerId = null) {
      App.populateCustomerDropdown('tx-form-customer', customerId);
      document.getElementById('tx-form-type').value = 'debt';
      document.getElementById('modal-tx-title').textContent = 'تسجيل دين جديد';
      document.getElementById('tx-form-amount').value = '';
      document.getElementById('tx-form-date').value = ValidationService.formatDate();
      document.getElementById('tx-form-ref').value = '';
      document.getElementById('tx-form-notes').value = '';

      const dueGroup = document.getElementById('tx-form-duedate-group');
      if (dueGroup) dueGroup.style.display = 'block';
      const dueInput = document.getElementById('tx-form-duedate');
      if (dueInput) dueInput.value = '';
      const schedCheck = document.getElementById('tx-form-schedule-calendar');
      if (schedCheck) schedCheck.checked = true;

      const linkedGroup = document.getElementById('tx-form-linked-debt-group');
      if (linkedGroup) linkedGroup.style.display = 'none';

      // Update currency badge
      App.updateTxModalCurrency(customerId);

      App.openModal('modal-transaction');
    },

    openRecordPaymentModal: function(customerId = null, targetDebtId = null) {
      App.populateCustomerDropdown('tx-form-customer', customerId);
      document.getElementById('tx-form-type').value = 'payment';
      document.getElementById('modal-tx-title').textContent = 'تسجيل دفعة / سداد';
      document.getElementById('tx-form-amount').value = '';
      document.getElementById('tx-form-date').value = ValidationService.formatDate();
      document.getElementById('tx-form-ref').value = '';
      document.getElementById('tx-form-notes').value = '';

      const dueGroup = document.getElementById('tx-form-duedate-group');
      if (dueGroup) dueGroup.style.display = 'none';
      const dueInput = document.getElementById('tx-form-duedate');
      if (dueInput) dueInput.value = '';

      const linkedGroup = document.getElementById('tx-form-linked-debt-group');
      if (linkedGroup) linkedGroup.style.display = 'block';

      App.populateUnsettledDebtsDropdown(customerId, targetDebtId);

      // Update currency badge
      App.updateTxModalCurrency(customerId);

      App.openModal('modal-transaction');
    },

    populateUnsettledDebtsDropdown: function(customerId, selectedDebtId = null) {
      const select = document.getElementById('tx-form-linked-debt');
      const hint = document.getElementById('tx-form-linked-debt-hint');
      if (!select) return;

      if (!customerId) {
        select.innerHTML = '<option value="">-- دفعة عامة على إجمالي الحساب --</option>';
        if (hint) hint.textContent = '';
        return;
      }

      const unsettled = TransactionService.getUnsettledDebts(customerId);
      const settings = AppDatabase.getSettings();
      const cur = settings.currency || 'ر.ي';

      if (unsettled.length === 0) {
        select.innerHTML = '<option value="">-- دفعة عامة (لا توجد ديون معلقة محددة) --</option>';
        if (hint) hint.textContent = 'سيتم قيد الدفعة في رصيد الحساب العام للعميل.';
        return;
      }

      let optionsHtml = '<option value="">-- دفعة عامة على إجمالي الحساب --</option>';
      for (const d of unsettled) {
        const isSel = d.id === selectedDebtId ? 'selected' : '';
        const refLabel = d.reference ? ` (${d.reference})` : '';
        optionsHtml += `<option value="${d.id}" ${isSel}>دين ${d.date}${refLabel} - متبقي: ${ValidationService.formatMoney(d.remainingAmount, cur)} من ${d.amount}</option>`;
      }
      select.innerHTML = optionsHtml;

      if (selectedDebtId) {
        App.handleLinkedDebtChange(selectedDebtId);
      } else {
        if (hint) hint.textContent = 'يمكنك اختيار دين محدد لتسجيل دفعة جزئية عليه، أو تركها كدفعة عامة.';
      }
    },

    handleLinkedDebtChange: function(debtId) {
      const hint = document.getElementById('tx-form-linked-debt-hint');
      const amountInput = document.getElementById('tx-form-amount');
      const refInput = document.getElementById('tx-form-ref');
      const settings = AppDatabase.getSettings();
      const cur = settings.currency || 'ر.ي';

      if (!debtId) {
        if (hint) hint.textContent = 'دفعة عامة على الحساب الإجمالي.';
        return;
      }

      const settlement = TransactionService.getDebtSettlement(debtId);
      if (!settlement) {
        if (hint) hint.textContent = '';
        return;
      }

      if (hint) {
        hint.innerHTML = `
          <strong>تفاصيل الدين المرتبط:</strong> أصل الدين: ${ValidationService.formatMoney(settlement.originalAmount, cur)} • 
          تم سداد: ${ValidationService.formatMoney(settlement.paidAmount, cur)} • 
          <span style="color:var(--color-debt); font-weight:700;">المتبقي: ${ValidationService.formatMoney(settlement.remainingAmount, cur)}</span>
        `;
      }

      // If amount input is empty, prefill with remaining amount for user convenience
      if (amountInput && (!amountInput.value || parseFloat(amountInput.value) <= 0)) {
        amountInput.value = settlement.remainingAmount;
      }

      if (refInput && !refInput.value) {
        const d = settlement.debt;
        refInput.value = `دفعة عن دين ${d.reference || d.date}`;
      }
    },

    updateTxModalCurrency: function(customerId) {
      const settings = AppDatabase.getSettings();
      const currBadge = document.getElementById('tx-form-currency-badge');
      if (!currBadge) return;
      if (customerId) {
        const c = CustomerService.getCustomerById(customerId);
        currBadge.textContent = c ? (c.effectiveCurrency || c.currency || settings.currency) : settings.currency;
      } else {
        currBadge.textContent = settings.currency || 'ر.ي';
      }
    },

    populateCustomerDropdown: function(selectId, selectedId = null) {
      const select = document.getElementById(selectId);
      if (!select) return;
      const customers = CustomerService.getCustomers('all');
      select.innerHTML = '<option value="">-- اختر العميل --</option>' + 
        customers.map(c => {
          const custCur = c.effectiveCurrency || c.currency || 'ر.ي';
          return `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.icon || '👤'} ${c.name} [${c.category || 'عادي'}] (الرصيد: ${c.balance} ${custCur})</option>`;
        }).join('');

      select.onchange = function() {
        const custId = this.value;
        App.updateTxModalCurrency(custId);
        const txType = document.getElementById('tx-form-type') ? document.getElementById('tx-form-type').value : 'debt';
        if (txType === 'payment') {
          App.populateUnsettledDebtsDropdown(custId);
        }
      };
    },

    saveTransactionSubmit: function() {
      const saveBtn = document.getElementById('btn-save-tx');
      if (saveBtn) saveBtn.disabled = true;

      const customerId = document.getElementById('tx-form-customer').value;
      const type = document.getElementById('tx-form-type').value;
      const amount = document.getElementById('tx-form-amount').value;
      const date = document.getElementById('tx-form-date').value;
      const dueDateInput = document.getElementById('tx-form-duedate');
      const dueDate = (type === 'debt' && dueDateInput) ? dueDateInput.value : null;
      const reference = document.getElementById('tx-form-ref').value;
      const notes = document.getElementById('tx-form-notes').value;
      const scheduleCalendarCheck = document.getElementById('tx-form-schedule-calendar');

      const linkedDebtSelect = document.getElementById('tx-form-linked-debt');
      const linkedDebtId = (type === 'payment' && linkedDebtSelect) ? linkedDebtSelect.value || null : null;

      try {
        const res = TransactionService.recordTransaction({
          customerId,
          type,
          amount,
          date,
          dueDate,
          reference,
          notes,
          linkedDebtId
        });

        // Trigger calendar reminder if requested
        if (type === 'debt' && dueDate && scheduleCalendarCheck && scheduleCalendarCheck.checked) {
          const cust = CustomerService.getCustomerById(customerId);
          if (cust) {
            try {
              NotificationScheduler.scheduleDebtReminder({
                customerName: cust.name,
                phone: cust.phone,
                amount: parseFloat(amount) || 0,
                currency: cust.effectiveCurrency || cust.currency,
                dueDate: dueDate,
                notes: notes || reference,
                title: `سداد دين: ${cust.name}`
              });
              showToast('تمت جدولة موعد الاستحقاق في تقويم الهاتف بنجاح 📅', 'info', 4000);
            } catch (calErr) {
              console.warn('Calendar notice:', calErr);
            }
          }
        }

        const msgExtra = res.debtSettlement 
          ? ` (مرتبطة بالدين: متبقي عليه ${res.debtSettlement.remainingAmount})`
          : '';

        showToast(`تم تسجيل العملية بنجاح! الرصيد الجديد: ${res.newBalance}${msgExtra}`, 'success');
        App.closeModal('modal-transaction');
        renderScreen(appState.currentScreen, { customerId });
      } catch (err) {
        showToast(err.message, 'error', 4500);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    },

    cancelTransactionPrompt: function(txId) {
      const reason = prompt('يرجى كتابة سبب إلغاء هذه العملية:');
      if (reason === null) return;

      try {
        TransactionService.cancelTransaction(txId, reason);
        showToast('تم إلغاء العملية وتحديث الأرصدة بأمان.', 'info');
        renderScreen(appState.currentScreen, { customerId: appState.activeCustomerId });
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    // Remittance Actions
    openAddRemittanceModal: function() {
      const compSelect = document.getElementById('remit-form-company');
      compSelect.innerHTML = RemittanceService.getCompanies().map(c => `<option value="${c}">${c}</option>`).join('');
      App.populateCustomerDropdown('remit-form-customer');

      document.getElementById('remit-form-amount').value = '';
      document.getElementById('remit-form-ref').value = '';
      document.getElementById('remit-form-sender').value = '';
      document.getElementById('remit-form-phone').value = '';
      document.getElementById('remit-form-date').value = ValidationService.formatDate();
      document.getElementById('remit-form-notes').value = '';
      App.openModal('modal-remittance');
    },

    saveRemittanceSubmit: function() {
      const saveBtn = document.getElementById('btn-save-remit');
      if (saveBtn) saveBtn.disabled = true;

      const company = document.getElementById('remit-form-company').value;
      const amount = document.getElementById('remit-form-amount').value;
      const reference = document.getElementById('remit-form-ref').value;
      const senderName = document.getElementById('remit-form-sender').value;
      const senderPhone = document.getElementById('remit-form-phone').value;
      const customerId = document.getElementById('remit-form-customer').value;
      const date = document.getElementById('remit-form-date').value;
      const notes = document.getElementById('remit-form-notes').value;

      try {
        RemittanceService.addRemittance({
          company,
          amount,
          reference,
          senderName,
          senderPhone,
          customerId,
          date,
          notes
        });

        showToast('تم تسجيل الحوالة بنجاح.', 'success');
        App.closeModal('modal-remittance');
        renderScreen('remittances');
      } catch (err) {
        showToast(err.message, 'error', 4500);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    },

    openLinkRemittanceModal: function(remitId) {
      appState.activeRemittanceId = remitId;
      App.populateCustomerDropdown('link-remit-customer');
      App.openModal('modal-link-remittance');
    },

    saveLinkRemittanceSubmit: function() {
      const custId = document.getElementById('link-remit-customer').value;
      if (!custId) {
        showToast('يرجى اختيار العميل.', 'warning');
        return;
      }

      try {
        RemittanceService.linkCustomer(appState.activeRemittanceId, custId);
        showToast('تم ربط الحوالة بالعميل بنجاح.', 'success');
        App.closeModal('modal-link-remittance');
        renderScreen('remittances');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    confirmRemittanceAsPayment: function(remitId) {
      if (!confirm('هل ترغب بتأكيد هذه الحوالة وترحيلها كدفعة مسددة لحساب العميل؟')) return;

      try {
        const res = RemittanceService.confirmAsPayment(remitId);
        showToast(`تم ترحيل الحوالة كدفعة بنجاح! الرصيد الجديد: ${res.newBalance}`, 'success');
        renderScreen('remittances');
      } catch (err) {
        showToast(err.message, 'error', 4500);
      }
    },

    // SMS Actions
    openSendSmsModal: function(customerId) {
      const customer = CustomerService.getCustomerById(customerId);
      if (!customer) return;

      appState.activeSmsCustomer = customer;
      const templates = SmsService.getTemplates();
      const defaultTpl = templates[0] ? templates[0].content : '';
      const rendered = SmsService.renderTemplate(defaultTpl, customer);

      document.getElementById('sms-modal-customer-name').textContent = customer.name;
      document.getElementById('sms-modal-phone').textContent = customer.phone || 'غير مسجل';
      document.getElementById('sms-modal-balance').textContent = customer.balance;
      document.getElementById('sms-modal-text').value = rendered;

      // Populate template selector inside modal
      const modalTplSelect = document.getElementById('sms-modal-tpl-select');
      if (modalTplSelect) {
        modalTplSelect.innerHTML = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        modalTplSelect.onchange = function() {
          const chosen = templates.find(t => t.id === modalTplSelect.value);
          if (chosen) {
            document.getElementById('sms-modal-text').value = SmsService.renderTemplate(chosen.content, customer);
          }
        };
      }

      App.openModal('modal-send-sms');
    },

    dispatchSmsSubmit: function() {
      const customer = appState.activeSmsCustomer;
      const text = document.getElementById('sms-modal-text').value;

      try {
        const res = SmsService.dispatchSms(customer, text);
        showToast('تم فتح تطبيق الرسائل لتأكيد الإرسال.', 'success');
        App.closeModal('modal-send-sms');
        renderScreen(appState.currentScreen, { customerId: customer.id });
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    toggleSelectAllDebtors: function(masterCheckbox) {
      const boxes = document.querySelectorAll('.debtor-checkbox');
      boxes.forEach(b => b.checked = masterCheckbox.checked);
    },

    prepareBulkSmsQueue: function() {
      const checkedBoxes = Array.from(document.querySelectorAll('.debtor-checkbox:checked'));
      if (checkedBoxes.length === 0) {
        showToast('يرجى تحديد عميل واحد على الأقل.', 'warning');
        return;
      }

      appState.smsQueue = checkedBoxes.map(b => b.value);
      appState.smsQueueIndex = 0;
      App.openNextInSmsQueue();
    },

    openNextInSmsQueue: function() {
      if (appState.smsQueueIndex >= appState.smsQueue.length) {
        showToast('اكتملت مراجعة جميع الرسائل المحددة.', 'success');
        return;
      }

      const custId = appState.smsQueue[appState.smsQueueIndex];
      appState.smsQueueIndex++;
      App.openSendSmsModal(custId);
    },

    // Templates Actions
    openAddTemplateModal: function() {
      document.getElementById('tpl-form-id').value = '';
      document.getElementById('tpl-form-name').value = '';
      document.getElementById('tpl-form-content').value = '';
      App.openModal('modal-template');
    },

    openEditTemplateModal: function(id) {
      const t = SmsService.getTemplates().find(x => x.id === id);
      if (!t) return;
      document.getElementById('tpl-form-id').value = t.id;
      document.getElementById('tpl-form-name').value = t.name;
      document.getElementById('tpl-form-content').value = t.content;
      App.openModal('modal-template');
    },

    saveTemplateSubmit: function() {
      const id = document.getElementById('tpl-form-id').value;
      const name = document.getElementById('tpl-form-name').value;
      const content = document.getElementById('tpl-form-content').value;

      try {
        if (id) {
          SmsService.updateTemplate(id, name, content);
          showToast('تم تحديث القالب.', 'success');
        } else {
          SmsService.addTemplate(name, content);
          showToast('تمت إضافة القالب.', 'success');
        }
        App.closeModal('modal-template');
        renderScreen('sms_templates');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    deleteTemplatePrompt: function(id) {
      if (!confirm('هل ترغب بحذف هذا القالب؟')) return;
      try {
        SmsService.deleteTemplate(id);
        showToast('تم حذف القالب.', 'info');
        renderScreen('sms_templates');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    clearSmsLogsPrompt: function() {
      if (!confirm('هل أنت متأكد من رغبتك في تفريغ سجل الرسائل؟')) return;
      SmsService.clearLogs();
      showToast('تم تفريغ السجل.', 'info');
      renderScreen('sms_logs');
    },

    // Statement Print & Share
    printCustomerStatement: function(customerId) {
      navigateTo('customer_detail', { customerId });
      setTimeout(() => window.print(), 300);
    },

    exportCurrentReportCsv: function() {
      if (!appState.currentReport) return;
      const { title, headers, rows } = appState.currentReport;
      const filename = `${title.replace(/\s+/g, '_')}_${ValidationService.formatDate()}.csv`;
      ReportService.exportToCsv(filename, headers, rows);
      showToast('تم تصدير ملف CSV بنجاح.', 'success');
    },

    // Backup & Restore Actions
    exportFullBackup: function() {
      try {
        const res = BackupService.exportFullBackup();
        showToast(`تم تصدير النسخة الاحتياطية (${res.filename}) بنجاح.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    triggerRestoreFilePicker: function() {
      document.getElementById('restore-file-input').click();
    },

    handleRestoreFileSelect: function(input) {
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const parsed = JSON.parse(e.target.result);
          const validation = BackupService.validateBackupData(parsed);

          appState.backupPreviewData = parsed;
          document.getElementById('restore-preview-cust').textContent = validation.customersCount;
          document.getElementById('restore-preview-tx').textContent = validation.transactionsCount;
          document.getElementById('restore-preview-remit').textContent = validation.remittancesCount;
          document.getElementById('restore-preview-version').textContent = validation.formatVersion;
          document.getElementById('restore-preview-date').textContent = validation.exportedAt || 'غير محدد';

          App.openModal('modal-restore-preview');
        } catch (err) {
          showToast('الملف المحدد غير صالح: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      input.value = ''; // Reset input
    },

    confirmRestoreSubmit: function(mode) {
      if (!appState.backupPreviewData) return;
      const confirmMsg = mode === 'full' 
        ? 'تحذير: سيتم استبدال كامل بيانات التطبيق الحالية بالنسخة الاحتياطية (مع إنشاء نسخة أمان تلقائية). هل ترغب بالمتابعة؟'
        : 'سيتم دمج البيانات الجديدة مع البيانات الحالية ومنع التكرار. هل ترغب بالمتابعة؟';

      if (!confirm(confirmMsg)) return;

      try {
        BackupService.restoreBackup(appState.backupPreviewData, mode);
        showToast('تمت استعادة البيانات بنجاح تام!', 'success');
        App.closeModal('modal-restore-preview');
        appState.backupPreviewData = null;
        renderScreen(appState.currentScreen);
      } catch (err) {
        showToast(err.message, 'error', 5000);
      }
    },

    // CSV Import Actions
    triggerCsvFilePicker: function() {
      document.getElementById('csv-file-input').click();
    },

    handleCsvFileSelect: function(input) {
      const file = input.files[0];
      if (!file) return;

      ImportCsvService.readFileWithArabicSupport(file, function(err, text) {
        if (err) {
          showToast('فشل قراءة ملف CSV: ' + err.message, 'error');
          return;
        }

        try {
          const parsedRows = ImportCsvService.parseCsvText(text);
          if (parsedRows.length <= 1) {
            throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة.');
          }

          const headers = parsedRows[0];
          const detectedMapping = ImportCsvService.detectColumns(headers);
          const analysis = ImportCsvService.analyzeCsv(parsedRows, detectedMapping);

          appState.csvAnalysis = analysis;
          const totalEl = document.getElementById('csv-preview-total');
          const validEl = document.getElementById('csv-preview-valid');
          const invalidEl = document.getElementById('csv-preview-invalid');
          const dupEl = document.getElementById('csv-preview-dup');

          if (totalEl) totalEl.textContent = analysis.totalRows;
          if (validEl) validEl.textContent = analysis.validCount;
          if (invalidEl) invalidEl.textContent = analysis.invalidCount;
          if (dupEl) dupEl.textContent = analysis.duplicateCount;

          // Render sample rows in modal if container exists
          const samplesContainer = document.getElementById('csv-preview-samples-body');
          const samplesBox = document.getElementById('csv-preview-samples-box');
          if (samplesContainer && samplesBox) {
            samplesBox.style.display = 'block';
            const sampleRows = analysis.validRows.slice(0, 5);
            samplesContainer.innerHTML = sampleRows.map(r => `
              <tr>
                <td><strong>${r.name}</strong></td>
                <td>${r.phone || '-'}</td>
                <td style="color:${r.balance > 0 ? 'var(--color-debt)' : 'var(--color-payment)'};">${r.balance}</td>
                <td>${r.isDuplicate ? '<span class="badge" style="background:#FEF3C7;color:#D97706;font-size:10px;">مكرر</span>' : '<span class="badge" style="background:#DCFCE7;color:#16A34A;font-size:10px;">جديد</span>'}</td>
              </tr>
            `).join('');
          }

          App.openModal('modal-csv-preview');
        } catch (parseErr) {
          showToast('خطأ أثناء تحليل ملف CSV: ' + parseErr.message, 'error');
        }
      });
      input.value = '';
    },

    confirmCsvImportSubmit: function() {
      if (!appState.csvAnalysis || !appState.csvAnalysis.validRows.length) {
        showToast('لا توجد بيانات صالحة للاستيراد.', 'error');
        return;
      }

      const dupModeSelect = document.getElementById('csv-import-duplicate-handling');
      const dupMode = dupModeSelect ? dupModeSelect.value : 'skip';

      try {
        const res = ImportCsvService.executeImport(appState.csvAnalysis.validRows, {
          duplicateHandling: dupMode
        });
        showToast(`تم استيراد (${res.importedCustomers}) عميل جديد ودمج (${res.mergedCustomers || 0}) وتسجيل (${res.createdTransactions}) قيد افتتاحي بنجاح.`, 'success');
        App.closeModal('modal-csv-preview');
        appState.csvAnalysis = null;
        renderScreen('customers');
      } catch (err) {
        showToast('فشل الاستيراد: ' + err.message, 'error');
      }
    },

    applyReportCustomDates: function() {
      const p = document.getElementById('report-period-select');
      if (p) p.value = 'custom';
      renderReports();
    },

    resetReportDates: function() {
      const s = document.getElementById('report-start-date');
      const e = document.getElementById('report-end-date');
      const p = document.getElementById('report-period-select');
      if (s) s.value = '';
      if (e) e.value = '';
      if (p) p.value = 'all';
      renderReports();
    },

    // Settings & Custom Currencies Actions
    saveSettingsSubmit: function() {
      const appTitle = document.getElementById('setting-app-title').value;
      const currency = document.getElementById('setting-currency').value;
      const preventOverpayment = document.getElementById('setting-overpayment').checked;
      const theme = document.getElementById('setting-theme').value;
      const accentColor = document.getElementById('setting-accent').value;
      const defaultIconInput = document.getElementById('setting-default-icon');
      const defaultCustomerIcon = defaultIconInput ? defaultIconInput.value : '👤';

      SettingsService.updateSettings({
        appTitle,
        currency,
        preventOverpayment,
        theme,
        accentColor,
        defaultCustomerIcon
      });

      renderSettings();
      showToast('تم حفظ الإعدادات وتطبيق المظهر والعملة فوراً.', 'success');
    },

    addCustomCurrencySubmit: function() {
      const nameInput = document.getElementById('custom-curr-name');
      const symbolInput = document.getElementById('custom-curr-symbol');
      const name = nameInput ? nameInput.value.trim() : '';
      const symbol = symbolInput ? symbolInput.value.trim() : '';

      try {
        const added = SettingsService.addCustomCurrency({ name, symbol });
        if (nameInput) nameInput.value = '';
        if (symbolInput) symbolInput.value = '';
        renderSettings();
        showToast(`تمت إضافة العملة المخصصة "${added.name}" بنجاح!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    deleteCustomCurrencySubmit: function(code) {
      if (!confirm(`هل أنت متأكد من حذف العملة المخصصة (${code}) من النظام؟`)) return;

      try {
        SettingsService.deleteCustomCurrency(code);
        renderSettings();
        showToast(`تم حذف العملة المخصصة (${code}) بنجاح.`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    // Calendar Notification Scheduler Actions
    scheduleAllUpcomingDebtsPrompt: function() {
      try {
        const res = NotificationScheduler.scheduleAllUpcomingDebts();
        showToast(`تمت جدولة (${res.count}) مواعيد استحقاق في تقويم هاتفك بنجاح 📅`, 'success', 4500);
      } catch (err) {
        showToast(err.message, 'warning');
      }
    },

    scheduleSingleDebtReminder: function(customerId, txId, amount, dueDate) {
      const cust = CustomerService.getCustomerById(customerId);
      if (!cust) return;

      try {
        NotificationScheduler.scheduleDebtReminder({
          customerName: cust.name,
          phone: cust.phone,
          amount: parseFloat(amount) || 0,
          currency: cust.effectiveCurrency || cust.currency,
          dueDate: dueDate,
          title: `سداد دين: ${cust.name}`
        });
        showToast(`تمت جدولة تذكير سداد للعميل ${cust.name} في تقويم هاتفك 📅`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    requestBrowserNotificationPrompt: function() {
      if (!('Notification' in window)) {
        showToast('المتصفح الحالي لا يدعم إشعارات الويب المباشرة.', 'warning');
        return;
      }
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          showToast('تم تفعيل التنبيهات المحلية بنجاح! 🔔', 'success');
          try {
            new Notification('مدير الديون الذكي برو SMS', {
              body: 'تم تفعيل التنبيهات بنجاح. ستصلك إشعارات بمواعيد الاستحقاق القادمة.',
              icon: 'icon-192.png'
            });
          } catch (_) {}
        } else {
          showToast('تم رفض إذن الإشعارات من إعدادات المتصفح.', 'warning');
        }
      });
    },

    // Universal Importer Actions (Excel, DB, PDF, CSV)
    triggerUniversalFilePicker: function() {
      const input = document.getElementById('universal-file-input');
      if (input) input.click();
    },

    handleUniversalFileSelect: async function(input) {
      const file = input.files[0];
      if (!file) return;

      showToast(`جارٍ قراءة وفحص ملف "${file.name}"... ⏳`, 'info', 2500);

      try {
        const result = await UniversalImporter.parseFile(file);
        appState.universalImportData = {
          filename: file.name,
          fileType: result.fileType,
          records: result.records,
          schemaReport: result.records.schemaReport || null
        };
        App.renderUniversalImportPreview();
        showToast(`تم استخراج (${result.records.validCount}) حساب بنجاح. راجع المعاينة أدناه.`, 'success');
      } catch (err) {
        showToast('فشل استيراد الملف: ' + err.message, 'error', 5000);
      } finally {
        input.value = '';
      }
    },

    // Market DB SQLite Demo Loader (188 Customers, 1,327 Txs, 3 Currencies)
    loadMarketDbDemo: function() {
      showToast('جارٍ تحميل ومعالجة قاعدة بيانات السوق (Market DB)... ⏳', 'info', 2000);
      try {
        const rawDb = UniversalImporter.generateMarketDbDemoData();
        const candidates = UniversalImporter.processMarketDbData(rawDb);
        const analyzed = UniversalImporter.analyzeCandidates(candidates);
        appState.universalImportData = {
          filename: '٢٠٢٦١٠٢٠٢١١٠٠٣-market(2).db',
          fileType: 'قاعدة بيانات SQLite السوق (188 عميل • 1,327 حركة)',
          records: analyzed
        };
        App.renderUniversalImportPreview();
        showToast(`تم فحص قاعدة بيانات السوق بنجاح! ${analyzed.validCount} حساب و1,327 حركة موزعة على 3 عملات.`, 'success', 4000);
      } catch (err) {
        showToast('فشل تحميل قاعدة البيانات: ' + err.message, 'error', 5000);
      }
    },

    renderUniversalImportPreview: function() {
      const card = document.getElementById('universal-import-preview-card');
      if (!card || !appState.universalImportData) return;

      const { filename, fileType, records } = appState.universalImportData;

      document.getElementById('import-preview-title').textContent = `معاينة: ${filename} (${fileType})`;
      document.getElementById('import-preview-badge').textContent = `${records.validCount} حساب`;

      const statsEl = document.getElementById('import-preview-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; font-size: 12px; background: #F8FAFC; padding: 10px; border-radius: 6px;">
            <div>إجمالي السجلات: <strong>${records.totalRows}</strong></div>
            <div>الحسابات الصالحة: <strong style="color:#16A34A;">${records.validCount}</strong></div>
            <div>الحسابات المكررة: <strong style="color:#D97706;">${records.duplicateCount}</strong></div>
            <div>أرصدة سالبة/دائنة: <strong style="color:#DC2626;">${records.negativeBalanceCount}</strong></div>
          </div>
        `;
      }

      const schemaEl = document.getElementById('import-schema-report');
      const schemaReport = appState.universalImportData.schemaReport || records.schemaReport;
      if (schemaEl) {
        if (schemaReport) {
          const m = schemaReport.mapping || {};
          schemaEl.style.display = 'block';
          schemaEl.textContent = [
            'تقرير تحليل SQLite الفعلي',
            `الجداول المكتشفة: ${schemaReport.tableCount || 0}`,
            `جدول العملاء: ${schemaReport.customerTable || 'غير محدد'}`,
            `عدد العملاء: ${schemaReport.customerCount || records.validCount}`,
            `جداول الحركات: ${(schemaReport.transactionTables || []).join('، ') || 'لم يتم اكتشاف جدول حركات'}`,
            `مطابقة الحقول: ${JSON.stringify(m)}`,
            `الصفوف المقروءة: ${schemaReport.rowsRead || 0}`,
            `حالة الفحص: ${(schemaReport.integrityCheck || []).join('، ') || 'غير متاح'}`,
            `تحذيرات: ${(schemaReport.warnings || []).slice(0, 10).join(' | ') || 'لا توجد'}`
          ].join('\n');
        } else { schemaEl.style.display = 'none'; schemaEl.textContent = ''; }
      }

      const tableBody = document.getElementById('import-preview-table-body');
      if (!tableBody) return;

      const settings = AppDatabase.getSettings();
      const defaultCur = settings.currency || 'ر.ي';

      tableBody.innerHTML = records.validRows.map((r, idx) => {
        let catBadge = '';
        if (r.category === 'مورد') {
          catBadge = '<span class="badge" style="background:#E0E7FF; color:#4338CA;">🏢 مورد</span>';
        } else if ((r.category || '').includes('VIP')) {
          catBadge = `<span class="badge" style="background:#FEF3C7; color:#B45309;">👑 ${r.category}</span>`;
        } else {
          catBadge = '<span class="badge" style="background:#F1F5F9; color:#475569;">👤 عميل عادي</span>';
        }

        const txCount = r.txCount !== undefined ? r.txCount : (r.transactions ? r.transactions.length : 0);
        const debtsFormatted = ValidationService.formatMoney(r.debts || 0, r.currency || defaultCur);
        const paymentsFormatted = ValidationService.formatMoney(r.payments || 0, r.currency || defaultCur);

        return `
          <tr style="${r.isDuplicate ? 'background: #FEF3C7;' : ''}">
            <td style="text-align: center;">
              <input type="checkbox" class="import-candidate-check" data-index="${idx}" checked onchange="App.updateImportSelectedCount()">
            </td>
            <td><strong>${r.name}</strong></td>
            <td>${catBadge}</td>
            <td class="ltr">${r.phone || '<span style="color:#94a3b8">بدون هاتف</span>'}</td>
            <td><span class="badge badge-info">${txCount} حركة</span></td>
            <td class="amount" style="color: var(--color-debt); font-weight: 600;">${debtsFormatted}</td>
            <td class="amount" style="color: var(--color-payment); font-weight: 600;">${paymentsFormatted}</td>
            <td class="amount" style="font-weight: 700; color: ${r.balance > 0 ? 'var(--color-debt)' : (r.balance < 0 ? 'var(--color-payment)' : '#334155')};">
              ${ValidationService.formatMoney(r.balance, r.currency || defaultCur)}
            </td>
            <td><strong>${r.currency || defaultCur}</strong></td>
            <td>
              ${r.isDuplicate ? '<span class="badge" style="background:#F59E0B; color:#fff;">مكرر ⚠️</span>' : '<span class="badge badge-payment">جديد ✨</span>'}
            </td>
          </tr>
        `;
      }).join('');

      App.updateImportSelectedCount();
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth' });
    },

    updateImportSelectedCount: function() {
      const checks = document.querySelectorAll('.import-candidate-check:checked');
      const totalChecks = document.querySelectorAll('.import-candidate-check');
      const counter = document.getElementById('import-selected-count');
      if (counter) counter.textContent = `${checks.length} من أصل ${totalChecks.length} محدد`;

      const selectAll = document.getElementById('import-select-all');
      if (selectAll) selectAll.checked = (checks.length === totalChecks.length && totalChecks.length > 0);
    },

    toggleSelectAllImport: function(checkbox) {
      const checks = document.querySelectorAll('.import-candidate-check');
      checks.forEach(c => { c.checked = checkbox.checked; });
      App.updateImportSelectedCount();
    },

    cancelImportPreview: function() {
      const card = document.getElementById('universal-import-preview-card');
      if (card) card.style.display = 'none';
      appState.universalImportData = null;
    },

    confirmUniversalImport: function() {
      if (!appState.universalImportData || !appState.universalImportData.records) return;

      const checkedBoxes = Array.from(document.querySelectorAll('.import-candidate-check:checked'));
      if (checkedBoxes.length === 0) {
        showToast('يرجى تحديد حساب واحد على الأقل للاستيراد.', 'warning');
        return;
      }

      const defaultCurr = document.getElementById('import-default-currency') ? document.getElementById('import-default-currency').value : '';
      const dupHandling = document.getElementById('import-duplicate-handling') ? document.getElementById('import-duplicate-handling').value : 'skip';
      const detailedCheckbox = document.getElementById('import-detailed-transactions');
      const importDetailed = detailedCheckbox ? detailedCheckbox.checked : false;

      const allValid = appState.universalImportData.records.validRows;
      const selectedItems = checkedBoxes.map(cb => allValid[parseInt(cb.getAttribute('data-index'), 10)]).filter(Boolean);

      try {
        const schemaReport = appState.universalImportData.schemaReport || appState.universalImportData.records.schemaReport;
        if (schemaReport) {
          const mapping = schemaReport.mapping || {};
          const summary = [
            `جدول العملاء: ${schemaReport.customerTable || 'غير محدد'}`,
            `عدد الجداول: ${schemaReport.tableCount || 0}`,
            `مطابقة الأعمدة: ${JSON.stringify(mapping)}`,
            `عدد الصفوف المقروءة: ${schemaReport.rowsRead || 0}`,
            `تحذيرات: ${(schemaReport.warnings || []).slice(0, 8).join(' | ') || 'لا توجد'}`,
            `فحص سلامة SQLite: ${(schemaReport.integrityCheck || []).join(', ') || 'غير متاح'}`
          ].join('\n');
          if (schemaReport.truncated) {
            showToast('تم إيقاف الاستيراد: تجاوز الملف حد قراءة السجلات؛ يجب تقسيم قاعدة البيانات أو رفع حد المعالجة قبل المتابعة.', 'error', 7000);
            return;
          }
          if ((schemaReport.foreignKeyViolations || []).length > 0) {
            showToast('تم إيقاف الاستيراد: توجد علاقات مكسورة في قاعدة البيانات المصدر. راجع الملف قبل الاستيراد.', 'error', 7000);
            return;
          }
          if (!confirm(`مراجعة واعتماد مطابقة قاعدة البيانات قبل الاستيراد:\n\n${summary}\n\nهل توافق على هذه المطابقات وترحيل السجلات المحددة؟`)) return;
          if ((schemaReport.integrityCheck || []).some(x => String(x).toLowerCase() !== 'ok')) {
            showToast('تم إيقاف الاستيراد: فحص سلامة قاعدة SQLite لم ينجح.', 'error', 6000);
            return;
          }
        }
        const res = UniversalImporter.executeImport(selectedItems, {
          defaultCurrency: defaultCurr,
          duplicateHandling: dupHandling,
          importDetailedTransactions: importDetailed
        });

        const txMsg = importDetailed 
          ? `وترحيل (${res.createdTransactions}) حركة تفصيلية بكامل بياناتها.` 
          : `وتسجيل (${res.createdTransactions}) قيد افتتاحي موثق.`;

        showToast(`اكتمل الاستيراد بنجاح! تم استيراد (${res.importedCustomers}) حسابات جديدة، ودمج (${res.mergedCustomers})، ${txMsg}`, 'success', 5000);
        App.cancelImportPreview();
        renderScreen('customers');
      } catch (err) {
        showToast('فشل تنفيذ الاستيراد: ' + err.message, 'error', 5000);
      }
    },

    resetAllDataPrompt: function() {
      const confirmation = prompt('تحذير شديد: سيتم مسح كافة العملاء والديون والمدفوعات والحوالات نهائياً.\n\nلتأكيد المسح التام، اكتب كلمة "حذف" في المربع أدناه:');
      if (confirmation === 'حذف') {
        AppDatabase.resetAll();
        showToast('تمت إعادة ضبط المصنع ومسح كافة البيانات.', 'info');
        renderScreen('dashboard');
      } else if (confirmation !== null) {
        showToast('تم إلغاء عملية المسح (الكلمة المدخلة غير مطابقة).', 'warning');
      }
    },

    // Test Suite Execution
    runAutomatedTestSuite: function() {
      const resultsContainer = document.getElementById('test-results-container');
      if (!resultsContainer) return;

      resultsContainer.innerHTML = '<div style="text-align:center; padding: 20px;">جاري تشغيل الاختبارات المحاسبية والتخزينية... ⏳</div>';

      setTimeout(() => {
        const testResults = AccountingTestSuite.runAllTests();
        const total = testResults.length;
        const passedCount = testResults.filter(t => t.passed).length;
        const allPassed = passedCount === total;

        resultsContainer.innerHTML = `
          <div style="background: ${allPassed ? '#DCFCE7' : '#FEE2E2'}; color: ${allPassed ? '#166534' : '#991B1B'}; padding: 14px; border-radius: var(--radius-sm); margin-bottom: 16px; border: 1px solid ${allPassed ? '#86EFAC' : '#FCA5A5'};">
            <strong>نتيجة الفحص المحاسبي والتخزيني:</strong> نجح (${passedCount} من أصل ${total}) اختبارات.
            ${allPassed ? '✅ جميع العمليات المحاسبية وسلامة البيانات تعمل بدقة 100%.' : '⚠️ هناك اختبارات بحاجة لمراجعة.'}
          </div>
          <div>
            ${testResults.map(t => `
              <div class="card" style="margin-bottom: 10px; border-right: 5px solid ${t.passed ? '#16A34A' : '#DC2626'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <strong style="font-size: 13px;">${t.name}</strong>
                  <span class="badge ${t.passed ? 'badge-payment' : 'badge-debt'}">${t.passed ? 'PASS' : 'FAIL'}</span>
                </div>
                <div style="font-size: 12px; color: var(--color-text-muted); line-height: 1.5;">
                  <div><strong>الخطوات:</strong> ${t.steps}</div>
                  <div><strong>المتوقع:</strong> ${t.expected}</div>
                  <div><strong>الفعلي:</strong> ${t.actual}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        showToast(allPassed ? 'اكتملت جميع الاختبارات بنجاح!' : 'فشل بعض الاختبارات، راجع التفاصيل.', allPassed ? 'success' : 'error');
      }, 100);
    },

    // Modal Helpers
    openModal: function(modalId) {
      const m = document.getElementById(modalId);
      if (m) m.classList.add('active');
    },

    closeModal: function(modalId) {
      const m = document.getElementById(modalId);
      if (m) m.classList.remove('active');
    }
  };

  // Setup Global Event Listeners for Filters
  const searchCustInput = document.getElementById('customers-search-input');
  if (searchCustInput) {
    searchCustInput.addEventListener('input', () => renderCustomersList());
  }

  const filterCustSelect = document.getElementById('customers-filter-select');
  if (filterCustSelect) {
    filterCustSelect.addEventListener('change', () => renderCustomersList());
  }

  const categoryCustSelect = document.getElementById('customers-category-select');
  if (categoryCustSelect) {
    categoryCustSelect.addEventListener('change', () => renderCustomersList());
  }

  const sortCustSelect = document.getElementById('customers-sort-select');
  if (sortCustSelect) {
    sortCustSelect.addEventListener('change', () => renderCustomersList());
  }

  const txFilter = document.getElementById('tx-filter-type');
  if (txFilter) {
    txFilter.addEventListener('change', () => renderTransactionsList());
  }

  const reportTypeSelect = document.getElementById('report-type-select');
  if (reportTypeSelect) {
    reportTypeSelect.addEventListener('change', () => renderReports());
  }

  const reportPeriodSelect = document.getElementById('report-period-select');
  const reportStartDate = document.getElementById('report-start-date');
  const reportEndDate = document.getElementById('report-end-date');

  if (reportPeriodSelect) {
    reportPeriodSelect.addEventListener('change', () => {
      const p = reportPeriodSelect.value;
      if (p !== 'custom' && p !== 'all') {
        const dates = ReportService.getPeriodDateRange(p);
        if (reportStartDate && dates.start) reportStartDate.value = dates.start;
        if (reportEndDate && dates.end) reportEndDate.value = dates.end;
      } else if (p === 'all') {
        if (reportStartDate) reportStartDate.value = '';
        if (reportEndDate) reportEndDate.value = '';
      }
      renderReports();
    });
  }

  if (reportStartDate) {
    reportStartDate.addEventListener('change', () => {
      if (reportPeriodSelect) reportPeriodSelect.value = 'custom';
      renderReports();
    });
  }

  if (reportEndDate) {
    reportEndDate.addEventListener('change', () => {
      if (reportPeriodSelect) reportPeriodSelect.value = 'custom';
      renderReports();
    });
  }

  // Initial render
  navigateTo('dashboard');
});
