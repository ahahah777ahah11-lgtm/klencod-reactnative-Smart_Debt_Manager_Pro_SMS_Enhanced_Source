# المواصفات الفنية والتقنية - مدير الديون الذكي برو SMS
# Smart Debt Manager Pro SMS - Technical Specification

## 1. نموذج البيانات (Data Models)

### أ. العملاء (Customer Entity)
```typescript
interface Customer {
  id: string;               // معرف فريد (مثال: cust_1730000000_abc123)
  name: string;             // اسم العميل
  phone: string;            // رقم الهاتف
  notes: string;            // ملاحظات وبيان
  createdAt: string;        // تاريخ ووقت الإنشاء (ISO String)
  updatedAt: string;        // تاريخ ووقت آخر تعديل
  archived: boolean;        // حالة الأرشفة (true/false)
}
```

### ب. العمليات المالية (Transaction Entity)
```typescript
interface Transaction {
  id: string;               // معرف فريد للعملية (tx_...)
  customerId: string;       // معرف العميل المرتبط
  type: 'debt' | 'payment' | 'opening' | 'settlement'; // نوع العملية
  amount: number;           // المبلغ المالي (رقم موجب > 0)
  date: string;             // تاريخ العملية (YYYY-MM-DD)
  notes: string;            // البيان والملاحظات
  reference: string;        // رقم السند أو الفاتورة
  status: 'active' | 'cancelled'; // حالة العملية
  createdAt: string;        // وقت الإنشاء
  cancelledAt?: string;     // وقت الإلغاء إن وجد
  cancelReason?: string;    // سبب الإلغاء
}
```

### ج. الحوالات الواردة (Remittance Entity)
```typescript
interface Remittance {
  id: string;               // معرف فريد (remit_...)
  company: string;          // شركة التحويل (النجم، الامتياز، داديه، إلخ)
  senderName: string;       // اسم المرسل
  senderPhone: string;      // هاتف المرسل
  amount: number;           // مبلغ الحوالة
  date: string;             // تاريخ الحوالة
  reference: string;        // الرقم المرجعي للحوالة
  customerId: string | null;// العميل المرتبط
  matchingStatus: 'unmatched' | 'matched' | 'pending_confirmation' | 'confirmed' | 'recorded_as_payment' | 'cancelled';
  paymentTransactionId: string | null; // رقم عملية الدفعة الناتجة
  createdAt: string;
}
```

### د. قوالب الرسائل (SMS Template Entity)
```typescript
interface SmsTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

### هـ. سجل الرسائل (SMS Log Entity)
```typescript
interface SmsLog {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  renderedMessage: string;
  preparedAt: string;
  status: 'prepared' | 'dispatched';
}
```

## 2. القواعد والمعادلات المحاسبية الأساسية

1. **إجمالي الديون المعتمدة:**
   $$\text{Total Debts} = \sum (\text{Transactions of type 'debt' where status = 'active'}) + \sum (\text{Opening debit balances})$$

2. **إجمالي المدفوعات المعتمدة:**
   $$\text{Total Payments} = \sum (\text{Transactions of type 'payment' where status = 'active'}) + \sum (\text{Opening credit balances})$$

3. **الرصيد المتبقي:**
   $$\text{Remaining Balance} = \text{Total Debts} - \text{Total Payments}$$

4. **سياسة منع السداد الزائد (Overpayment Guard):**
   - في حال كان الرصيد الحالي $\le 0$، يتم رفض تسجيل الدفعة وإظهار تنبيه يوضح عدم وجود رصيد مستحق.
   - في حال كان مبلغ الدفعة > الرصيد المستحق، يتم رفض العملية افتراضياً لمنع تحول الحساب إلى رصيد دائن غير موثق.

5. **منع التكرار في الحوالات:**
   - تطبيع اسم الشركة والرقم المرجعي (إزالة المسافات وتوحيد الأرقام والحروف).
   - التحقق من عدم وجود حوالة أخرى بنفس الشركة والرقم المرجعي.
   - عند ترحيل الحوالة كدفعة، يتم إنشاء حركة دفعة واحدة وتحديث `paymentTransactionId` وقفل الحوالة فوراً.
