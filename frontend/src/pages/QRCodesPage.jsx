import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getGroups, getStudents, getStudent, bulkCardPrinted, toggleStudentCardPrinted } from '../api'
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
  const [cardStyle, setCardStyle] = useState('sticker') // 'badge' | 'sticker'
  const [showCutLines, setShowCutLines] = useState(true)
  const [printFilter, setPrintFilter] = useState('all') // 'all' | 'unprinted' | 'printed'
  const [printedMap, setPrintedMap] = useState({})

  const [studentIdInput, setStudentIdInput] = useState('')
  const [searchParams] = useSearchParams()

  // Load printed records from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tollaby_printed_cards') || '{}')
      setPrintedMap(saved)
    } catch {
      setPrintedMap({})
    }
  }, [])

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
      // Default: select all fetched students
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
    setSelectedIds(new Set(displayedStudents.map(s => s.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const isStudentPrinted = (s) => Boolean(s.cardPrinted || printedMap[s.id])

  const selectUnprintedOnly = () => {
    const unprinted = students.filter(s => !isStudentPrinted(s)).map(s => s.id)
    setSelectedIds(new Set(unprinted))
  }

  const handlePrint = () => {
    if (selectedCount === 0) {
      alert('يرجى تحديد كارت واحد على الأقل للطباعة')
      return
    }

    const idsArray = Array.from(selectedIds)
    // 1. Persist to server database!
    bulkCardPrinted(idsArray, true).catch(() => {})

    // 2. Update local state & memory
    setStudents(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, cardPrinted: true } : s))

    const updated = { ...printedMap }
    const nowStr = new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    selectedIds.forEach(id => {
      const prev = updated[id] || { count: 0 }
      updated[id] = { count: prev.count + 1, printedAt: nowStr }
    })
    setPrintedMap(updated)
    try {
      localStorage.setItem('tollaby_printed_cards', JSON.stringify(updated))
    } catch (e) {}

    window.print()
  }

  const markSelectedAsPrinted = async (printed = true) => {
    const idsArray = Array.from(selectedIds)
    if (idsArray.length === 0) return
    try {
      await bulkCardPrinted(idsArray, printed)
      setStudents(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, cardPrinted: printed } : s))
      const updated = { ...printedMap }
      const nowStr = new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: 'numeric' })
      selectedIds.forEach(id => {
        if (printed) {
          const prev = updated[id] || { count: 0 }
          updated[id] = { count: prev.count + 1, printedAt: nowStr }
        } else {
          delete updated[id]
        }
      })
      setPrintedMap(updated)
      localStorage.setItem('tollaby_printed_cards', JSON.stringify(updated))
    } catch {
      alert('فشل تحديث حالة الطباعة على السيرفر')
    }
  }

  const handleToggleSingleCard = async (studentId, currentPrinted) => {
    try {
      const next = !currentPrinted
      await toggleStudentCardPrinted(studentId, next)
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, cardPrinted: next } : s))
      setPrintedMap(prev => {
        const copy = { ...prev }
        if (next) copy[studentId] = { count: 1, printedAt: new Date().toLocaleDateString('ar-EG') }
        else delete copy[studentId]
        localStorage.setItem('tollaby_printed_cards', JSON.stringify(copy))
        return copy
      })
    } catch {
      alert('فشل تحديث حالة الكارت')
    }
  }

  const resetPrintingStatus = async () => {
    if (window.confirm('هل أنت متأكد من تصفير سجل طباعة الكروت؟')) {
      const allIds = students.map(s => s.id)
      if (allIds.length > 0) {
        bulkCardPrinted(allIds, false).catch(() => {})
      }
      setStudents(prev => prev.map(s => ({ ...s, cardPrinted: false })))
      setPrintedMap({})
      localStorage.removeItem('tollaby_printed_cards')
    }
  }

  // Filter students by print filter tab
  const displayedStudents = students.filter(s => {
    const isPrinted = isStudentPrinted(s)
    if (printFilter === 'unprinted') return !isPrinted
    if (printFilter === 'printed') return isPrinted
    return true
  })

  const unprintedCount = students.filter(s => !isStudentPrinted(s)).length
  const printedCount = students.filter(s => isStudentPrinted(s)).length
  const selectedCount = students.filter(s => selectedIds.has(s.id)).length

  // Unique grades from groups
  const availableGrades = Array.from(new Set(groups.map(g => g.grade).filter(Boolean)))

  return (
    <div>
      {/* Header (No-Print) */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">كروت وهوية الطلاب (Student ID Cards)</h1>
          <p className="page-subtitle">توليد وطباعة بطاقات الهوية الرسمية والملصقات للطلاب مع تتبع حالة الطباعة</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {selectedCount > 0 && (
            <button className="btn btn-primary" onClick={handlePrint} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem', fontWeight: 'bold' }}>
              <i className="pi pi-print" /> طباعة ({selectedCount}) كارت محدد
            </button>
          )}
        </div>
      </div>

      {/* Control Panel (No-Print) */}
      <div className="card no-print" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 className="card-title"><i className="pi pi-sliders-h" /> خيارات التصفية والشكل</h2>
          
          {/* Card Style Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>شكل البطاقة:</span>
            <div style={{ display: 'flex', background: 'var(--surface-ground)', borderRadius: '8px', padding: '0.2rem', border: '1px solid var(--surface-border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${cardStyle === 'badge' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                onClick={() => setCardStyle('badge')}
              >
                <i className="pi pi-id-card" /> كارنيه هوية فاخر (ID Card)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${cardStyle === 'sticker' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '6px', fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                onClick={() => setCardStyle('sticker')}
              >
                <i className="pi pi-tag" /> ملصقات باركود للمذكرات
              </button>
            </div>
          </div>
        </div>

        {/* Filter inputs */}
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

        {/* Action Controls and Guide Explanation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleFetchStudents} disabled={fetching}>
              <i className={`pi ${fetching ? 'pi-spin pi-spinner' : 'pi-search'}`} /> عرض كروت الطلاب
            </button>

            {/* Cut Guides Toggle with Clarification Tooltip */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }} title="خطوط القص هي علامات متقطعة تفصل بين الكروت لترشدك أين تقص الورقة بالمقص أو الكاتر لضمان تطابق مقاسات جميع البطاقات">
              <input type="checkbox" checked={showCutLines} onChange={e => setShowCutLines(e.target.checked)} />
              <span>إظهار خطوط القص (Cut Guides) ✂️</span>
            </label>
          </div>

          {students.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>
                المحدد للطباعة: <strong>{selectedCount}</strong> من {students.length}
              </span>
              <button type="button" className="btn btn-sm btn-secondary" onClick={selectAll}>تحديد المعروض</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={deselectAll}>إلغاء التحديد</button>
              {unprintedCount > 0 && (
                <button type="button" className="btn btn-sm btn-warning" onClick={selectUnprintedOnly} style={{ fontWeight: 'bold' }}>
                  <i className="pi pi-star" /> تحديد غير المطبوعين ({unprintedCount})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Print Status Filter Bar */}
        {students.length > 0 && (
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, marginLeft: '0.5rem' }}>تصفية حسب حالة الطباعة:</span>
              <button
                type="button"
                className={`btn btn-sm ${printFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPrintFilter('all')}
              >
                الكل ({students.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${printFilter === 'unprinted' ? 'btn-warning' : 'btn-secondary'}`}
                onClick={() => setPrintFilter('unprinted')}
              >
                🆕 لم يُطبع بعد ({unprintedCount})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${printFilter === 'printed' ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => setPrintFilter('printed')}
              >
                ✅ تم طباعته ({printedCount})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn btn-sm btn-secondary" onClick={markSelectedAsPrinted} title="تحديد الكروت المحددة كمطبوعة دون الحاجة لإعادة الطباعة">
                <i className="pi pi-check" /> تحديد كمطبوع
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={resetPrintingStatus} title="تصفير سجل الطباعة">
                <i className="pi pi-refresh" /> تصفير السجل
              </button>
            </div>
          </div>
        )}
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
      {displayedStudents.length > 0 && (
        <div className="id-cards-print-wrapper">
          <style>{`
            /* Web View Styles */
            .id-cards-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(${cardStyle === 'sticker' ? '210px' : '320px'}, 1fr));
              gap: 1.25rem;
            }
            .id-card-wrapper {
              position: relative;
              transition: all 0.2s;
              border-radius: 14px;
            }
            .id-card-wrapper.is-unselected {
              opacity: 0.45;
              filter: grayscale(40%);
            }
            .id-card-wrapper.is-unselected:hover {
              opacity: 0.75;
              filter: none;
            }
            .id-card-badge {
              background: linear-gradient(135deg, #0d1b3e 0%, #15295c 100%);
              color: #ffffff;
              border-radius: 14px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
              border: 2px solid transparent;
              overflow: hidden;
              position: relative;
              cursor: pointer;
              transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
              page-break-inside: avoid;
            }
            .id-card-wrapper.is-selected .id-card-badge {
              border-color: #3b82f6;
              box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
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
              padding: 0.45rem;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              border: 1px solid #e2e8f0;
              flex-shrink: 0;
            }
            .id-card-footer {
              background: rgba(0, 0, 0, 0.25);
              padding: 0.4rem 0.85rem;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 0.72rem;
              color: #94a3b8;
              border-top: 1px solid rgba(255, 255, 255, 0.08);
            }

            /* Sticker Card Style (Baseline original clean dashed sticker) */
            .id-card-sticker {
              background: #ffffff;
              color: #000000;
              border-radius: 8px;
              border: 2px dashed #000000;
              padding: 14px 10px;
              text-align: center;
              cursor: pointer;
              transition: transform 0.2s, box-shadow 0.2s;
              page-break-inside: avoid;
            }
            .id-card-wrapper.is-selected .id-card-sticker {
              border-color: #2563eb;
              box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
            }

            /* Print Status Tag */
            .print-status-tag {
              position: absolute;
              top: -8px;
              left: 12px;
              z-index: 10;
              font-size: 0.7rem;
              font-weight: 700;
              padding: 0.15rem 0.6rem;
              border-radius: 12px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }

            /* Strict Print Settings for Clean A4 */
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm 6mm;
              }
              body {
                background: #ffffff !important;
                color: #000000 !important;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
              }
              .no-print, .mobile-bottom-nav, .layout-sidebar, .layout-topbar, .menu-btn-toggle, .print-status-tag, .selection-checkbox, nav, aside, header {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                width: 0 !important;
                overflow: hidden !important;
              }
              .layout-main-container, .layout-main {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
              }
              .id-cards-grid {
                display: grid !important;
                grid-template-columns: ${cardStyle === 'sticker' ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)'} !important;
                gap: 10px !important;
                width: 100% !important;
                padding: 0 !important;
              }
              /* Hide unselected cards strictly during printing */
              .id-card-wrapper.is-unselected {
                display: none !important;
              }
              .id-card-wrapper {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .id-card-badge {
                box-shadow: none !important;
                border: ${showCutLines ? '1px dashed #64748b' : '1px solid #cbd5e1'} !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .id-card-header {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .id-card-sticker {
                background: #ffffff !important;
                color: #000000 !important;
                border: ${showCutLines ? '2px dashed #000000' : '1px solid #000000'} !important;
                padding: 12px 6px !important;
                text-align: center !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .id-card-sticker h3 {
                font-size: 13px !important;
                font-weight: 800 !important;
                margin: 8px 0 4px !important;
                color: #000000 !important;
              }
              .id-card-sticker p {
                font-size: 11px !important;
                margin: 2px 0 !important;
                color: #000000 !important;
              }
            }
          `}</style>

          <div className="id-cards-grid">
            {displayedStudents.map(s => {
              const isSelected = selectedIds.has(s.id)
              const isPrinted = isStudentPrinted(s)
              const printRecord = printedMap[s.id]

              return (
                <div
                  key={s.id}
                  className={`id-card-wrapper ${isSelected ? 'is-selected' : 'is-unselected'}`}
                  onClick={() => toggleSelectStudent(s.id)}
                >
                  {/* Status Indicator (No-Print) */}
                  <div
                    className="print-status-tag no-print"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleSingleCard(s.id, isPrinted)
                    }}
                    title="انقر هنا لتغيير حالة الطباعة (مطبوع / غير مطبوع)"
                    style={{ cursor: 'pointer' }}
                  >
                    {isPrinted ? (
                      <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                        ✅ تم طباعته {printRecord?.count ? `(${printRecord.count}x)` : ''}
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                        🆕 جديد (لم يُطبع)
                      </span>
                    )}
                  </div>

                  {/* Card Selection Indicator */}
                  <div
                    className="selection-checkbox no-print"
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '12px',
                      zIndex: 11,
                      background: isSelected ? '#3b82f6' : 'rgba(0,0,0,0.5)',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      border: '1px solid #ffffff'
                    }}
                    title={isSelected ? 'محدد للطباعة (اضغط للاستثناء)' : 'غير محدد (اضغط لتضمينه في الطباعة)'}
                  >
                    <i className={`pi ${isSelected ? 'pi-check' : 'pi-minus'}`} />
                  </div>

                  {cardStyle === 'badge' ? (
                    /* ID Card Badge */
                    <div className="id-card-badge" title="اضغط لتحديد / إلغاء تحديد هذا الكارت للطباعة">
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
                          <QRCodeSVG value={String(s.id)} size={94} level="M" />
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
                        <div>
                          <i className="pi pi-phone" style={{ marginLeft: '0.25rem' }} />
                          {s.phoneNumber || 'بدون هاتف'}
                        </div>
                        <div style={{ color: '#f59e0b', fontWeight: 600 }}>
                          <i className="pi pi-exclamation-circle" style={{ marginLeft: '0.25rem' }} />
                          طوارئ ولي الأمر: {s.dadPhoneNumber || '-'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Original Sticker Style (ملصقات باركود المذكرات الأساسية) */
                    <div className="id-card-sticker qr-card" title="اضغط لتحديد / إلغاء تحديد هذا الملصق للطباعة">
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                        <QRCodeSVG value={String(s.id)} size={120} level="M" />
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '8px 0 4px', color: '#000000' }}>
                        {s.name}
                      </h3>
                      <p style={{ fontSize: '12px', fontWeight: 700, margin: '2px 0', color: '#1e293b' }}>
                        رقم الطالب: #{s.id}
                      </p>
                      <p style={{ fontSize: '12px', margin: '2px 0', color: '#475569' }}>
                        {s.group?.name || 'مجموعة عامة'}
                      </p>
                      {s.phoneNumber && (
                        <p style={{ fontSize: '10px', margin: '2px 0', color: '#64748b' }}>
                          هاتف: {s.phoneNumber}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
