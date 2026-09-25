import { useEffect, useState } from 'react'
import { getBooks, createBook, deleteBook, getBookings, toggleBooking, toggleDelivery, getGroups } from '../api'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

const GRADES = [
  'الصف السادس الابتدائي','الصف الأول الاعدادي','الصف الثاني الاعدادي','الصف الثالث الاعدادي',
  'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي','بدون صف محدد'
]

export default function BooksPage() {
  const [tab, setTab] = useState('books') // 'books' or 'bookings'
  const [books, setBooks] = useState([])
  const [groups, setGroups] = useState([])
  const [bookings, setBookings] = useState({ data: [], total: 0, page: 1 })
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ title: '', grade: GRADES[0], price: '' })
  
  const [searchQ, setSearchQ] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')

  const PER_PAGE = 10;

  const loadBooks = () => { setLoading(true); getBooks().then(r => setBooks(r.data)).finally(() => setLoading(false)) }
  
  const loadBookings = (page = 1) => {
    setLoading(true)
    const params = { page, per_page: PER_PAGE, q: searchQ }
    if (filterGroupId) params.groupId = filterGroupId

    getBookings(params)
      .then(r => setBookings({ data: r.data.bookings, total: r.data.total, page }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { tab === 'books' ? loadBooks() : loadBookings() }, [tab, searchQ, filterGroupId])

  useEffect(() => {
    getGroups().then(r => setGroups(r.data))
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
      setMsg({ type: 'success', text: 'تم إضافة الكتاب' })
      setModal(null); loadBooks()
    } catch { setMsg({ type: 'error', text: 'فشل الإضافة' }) }
  }

  const handleDeleteBook = async () => {
    try { await deleteBook(editing.id); setMsg({ type: 'success', text: 'تم الحذف' }); setModal(null); loadBooks() }
    catch { setMsg({ type: 'error', text: 'فشل الحذف' }) }
  }

  const handleToggleBooking = async (studentId, bookId) => {
    try { await toggleBooking({ studentId, bookId }); loadBookings(bookings.page) }
    catch { setMsg({ type: 'error', text: 'خطأ' }) }
  }

  const handleToggleDelivery = async (studentId, bookId) => {
    try { await toggleDelivery({ studentId, bookId }); loadBookings(bookings.page) }
    catch { setMsg({ type: 'error', text: 'خطأ في تحديث حالة التسليم' }) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">الكتب والحجوزات</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface-ground)', padding: '0.3rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--surface-border)' }}>
            <button className={`btn ${tab === 'books' ? 'btn-primary' : ''}`} style={{ background: tab !== 'books' ? 'transparent' : '', border: 'none', color: tab !== 'books' ? 'var(--text-color)' : '' }} onClick={() => setTab('books')}><i className="pi pi-book" /> الكتب المتاحة</button>
            <button className={`btn ${tab === 'bookings' ? 'btn-primary' : ''}`} style={{ background: tab !== 'bookings' ? 'transparent' : '', border: 'none', color: tab !== 'bookings' ? 'var(--text-color)' : '' }} onClick={() => { setTab('bookings'); setSearchQ('') }}><i className="pi pi-users" /> حجوزات الطلاب</button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {tab === 'books' ? (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">الكتب</h2>
            <button className="btn btn-primary" onClick={() => { setForm({ title: '', grade: GRADES[0], price: '' }); setModal('add_book') }}><i className="pi pi-plus" /> إضافة كتاب</button>
          </div>
          {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
            : books.length === 0 ? <div className="empty-state"><i className="pi pi-book" /><p>لا توجد كتب مسجلة</p></div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {books.map(b => (
                  <div key={b.id} style={{ background: 'var(--surface-ground)', border: '1px solid var(--surface-border)', borderRadius: 'var(--border-radius)', padding: '1rem', position: 'relative' }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.25rem' }}>{b.title}</div>
                    <div className="text-muted text-sm" style={{ marginBottom: '0.5rem' }}>{b.grade} - السعر: <span className="badge badge-success">{b.price} ج.م</span></div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                      <span title="إجمالي الحاجزين">الحاجزين: <span className="badge badge-info">{b.bookingsCount || 0}</span></span>
                      <span title="تم التسليم">المستلمين: <span className="badge badge-success">{b.deliveredCount || 0}</span></span>
                      <span title="لسه مستلمش">لسه مستلمش: <span className="badge badge-warning">{b.notDeliveredCount || 0}</span></span>
                    </div>
                    <button className="btn btn-danger btn-sm btn-icon" style={{ position: 'absolute', left: '1rem', top: '1rem' }} onClick={() => { setEditing(b); setModal('delete_book') }}><i className="pi pi-trash" /></button>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">حجوزات الطلاب</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input className="form-control" style={{ width: '220px' }} placeholder="بحث برقم أو اسم الطالب..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <select className="form-control" style={{ width: '200px' }} value={filterGroupId} onChange={e => setFilterGroupId(e.target.value)}>
                <option value="">-- جميع المجموعات --</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
              </select>
            </div>
          </div>
          {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
            : bookings.data.length === 0 ? <div className="empty-state"><i className="pi pi-users" /><p>لا يوجد طلاب</p></div>
            : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>المجموعة / الصف</th>
                      <th>الكتب المتاحة للصف</th>
                      <th>تسليم الكتب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.data.map(item => (
                      <tr key={item.student.id}>
                        <td>
                          <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>{item.student.id}</span>
                          <span style={{ fontWeight: 600 }}>{item.student.name}</span>
                        </td>
                        <td>{item.student.group?.name} <span className="text-muted text-sm">({item.student.group?.grade})</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {item.availableBooks.length === 0 ? <span className="text-muted text-sm">لا يوجد كتب</span> : null}
                            {item.availableBooks.map(b => {
                              const booked = item.studentBookIds.includes(b.id)
                              return (
                                <button key={b.id} className={`btn btn-sm ${booked ? 'btn-success' : 'btn-secondary'}`} onClick={() => handleToggleBooking(item.student.id, b.id)}>
                                  <i className={`pi pi-${booked ? 'check' : 'times'}`} /> {b.title} ({b.price} ج.م)
                                </button>
                              )
                            })}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {item.studentBookIds.length === 0
                              ? <span className="text-muted text-sm">لا يوجد كتب محجوزة</span>
                              : item.availableBooks.filter(b => item.studentBookIds.includes(b.id)).map(b => {
                                  const delivered = item.deliveredBookIds.includes(b.id)
                                  return (
                                    <button
                                      key={b.id}
                                      className={`btn btn-sm ${delivered ? 'btn-success' : 'btn-secondary'}`}
                                      title={delivered ? 'تم التسليم — اضغط للتراجع' : 'اضغط لتسليم الكتاب'}
                                      onClick={() => handleToggleDelivery(item.student.id, b.id)}
                                    >
                                      <i className={`pi pi-${delivered ? 'check-circle' : 'send'}`} /> {b.title}
                                    </button>
                                  )
                                })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          <Pagination 
            totalItems={bookings.total} 
            itemsPerPage={PER_PAGE} 
            currentPage={bookings.page} 
            onPageChange={page => loadBookings(page)} 
          />
        </div>
      )}

      {/* Add Book Modal */}
      {modal === 'add_book' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">إضافة كتاب</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSaveBook}>
              <div className="form-group">
                <label className="form-label">عنوان الكتاب</label>
                <input className="form-control" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">الصف الدراسي المرتبط</label>
                <select className="form-control" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">السعر</label>
                <input className="form-control" type="number" step="0.5" min="0" required value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> إضافة</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Book Modal */}
      {modal === 'delete_book' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#dc3545' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل تريد حذف كتاب <strong>{editing?.title}</strong>؟ سيتم إلغاء حجوزات الطلاب له.</p>
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
