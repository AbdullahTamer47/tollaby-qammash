import { useState } from 'react'

export default function SessionWhatsAppModal({ session, attendance = [], onClose }) {
  const [tab, setTab] = useState('absent') // 'absent' | 'unpaid'
  const [sentMap, setSentMap] = useState({})

  const sessionDateStr = session?.date
    ? new Date(session.date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
    : 'اليوم'

  const sessionPrice = session?.price || 0

  // Absent students
  const absentList = attendance.filter(a => !a.isAttendant)

  // Unpaid or partially paid students who attended
  const unpaidList = attendance.filter(a => {
    if (!a.isAttendant) return false
    const paid = a.amountPaid || 0
    return paid < sessionPrice
  })

  const cleanPhone = (p) => (p || '').replace(/\D/g, '').replace(/^0+/, '')

  const handleOpenWhatsApp = (studentId, phone, text) => {
    const clean = cleanPhone(phone)
    if (!clean) {
      alert('لا يوجد رقم هاتف مسجل لهذا الطالب أو ولي أمره')
      return
    }

    setSentMap(prev => ({ ...prev, [studentId]: true }))
    const url = `https://wa.me/20${clean}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const markAllAsSent = (list) => {
    const updated = { ...sentMap }
    list.forEach(item => { updated[item.student.id] = true })
    setSentMap(updated)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '2px solid #25D366' }}>
          <div>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#15803d' }}>
              <i className="pi pi-whatsapp" style={{ fontSize: '1.4rem' }} /> مركز رسائل الواتساب للحصة
            </h3>
            <p className="text-muted text-sm" style={{ margin: '0.2rem 0 0' }}>
              {session?.title} · {sessionDateStr}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><i className="pi pi-times" /></button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--surface-ground)', borderBottom: '1px solid var(--surface-border)' }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'absent' ? 'btn-danger' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
            onClick={() => setTab('absent')}
          >
            <i className="pi pi-user-minus" /> أولياء أمور الغائبين ({absentList.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'unpaid' ? 'btn-warning' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
            onClick={() => setTab('unpaid')}
          >
            <i className="pi pi-wallet" /> المتأخرين عن دفع الحصة ({unpaidList.length})
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {tab === 'absent' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-color-secondary)' }}>
                  إرسال رسالة تنبيه غياب مخصصة لولي الأمر بضغطة زر
                </span>
                {absentList.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => markAllAsSent(absentList)}
                  >
                    <i className="pi pi-check" /> تحديد الكل كمرسل
                  </button>
                )}
              </div>

              {absentList.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                  <i className="pi pi-check-circle" style={{ fontSize: '2.5rem', color: '#10b981' }} />
                  <p>رائع! لا يوجد أي طلاب غائبين في هذه الحصة 🎉</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {absentList.map(a => {
                    const s = a.student
                    const isSent = Boolean(sentMap[s.id])
                    const dadPhone = s.dadPhoneNumber || s.phoneNumber
                    const messageText = `السلام عليكم ورحمة الله وبركاته،\nنود إحاطتكم علماً بأن الطالب (${s.name}) غاب اليوم عن (${session.title}) المنعقدة بتاريخ (${sessionDateStr}).\nنرجو الاطمئنان والمتابعة حرصاً على مستواه الأكاديمي.\n— منصة الأستاذ محمد القماش`

                    return (
                      <div
                        key={s.id}
                        style={{
                          background: isSent ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-ground)',
                          border: `1px solid ${isSent ? '#10b981' : 'var(--surface-border)'}`,
                          borderRadius: '10px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.name}</span>
                            <span className="badge badge-info text-xs">#{s.id}</span>
                            {isSent && <span className="badge badge-success text-xs">✅ تم فتح المحادثة</span>}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)', marginTop: '0.2rem' }}>
                            هاتف ولي الأمر: <strong>{dadPhone || 'غير مسجل'}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ background: '#25D366', color: '#ffffff', fontWeight: 600 }}
                            onClick={() => handleOpenWhatsApp(s.id, dadPhone, messageText)}
                          >
                            <i className="pi pi-whatsapp" /> إرسال لولي الأمر
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-color-secondary)' }}>
                  الطلاب الحاضرون الذين لم يسددوا ثمن الحصة أو سددوا جزءاً منه
                </span>
                {unpaidList.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => markAllAsSent(unpaidList)}
                  >
                    <i className="pi pi-check" /> تحديد الكل كمرسل
                  </button>
                )}
              </div>

              {unpaidList.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                  <i className="pi pi-check-circle" style={{ fontSize: '2.5rem', color: '#10b981' }} />
                  <p>ممتاز! جميع الطلاب الحاضرين مسددون لثمن الحصة بالكامل 👏</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {unpaidList.map(a => {
                    const s = a.student
                    const isSent = Boolean(sentMap[s.id])
                    const dadPhone = s.dadPhoneNumber || s.phoneNumber
                    const paid = a.amountPaid || 0
                    const remaining = Math.max(0, sessionPrice - paid)
                    const messageText = `السلام عليكم ورحمة الله وبركاته،\nنود تذكيركم بأن الطالب (${s.name}) حضر اليوم (${session.title}) ومتبقي عليه مستحق للحصة بمبلغ (${remaining}) جنيه.\nيرجى التكرم بالسداد في الحصة القادمة.\n— منصة الأستاذ محمد القماش`

                    return (
                      <div
                        key={s.id}
                        style={{
                          background: isSent ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-ground)',
                          border: `1px solid ${isSent ? '#10b981' : 'var(--surface-border)'}`,
                          borderRadius: '10px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.name}</span>
                            <span className="badge badge-info text-xs">#{s.id}</span>
                            <span className="badge badge-danger text-xs">متبقي: {remaining} ج</span>
                            {isSent && <span className="badge badge-success text-xs">✅ تم فتح المحادثة</span>}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)', marginTop: '0.2rem' }}>
                            المسدد: {paid} ج من {sessionPrice} ج | هاتف ولي الأمر: <strong>{dadPhone || 'غير مسجل'}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ background: '#25D366', color: '#ffffff', fontWeight: 600 }}
                            onClick={() => handleOpenWhatsApp(s.id, dadPhone, messageText)}
                          >
                            <i className="pi pi-whatsapp" /> إرسال تذكير بالسداد
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)' }}>
            يتم فتح تطبيق الواتساب أو واتساب ويب مباشرة مع رسالة جاهزة لكل ولي أمر
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  )
}
