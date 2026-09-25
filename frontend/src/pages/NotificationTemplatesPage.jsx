import { useEffect, useState, useRef } from 'react'
import {
  getNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  testSendNotificationTemplate,
  getNotificationsStatus,
} from '../api'

const COMMON_PLACEHOLDERS = [
  '{{رقم_الهاتف}}', '{{رقم_ولي_الأمر}}', '{{المجموعة}}', '{{الصف}}',
  '{{الإجمالي_الكلي}}', '{{المدفوع_الكلي}}', '{{المتبقي_الكلي}}',
  '{{المكان}}', '{{الوصف}}'
]

const TYPES = [
  { value: 'attendance_present', label: 'حضور',                 icon: 'pi-check-circle',   color: '#10b981',
    placeholders: ['{{كود_الطالب}}', '{{اسم_الطالب}}', '{{عنوان_الحصة}}', '{{الحضور}}', '{{التاريخ}}', ...COMMON_PLACEHOLDERS],
  },
  { value: 'attendance_absent',  label: 'غياب',                 icon: 'pi-times-circle',   color: '#ef4444',
    placeholders: ['{{كود_الطالب}}', '{{اسم_الطالب}}', '{{عنوان_الحصة}}', '{{الحضور}}', '{{التاريخ}}', ...COMMON_PLACEHOLDERS],
  },
  { value: 'exam_grade_good',    label: 'درجة امتحان (ممتاز)',   icon: 'pi-star',           color: '#f59e0b',
    placeholders: ['{{كود_الطالب}}', '{{اسم_الطالب}}', '{{عنوان_الامتحان}}', '{{الدرجة}}', '{{الدرجة_الكلية}}', ...COMMON_PLACEHOLDERS],
  },
  { value: 'exam_grade_bad',     label: 'درجة امتحان (ضعيف)',    icon: 'pi-exclamation-triangle', color: '#ef4444',
    placeholders: ['{{كود_الطالب}}', '{{اسم_الطالب}}', '{{عنوان_الامتحان}}', '{{الدرجة}}', '{{الدرجة_الكلية}}', ...COMMON_PLACEHOLDERS],
  },
  { value: 'payment_added_sessions', label: 'إضافة دفعة (حصص)', icon: 'pi-money-bill',   color: '#10b981',
    placeholders: ['{{كود_الطالب}}', '{{اسم_الطالب}}', '{{قيمة_الدفعة}}', '{{تاريخ_الدفع}}', '{{الدرجة_الكلية}}', '{{المتبقي}}', ...COMMON_PLACEHOLDERS],
  },
  { value: 'payment_added_book',     label: 'إضافة دفعة (كتب)', icon: 'pi-book',         color: '#0891b2',
    placeholders: ['{{كود_الطالب}}', '{{اسم_الطالب}}', '{{قيمة_الدفعة}}', '{{تاريخ_الدفع}}', '{{الدرجة_الكلية}}', '{{المتبقي}}', ...COMMON_PLACEHOLDERS]
  }
]

function getTypeInfo(value) {
  return TYPES.find(t => t.value === value) || TYPES[TYPES.length - 1]
}

// regex يدعم الأحرف العربية والإنجليزية والشرطة السفلية
const PH_REGEX = /\{\{([\u0600-\u06FFa-zA-Z0-9_]+)\}\}/g
const SAMPLE_VALUES = {
  'كود_الطالب': '1042',
  'اسم_الطالب': 'أحمد محمد',
  'اسم_المجموعة': 'مجموعة أ',
  'عنوان_الحصة': 'حصة الرياضيات',
  'قيمة_الدفعة': '150 جنيه',
  'تاريخ_الدفع': '09/07/2026',
  'الدرجة_الكلية': '20',
  'المتبقي': '150 جنيه',
  'عنوان_المحاضرة': 'محاضرة المراجعة',
  'عنوان_الامتحان': 'امتحان الشهر',
  'الحضور': 'حاضر',
  'الدرجة': '18',
  'التاريخ': new Date().toLocaleString('ar-EG'),
  'رقم_الهاتف': '01012345678',
  'رقم_ولي_الأمر': '01112345678',
  'المجموعة': 'مجموعة أ',
  'الصف': 'الثاني الثانوي',
  'الإجمالي_الكلي': '1200',
  'المدفوع_الكلي': '800',
  'المتبقي_الكلي': '400',
  'المكان': 'قاعة 1',
  'الوصف': 'مراجعة الباب الأول'
}


function renderPreview(body) {
  return body.replace(PH_REGEX, (_, k) => SAMPLE_VALUES[k] ?? `[${k}]`)
}

export default function NotificationTemplatesPage() {
  const textareaRef = useRef(null)
  const [templates, setTemplates] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'form' | 'delete' | 'preview'
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ name: '', type: 'attendance_present', body: '', active: true })
  const [filter, setFilter] = useState('all')
  const [previewResult, setPreviewResult] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testSending, setTestSending] = useState(false)

  const insertPlaceholder = (ph) => {
    const el = textareaRef.current
    if (!el) {
      setForm(f => ({ ...f, body: f.body + ph }))
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    setForm(f => {
      const newBody = f.body.substring(0, start) + ph + f.body.substring(end)
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + ph.length
        el.focus()
      }, 0)
      return { ...f, body: newBody }
    })
  }

  const load = () => {
    setLoading(true)
    Promise.all([
      getNotificationTemplates(),
      getNotificationsStatus().catch(() => null)
    ]).then(([tRes, sRes]) => {
      setTemplates(tRes.data)
      if (sRes) setStatus(sRes.data)
    }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const showMsg = (type, text) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', type: 'attendance_present', body: '', active: true })
    setModal('form')
  }

  const openEdit = (t) => {
    setEditing(t)
    setForm({ name: t.name, type: t.type, body: t.body, active: t.active })
    setModal('form')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      editing
        ? await updateNotificationTemplate(editing.id, form)
        : await createNotificationTemplate(form)
      showMsg('success', editing ? 'تم تحديث القالب' : 'تم إضافة القالب')
      setModal(null)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'خطأ في الحفظ')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteNotificationTemplate(editing.id)
      showMsg('success', 'تم حذف القالب')
      setModal(null)
      load()
    } catch {
      showMsg('error', 'فشل الحذف')
    }
  }

  const openPreview = (t) => {
    setPreviewResult(renderPreview(t.body))
    setEditing(t)
    setModal('preview')
  }

  const handleTestSend = async () => {
    if (!editing || !testPhone.trim()) return
    setTestSending(true)
    try {
      await testSendNotificationTemplate(editing.id, { phoneNumber: testPhone })
      showMsg('success', 'تم إرسال رسالة اختبار')
      setModal(null)
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'فشل إرسال الاختبار')
    } finally {
      setTestSending(false)
    }
  }

  const filteredTemplates = filter === 'all' ? templates : templates.filter(t => t.type === filter)
  const typeInfo = getTypeInfo(form.type)

  const requireTrigger = status?.requireTrigger
  const hasToken = status?.hasWhatsappToken

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><i className="pi pi-file-edit" /> قوالب الرسائل</h1>
          <p className="page-subtitle">{templates.length} قالب · رسائل نصية مجانية ضمن نافذة الـ 24 ساعة</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <i className="pi pi-plus" /> قالب جديد
        </button>
      </div>

      {/* Status Banner */}
      {status && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {!hasToken && (
            <div className="alert alert-error" style={{ margin: 0, flex: '1 1 300px' }}>
              <i className="pi pi-exclamation-triangle" /> واتساب غير مُعدّ — أضف WHATSAPP_TOKEN في ملف .env
            </div>
          )}
          <div className="alert alert-info" style={{ margin: 0, flex: '1 1 300px', background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}>
            <i className={`pi ${requireTrigger ? 'pi-lock' : 'pi-send'}`} />
            {requireTrigger
              ? ' وضع الـ Trigger مفعّل — يُرسل فقط لمن فتح محادثة في آخر 24 ساعة (مجاناً)'
              : ' يُرسل للجميع — من فتح نافذة يأخذ نص مجاني، غيره يأخذ قالب واتساب مدفوع'
            }
          </div>
        </div>
      )}

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} /> {msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>
          الكل ({templates.length})
        </button>
        {TYPES.map(t => {
          const count = templates.filter(tp => tp.type === t.value).length
          return (
            <button key={t.value}
              className={`btn btn-sm ${filter === t.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(t.value)}
              style={{ borderRight: `3px solid ${t.color}` }}
            >
              <i className={`pi ${t.icon}`} /> {t.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Templates grid */}
      {loading
        ? <div className="spinner-wrapper"><div className="spinner" /></div>
        : filteredTemplates.length === 0
          ? (
            <div className="empty-state">
              <i className="pi pi-file-edit" />
              <p>لا توجد قوالب</p>
              <button className="btn btn-primary" onClick={openCreate}><i className="pi pi-plus" /> أضف قالباً</button>
            </div>
          )
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredTemplates.map(t => {
                const info = getTypeInfo(t.type)
                return (
                  <div key={t.id} className="card" style={{ margin: 0, borderTop: `3px solid ${info.color}`, opacity: t.active ? 1 : 0.55 }}>
                    <div className="card-header" style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <i className={`pi ${info.icon}`} style={{ color: info.color, fontSize: '1.1rem' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openPreview(t)} title="معاينة">
                          <i className="pi pi-eye" />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} title="تعديل">
                          <i className="pi pi-pencil" />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => { setEditing(t); setModal('delete') }} title="حذف">
                          <i className="pi pi-trash" />
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: '0.75rem' }}>
                      <span className="badge" style={{ background: info.color + '22', color: info.color, border: `1px solid ${info.color}55`, marginBottom: '0.5rem', display: 'inline-block' }}>
                        <i className={`pi ${info.icon}`} /> {info.label}
                      </span>
                      {!t.active && <span className="badge badge-warning" style={{ marginRight: '0.4rem' }}>غير نشط</span>}
                    </div>

                    <div style={{
                      background: 'var(--surface-ground)',
                      borderRadius: 'var(--border-radius)',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      lineHeight: 1.6,
                      direction: 'rtl',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '100px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {t.body}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(transparent, var(--surface-ground))' }} />
                    </div>

                    <div className="text-muted text-sm" style={{ marginTop: '0.75rem' }}>
                      آخر تحديث: {new Date(t.updatedAt).toLocaleDateString('ar-EG')}
                    </div>
                  </div>
                )
              })}
            </div>
          )
      }

      {/* ===== Form Modal ===== */}
      {modal === 'form' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="pi pi-file-edit" /> {editing ? 'تعديل قالب' : 'قالب جديد'}
              </h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">اسم القالب</label>
                  <input className="form-control" required value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="مثال: إشعار غياب يومي" />
                </div>
                <div className="form-group">
                  <label className="form-label">نوع الإشعار</label>
                  <select className="form-control" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Placeholders chips */}
              <div className="form-group">
                <label className="form-label">المتغيرات المتاحة — اضغط لإدراجها في الرسالة</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {typeInfo.placeholders.map(ph => (
                    <button key={ph} type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontFamily: 'inherit', fontSize: '0.82rem', direction: 'rtl' }}
                      onClick={() => insertPlaceholder(ph)}>
                      {ph}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">نص الرسالة</label>
                <textarea
                  ref={textareaRef}
                  className="form-control"
                  required
                  rows={5}
                  style={{ resize: 'vertical', fontFamily: 'inherit', direction: 'rtl' }}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder={typeInfo.fallback || 'اكتب نص الرسالة هنا...'}
                />
                <div className="text-muted text-sm" style={{ marginTop: '0.4rem' }}>
                  الرسائل الواردة خلال الـ 24 ساعة ستتسلم النص مجاناً. غيرها ستتسلم قالب واتساب المعتمد.
                </div>
              </div>

              {/* Live preview */}
              {form.body && (
                <div style={{ background: '#25d366', borderRadius: '12px 12px 0 12px', padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#fff', direction: 'rtl', whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
                  <div className="text-sm" style={{ opacity: 0.75, marginBottom: '0.25rem' }}><i className="pi pi-whatsapp" /> معاينة:</div>
                  {renderPreview(form.body)}
                </div>
              )}

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input type="checkbox" id="tpl-active" checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="tpl-active" className="form-label" style={{ margin: 0 }}>قالب نشط</label>
              </div>

              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> حفظ</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Delete Modal ===== */}
      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#dc3545' }}>
                <i className="pi pi-exclamation-triangle" /> تأكيد الحذف
              </h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل تريد حذف قالب <strong>{editing?.name}</strong>؟</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDelete}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Preview Modal ===== */}
      {modal === 'preview' && editing && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="pi pi-eye" /> معاينة: {editing.name}</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>

            {/* WhatsApp bubble preview */}
            <div style={{ background: '#e5ddd5', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{
                background: '#fff',
                borderRadius: '8px 8px 8px 0',
                padding: '0.75rem 1rem',
                fontSize: '0.95rem',
                direction: 'rtl',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                maxWidth: '90%',
                marginRight: 'auto'
              }}>
                {previewResult}
              </div>
              <div className="text-muted text-sm" style={{ marginTop: '0.4rem', textAlign: 'left' }}>
                {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} ✓✓
              </div>
            </div>

            <div className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
              <i className="pi pi-info-circle" /> المعاينة تستخدم بيانات مثال. عند الإرسال الجماعي تُستبدل بالبيانات الفعلية.
            </div>

            <div className="form-group">
              <label className="form-label">إرسال اختبار لرقم واتساب</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="form-control" placeholder="مثال: 01000000000" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
                <button className="btn btn-primary" disabled={testSending || !testPhone.trim()} onClick={handleTestSend}>
                  {testSending ? <i className="pi pi-spin pi-spinner" /> : <i className="pi pi-send" />} اختبار
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { openEdit(editing); }}>
                <i className="pi pi-pencil" /> تعديل
              </button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
