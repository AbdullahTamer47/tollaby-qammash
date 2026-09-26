import { useState, useEffect } from 'react'
import { getStudentDashboard } from '../api'

export default function StudentReportModal({ studentId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!studentId) return
    setLoading(true)
    getStudentDashboard(studentId)
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId])

  if (!studentId) return null

  const { student, allAttendance, totalGroupSessions, totalAttended, attendancePercentage, payment, examResults } = data || {}

  // Format Egyptian WhatsApp phone
  const cleanPhone = (phone) => {
    if (!phone) return ''
    let p = String(phone).replace(/\D/g, '')
    if (p.startsWith('0')) p = '2' + p
    else if (!p.startsWith('20')) p = '20' + p
    return p
  }

  const parentPhone = student?.dadPhoneNumber || student?.phoneNumber
  const waTarget = cleanPhone(parentPhone)

  // Generate WhatsApp formatted message
  const generateWhatsAppMessage = () => {
    if (!data) return ''
    const remaining = (payment?.amountDue || 0) - (payment?.amountPaid || 0)
    const attPct = totalGroupSessions > 0 ? ((totalAttended / totalGroupSessions) * 100).toFixed(0) : 100

    let msg = `السلام عليكم ورحمة الله وبركاته،\n`
    msg += `ولي أمر الطالب/ـة: *${student?.name}* (كود: #${student?.id})\n`
    msg += `تحية طيبة من *منصة الأستاذ محمد القماش* 🎓\n\n`
    msg += `📊 *تقرير المتابعة الأكاديمية والحضور:*\n`
    msg += `---------------------------------\n`
    msg += `🏫 *المجموعة:* ${student?.group?.name || '-'}\n`
    msg += `📅 *نسبة الحضور:* ${attPct}% (حضر ${totalAttended} من أصل ${totalGroupSessions} حصة)\n`

    if (examResults && examResults.length > 0) {
      msg += `\n📝 *أحدث نتائج الامتحانات:*\n`
      examResults.slice(0, 3).forEach(ex => {
        const deg = ex.studentDegree !== null ? ex.studentDegree : 'غائب'
        const total = ex.exam?.totalDegree || 50
        msg += ` • ${ex.exam?.title}: *${deg} / ${total}*\n`
      })
    }

    msg += `\n💰 *الموقف المالي:* `
    if (remaining <= 0) {
      msg += `خالص تماماً (لا توجد متأخرات) ✅\n`
    } else {
      msg += `متبقي مستحق: *${remaining.toLocaleString()} ج.م* ⚠️\n`
    }

    msg += `\nشاكرين حرصكم ومتابعتكم الدائمة لتفوق الطالب.\n`
    msg += `*الأستاذ محمد القماش* — هاتف المنصة: 01000000000`
    return msg
  }

  const handleShareWhatsApp = () => {
    const text = generateWhatsAppMessage()
    const url = `https://wa.me/${waTarget}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const handlePrint = () => {
    window.print()
  }

  const remainingBalance = (payment?.amountDue || 0) - (payment?.amountPaid || 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal student-report-modal"
        style={{ maxWidth: '680px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header (No-Print) */}
        <div className="modal-header no-print" style={{ justifyContent: 'space-between' }}>
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="pi pi-file-pdf" style={{ color: 'var(--primary-color)' }} />
            تقرير المتابعة الشامل لولي الأمر
          </h3>
          <button className="modal-close" onClick={onClose}><i className="pi pi-times" /></button>
        </div>

        {loading ? (
          <div className="spinner-wrapper" style={{ minHeight: '200px' }}><div className="spinner" /></div>
        ) : !data ? (
          <div className="empty-state"><p>تعذر تحميل بيانات التقرير</p></div>
        ) : (
          <div>
            {/* Printable Report Sheet */}
            <div id="student-parent-report-sheet" style={{ background: '#ffffff', color: '#0f172a', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <style>{`
                @media print {
                  body * { visibility: hidden !important; }
                  #student-parent-report-sheet, #student-parent-report-sheet * { visibility: visible !important; }
                  #student-parent-report-sheet {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    padding: 20px !important;
                    box-shadow: none !important;
                    border: none !important;
                  }
                  .no-print { display: none !important; }
                }
              `}</style>

              {/* Report Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1e3a8a', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e3a8a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <i className="pi pi-graduation-cap" style={{ color: '#fbbf24' }} />
                    منصة الأستاذ محمد القماش
                  </h2>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>
                    تقرير المتابعة الدورية للأداء والغياب
                  </div>
                </div>
                <div style={{ textAlign: 'left', fontSize: '0.78rem', color: '#64748b' }}>
                  <div>تاريخ التقرير:</div>
                  <strong style={{ color: '#0f172a' }}>{new Date().toLocaleDateString('ar-EG')}</strong>
                </div>
              </div>

              {/* Student Info Box */}
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', fontSize: '0.88rem' }}>
                  <div><span style={{ color: '#64748b' }}>اسم الطالب: </span><strong>{student?.name}</strong></div>
                  <div><span style={{ color: '#64748b' }}>كود الطالب: </span><strong style={{ color: '#2563eb' }}>#{student?.id}</strong></div>
                  <div><span style={{ color: '#64748b' }}>المجموعة: </span><strong>{student?.group?.name || '-'}</strong></div>
                  <div><span style={{ color: '#64748b' }}>الصف: </span><strong>{student?.group?.grade || '-'}</strong></div>
                  <div><span style={{ color: '#64748b' }}>هاتف ولي الأمر: </span><strong style={{ direction: 'ltr', display: 'inline-block' }}>{student?.dadPhoneNumber || '-'}</strong></div>
                  <div><span style={{ color: '#64748b' }}>حالة القيد: </span><strong style={{ color: student?.active ? '#10b981' : '#ef4444' }}>{student?.active ? 'نشط' : 'غير نشط'}</strong></div>
                </div>
              </div>

              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>نسبة الحضور والالتزام</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
                    {totalGroupSessions > 0 ? ((totalAttended / totalGroupSessions) * 100).toFixed(0) : 100}%
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#166534' }}>حضر {totalAttended} من {totalGroupSessions} حصة</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 600 }}>الامتحانات المنجزة</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>
                    {examResults?.length || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#1e40af' }}>امتحان مسجل</div>
                </div>

                <div style={{ background: remainingBalance <= 0 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${remainingBalance <= 0 ? '#bbf7d0' : '#fde68a'}`, borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: remainingBalance <= 0 ? '#166534' : '#b45309', fontWeight: 600 }}>الموقف المالي</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: remainingBalance <= 0 ? '#15803d' : '#d97706', marginTop: '0.2rem' }}>
                    {remainingBalance <= 0 ? 'خالص ✅' : `${remainingBalance.toLocaleString()} ج`}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: remainingBalance <= 0 ? '#166534' : '#b45309' }}>
                    {remainingBalance <= 0 ? 'لا توجد متأخرات' : 'متبقي مستحق'}
                  </div>
                </div>
              </div>

              {/* Recent Exams Section */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.35rem', marginBottom: '0.5rem' }}>
                  <i className="pi pi-pencil" style={{ marginLeft: '0.35rem' }} /> درجات الامتحانات الأخيرة
                </h4>
                {examResults?.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>لا توجد امتحانات مسجلة لهذا الطالب حتى الآن.</div>
                ) : (
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '0.4rem 0.5rem' }}>الامتحان</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>درجة الطالب</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>الدرجة العظمى</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examResults.map((ex, i) => {
                        const passed = ex.studentDegree !== null && ex.studentDegree >= (ex.exam?.minPassDegree || 0)
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{ex.exam?.title}</td>
                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700 }}>{ex.studentDegree !== null ? ex.studentDegree : 'غائب'}</td>
                            <td style={{ padding: '0.4rem 0.5rem', color: '#64748b' }}>{ex.exam?.totalDegree}</td>
                            <td style={{ padding: '0.4rem 0.5rem' }}>
                              <span style={{
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: passed ? '#dcfce7' : '#fee2e2',
                                color: passed ? '#15803d' : '#b91c1c'
                              }}>
                                {ex.studentDegree === null ? 'غائب' : passed ? 'ناجح' : 'راسب'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Recent Attendance Section */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.35rem', marginBottom: '0.5rem' }}>
                  <i className="pi pi-calendar" style={{ marginLeft: '0.35rem' }} /> سجل الحصص الأخيرة
                </h4>
                {allAttendance?.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>لا توجد حصص مسجلة بعد.</div>
                ) : (
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '0.4rem 0.5rem' }}>الحصة</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>التاريخ</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>حالة الحضور</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAttendance.slice(0, 5).map((att, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{att.session?.title}</td>
                          <td style={{ padding: '0.4rem 0.5rem', color: '#64748b' }}>
                            {new Date(att.session?.date).toLocaleDateString('ar-EG')}
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem' }}>
                            <span style={{
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: att.isAttendant ? '#dcfce7' : '#fee2e2',
                              color: att.isAttendant ? '#15803d' : '#b91c1c'
                            }}>
                              {att.isAttendant ? 'حاضر ✅' : 'غائب ❌'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Signature / Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.78rem', color: '#64748b' }}>
                <span>مع تمنياتنا بالتفوق والنجاح الدائم.</span>
                <strong style={{ color: '#1e3a8a' }}>توقيع الإدارة: الأستاذ محمد القماش</strong>
              </div>
            </div>

            {/* Action Buttons (No-Print) */}
            <div className="no-print" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleShareWhatsApp}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}
              >
                <i className="pi pi-whatsapp" style={{ fontSize: '1.1rem' }} />
                <span>إرسال واتساب لولي الأمر ({parentPhone || 'غير مسجل'})</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrint}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}
              >
                <i className="pi pi-print" />
                <span>طباعة التقرير / PDF</span>
              </button>

              <button type="button" className="btn btn-secondary" onClick={onClose}>
                إغلاق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
