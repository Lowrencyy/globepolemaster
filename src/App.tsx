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
import TeardownLogs from './pages/reports/TeardownLogs'
import TeardownLogDetail from './pages/reports/TeardownLogDetail'
import Teams from './pages/subcontractors/Teams'
import SubconUsers from './pages/subcontractors/SubconUsers'
import LoadingScreen from './pages/LoadingScreen'
import Sitelist from './pages/sites/Sitelist'
import SiteDetail from './pages/sites/SiteDetail'
import NodeDetail from './pages/nodes/NodeDetail'
import SpanList from './pages/spans/SpanList'
import Users from './pages/users/Users'
import Profile from './pages/users/Profile'
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

function SitelistPage() {
  return <Layout><Sitelist/></Layout>
}

function SiteDetailPage() {
  return <Layout><SiteDetail /></Layout>
}

function NodeDetailPage() {
  return <Layout><NodeDetail /></Layout>
}

function SpanListPage() {
  return <Layout><SpanList /></Layout>
}

function UsersPage() {
  return <Layout><Users /></Layout>
}

function ProfilePage() {
  return <Layout><Profile /></Layout>
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

function TeardownLogsPage() {
  return <Layout><TeardownLogs /></Layout>
}

function TeardownLogDetailPage() {
  return <Layout><TeardownLogDetail /></Layout>
}

function TeamsPage() {
  return <Layout><Teams /></Layout>
}

function SubconUsersPage() {
  return <Layout><SubconUsers /></Layout>
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
        <Route path="/reports/teardown-logs" element={<ProtectedRoute><TeardownLogsPage /></ProtectedRoute>} />
        <Route path="/reports/teardown-logs/:id" element={<ProtectedRoute><TeardownLogDetailPage /></ProtectedRoute>} />
        <Route path="/subcontractors/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
        <Route path="/subcontractors/users" element={<ProtectedRoute><SubconUsersPage /></ProtectedRoute>} />
        <Route path='/sites' element={<ProtectedRoute><SitelistPage /></ProtectedRoute>} />
        <Route path='/sites/:siteSlug' element={<ProtectedRoute><SiteDetailPage /></ProtectedRoute>} />
        <Route path='/sites/:siteSlug/nodes/:nodeSlug' element={<ProtectedRoute><NodeDetailPage /></ProtectedRoute>} />
        <Route path='/spans' element={<ProtectedRoute><SpanListPage /></ProtectedRoute>} />
        <Route path='/users' element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
        <Route path='/users/profile' element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      
    </BrowserRouter >
  )
}
