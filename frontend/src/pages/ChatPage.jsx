import { useEffect, useRef, useState } from 'react'
import {
  getChatConversations,
  getChatConversationsSummary,
  getChatMessages,
  getChatStudents,
  getChatWebhookEvents,
  getRecentChatMessages,
  getUnknownChatMessages,
  markChatMessagesSeen,
  sendChatMessage,
  getNotificationTemplates,
  deleteChatMessages
} from '../api'

const PAGE_SIZE = 20
const MESSAGE_PAGE_SIZE = 50
const FALLBACK_QUICK_MESSAGES = [
  { title: 'موعد حصة', text: 'نذكركم بموعد الحصة القادمة. برجاء الالتزام بالحضور في الموعد.' },
  { title: 'تذكير دفع', text: 'نرجو متابعة سداد المستحقات المتأخرة في أقرب وقت.' },
  { title: 'غياب', text: 'نحيط علم سيادتكم أن الطالب لم يحضر الحصة اليوم.' },
  { title: 'درجة جديدة', text: 'تم تسجيل درجة جديدة للطالب، برجاء مراجعة لوحة الطالب.' }
]

function statusLabel(status) {
  const labels = { queued: 'قيد الإرسال', sent: 'مرسلة', delivered: 'وصلت', read: 'مقروءة', failed: 'فشلت', received: 'واردة' }
  return labels[status] || status
}

function statusBadge(status) {
  if (status === 'failed') return 'danger'
  if (status === 'read' || status === 'delivered' || status === 'received') return 'success'
  if (status === 'sent') return 'info'
  return 'warning'
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-'
}

function formatShortTime(value) {
  return value ? new Date(value).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'
}

function avatarLabel(nameOrPhone) {
  return String(nameOrPhone || '?').trim().slice(0, 1).toUpperCase()
}

function shouldGroupWithPrevious(current, previous) {
  if (!previous) return false
  const currentTime = new Date(current.createdAt).getTime()
  const previousTime = new Date(previous.createdAt).getTime()
  return current.direction === previous.direction && Math.abs(currentTime - previousTime) < 3 * 60 * 1000
}

function statusIcon(status) {
  if (status === 'read') return '✓✓'
  if (status === 'delivered') return '✓✓'
  if (status === 'sent') return '✓'
  if (status === 'failed') return '!'
  return ''
}

function totalPages(meta) {
  return Math.max(Math.ceil((meta.total || 0) / (meta.per_page || PAGE_SIZE)), 1)
}

function Pagination({ meta, onPageChange }) {
  const pages = totalPages(meta)
  if ((meta.total || 0) <= (meta.per_page || PAGE_SIZE)) return null
  return (
    <div className="chat-pagination">
      <button className="btn btn-secondary btn-sm" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>السابق</button>
      <span>صفحة {meta.page} من {pages} · {meta.total} نتيجة</span>
      <button className="btn btn-secondary btn-sm" disabled={meta.page >= pages} onClick={() => onPageChange(meta.page + 1)}>التالي</button>
    </div>
  )
}

export default function ChatPage() {
  const [students, setStudents] = useState([])
  const [conversations, setConversations] = useState([])
  const [recentMessages, setRecentMessages] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [selectedPhone, setSelectedPhone] = useState('')
  const [recipientType, setRecipientType] = useState('parent')
  const [messages, setMessages] = useState([])
  const [unknownMessages, setUnknownMessages] = useState([])
  const [webhookEvents, setWebhookEvents] = useState([])
  const [templates, setTemplates] = useState([])
  const [message, setMessage] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [conversationQ, setConversationQ] = useState('')
  const [activeTab, setActiveTab] = useState('conversations')
  const [summary, setSummary] = useState({ conversations: 0, incomingUnread: 0, unknownIncoming: 0 })
  const [conversationMeta, setConversationMeta] = useState({ page: 1, per_page: PAGE_SIZE, total: 0 })
  const [studentMeta, setStudentMeta] = useState({ page: 1, per_page: PAGE_SIZE, total: 0 })
  const [messageMeta, setMessageMeta] = useState({ page: 1, per_page: MESSAGE_PAGE_SIZE, total: 0 })
  const [unknownMeta, setUnknownMeta] = useState({ page: 1, per_page: PAGE_SIZE, total: 0 })
  const [recentMeta, setRecentMeta] = useState({ page: 1, per_page: PAGE_SIZE, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)
  const messagesEndRef = useRef(null)

  const loadSummary = () => {
    getChatConversationsSummary().then(r => setSummary(r.data)).catch(() => {})
  }

  const loadStudents = (page = studentMeta.page) => {
    setSidebarLoading(true)
    getChatStudents({ q: searchQ, page, per_page: PAGE_SIZE })
      .then(r => { setStudents(r.data.students); setStudentMeta({ page: r.data.page, per_page: r.data.per_page, total: r.data.total }) })
      .catch(() => setMsg({ type: 'error', text: 'فشل تحميل الطلاب' }))
      .finally(() => setSidebarLoading(false))
  }

  const loadConversations = (page = conversationMeta.page) => {
    setSidebarLoading(true)
    getChatConversations({ q: conversationQ, page, per_page: PAGE_SIZE })
      .then(r => { setConversations(r.data.conversations); setConversationMeta({ page: r.data.page, per_page: r.data.per_page, total: r.data.total }) })
      .catch(() => setMsg({ type: 'error', text: 'فشل تحميل المحادثات' }))
      .finally(() => setSidebarLoading(false))
  }

  const loadUnknown = (page = unknownMeta.page) => {
    getUnknownChatMessages({ page, per_page: PAGE_SIZE })
      .then(r => { setUnknownMessages(r.data.messages); setUnknownMeta({ page: r.data.page, per_page: r.data.per_page, total: r.data.total }) })
      .catch(() => {})
  }

  const loadRecent = (page = recentMeta.page) => {
    getRecentChatMessages({ page, per_page: PAGE_SIZE })
      .then(r => { setRecentMessages(r.data.messages); setRecentMeta({ page: r.data.page, per_page: r.data.per_page, total: r.data.total }) })
      .catch(() => {})
  }

  const loadDiagnostics = () => {
    loadUnknown()
    loadRecent()
    getChatWebhookEvents().then(r => setWebhookEvents(r.data)).catch(() => {})
  }

  const loadTemplates = () => {
    getNotificationTemplates()
      .then(r => setTemplates(r.data.filter(t => t.active)))
      .catch(() => setTemplates([]))
  }

  const sampleTokens = selectedStudent ? {
    '{{اسم_الطالب}}': selectedStudent.name,
    '{{اسم_المجموعة}}': selectedStudent.group?.name || '',
    '{{التاريخ}}': new Date().toLocaleString('ar-EG'),
    '{{عنوان_الحصة}}': 'عنوان الحصة',
    '{{عنوان_المحاضرة}}': 'عنوان المحاضرة',
    '{{عنوان_الامتحان}}': 'عنوان الامتحان',
    '{{الحضور}}': 'حاضر',
    '{{الدرجة}}': '0',
    '{{الدرجة_الكلية}}': '0'
  } : {}

  const renderTemplateForComposer = (body) => Object.entries(sampleTokens).reduce(
    (text, [key, value]) => text.replaceAll(key, value),
    body
  )

  const getStudentPhone = (student, type = recipientType) => type === 'parent' ? student?.dadPhoneNumber : student?.phoneNumber

  const loadMessages = ({ student = selectedStudent, phone = selectedPhone, type = recipientType, page = messageMeta.page } = {}) => {
    const targetPhone = student ? getStudentPhone(student, type) : phone
    if (!targetPhone) return
    setLoading(true)
    const params = { phoneNumber: targetPhone, page, per_page: MESSAGE_PAGE_SIZE }
    getChatMessages(params)
      .then(r => {
        setMessages(r.data.messages)
        setMessageMeta({ page: r.data.page, per_page: r.data.per_page, total: r.data.total })
        markCurrentConversationSeen(student, targetPhone)
      })
      .catch(() => setMsg({ type: 'error', text: 'فشل تحميل الرسائل' }))
      .finally(() => setLoading(false))
  }

  const markCurrentConversationSeen = (student = selectedStudent, phone = selectedPhone) => {
    const targetPhone = phone || (student ? getStudentPhone(student) : '')
    if (!targetPhone) return
    markChatMessagesSeen({ phoneNumber: targetPhone })
      .then(() => { loadSummary(); loadConversations(conversationMeta.page); loadUnknown(unknownMeta.page) })
      .catch(() => {})
  }

  useEffect(() => { loadSummary(); loadConversations(1); loadDiagnostics(); loadTemplates() }, [])
  useEffect(() => { loadStudents(1) }, [searchQ])
  useEffect(() => { loadConversations(1) }, [conversationQ])
  useEffect(() => { if (selectedStudent || selectedPhone) loadMessages({ page: 1 }) }, [selectedStudent, selectedPhone, recipientType])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const currentPhone = selectedStudent ? getStudentPhone(selectedStudent) : selectedPhone

  const selectStudent = (student, type = 'parent') => {
    setSelectedStudent(student)
    setRecipientType(type)
    setSelectedPhone('')
    setMessageMeta({ page: 1, per_page: MESSAGE_PAGE_SIZE, total: 0 })
    setActiveTab('students')
  }

  const selectConversation = (conversation) => {
    setSelectedStudent(conversation.student || null)
    setRecipientType(conversation.recipientType === 'student' ? 'student' : 'parent')
    setSelectedPhone(conversation.student ? '' : conversation.phoneNumber)
    setMessageMeta({ page: 1, per_page: MESSAGE_PAGE_SIZE, total: 0 })
    setActiveTab('conversations')
  }

  const selectUnknown = (phoneNumber) => {
    setSelectedStudent(null)
    setSelectedPhone(phoneNumber)
    setRecipientType('unknown')
    setMessageMeta({ page: 1, per_page: MESSAGE_PAGE_SIZE, total: 0 })
  }

  const refreshAll = () => {
    loadSummary()
    loadConversations()
    loadStudents()
    loadDiagnostics()
    loadMessages()
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim() || (!selectedStudent && !selectedPhone)) return
    setSending(true)
    setMsg(null)
    try {
      await sendChatMessage({ studentId: selectedStudent?.id, recipientType, phoneNumber: selectedStudent ? undefined : selectedPhone, message })
      setMessage('')
      refreshAll()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'فشل الإرسال. تأكد من إعداد واتساب أو نافذة 24 ساعة.' })
      refreshAll()
    } finally {
      setSending(false)
    }
  }

  const selectedTitle = selectedStudent?.name || (selectedPhone ? `رقم غير معروف ${selectedPhone}` : '')

  return (
    <div className="chat-page whatsapp-chat-page">
      <div className="page-header chat-page-header">
        <div>
          <h1 className="page-title">الشات / واتساب</h1>
          <p className="page-subtitle">واجهة محادثات سريعة للطلاب وأولياء الأمور</p>
        </div>
        <button className="btn btn-secondary" onClick={refreshAll}><i className="pi pi-refresh" /> تحديث الكل</button>
      </div>

      {msg && <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}><i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}<button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button></div>}

      <div className="chat-shell">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-top">
            <div>
              <strong>واتساب</strong>
              <span>{summary.conversations} محادثة · {summary.incomingUnread} وارد</span>
            </div>
            <button className="chat-icon-btn" onClick={refreshAll} title="تحديث"><i className="pi pi-refresh" /></button>
          </div>

          <div className="chat-tabs">
            <button className={activeTab === 'conversations' ? 'active' : ''} onClick={() => setActiveTab('conversations')}>المحادثات <span className="badge badge-info">{conversationMeta.total}</span></button>
            <button className={activeTab === 'students' ? 'active' : ''} onClick={() => setActiveTab('students')}>الأشخاص <span className="badge badge-info">{studentMeta.total}</span></button>
            <button className={activeTab === 'unknown' ? 'active' : ''} onClick={() => setActiveTab('unknown')}>غير معروف <span className="badge badge-warning">{unknownMeta.total}</span></button>
          </div>

          {activeTab === 'conversations' && <>
            <div className="chat-search"><i className="pi pi-search" /><input placeholder="بحث أو بدء محادثة جديدة" value={conversationQ} onChange={e => setConversationQ(e.target.value)} /></div>
            <div className="chat-list">
              {sidebarLoading ? <div className="spinner-wrapper"><div className="spinner" /></div> : conversations.map(conversation => (
                <button key={conversation.phoneNumber} className={`chat-list-item ${selectedPhone === conversation.phoneNumber || selectedStudent?.id === conversation.student?.id ? 'active' : ''}`} onClick={() => selectConversation(conversation)}>
                  <span className="chat-avatar">{avatarLabel(conversation.student?.name || conversation.phoneNumber)}</span>
                  <span className="chat-list-body">
                    <span className="chat-list-main"><strong>{conversation.student?.name || conversation.phoneNumber}</strong><time>{formatShortTime(conversation.lastMessage?.createdAt)}</time></span>
                    <span className="chat-list-meta">{conversation.student?.group?.name || 'رقم غير معروف'} · {conversation.recipientType === 'parent' ? 'ولي الأمر' : conversation.recipientType === 'student' ? 'الطالب' : 'غير معروف'}</span>
                    <span className="chat-list-preview">{conversation.lastMessage?.direction === 'outgoing' ? 'أنت: ' : ''}{conversation.lastMessage?.message}</span>
                  </span>
                  {conversation.unreadIncoming > 0 && <span className="chat-unread">{conversation.unreadIncoming}</span>}
                </button>
              ))}
              {!sidebarLoading && conversations.length === 0 && <div className="empty-state"><p>لا توجد محادثات</p></div>}
            </div>
            <Pagination meta={conversationMeta} onPageChange={loadConversations} />
          </>}

          {activeTab === 'students' && <>
            <div className="chat-search"><i className="pi pi-search" /><input placeholder="بحث بالاسم أو رقم الهاتف" value={searchQ} onChange={e => setSearchQ(e.target.value)} /></div>
            <div className="chat-list">
              {sidebarLoading ? <div className="spinner-wrapper"><div className="spinner" /></div> : students.map(student => (
                <button key={student.id} className={`chat-list-item ${selectedStudent?.id === student.id ? 'active' : ''}`} onClick={() => selectStudent(student)}>
                  <span className="chat-avatar">{avatarLabel(student.name)}</span>
                  <span className="chat-list-body">
                    <span className="chat-list-main"><strong>{student.name}</strong><time>#{student.id}</time></span>
                    <span className="chat-list-meta">{student.group?.name || 'بدون مجموعة'}</span>
                    <span className="chat-list-preview">ولي الأمر: {student.dadPhoneNumber || '-'} · الطالب: {student.phoneNumber || '-'}</span>
                  </span>
                </button>
              ))}
              {!sidebarLoading && students.length === 0 && <div className="empty-state"><p>لا يوجد أشخاص</p></div>}
            </div>
            <Pagination meta={studentMeta} onPageChange={loadStudents} />
          </>}

          {activeTab === 'unknown' && <>
            <div className="chat-section-title">رسائل غير مرتبطة بطالب</div>
            <div className="chat-list">
              {unknownMessages.map(item => (
                <button key={item.id} className={`chat-list-item ${selectedPhone === item.phoneNumber ? 'active' : ''}`} onClick={() => selectUnknown(item.phoneNumber)}>
                  <span className="chat-avatar unknown"><i className="pi pi-question" /></span>
                  <span className="chat-list-body">
                    <span className="chat-list-main"><strong>{item.phoneNumber}</strong><time>{formatShortTime(item.createdAt)}</time></span>
                    <span className="chat-list-meta">رقم غير معروف</span>
                    <span className="chat-list-preview">{item.message}</span>
                  </span>
                </button>
              ))}
              {unknownMessages.length === 0 && <div className="empty-state"><p>لا توجد رسائل غير معروفة</p></div>}
            </div>
            <Pagination meta={unknownMeta} onPageChange={loadUnknown} />
          </>}
        </aside>

        <section className="chat-panel">
          {selectedStudent || selectedPhone ? <>
            <div className="chat-header">
              <div>
                <span className="chat-avatar chat-header-avatar">{avatarLabel(selectedTitle)}</span>
                <span>
                  <h2>{selectedTitle}</h2>
                  <p>{currentPhone || 'لا يوجد رقم'} {selectedStudent?.group ? `· ${selectedStudent.group.name}` : ''}</p>
                </span>
              </div>
              <div className="chat-header-actions">
                {selectedStudent && <select className="form-control" value={recipientType} onChange={e => setRecipientType(e.target.value)}><option value="parent">ولي الأمر</option><option value="student">الطالب</option></select>}
                <button className="chat-icon-btn" type="button" onClick={() => loadMessages()}><i className="pi pi-refresh" /></button>
                <button className="chat-icon-btn" style={{ color: '#dc3545', borderColor: '#dc3545' }} title="مسح المحادثة" type="button" onClick={() => {
                  if (window.confirm('هل أنت متأكد من مسح جميع رسائل هذه المحادثة؟')) {
                    deleteChatMessages({ phoneNumber: currentPhone }).then(() => {
                      loadMessages()
                      loadSummary()
                      loadConversations()
                      setMsg({ type: 'success', text: 'تم مسح المحادثة بنجاح' })
                    }).catch(() => setMsg({ type: 'error', text: 'فشل مسح المحادثة' }))
                  }
                }}><i className="pi pi-trash" /></button>
              </div>
            </div>

            <div className="chat-message-toolbar">
              <Pagination meta={messageMeta} onPageChange={page => loadMessages({ page })} />
              <span className="text-muted text-sm">يعرض {messages.length} من {messageMeta.total} رسالة</span>
            </div>

            <div className="chat-messages">
              {loading ? <div className="spinner-wrapper"><div className="spinner" /></div> : messages.length === 0 ? <div className="empty-state"><p>لا توجد رسائل في هذه المحادثة</p></div> : messages.map((m, index) => (
                <div key={m.id} className={`chat-row ${m.direction === 'outgoing' ? 'outgoing' : 'incoming'} ${shouldGroupWithPrevious(m, messages[index - 1]) ? 'grouped' : ''}`}>
                  <div className={`chat-bubble ${m.status === 'failed' ? 'failed' : ''}`}>
                    <div>{m.message}</div>
                    <small><time>{formatShortTime(m.createdAt)}</time>{m.direction === 'outgoing' && <span className={`chat-status status-${m.status}`} title={statusLabel(m.status)}>{statusIcon(m.status)}</span>}{m.sentBy?.username ? <span>{m.sentBy.username}</span> : null}</small>
                    {m.error && <small className="chat-error">{m.error}</small>}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="quick-replies">
              {(templates.length ? templates : FALLBACK_QUICK_MESSAGES).map(item => (
                <button key={item.id || item.title} type="button" onClick={() => setMessage(renderTemplateForComposer(item.body || item.text))}>
                  {item.name || item.title}
                </button>
              ))}
            </div>
            <form className="chat-composer" onSubmit={handleSend}>
              <button type="button" className="chat-icon-btn"></button>
              <textarea rows="1" placeholder="اكتب رسالة" value={message} onChange={e => setMessage(e.target.value)} />
              <button type="button" className="chat-icon-btn"></button>
              <button className="chat-send-btn" disabled={sending || !currentPhone || !message.trim()}><i className={`pi pi-${sending ? 'spin pi-spinner' : 'send'}`} /></button>
              <div className="chat-composer-footer">
                <span className="text-muted text-sm">{message.length} حرف · الرسائل العادية تعمل داخل نافذة 24 ساعة فقط</span>
              </div>
            </form>
          </> : <div className="chat-empty"><i className="pi pi-whatsapp" /><h2>واتساب تولابي</h2><p>اختر محادثة من القائمة لعرض الرسائل والرد بسرعة.</p></div>}
        </section>
      </div>

      <details className="card chat-debug">
        <summary>تنظيم البيانات والتشخيص</summary>
        <h3 className="card-title">آخر الرسائل</h3>
        <div className="table-container">
          <table><thead><tr><th>النوع</th><th>الشخص</th><th>الرقم</th><th>الرسالة</th><th>الوقت</th><th>الحالة</th></tr></thead><tbody>{recentMessages.map(item => <tr key={item.id}><td>{item.direction === 'incoming' ? 'وارد' : 'صادر'}</td><td>{item.student?.name || '-'}</td><td>{item.phoneNumber}</td><td>{item.message}</td><td>{formatTime(item.createdAt)}</td><td>{statusLabel(item.status)}</td></tr>)}</tbody></table>
        </div>
        <Pagination meta={recentMeta} onPageChange={loadRecent} />
        <h3 className="card-title mt-2">Webhook Events</h3>
        {webhookEvents.length === 0 ? <div className="empty-state"><p>لم يصل أي webhook بعد</p></div> : <div className="table-container"><table><thead><tr><th>الحالة</th><th>الوقت</th><th>ملخص</th><th>خطأ</th></tr></thead><tbody>{webhookEvents.map(e => {
          let summary = ''
          try {
            const payload = JSON.parse(e.payload)
            const changes = payload.entry?.flatMap(entry => entry.changes || []) || []
            const messageCount = changes.reduce((sum, c) => sum + (c.value?.messages?.length || 0), 0)
            const statusCount = changes.reduce((sum, c) => sum + (c.value?.statuses?.length || 0), 0)
            summary = `${messageCount} رسائل / ${statusCount} حالات`
          } catch { summary = 'غير متاح' }
          return <tr key={e.id}><td>{e.eventType}</td><td>{formatTime(e.createdAt)}</td><td>{summary}</td><td>{e.error || '-'}</td></tr>
        })}</tbody></table></div>}
      </details>
    </div>
  )
}
