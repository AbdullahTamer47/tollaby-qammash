import React, { useState, useEffect, useMemo } from 'react'
import { getArchivedMessages, getStudentArchivedMessages, deleteAllArchivedMessages, deleteArchivedMessage } from '../api'
import Pagination from '../components/Pagination'

export default function ArchivePage() {
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [error, setError] = useState(null)
  
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentMessages, setStudentMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  
  const [currentPage, setCurrentPage] = useState(1);
  
  const PER_PAGE = 10;

  useEffect(() => { load() }, [])

  // Reset page on search
  useEffect(() => {
    setCurrentPage(1)
  }, [q])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getArchivedMessages()
      setArchived(data)
    } catch (err) {
      setError(err.message || 'فشل تحميل الأرشيف')
    } finally {
      setLoading(false)
    }
  }

  const handleStudentClick = async (studentId, studentName) => {
    setSelectedStudent(studentName)
    setLoadingMessages(true)
    try {
      const msgs = await getStudentArchivedMessages(studentId)
      setStudentMessages(msgs)
    } catch (err) {
      setStudentMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  const filtered = useMemo(() => {
    return archived.filter(a => 
      a.studentName?.toLowerCase().includes(q.toLowerCase()) || 
      a.phoneNumber?.includes(q)
    )
  }, [archived, q])

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, currentPage]);

  const handleDeleteAll = async () => {
    if (!confirm('هل أنت متأكد من حذف جميع الرسائل المؤرشفة؟')) return;
    try {
      await deleteAllArchivedMessages();
      load();
    } catch (err) {
      setError(err.message || 'فشل حذف الأرشيف');
    }
  }

  const handleDeleteMessage = async (msgId, studentId, studentName) => {
    if (!confirm('هل تريد حذف هذه الرسالة؟')) return;
    try {
      await deleteArchivedMessage(msgId);
      // Reload the student's messages
      handleStudentClick(studentId, studentName);
      // Also reload the main list to update counts
      load();
    } catch (err) {
      alert('فشل الحذف');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><i className="pi pi-inbox" /> أرشيف الرسائل</h1>
          <p className="page-subtitle">الرسائل المعلقة لعدم وجود محادثة نشطة (سيتم إرسالها فور تواصل ولي الأمر)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={load}>
            <i className="pi pi-refresh" /> تحديث
          </button>
          <button className="btn btn-danger" onClick={handleDeleteAll}>
            <i className="pi pi-trash" /> حذف جميع الرسائل
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, margin: 0, minWidth: '250px' }}>
            <div className="p-input-icon-left" style={{ width: '100%', position: 'relative' }}>
              <i className="pi pi-search" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-color-secondary)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="بحث بالاسم أو رقم الهاتف..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ margin: '1rem' }}>
            <i className="pi pi-exclamation-triangle" /> {error}
          </div>
        )}

        {loading ? (
          <div className="spinner-wrapper"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="pi pi-inbox" />
            <p>{q ? 'لا توجد نتائج مطابقة للبحث' : 'الأرشيف فارغ، لا توجد رسائل معلقة.'}</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>اسم الطالب</th>
                    <th>رقم ولي الأمر</th>
                    <th>عدد الرسائل المؤرشفة</th>
                    <th>تاريخ آخر تواصل من ولي الأمر</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(row => (
                    <tr key={row.studentId || row.phoneNumber}>
                      <td style={{ fontWeight: 600 }}>{row.studentName || 'غير مسجل'}</td>
                      <td dir="ltr" style={{ textAlign: 'right' }}>{row.phoneNumber}</td>
                      <td><span className="badge badge-warning">{row.archivedCount}</span></td>
                      <td>
                        {row.lastContactAt 
                          ? new Date(row.lastContactAt).toLocaleString('ar-EG') 
                          : <span className="text-muted">لم يتواصل أبدًا</span>}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleStudentClick(row.studentId, row.studentName)}>
                          <i className="pi pi-eye" /> عرض الرسائل
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              totalItems={filtered.length}
              itemsPerPage={PER_PAGE}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {selectedStudent && (
        <div className="modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="modal" style={{ maxWidth: '600px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">الرسائل المؤرشفة: {selectedStudent}</h3>
              <button className="modal-close" onClick={() => setSelectedStudent(null)}><i className="pi pi-times" /></button>
            </div>
            
            <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '0.5rem' }}>
              {loadingMessages ? (
                <div className="spinner-wrapper"><div className="spinner" /></div>
              ) : studentMessages.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-color-secondary)' }}>لا توجد رسائل.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {studentMessages.map(msg => (
                    <div key={msg.id} style={{
                      background: 'var(--surface-hover)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--surface-border)'
                    }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{new Date(msg.createdAt).toLocaleString('ar-EG')}</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <span className="badge badge-warning">مؤرشف</span>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMessage(msg.id, msg.studentId, selectedStudent)}>
                            <i className="pi pi-trash" />
                          </button>
                        </div>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedStudent(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
