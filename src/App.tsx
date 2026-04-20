import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import DashboardPage from './pages/Dashboard'
import AllPoles from './pages/poles/AllPoles'
import PoleMapView from './pages/poles/PoleMapView'
import AllNapBoxes from './pages/nap/AllNapBoxes'
import SlotStatus from './pages/nap/SlotStatus'
import NapBoxDetail from './pages/nap/NapBoxDetail'
import PoleAudit from './pages/poleaudit/PoleAudit'
import LiveTeardown from './pages/field/LiveTeardown'
import LoadingScreen from './pages/LoadingScreen'
import { isAuthenticated } from './lib/auth'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Dashboard() {
  return (
    <Layout>
      <DashboardPage />
    </Layout>
  )
}

function PoleAuditPage() {
  return <Layout><PoleAudit /></Layout>
}

function LiveTeardownPage() {
  return <Layout><LiveTeardown /></Layout>
}

function AllPolesPage() {
  return <Layout><AllPoles /></Layout>
}

function PoleMapViewPage() {
  return <Layout><PoleMapView /></Layout>
}



function AllNapBoxesPage() {
  return <Layout><AllNapBoxes /></Layout>
}

function NapBoxDetailPage() {
  return <Layout><NapBoxDetail /></Layout>
}

function SlotStatusPage() {
  return <Layout><SlotStatus /></Layout>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/loading" element={<ProtectedRoute><LoadingScreen /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/poles/all" element={<ProtectedRoute><AllPolesPage /></ProtectedRoute>} />
        <Route path="/poles/map" element={<ProtectedRoute><PoleMapViewPage /></ProtectedRoute>} />
        <Route path="/nap/boxes" element={<ProtectedRoute><AllNapBoxesPage /></ProtectedRoute>} />
        <Route path="/nap/boxes/:id" element={<ProtectedRoute><NapBoxDetailPage /></ProtectedRoute>} />
        <Route path="/nap/slot-status" element={<ProtectedRoute><SlotStatusPage /></ProtectedRoute>} />
        <Route path="/polereports/poleAudit" element={<ProtectedRoute><PoleAuditPage /></ProtectedRoute>} />
        <Route path="/field/live" element={<ProtectedRoute><LiveTeardownPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      
    </BrowserRouter >
  )
}
