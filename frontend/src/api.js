import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  response => response,
  error => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    const skipAuthError = error.config?.skipAuthError;
    const skipGlobalError = error.config?.skipGlobalError;
    if (error.response) {
      if (error.response.status === 401) {
        if (!isLoginRequest && !skipAuthError) {
          window.dispatchEvent(new CustomEvent('api-auth-error'));
        }
      } else if (error.response.status === 403) {
        if (!skipGlobalError) window.dispatchEvent(new CustomEvent('api-error', { detail: 'غير مصرح لك للقيام بهذا الإجراء' }));
      } else if (error.response.status >= 500) {
        if (!skipGlobalError) window.dispatchEvent(new CustomEvent('api-error', { detail: 'حدث خطأ في الخادم (500)' }));
      } else if (error.response.data && error.response.data.error) {
        if (!skipGlobalError) window.dispatchEvent(new CustomEvent('api-error', { detail: error.response.data.error }));
      }
    } else if (!skipGlobalError) {
      window.dispatchEvent(new CustomEvent('api-error', { detail: 'لا يمكن الاتصال بالخادم. تحقق من الإنترنت.' }));
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (data) => api.post('/auth/login', data)
export const logout = () => api.post('/auth/logout')
export const getMe = (config = {}) => api.get('/auth/me', config)
export const updateMe = (data) => api.put('/auth/me', data)
export const createAssistant = (data) => api.post('/auth/assistants', data)
export const getAssistants = () => api.get('/auth/assistants')
export const updateAssistant = (id, data) => api.put(`/auth/assistants/${id}`, data)
export const deleteAssistant = (id) => api.delete(`/auth/assistants/${id}`)

// Students
export const getStudents = (params) => api.get('/students', { params })
export const createStudent = (data) => api.post('/students', data)
export const getStudent = (id) => api.get(`/students/${id}`)
export const updateStudent = (id, data) => api.put(`/students/${id}`, data)
export const deleteStudent = (id) => api.delete(`/students/${id}`)
export const activateStudent = (id) => api.post(`/students/${id}/activate`)
export const changeStudentGroup = (id, groupId) => api.post(`/students/${id}/change-group`, { groupId })
export const getStudentDashboard = (id) => api.get(`/students/${id}/dashboard`)
export const getBarcodes = (params) => api.get('/students/barcodes/print', { params })

// Groups
export const getGroups = () => api.get('/groups')
export const createGroup = (data) => api.post('/groups', data)
export const getGroup = (id) => api.get(`/groups/${id}`)
export const updateGroup = (id, data) => api.put(`/groups/${id}`, data)
export const deleteGroup = (id) => api.delete(`/groups/${id}`)
export const getGroupStudents = (id) => api.get(`/groups/${id}/students`)

// --- Chat Archive ---
export const getArchivedMessages = async () => (await api.get('/chat/archived')).data
export const getStudentArchivedMessages = async (studentId) => (await api.get(`/chat/archived/${studentId}`)).data
export const deleteArchivedMessage = (id) => api.delete(`/chat/archived/${id}`)
export const deleteAllArchivedMessages = () => api.delete('/chat/archived')

// Sessions
export const getSessions = (params) => api.get('/sessions', { params })
export const createSession = (data) => api.post('/sessions', data)
export const getSession = (id) => api.get(`/sessions/${id}`)
export const updateSession = (id, data) => api.put(`/sessions/${id}`, data)
export const deleteSession = (id) => api.delete(`/sessions/${id}`)
export const toggleSessionActive = (id) => api.post(`/sessions/${id}/toggle-active`)
export const bulkCreateSessions = (data) => api.post('/sessions/bulk-create', data)
export const deleteMonthSessions = (groupId, year, month) => api.delete(`/sessions/month/${groupId}/${year}/${month}`)
export const deleteMonthLectures = (grade, year, month) => api.delete(`/sessions/month-by-grade/${encodeURIComponent(grade)}/${year}/${month}`)
export const getSessionAttendance = (id) => api.get(`/sessions/${id}/attendance`)
export const editSessionAttendance = (id, data) => api.post(`/sessions/${id}/attendance/edit`, data)
export const scanAttendance = (id, data) => api.post(`/sessions/${id}/attendance/scan`, data)
export const notifySession = (id, action) => api.post(`/sessions/${id}/notify`, { action })

// Payments
export const getPayments = (params) => api.get('/payments', { params })
export const reloadPayments = () => api.post('/payments/reload')
export const downloadPaymentsCSV = () => api.get('/payments/download-csv', { responseType: 'blob' })
export const addPayment = (studentId, data) => api.post(`/payments/${studentId}/add`, data)
export const getPaymentHistory = (studentId) => api.get(`/payments/${studentId}/history`)
export const deleteEachPayment = (id) => api.delete(`/payments/each/${id}`)

// Exams
export const getExams = (params) => api.get('/exams', { params })
export const createExam = (data) => api.post('/exams', data)
export const getExam = (id) => api.get(`/exams/${id}`)
export const updateExam = (id, data) => api.put(`/exams/${id}`, data)
export const deleteExam = (id) => api.delete(`/exams/${id}`)
export const getExamDegrees = (id) => api.get(`/exams/${id}/degrees`)
export const editExamDegrees = (id, data) => api.post(`/exams/${id}/degrees/edit`, data)
export const notifyExamGrades = (id) => api.post(`/exams/${id}/notify`)

// Books
export const getBooks = () => api.get('/books')
export const createBook = (data) => api.post('/books', data)
export const deleteBook = (id) => api.delete(`/books/${id}`)
export const getBookings = (params) => api.get('/books/bookings', { params })
export const toggleBooking = (data) => api.post('/books/bookings/toggle', data)
export const toggleDelivery = (data) => api.post('/books/bookings/deliver', data)
export const setBookBookingDiscount = (data) => api.post('/books/bookings/discount', data)

// Offers
export const getOffers = () => api.get('/offers')
export const createOffer = (data) => api.post('/offers', data)
export const deleteOffer = (id) => api.delete(`/offers/${id}`)

// Search
export const globalSearch = (q) => api.get('/search', { params: { q } })

// Chat / WhatsApp
export const getChatConversations = (params) => api.get('/chat/conversations', { params })
export const getChatConversationsSummary = () => api.get('/chat/conversations/summary')
export const getRecentChatMessages = (params) => api.get('/chat/recent', { params })
export const getChatStudents = (params) => api.get('/chat/students', { params })
export const getChatMessages = (params) => api.get('/chat/messages', { params })
export const markChatMessagesSeen = (data) => api.post('/chat/messages/mark-seen', data)
export const deleteChatMessages = (params) => api.delete('/chat/messages', { params })
export const getUnknownChatMessages = (params) => api.get('/chat/unknown', { params })
export const getChatWebhookEvents = () => api.get('/chat/webhook/events')
export const sendChatMessage = (data) => api.post('/chat/messages/send', data)

// Teacher
export const getTeacherDashboard = () => api.get('/teacher/dashboard')

// Assistant
export const getAssistantInfo = () => api.get('/assistant/info')

// Admin
export const getAdminStats = () => api.get('/admin/stats')

// Notification Templates (DB-stored text templates)
export const getNotificationTemplates = () => api.get('/notification-templates')
export const createNotificationTemplate = (data) => api.post('/notification-templates', data)
export const updateNotificationTemplate = (id, data) => api.put(`/notification-templates/${id}`, data)
export const deleteNotificationTemplate = (id) => api.delete(`/notification-templates/${id}`)
export const testSendNotificationTemplate = (id, data) => api.post(`/notification-templates/${id}/test-send`, data)

// Notifications (bulk send)
export const getNotificationsStatus = () => api.get('/notifications/status')
export const sendAttendanceNotification = (sessionId, data) => api.post(`/notifications/attendance/${sessionId}`, data)
export const sendExamNotification = (examId, data) => api.post(`/notifications/exam/${examId}`, data)
export const sendSessionNotification = (sessionId, action, data) => api.post(`/notifications/session/${sessionId}/${action}`, data)

export default api
