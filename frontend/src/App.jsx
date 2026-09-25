import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useRef, useEffect } from 'react'
import { Toast } from 'primereact/toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TeacherDashboardPage = lazy(() => import('./pages/TeacherDashboardPage'))
const AssistantInfoPage = lazy(() => import('./pages/AssistantInfoPage'))
const StudentsPage = lazy(() => import('./pages/StudentsPage'))
const StudentDashboardPage = lazy(() => import('./pages/StudentDashboardPage'))
const GroupsPage = lazy(() => import('./pages/GroupsPage'))
const GroupStudentsPage = lazy(() => import('./pages/GroupStudentsPage'))
const SessionsPage = lazy(() => import('./pages/SessionsPage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'))
const PaymentHistoryPage = lazy(() => import('./pages/PaymentHistoryPage'))
const ExamsPage = lazy(() => import('./pages/ExamsPage'))
const ExamDegreesPage = lazy(() => import('./pages/ExamDegreesPage'))
const BooksPage = lazy(() => import('./pages/BooksPage'))
const QRCodesPage = lazy(() => import('./pages/QRCodesPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const AssistantsPage = lazy(() => import('./pages/AssistantsPage'))
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))



function ProtectedRoute({ children, teacherOnly = false, permission }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (teacherOnly && user.role !== 'teacher') return <Navigate to="/" replace />
  if (permission && user.role !== 'teacher' && !(Array.isArray(user.permissions) && user.permissions.includes(permission))) return <Navigate to="/" replace />
  return children
}

const LoadingSpinner = () => <div className="spinner-wrapper"><div className="spinner" /></div>

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSpinner />

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={
            user?.role === 'teacher'
              ? <Navigate to="/teacher-dashboard" replace />
              : <DashboardPage />
          } />
          <Route path="teacher-dashboard" element={<ProtectedRoute teacherOnly><TeacherDashboardPage /></ProtectedRoute>} />
          <Route path="admin" element={<ProtectedRoute teacherOnly><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="assistants" element={<ProtectedRoute teacherOnly><AssistantsPage /></ProtectedRoute>} />
          <Route path="assistant-info" element={<ProtectedRoute><AssistantInfoPage /></ProtectedRoute>} />

          <Route path="students" element={<ProtectedRoute permission="students"><StudentsPage /></ProtectedRoute>} />
          <Route path="students/:id/dashboard" element={<ProtectedRoute permission="students"><StudentDashboardPage /></ProtectedRoute>} />

          <Route path="groups" element={<ProtectedRoute permission="groups"><GroupsPage /></ProtectedRoute>} />
          <Route path="groups/:id/students" element={<ProtectedRoute permission="groups"><GroupStudentsPage /></ProtectedRoute>} />

          <Route path="sessions" element={<ProtectedRoute permission="sessions"><SessionsPage /></ProtectedRoute>} />
          <Route path="sessions/:id/attendance" element={<ProtectedRoute permission="attendance"><AttendancePage /></ProtectedRoute>} />

          <Route path="payments" element={<ProtectedRoute permission="payments"><PaymentsPage /></ProtectedRoute>} />
          <Route path="payments/:id/history" element={<ProtectedRoute permission="payments"><PaymentHistoryPage /></ProtectedRoute>} />
          <Route path="expenses" element={<ProtectedRoute permission="payments"><ExpensesPage /></ProtectedRoute>} />


          <Route path="exams" element={<ProtectedRoute permission="exams"><ExamsPage /></ProtectedRoute>} />
          <Route path="exams/:id/degrees" element={<ProtectedRoute permission="exams"><ExamDegreesPage /></ProtectedRoute>} />

          <Route path="books" element={<ProtectedRoute permission="books"><BooksPage /></ProtectedRoute>} />
          <Route path="qrcodes" element={<ProtectedRoute permission="students"><QRCodesPage /></ProtectedRoute>} />
          <Route path="search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  const toast = useRef(null)

  useEffect(() => {
    const handleError = (e) => {
      if (toast.current) {
        toast.current.show({ severity: 'error', summary: 'خطأ', detail: e.detail || 'حدث خطأ غير متوقع', life: 5000 })
      }
    }
    const handleAuthError = () => {
      if (window.location.pathname !== '/login') {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }

    window.addEventListener('api-error', handleError)
    window.addEventListener('api-auth-error', handleAuthError)

    return () => {
      window.removeEventListener('api-error', handleError)
      window.removeEventListener('api-auth-error', handleAuthError)
    }
  }, [])

  return (
    <AuthProvider>
      <Toast ref={toast} position="bottom-left" />
      <AppRoutes />
    </AuthProvider>
  )
}
