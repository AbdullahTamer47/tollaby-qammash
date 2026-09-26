import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { getStudents, deleteStudent, activateStudent, getGroups, getOffers, createStudent, updateStudent } from '../api'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'
import StudentReportModal from '../components/StudentReportModal'

const GRADES = [
  'الصف السادس الابتدائي','الصف الأول الاعدادي','الصف الثاني الاعدادي','الصف الثالث الاعدادي',
  'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي','بدون صف محدد'
]

const EMPTY_FORM = { name: '', phoneNumber: '', dadPhoneNumber: '', sex: 'ذكر', groupId: '', offerId: '', active: false }

const isValidEgyptianPhone = (num) => /^01[0125][0-9]{8}$/.test(num)

export default function StudentsPage() {
  const [state, setState] = useState({ students: [], total: 0, page: 1 })
  const [loading, setLoading] = useState(true)
  const [reportStudentId, setReportStudentId] = useState(null)
  
  // Filters
  const [searchQ, setSearchQ] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSex, setFilterSex] = useState('')
  const [filterActive, setFilterActive] = useState('')

  const [groups, setGroups] = useState([])
  const [offers, setOffers] = useState([])
  const [modal, setModal] = useState(null) // null | 'add' | 'edit' | 'delete' | 'offer'
  const [editingStudent, setEditingStudent] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [phoneErrors, setPhoneErrors] = useState({ phoneNumber: '', dadPhoneNumber: '' })
  const [offerForm, setOfferForm] = useState({ title: '', type: 'percentage', value: '' })
  const [msg, setMsg] = useState(null)
  const [qrModal, setQrModal] = useState(false)
  const navigate = useNavigate()

  const PER_PAGE = 10;

  const load = useCallback((page = 1) => {
    setLoading(true)
    const params = { page, per_page: PER_PAGE }
    if (searchQ) params.q = searchQ
    if (filterGroupId) params.groupId = filterGroupId
    if (filterGrade) params.grade = filterGrade
    if (filterSex) params.sex = filterSex
    if (filterActive) params.active = filterActive

    getStudents(params)
      .then(r => setState({ students: r.data.students, total: r.data.total, page }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [searchQ, filterGroupId, filterGrade, filterSex, filterActive])

  useEffect(() => {
    load(1)
  }, [searchQ, filterGroupId, filterGrade, filterSex, filterActive, load])

  useEffect(() => {
    getGroups().then(r => setGroups(r.data))
    getOffers().then(r => setOffers(r.data))
  }, [])

  useEffect(() => {
    if (qrModal) {
      const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false)
      scanner.render((text) => {
        scanner.clear()
        setQrModal(false)
        navigate(`/students/${text}/dashboard`)
      }, () => {})
      return () => {
        scanner.clear().catch(() => {})
      }
    }
  }, [qrModal, navigate])

  const handleExportCSV = () => {
    // If we want to export all, we could fetch all. For simplicity, export current list or fetch full list if needed.
    // Assuming backend pagination, to get full list, we might need a separate endpoint or high per_page.
    // We'll just export the current page for now, or request per_page = total to export all.
    getStudents({ q: searchQ, groupId: filterGroupId, grade: filterGrade, sex: filterSex, active: filterActive, per_page: 10000 })
      .then(r => {
        const columns = [
          { header: 'الرقم', key: 'id' },
          { header: 'الاسم', key: 'name' },
          { header: 'هاتف الطالب', key: 'phoneNumber' },
          { header: 'هاتف ولي الأمر', key: 'dadPhoneNumber' },
          { header: 'المجموعة', key: 'group.name' },
          { header: 'الصف', key: 'group.grade' },
          { header: 'النوع', key: 'sex' },
          { header: 'الحالة', render: s => s.active ? 'نشط' : 'غير نشط' }
        ]
        exportToCSV(r.data.students, columns, 'students_export')
      })
  }

  const handlePhoneChange = (field, rawValue) => {
    const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 11)
    setForm(f => ({ ...f, [field]: digitsOnly }))

    if (digitsOnly.length === 0) {
      setPhoneErrors(prev => ({ ...prev, [field]: '' }))
    } else if (digitsOnly.length < 11) {
      setPhoneErrors(prev => ({ ...prev, [field]: 'الرقم لازم يكون 11 رقم' }))
    } else if (!isValidEgyptianPhone(digitsOnly)) {
      setPhoneErrors(prev => ({ ...prev, [field]: 'رقم غير صحيح (لازم يبدأ بـ 010 أو 011 أو 012 أو 015)' }))
    } else {
      setPhoneErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, groupId: groups[0]?.id || '', offerId: offers[0]?.id || '' })
    setEditingStudent(null)
    setPhoneErrors({ phoneNumber: '', dadPhoneNumber: '' })
    setModal('add')
  }

  const openEdit = (s) => {
    setForm({ name: s.name, phoneNumber: s.phoneNumber, dadPhoneNumber: s.dadPhoneNumber, sex: s.sex, groupId: s.groupId, offerId: s.offerId, active: s.active })
    setEditingStudent(s)
    setPhoneErrors({ phoneNumber: '', dadPhoneNumber: '' })
    setModal('edit')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!isValidEgyptianPhone(form.phoneNumber) || !isValidEgyptianPhone(form.dadPhoneNumber)) {
      setMsg({ type: 'error', text: 'من فضلك أدخل أرقام هواتف مصرية صحيحة' })
      return
    }
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, form)
        setMsg({ type: 'success', text: 'تم تعديل الطالب بنجاح' })
      } else {
        await createStudent(form)
        setMsg({ type: 'success', text: 'تم إضافة الطالب بنجاح' })
      }
      setModal(null)
      load(state.page)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'خطأ' })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteStudent(editingStudent.id)
      setMsg({ type: 'success', text: 'تم حذف الطالب' })
      setModal(null)
      load(1)
    } catch (err) {
      setMsg({ type: 'error', text: 'فشل الحذف' })
    }
  }

  const handleActivate = async (s) => {
    await activateStudent(s.id)
    load(state.page)
  }

  const totalPages = Math.ceil(state.total / PER_PAGE)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">الطلاب</h1>
          <p className="page-subtitle">إجمالي: {state.total} طالب</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
          <button className="btn btn-secondary" onClick={() => setModal('offer')}>
            <i className="pi pi-tag" /> إضافة خصم
          </button>
          <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => setQrModal(true)}>
            <i className="pi pi-camera" /> مسح QR
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <i className="pi pi-user-plus" /> إضافة طالب
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />
          {msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>
            <i className="pi pi-times" />
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-users" /> قائمة الطلاب</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="form-control"
              style={{ width: '220px' }}
              placeholder="بحث بالاسم أو الرقم..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
            <select className="form-control" style={{ width: '180px' }} value={filterGroupId} onChange={e => setFilterGroupId(e.target.value)}>
              <option value="">-- جميع المجموعات --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
            </select>
            <select className="form-control" style={{ width: '150px' }} value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
              <option value="">-- كل الصفوف --</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="form-control" style={{ width: '120px' }} value={filterSex} onChange={e => setFilterSex(e.target.value)}>
              <option value="">-- النوع --</option>
              <option value="ذكر">ذكر</option>
              <option value="أنثي">أنثي</option>
            </select>
            <select className="form-control" style={{ width: '120px' }} value={filterActive} onChange={e => setFilterActive(e.target.value)}>
              <option value="">-- الحالة --</option>
              <option value="true">نشط</option>
              <option value="false">غير نشط</option>
            </select>
          </div>
        </div>

        {loading
          ? <div className="spinner-wrapper"><div className="spinner" /></div>
          : state.students.length === 0
            ? <div className="empty-state"><i className="pi pi-users" /><p>لا يوجد طلاب</p></div>
            : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>الرقم</th>
                      <th>الاسم</th>
                      <th>المجموعة</th>
                      <th>الصف</th>
                      <th>النوع</th>
                      <th>الحالة</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.students.map(s => (
                      <tr key={s.id}>
                        <td><span className="badge badge-info">{s.id}</span></td>
                        <td>
                          <Link to={`/students/${s.id}/dashboard`} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>
                            {s.name}
                          </Link>
                        </td>
                        <td>{s.group?.name || '-'}</td>
                        <td><span className="text-muted text-sm">{s.group?.grade || '-'}</span></td>
                        <td>{s.sex}</td>
                        <td>
                          <span className={`badge badge-${s.active ? 'success' : 'danger'}`}>
                            {s.active ? 'نشط' : 'غير نشط'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              className="btn btn-sm btn-icon"
                              title="تقرير المتابعة الشامل لولي الأمر (واتساب / PDF)"
                              style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0284c7', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                              onClick={() => setReportStudentId(s.id)}
                            >
                              <i className="pi pi-file-pdf" />
                            </button>
                            <button className="btn btn-secondary btn-sm btn-icon" title="لوحة الطالب" onClick={() => navigate(`/students/${s.id}/dashboard`)}>
                              <i className="pi pi-chart-bar" />
                            </button>
                            <button className="btn btn-secondary btn-sm btn-icon" title="تعديل" onClick={() => openEdit(s)}>
                              <i className="pi pi-pencil" />
                            </button>
                            <button
                              className={`btn btn-sm btn-icon ${s.active ? 'btn-warning' : 'btn-success'}`}
                              title={s.active ? 'تعطيل' : 'تفعيل'}
                              onClick={() => handleActivate(s)}
                            >
                              <i className={`pi pi-${s.active ? 'ban' : 'check'}`} />
                            </button>
                            <button className="btn btn-danger btn-sm btn-icon" title="حذف" onClick={() => { setEditingStudent(s); setModal('delete') }}>
                              <i className="pi pi-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }

        {totalPages > 1 && (
          <Pagination 
            totalItems={state.total} 
            itemsPerPage={PER_PAGE} 
            currentPage={state.page} 
            onPageChange={page => load(page)} 
          />
        )}
      </div>

      {/* Add/Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{modal === 'add' ? 'إضافة طالب' : 'تعديل طالب'}</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">الاسم الكامل</label>
                  <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">رقم هاتف الطالب</label>
                  <input
                    className="form-control"
                    required
                    value={form.phoneNumber}
                    onChange={e => handlePhoneChange('phoneNumber', e.target.value)}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="01xxxxxxxxx"
                  />
                  {phoneErrors.phoneNumber && (
                    <span className="text-sm" style={{ color: 'var(--danger-color)' }}>{phoneErrors.phoneNumber}</span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">رقم هاتف ولي الأمر</label>
                  <input
                    className="form-control"
                    required
                    value={form.dadPhoneNumber}
                    onChange={e => handlePhoneChange('dadPhoneNumber', e.target.value)}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="01xxxxxxxxx"
                  />
                  {phoneErrors.dadPhoneNumber && (
                    <span className="text-sm" style={{ color: 'var(--danger-color)' }}>{phoneErrors.dadPhoneNumber}</span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">النوع</label>
                  <select className="form-control" value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}>
                    <option value="ذكر">ذكر</option>
                    <option value="أنثي">أنثي</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">المجموعة</label>
                  <select className="form-control" required value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: parseInt(e.target.value) }))}>
                    <option value="">-- اختر المجموعة --</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الخصم / العرض</label>
                  <select className="form-control" required value={form.offerId} onChange={e => setForm(f => ({ ...f, offerId: parseInt(e.target.value) }))}>
                    <option value="">-- اختر --</option>
                    {offers.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.title} ({o.type === 'percentage' ? o.value + '%' : o.type === 'amount' ? o.value + ' ج' : o.value + ' حصص'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  <label htmlFor="active" className="form-label" style={{ margin: 0 }}>طالب نشط</label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> حفظ</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--danger-color)' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل أنت متأكد من حذف الطالب <strong>{editingStudent?.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDelete}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Modal */}
      {modal === 'offer' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">إضافة خصم جديد</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={async e => {
              e.preventDefault()
              try {
                const { createOffer } = await import('../api')
                await createOffer(offerForm)
                const r = await getOffers()
                setOffers(r.data)
                setOfferForm({ title: '', type: 'percentage', value: '' })
                setModal(null)
                setMsg({ type: 'success', text: 'تم إضافة الخصم' })
              } catch { setMsg({ type: 'error', text: 'خطأ' }) }
            }}>
              <div className="form-group">
                <label className="form-label">اسم العرض</label>
                <input className="form-control" required value={offerForm.title} onChange={e => setOfferForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">نوع الخصم</label>
                <select className="form-control" value={offerForm.type} onChange={e => setOfferForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="percentage">نسبة مئوية (%)</option>
                  <option value="amount">مبلغ ثابت لكل حصة (جنيه)</option>
                  <option value="sessions">عدد حصص مجانية</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">قيمة الخصم</label>
                <input className="form-control" type="number" min="0" required value={offerForm.value} onChange={e => setOfferForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> إضافة</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {qrModal && (
        <div className="modal-overlay" onClick={() => setQrModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="pi pi-camera" /> مسح بطاقة الطالب</h3>
              <button className="modal-close" onClick={() => setQrModal(false)}><i className="pi pi-times" /></button>
            </div>
            <div style={{ padding: '1rem 0', display: 'flex', justifyContent: 'center' }}>
              <div id="qr-reader" style={{ width: '100%', maxWidth: '350px' }}></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setQrModal(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Student Report for Parent Modal */}
      {reportStudentId && (
        <StudentReportModal
          studentId={reportStudentId}
          onClose={() => setReportStudentId(null)}
        />
      )}
    </div>
  )
}
