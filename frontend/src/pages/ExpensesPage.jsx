import { useEffect, useState, useMemo } from 'react'
import { getExpenses, getExpensesSummary, createExpense, updateExpense, deleteExpense } from '../api'
import Pagination from '../components/Pagination'

export const EXPENSE_CATEGORIES = [
  { id: 'rent', label: 'إيجار القاعة / السنتر', icon: 'pi-building', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  { id: 'electricity', label: 'فواتير (كهرباء / مياه / نت)', icon: 'pi-bolt', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'prints', label: 'مطبوعات وورق ومذكرات', icon: 'pi-print', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  { id: 'salary', label: 'رواتب ومكافآت مساعدين', icon: 'pi-users', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { id: 'hospitality', label: 'ضيافة وبوفيه ومشروبات', icon: 'pi-coffee', color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
  { id: 'maintenance', label: 'صيانة وأدوات ومستلزمات', icon: 'pi-wrench', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  { id: 'fees', label: 'رسوم واشتراكات', icon: 'pi-ticket', color: '#14b8a6', bg: 'rgba(20,184,166,0.1)' },
  { id: 'other', label: 'مصروفات أخرى', icon: 'pi-ellipsis-h', color: '#64748b', bg: 'rgba(100,116,139,0.1)' }
]

export const getCategoryMeta = (catId) => {
  return EXPENSE_CATEGORIES.find(c => c.id === catId) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filteredSum, setFilteredSum] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Modals
  const [modal, setModal] = useState(null) // 'create' | 'edit' | 'delete'
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form State
  const [form, setForm] = useState({
    title: '',
    category: 'rent',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    paidBy: '',
    notes: ''
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [resExp, resSummary] = await Promise.all([
        getExpenses({
          page: currentPage,
          per_page: 15,
          category: categoryFilter,
          q: searchQ,
          from: dateFrom || undefined,
          to: dateTo || undefined
        }),
        getExpensesSummary()
      ])

      setExpenses(resExp.data.expenses || [])
      setTotalPages(resExp.data.pages || 1)
      setFilteredSum(resExp.data.filteredSum || 0)
      setTotalCount(resExp.data.total || 0)
      setSummary(resSummary.data)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'فشل تحميل بيانات المصروفات' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentPage, categoryFilter, dateFrom, dateTo])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setCurrentPage(1)
    loadData()
  }

  const openCreate = () => {
    setEditingItem(null)
    setForm({
      title: '',
      category: 'rent',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      paidBy: '',
      notes: ''
    })
    setModal('create')
  }

  const openEdit = (exp) => {
    setEditingItem(exp)
    setForm({
      title: exp.title,
      category: exp.category,
      amount: exp.amount,
      date: exp.date ? new Date(exp.date).toISOString().slice(0, 10) : '',
      paidBy: exp.paidBy || '',
      notes: exp.notes || ''
    })
    setModal('edit')
  }

  const openDelete = (exp) => {
    setEditingItem(exp)
    setModal('delete')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setMsg({ type: 'error', text: 'يرجى إدخال اسم بند المصروف' })
      return
    }
    const val = parseFloat(form.amount)
    if (isNaN(val) || val <= 0) {
      setMsg({ type: 'error', text: 'المبلغ غير صالح' })
      return
    }

    setSaving(true)
    try {
      if (modal === 'create') {
        await createExpense(form)
        setMsg({ type: 'success', text: 'تم تسجيل المصروف بنجاح' })
      } else if (modal === 'edit') {
        await updateExpense(editingItem.id, form)
        setMsg({ type: 'success', text: 'تم تحديث بيانات المصروف بنجاح' })
      }
      setModal(null)
      loadData()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'حدث خطأ أثناء الحفظ' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteExpense(editingItem.id)
      setMsg({ type: 'success', text: 'تم حذف المصروف بنجاح' })
      setModal(null)
      loadData()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'فشل حذف المصروف' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title"><i className="pi pi-money-bill" style={{ color: '#10b981' }} /> إدارة المصروفات العامة</h1>
          <p className="page-subtitle">تسجيل ومتابعة مصروفات السنتر (إيجار، فواتير، مطبوعات، صيانة، رواتب، وغيرها)</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem' }}>
          <i className="pi pi-plus" /> تسجيل مصروف جديد
        </button>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1.25rem' }}>
          <i className={`pi ${msg.type === 'success' ? 'pi-check-circle' : 'pi-exclamation-circle'}`} />
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderRight: '4px solid #ef4444', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            <i className="pi pi-chart-pie" />
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>إجمالي المصروفات (كلي)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444', marginTop: '0.2rem' }}>
              {(summary?.totalAmount || 0).toLocaleString()} <span style={{ fontSize: '0.85rem' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>{summary?.totalCount || 0} عملية صرف</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRight: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            <i className="pi pi-calendar" />
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>مصروفات هذا الشهر</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.2rem' }}>
              {(summary?.thisMonthAmount || 0).toLocaleString()} <span style={{ fontSize: '0.85rem' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>{summary?.thisMonthCount || 0} عملية في الشهر الحالي</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRight: '4px solid #3b82f6', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            <i className="pi pi-filter" />
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>المعروض حالياً (وفق التصفية)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3b82f6', marginTop: '0.2rem' }}>
              {filteredSum.toLocaleString()} <span style={{ fontSize: '0.85rem' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>{totalCount} بند مطابق</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>بحث بالاسم أو البيان</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                placeholder="مثال: إيجار، كهرباء..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>تصنيف البند</label>
            <select
              className="form-control"
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">كل التصنيفات</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>من تاريخ</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>إلى تاريخ</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
              <i className="pi pi-search" /> تصفية
            </button>
            {(searchQ || categoryFilter !== 'all' || dateFrom || dateTo) && (
              <button
                type="button"
                className="btn btn-secondary"
                title="إعادة تعيين"
                onClick={() => {
                  setSearchQ('');
                  setCategoryFilter('all');
                  setDateFrom('');
                  setDateTo('');
                  setCurrentPage(1);
                }}
              >
                <i className="pi pi-refresh" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Expenses Table / Cards */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div className="spinner-wrapper" style={{ padding: '3rem 0' }}><div className="spinner" /></div>
        ) : expenses.length === 0 ? (
          <div className="empty-state" style={{ padding: '3.5rem 1rem' }}>
            <i className="pi pi-inbox" style={{ fontSize: '2.5rem', color: 'var(--text-color-secondary)' }} />
            <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>لا توجد مصروفات مسجلة مطابقة للبحث</p>
            <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: '0.5rem' }}>
              <i className="pi pi-plus" /> إضافة أول مصروف
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'var(--surface-ground, #f8fafc)', borderBottom: '1px solid var(--surface-border)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>التاريخ</th>
                  <th style={{ padding: '0.85rem 1rem' }}>بند المصروف</th>
                  <th style={{ padding: '0.85rem 1rem' }}>التصنيف</th>
                  <th style={{ padding: '0.85rem 1rem' }}>المبلغ</th>
                  <th style={{ padding: '0.85rem 1rem' }}>المسؤول عن الصرف</th>
                  <th style={{ padding: '0.85rem 1rem' }}>ملاحظات</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => {
                  const meta = getCategoryMeta(exp.category)
                  const formattedDate = new Date(exp.date).toLocaleDateString('ar-EG', {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })
                  return (
                    <tr key={exp.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>{formattedDate}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>{exp.title}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '16px',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          color: meta.color,
                          background: meta.bg
                        }}>
                          <i className={`pi ${meta.icon}`} style={{ fontSize: '0.8rem' }} />
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '1rem' }}>
                          {exp.amount.toLocaleString()} ج.م
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.85rem' }}>{exp.paidBy || '-'}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', maxWidth: '220px' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={exp.notes || ''}>
                          {exp.notes || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openEdit(exp)}
                            title="تعديل"
                            style={{ padding: '0.35rem 0.6rem' }}
                          >
                            <i className="pi pi-pencil" />
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => openDelete(exp)}
                            title="حذف"
                            style={{ padding: '0.35rem 0.6rem' }}
                          >
                            <i className="pi pi-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--surface-border)' }}>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={p => setCurrentPage(p)}
            />
          </div>
        )}
      </div>

      {/* Modal: Create or Edit Expense */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <i className={`pi ${modal === 'create' ? 'pi-plus-circle' : 'pi-pencil'}`} style={{ color: 'var(--primary-color)' }} />
                {modal === 'create' ? 'تسجيل مصروف جديد' : 'تعديل بيانات المصروف'}
              </h3>
              <button className="modal-close" onClick={() => setModal(null)}>
                <i className="pi pi-times" />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">اسم بند المصروف <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="مثال: إيجار قاعة شهر أكتوبر، فاتورة الكهرباء، ورق تصوير..."
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">التصنيف</label>
                  <select
                    className="form-control"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">المبلغ (ج.م) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="form-control"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">تاريخ الصرف</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">المسؤول عن الصرف</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="اسم المسؤول أو المساعد"
                    value={form.paidBy}
                    onChange={e => setForm(f => ({ ...f, paidBy: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">ملاحظات أو تفاصيل إضافية</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="أي ملاحظات حول الفاتورة أو رقم الإيصال..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><i className="pi pi-spin pi-spinner" /> جاري الحفظ...</> : <><i className="pi pi-check" /> حفظ المصروف</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {modal === 'delete' && editingItem && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#ef4444' }}>
                <i className="pi pi-exclamation-triangle" /> تأكيد حذف المصروف
              </h3>
              <button className="modal-close" onClick={() => setModal(null)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <p style={{ marginTop: '0.5rem', lineHeight: 1.6 }}>
              هل أنت متأكد من حذف بند المصروف: <strong>"{editingItem.title}"</strong> بقيمة <strong>{editingItem.amount} ج.م</strong>؟
            </p>
            <div className="modal-footer" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? <><i className="pi pi-spin pi-spinner" /> جاري الحذف...</> : <><i className="pi pi-trash" /> حذف نهائي</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
