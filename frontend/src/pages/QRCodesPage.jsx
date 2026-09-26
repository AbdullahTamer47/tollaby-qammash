import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getGroups, getStudents, getStudent } from '../api'
import { QRCodeSVG } from 'qrcode.react'

export default function QRCodesPage() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [students, setStudents] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [fetching, setFetching] = useState(false)
  const [cardStyle, setCardStyle] = useState('badge') // 'badge' | 'sticker'
  const [showCutLines, setShowCutLines] = useState(true)

  const [studentIdInput, setStudentIdInput] = useState('')
  const [searchParams] = useSearchParams()

  useEffect(() => {
    getGroups().then(r => setGroups(r.data)).finally(() => setLoading(false))

    const sid = searchParams.get('student_id')
    if (sid) {
      setStudentIdInput(sid)
      handleFetchSingleStudent(sid)
    }
  }, [])

  const handleFetchSingleStudent = async (sid) => {
    if (!sid) return
    setFetching(true)
    try {
      const r = await getStudent(sid)
      setStudents([r.data])
      setSelectedIds(new Set([r.data.id]))
    } catch {
      alert('الطالب غير موجود')
    } finally {
      setFetching(false)
    }
  }

  const handleFetchStudents = async () => {
    setFetching(true)
    try {
      const params = { per_page: 500 }
      if (selectedGroup) params.groupId = selectedGroup
      if (selectedGrade) params.grade = selectedGrade
      if (searchQuery) params.q = searchQuery
      const r = await getStudents(params)
      const list = r.data.students || []
      setStudents(list)
      setSelectedIds(new Set(list.map(s => s.id)))
    } catch {
      alert('فشل جلب الطلاب')
    } finally {
      setFetching(false)
    }
  }

  const toggleSelectStudent = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(students.map(s => s.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const handlePrint = () => {
    window.print()
  }

  const filteredStudents = students.filter(s => selectedIds.has(s.id))

  // Unique grades from groups
  const availableGrades = Array.from(new Set(groups.map(g => g.grade).filter(Boolean)))

  return (
    <div>
      {/* Header (No-Print) */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">كروت وهوية الطلاب (Student ID Cards)</h1>
          <p className="page-subtitle">توليد وطباعة بطاقات الهوية الرسمية والباركود للطلاب بجودة عالية</p>
        </div>
        {filteredStudents.length > 0 && (
          <button className="btn btn-primary" onClick={handlePrint} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem', fontWeight: 'bold' }}>
            <i className="pi pi-print" /> طباعة ({filteredStudents.length}) كارت
          </button>
        )}
      </div>

      {/* Control Panel (No-Print) */}
      <div className="card no-print" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ justifyContent: 'space-between' }}>
          <h2 className="card-title"><i className="pi pi-sliders-h" /> خيارات التصفية والطباعة</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>شكل البطاقة:</span>
            <div style={{ display: 'flex', background: 'var(--surface-ground)', borderRadius: '8px', padding: '0.2rem', border: '1px solid var(--surface-border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${cardStyle === 'badge' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                onClick={() => setCardStyle('badge')}
              >
                <i className="pi pi-id-card" /> كارت هوية (ID Badge)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${cardStyle === 'sticker' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                onClick={() => setCardStyle('sticker')}
              >
                <i className="pi pi-tag" /> ملصقات باركود
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">تصفية بالمجموعة</label>
            <select className="form-control" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
              <option value="">-- كل المجموعات --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">تصفية بالصف الدراسي</label>
            <select className="form-control" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
              <option value="">-- كل الصفوف --</option>
              {availableGrades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">بحث سريع (اسم / كود / هاتف)</label>
            <input
              className="form-control"
              placeholder="اكتب اسم أو كود الطالب..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchStudents()}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleFetchStudents} disabled={fetching}>
              <i className={`pi ${fetching ? 'pi-spin pi-spinner' : 'pi-search'}`} /> عرض كروت الطلاب
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={showCutLines} onChange={e => setShowCutLines(e.target.checked)} />
              إظهار خطوط القص (Cut Guides)
            </label>
          </div>

          {students.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>
                محدد: <strong>{selectedIds.size}</strong> من {students.length}
              </span>
              <button type="button" className="btn btn-sm btn-secondary" onClick={selectAll}>تحديد الكل</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={deselectAll}>إلغاء التحديد</button>
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {students.length === 0 && !fetching && (
        <div className="empty-state no-print">
          <i className="pi pi-id-card" style={{ fontSize: '3rem', color: 'var(--text-color-secondary)' }} />
          <h3>جاهز لتوليد وطباعة كروت الطلاب</h3>
          <p>اختر المجموعة أو الصف الدراسي واضغط على <strong>"عرض كروت الطلاب"</strong> للمعاينة والطباعة المباشرة.</p>
        </div>
      )}

      {/* Print & Preview Container */}
      {filteredStudents.length > 0 && (
        <div className="id-cards-print-wrapper">
          <style>{`
            /* Web View Styles */
            .id-cards-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
              gap: 1.25rem;
            }
            .id-card-badge {
              background: linear-gradient(135deg, #0d1b3e 0%, #15295c 100%);
              color: #ffffff;
              border-radius: 14px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
              border: 1px solid rgba(255, 255, 255, 0.1);
              overflow: hidden;
              position: relative;
              cursor: pointer;
              transition: transform 0.2s, box-shadow 0.2s;
              page-break-inside: avoid;
            }
            .id-card-badge:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
            }
            .id-card-header {
              background: linear-gradient(90deg, #1e3a8a 0%, #2563eb 100%);
              padding: 0.65rem 0.85rem;
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #fbbf24;
            }
            .id-card-body {
              padding: 0.85rem;
              display: flex;
              gap: 0.85rem;
              align-items: center;
            }
            .id-card-qr-box {
              background: #ffffff;
              padding: 6px;
              border-radius: 10px;
              display: inline-flex;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              flex-shrink: 0;
            }
            .id-card-footer {
              background: rgba(0, 0, 0, 0.25);
              padding: 0.4rem 0.85rem;
              font-size: 0.72rem;
              display: flex;
              justify-content: space-between;
              color: #94a3b8;
              border-top: 1px solid rgba(255, 255, 255, 0.08);
            }

            /* Sticker Style */
            .id-card-sticker {
              background: #ffffff;
              color: #0f172a;
              border: 2px solid #cbd5e1;
              border-radius: 8px;
              padding: 0.75rem;
              text-align: center;
              cursor: pointer;
              page-break-inside: avoid;
            }

            /* Printing Setup (Strict A4 Layout) */
            @media print {
              body {
                background: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print, .layout-sidebar, .layout-topbar, .menu-btn-toggle {
                display: none !important;
              }
              .layout-main-container, .layout-main {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
              }
              .id-cards-grid {
                display: grid !important;
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 12px !important;
                width: 100% !important;
                padding: 10px !important;
              }
              .id-card-badge {
                box-shadow: none !important;
                border: ${showCutLines ? '1px dashed #64748b' : '1px solid #cbd5e1'} !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                page-break-inside: avoid !important;
              }
              .id-card-header {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .id-card-sticker {
                border: ${showCutLines ? '1px dashed #64748b' : '1px solid #000000'} !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          `}</style>

          <div className="id-cards-grid">
            {filteredStudents.map(s => cardStyle === 'badge' ? (
              /* ID Card Badge */
              <div
                key={s.id}
                className="id-card-badge"
                onClick={() => toggleSelectStudent(s.id)}
                title="اضغط لإلغاء تحديد هذا الكارت للطباعة"
              >
                <div className="id-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <i className="pi pi-graduation-cap" style={{ color: '#fbbf24', fontSize: '1.1rem' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', letterSpacing: '0.3px', color: '#ffffff' }}>
                      منصة الأستاذ محمد القماش
                    </span>
                  </div>
                  <span style={{ background: '#fbbf24', color: '#0f172a', fontWeight: 800, fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                    بطاقة حضور
                  </span>
                </div>

                <div className="id-card-body">
                  <div className="id-card-qr-box">
                    <QRCodeSVG value={String(s.id)} size={96} level="M" />
                  </div>

                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </div>

                    <div style={{ display: 'inline-block', background: 'rgba(59, 130, 246, 0.25)', color: '#93c5fd', fontSize: '0.78rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '4px', marginBottom: '0.35rem' }}>
                      كود الطالب: #{s.id}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
                      <i className="pi pi-th-large" style={{ marginLeft: '0.3rem', fontSize: '0.75rem', color: '#fbbf24' }} />
                      {s.group?.name || 'مجموعة عامة'}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      <i className="pi pi-book" style={{ marginLeft: '0.3rem', fontSize: '0.72rem' }} />
                      {s.group?.grade || 'المرحلة الثانوية'}
                    </div>
                  </div>
                </div>

                <div className="id-card-footer">
                  <span>📱 هاتف الطالب: {s.phoneNumber || '-'}</span>
                  <span>🚨 طوارئ ولي الأمر: {s.dadPhoneNumber || '-'}</span>
                </div>
              </div>
            ) : (
              /* Sticker Style */
              <div
                key={s.id}
                className="id-card-sticker"
                onClick={() => toggleSelectStudent(s.id)}
                title="اضغط لإلغاء تحديد هذا الملصق"
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e3a8a', marginBottom: '0.35rem' }}>
                  الأستاذ محمد القماش
                </div>
                <div style={{ background: '#ffffff', padding: '4px', display: 'inline-block', borderRadius: '6px' }}>
                  <QRCodeSVG value={String(s.id)} size={88} level="M" />
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', marginTop: '0.35rem' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb' }}>
                  كود: #{s.id} — {s.group?.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
