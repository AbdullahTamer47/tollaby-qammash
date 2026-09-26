import { useEffect, useState } from 'react'
import { getBooks, createBook, deleteBook, getBookings, toggleBooking, toggleDelivery, getGroups } from '../api'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

const GRADES = [
  'الصف السادس الابتدائي','الصف الأول الاعدادي','الصف الثاني الاعدادي','الصف الثالث الاعدادي',
  'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي','بدون صف محدد'
]

export default function BooksPage() {
  const [tab, setTab] = useState('bookings') // Default to 'bookings' for faster daily workflow
  const [books, setBooks] = useState([])
  const [groups, setGroups] = useState([])
  const [bookings, setBookings] = useState({ data: [], total: 0, page: 1 })
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ title: '', grade: GRADES[4], price: '' })
  
  const [searchQ, setSearchQ] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState('all') // 'all' | 'pending' | 'delivered'

  const PER_PAGE = 10;

  const loadBooks = () => {
    setLoading(true)
    getBooks().then(r => setBooks(r.data)).finally(() => setLoading(false))
  }
  
  const loadBookings = (page = 1) => {
    setLoading(true)
    const params = { page, per_page: PER_PAGE, q: searchQ }
    if (filterGroupId) params.groupId = filterGroupId

    getBookings(params)
      .then(r => setBookings({ data: r.data.bookings, total: r.data.total, page }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === 'books') loadBooks()
    else loadBookings()
  }, [tab, searchQ, filterGroupId])

  useEffect(() => {
    getGroups().then(r => setGroups(r.data))
    getBooks().then(r => setBooks(r.data))
  }, [])

  const handleExportCSV = () => {
    if (tab === 'books') {
      const columns = [
        { header: 'الرقم', key: 'id' },
        { header: 'العنوان', key: 'title' },
        { header: 'الصف الدراسي', key: 'grade' },
        { header: 'السعر', key: 'price' }
      ]
      exportToCSV(books, columns, 'books_list')
    } else {
      getBookings({ q: searchQ, groupId: filterGroupId, per_page: 10000 }).then(r => {
        const columns = [
          { header: 'رقم الطالب', key: 'student.id' },
          { header: 'الاسم', key: 'student.name' },
          { header: 'المجموعة', key: 'student.group.name' },
          { header: 'الكتب المحجوزة', render: b => b.availableBooks.filter(ab => b.studentBookIds.includes(ab.id)).map(ab => ab.title).join(', ') },
          { header: 'الكتب غير المحجوزة', render: b => b.availableBooks.filter(ab => !b.studentBookIds.includes(ab.id)).map(ab => ab.title).join(', ') }
        ]
        exportToCSV(r.data.bookings, columns, 'books_bookings')
      })
    }
  }

  const handleSaveBook = async (e) => {
    e.preventDefault()
    try {
      await createBook(form)
      setMsg({ type: 'success', text: 'تمت إضافة الكتاب بنجاح' })
      setModal(null)
      loadBooks()
    } catch {
      setMsg({ type: 'error', text: 'فشل إضافة الكتاب' })
    }
  }

  const handleDeleteBook = async () => {
    try {
      await deleteBook(editing.id)
      setMsg({ type: 'success', text: 'تم حذف الكتاب' })
      setModal(null)
      loadBooks()
    } catch {
      setMsg({ type: 'error', text: 'فشل الحذف' })
    }
  }

  const handleToggleBooking = async (studentId, bookId) => {
    try {
      await toggleBooking({ studentId, bookId })
      loadBookings(bookings.page)
    } catch {
      setMsg({ type: 'error', text: 'فشل تعديل حالة الحجز' })
    }
  }

  const handleToggleDelivery = async (studentId, bookId) => {
    try {
      await toggleDelivery({ studentId, bookId })
      loadBookings(bookings.page)
    } catch {
      setMsg({ type: 'error', text: 'خطأ في تحديث حالة التسليم' })
    }
  }

  const cleanPhone = (p) => (p || '').replace(/\D/g, '').replace(/^0+/, '')

  const sendWhatsAppDeliveryNotice = (item) => {
    const dadPhone = item.student?.dadPhoneNumber || item.student?.phoneNumber
    const clean = cleanPhone(dadPhone)
    if (!clean) {
      alert('لا يوجد رقم مسجل لولي الأمر أو الطالب')
      return
    }

    const bookedTitles = item.availableBooks
      .filter(b => item.studentBookIds.includes(b.id))
      .map(b => b.title)
      .join(' و ')

    const text = `السلام عليكم ورحمة الله،\nنود إحاطتكم علماً بأن مذكرات الطالب (${item.student?.name}) [${bookedTitles}] جاهزة للتسليم بالسنتر.\n— منصة الأستاذ محمد القماش`
    window.open(`https://wa.me/20${clean}?text=${encodeURIComponent(text)}`, '_blank')
  }

  // Filter bookings by delivery status
  const displayedBookings = bookings.data.filter(item => {
    const hasBookings = item.studentBookIds.length > 0
    const allDelivered = hasBookings && item.studentBookIds.every(id => item.deliveredBookIds.includes(id))
    const hasUndelivered = hasBookings && item.studentBookIds.some(id => !item.deliveredBookIds.includes(id))

    if (deliveryFilter === 'pending') return hasUndelivered
    if (deliveryFilter === 'delivered') return allDelivered
    return true
  })

  // Aggregate stats across books
  const totalBookingsCount = books.reduce((acc, b) => acc + (b.bookingsCount || 0), 0)
  const totalDeliveredCount = books.reduce((acc, b) => acc + (b.deliveredCount || 0), 0)
  const totalPendingDelivery = Math.max(0, totalBookingsCount - totalDeliveredCount)

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">الكتب والمذكرات والحجوزات</h1>
          <p className="page-subtitle">إدارة المذكرات المدرسية وحجوزات الطلاب ومتابعة التسليم</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
          <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--surface-ground)', padding: '0.25rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--surface-border)' }}>
            <button
              className={`btn btn-sm ${tab === 'bookings' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setTab('bookings'); setSearchQ('') }}
            >
              <i className="pi pi-users" /> تسليم وحجوزات الطلاب
            </button>
            <button
              className={`btn btn-sm ${tab === 'books' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab('books')}
            >
              <i className="pi pi-book" /> قائمة الكتب والمذكرات
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-book" /></div>
          <div>
            <div className="stat-value">{books.length}</div>
            <div className="stat-label">أنواع المذكرات</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple"><i className="pi pi-bookmark" /></div>
          <div>
            <div className="stat-value">{totalBookingsCount}</div>
            <div className="stat-label">إجمالي الحجوزات</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-check-circle" /></div>
          <div>
            <div className="stat-value" style={{ color: '#10b981' }}>{totalDeliveredCount}</div>
            <div className="stat-label">تم تسليمها للطلاب</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange"><i className="pi pi-box" /></div>
          <div>
            <div className="stat-value" style={{ color: '#f59e0b' }}>{totalPendingDelivery}</div>
            <div className="stat-label">متبقي للتسليم 📦</div>
          </div>
        </div>
      </div>

      {tab === 'books' ? (
        /* Books List View */
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <h2 className="card-title"><i className="pi pi-book" /> قائمة المذكرات والكتب المتاحة</h2>
            <button className="btn btn-primary" onClick={() => { setForm({ title: '', grade: GRADES[4], price: '' }); setModal('add_book') }}>
              <i className="pi pi-plus" /> إضافة مذكرة جديدة
            </button>
          </div>

          {loading ? (
            <div className="spinner-wrapper"><div className="spinner" /></div>
          ) : books.length === 0 ? (
            <div className="empty-state"><i className="pi pi-book" /><p>لا توجد كتب أو مذكرات مسجلة</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
              {books.map(b => (
                <div key={b.id} style={{ background: 'var(--surface-ground)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '1.25rem', position: 'relative' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary-color)', marginBottom: '0.35rem' }}>{b.title}</div>
                  <div className="text-muted text-sm" style={{ marginBottom: '0.75rem' }}>
                    {b.grade} · السعر: <span className="badge badge-success" style={{ fontWeight: 700 }}>{b.price} ج.م</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem', textAlign: 'center', background: 'var(--surface-card)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-color-secondary)' }}>حاجزين</div>
                      <div style={{ fontWeight: 800, color: 'var(--primary-color)' }}>{b.bookingsCount || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-color-secondary)' }}>استلموا</div>
                      <div style={{ fontWeight: 800, color: '#10b981' }}>{b.deliveredCount || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-color-secondary)' }}>متبقي</div>
                      <div style={{ fontWeight: 800, color: '#f59e0b' }}>{b.notDeliveredCount || 0}</div>
                    </div>
                  </div>

                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    style={{ position: 'absolute', left: '1rem', top: '1rem' }}
                    title="حذف المذكرة"
                    onClick={() => { setEditing(b); setModal('delete_book') }}
                  >
                    <i className="pi pi-trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Student Bookings & Handout View */
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 className="card-title" style={{ margin: 0 }}><i className="pi pi-users" /> حجوزات وتسليم المذكرات</h2>
              
              {/* Delivery Filter Tabs */}
              <div style={{ display: 'flex', background: 'var(--surface-ground)', borderRadius: '8px', padding: '0.2rem', border: '1px solid var(--surface-border)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${deliveryFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}
                  onClick={() => setDeliveryFilter('all')}
                >
                  الكل
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${deliveryFilter === 'pending' ? 'btn-warning' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem', fontWeight: deliveryFilter === 'pending' ? 'bold' : 'normal' }}
                  onClick={() => setDeliveryFilter('pending')}
                >
                  📦 حجزوا ولم يستلموا بعد
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${deliveryFilter === 'delivered' ? 'btn-success' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}
                  onClick={() => setDeliveryFilter('delivered')}
                >
                  ✅ استلموا بالكامل
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                className="form-control"
                style={{ width: '220px' }}
                placeholder="بحث برقم أو اسم الطالب..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
              <select
                className="form-control"
                style={{ width: '200px' }}
                value={filterGroupId}
                onChange={e => setFilterGroupId(e.target.value)}
              >
                <option value="">-- جميع المجموعات --</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="spinner-wrapper"><div className="spinner" /></div>
          ) : displayedBookings.length === 0 ? (
            <div className="empty-state">
              <i className="pi pi-check-circle" style={{ fontSize: '2.5rem', color: '#10b981' }} />
              <p>لا يوجد طلاب مطابقين للتصفية الحالية</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>المجموعة / الصف</th>
                    <th>حجز الكتب المتاحة</th>
                    <th>حالة التسليم الفعلي</th>
                    <th>إجراءات التواصل</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedBookings.map(item => {
                    const hasBookings = item.studentBookIds.length > 0

                    return (
                      <tr key={item.student.id}>
                        <td>
                          <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>#{item.student.id}</span>
                          <span style={{ fontWeight: 700 }}>{item.student.name}</span>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>{item.student.group?.name || '-'}</div>
                          <span className="text-muted text-sm">{item.student.group?.grade || '-'}</span>
                        </td>

                        {/* Booking toggles */}
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {item.availableBooks.length === 0 && <span className="text-muted text-sm">لا توجد مذكرات لهذا الصف</span>}
                            {item.availableBooks.map(b => {
                              const booked = item.studentBookIds.includes(b.id)
                              return (
                                <button
                                  key={b.id}
                                  className={`btn btn-sm ${booked ? 'btn-primary' : 'btn-secondary'}`}
                                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
                                  title={booked ? 'محجوز — اضغط لإلغاء الحجز' : 'اضغط لحجز هذه المذكرة للطالب'}
                                  onClick={() => handleToggleBooking(item.student.id, b.id)}
                                >
                                  <i className={`pi pi-${booked ? 'bookmark-fill' : 'bookmark'}`} /> {b.title} ({b.price} ج)
                                </button>
                              )
                            })}
                          </div>
                        </td>

                        {/* Delivery Handout */}
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {!hasBookings ? (
                              <span className="text-muted text-sm">لم يحجز أي مذكرة</span>
                            ) : (
                              item.availableBooks.filter(b => item.studentBookIds.includes(b.id)).map(b => {
                                const delivered = item.deliveredBookIds.includes(b.id)
                                return (
                                  <button
                                    key={b.id}
                                    className={`btn btn-sm ${delivered ? 'btn-success' : 'btn-warning'}`}
                                    style={{ fontWeight: 700, fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                                    title={delivered ? 'تم التسليم بالفعل — اضغط للتراجع إذا لزم' : 'اضغط لتأكيد تسليم المذكرة للطالب باليد'}
                                    onClick={() => handleToggleDelivery(item.student.id, b.id)}
                                  >
                                    <i className={`pi pi-${delivered ? 'check-circle' : 'box'}`} /> {b.title} {delivered ? '(مستلم ✅)' : '(تسليم 📦)'}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        </td>

                        {/* WhatsApp Notice */}
                        <td>
                          {hasBookings && (
                            <button
                              type="button"
                              className="btn btn-sm btn-icon"
                              title="إرسال إشعار جاهزية المذكرة لولي الأمر عبر واتساب"
                              style={{ background: '#25D366', color: '#ffffff', border: '1px solid #1ebe5d' }}
                              onClick={() => sendWhatsAppDeliveryNotice(item)}
                            >
                              <i className="pi pi-whatsapp" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {bookings.total > PER_PAGE && (
            <Pagination 
              totalItems={bookings.total} 
              itemsPerPage={PER_PAGE} 
              currentPage={bookings.page} 
              onPageChange={page => loadBookings(page)} 
            />
          )}
        </div>
      )}

      {/* Modal: Add Book */}
      {modal === 'add_book' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="pi pi-plus" /> إضافة مذكرة / كتاب جديد</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSaveBook}>
              <div className="form-group">
                <label className="form-label">عنوان المذكرة / الكتاب</label>
                <input
                  className="form-control"
                  required
                  placeholder="مثال: مذكرة ليلة الامتحان - الباب الأول"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">الصف الدراسي المرتبط</label>
                <select
                  className="form-control"
                  value={form.grade}
                  onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                >
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">سعر المذكرة (جنيه)</label>
                <input
                  className="form-control"
                  type="number"
                  step="1"
                  min="0"
                  required
                  placeholder="مثال: 50"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> حفظ المذكرة</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Book */}
      {modal === 'delete_book' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--danger-color)' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل أنت متأكد من حذف مذكرة <strong>{editing?.title}</strong>؟</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDeleteBook}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
