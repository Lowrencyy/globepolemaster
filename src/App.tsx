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
import Subcontractors from './pages/subcontractors/Subcontractors'
import SubcontractorDetail from './pages/subcontractors/SubcontractorDetail'
import TeamDetail from './pages/subcontractors/TeamDetail'
import SubcontractorTeams from './pages/subcontractors/SubcontractorTeams'
import LoadingScreen from './pages/LoadingScreen'
import Sitelist from './pages/sites/Sitelist'
import SiteDetail from './pages/sites/SiteDetail'
import NodeDetail from './pages/nodes/NodeDetail'
import NodeSpans from './pages/nodes/NodeSpans'
import NodePolesList from './pages/nodes/NodePolesList'
import Users from './pages/users/Users'
import Profile from './pages/users/Profile'
import SpanList from './pages/spans/SpanList'
import DailyReports from './pages/reports/DailyReports'
import NodeDailyReport from './pages/reports/NodeDailyReport'
import RTDReports from './pages/reports/RTDReports'
import NodeRTDReport from './pages/reports/NodeRTDReport'
import VicinityReports from './pages/reports/VicinityReports'
import NodeVicinityMap from './pages/reports/NodeVicinityMap'
import PoleReports from './pages/reports/PoleReports'
import NodePoleReport from './pages/reports/NodePoleReport'
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

function ProfilePage() {
  return <Layout><Profile/></Layout>
}

function DailyReportPage(){
  return <Layout><DailyReports /></Layout>
}

function NodeDailyReportPage(){
  return <Layout><NodeDailyReport /></Layout>
}

function RTDReportsPage(){
  return <Layout><RTDReports /></Layout>
}

function NodeRTDReportPage(){
  return <Layout><NodeRTDReport /></Layout>
}

function VicinityReportsPage(){
  return <Layout><VicinityReports /></Layout>
}

function NodeVicinityMapPage(){
  return <Layout><NodeVicinityMap /></Layout>
}

function PoleReportsPage(){
  return <Layout><PoleReports /></Layout>
}

function NodePoleReportPage(){
  return <Layout><NodePoleReport /></Layout>
}

function SpanListPage() {
  return <Layout><SpanList/></Layout>
}

function UsersPage() {
  return <Layout><Users /></Layout>
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

function SitelistPage(){
  return <Layout><Sitelist/></Layout>
}

function SiteDetailPage() {
  return <Layout><SiteDetail /></Layout>
}

function NodeDetailPage() {
  return <Layout><NodeDetail /></Layout>
}

function NodeSpansPage() {
  return <Layout><NodeSpans /></Layout>
}

function NodePolesListPage() {
  return <Layout><NodePolesList /></Layout>
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

function SubcontractorsPage() {
  return <Layout><Subcontractors /></Layout>
}

function SubcontractorDetailPage() {
  return <Layout><SubcontractorDetail /></Layout>
}

function TeamDetailPage() {
  return <Layout><TeamDetail /></Layout>
}

function SubcontractorTeamsPage() {
  return <Layout><SubcontractorTeams /></Layout>
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
        <Route path="/subcontractors" element={<ProtectedRoute><SubcontractorsPage /></ProtectedRoute>} />
        <Route path="/subcontractors/:id" element={<ProtectedRoute><SubcontractorDetailPage /></ProtectedRoute>} />
        <Route path="/subcontractors/:id/teams" element={<ProtectedRoute><SubcontractorTeamsPage /></ProtectedRoute>} />
        <Route path="/subcontractors/:id/teams/:teamId" element={<ProtectedRoute><TeamDetailPage /></ProtectedRoute>} />
        <Route path="/subcontractors/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
        <Route path="/subcontractors/users" element={<ProtectedRoute><SubconUsersPage /></ProtectedRoute>} />
        <Route path='/sites' element={<ProtectedRoute><SitelistPage/></ProtectedRoute>}/>
        <Route path='/sites/:siteSlug' element={<ProtectedRoute><SiteDetailPage /></ProtectedRoute>} />
        <Route path='/sites/:siteSlug/nodes/:nodeSlug' element={<ProtectedRoute><NodeDetailPage /></ProtectedRoute>} />
        <Route path='/sites/:siteSlug/nodes/:nodeSlug/spans' element={<ProtectedRoute><NodeSpansPage /></ProtectedRoute>} />
        <Route path='/sites/:siteSlug/nodes/:nodeSlug/poles' element={<ProtectedRoute><NodePolesListPage /></ProtectedRoute>} />
        <Route path='/users' element={<ProtectedRoute><UsersPage/></ProtectedRoute>}/>
        <Route path='/spans' element={<ProtectedRoute><SpanListPage/></ProtectedRoute>}/>
        <Route path='/dailyreports' element={<ProtectedRoute><DailyReportPage/></ProtectedRoute>}/>
        <Route path='/reports/daily/:nodeId' element={<ProtectedRoute><NodeDailyReportPage/></ProtectedRoute>}/>
        <Route path='/reports/rtd' element={<ProtectedRoute><RTDReportsPage/></ProtectedRoute>}/>
        <Route path='/reports/rtd/:nodeId' element={<ProtectedRoute><NodeRTDReportPage/></ProtectedRoute>}/>
        <Route path='/reports/vicinity' element={<ProtectedRoute><VicinityReportsPage/></ProtectedRoute>}/>
        <Route path='/reports/vicinity/:nodeId' element={<ProtectedRoute><NodeVicinityMapPage/></ProtectedRoute>}/>
        <Route path='/reports/pole-reports' element={<ProtectedRoute><PoleReportsPage/></ProtectedRoute>}/>
        <Route path='/reports/pole-reports/:nodeId' element={<ProtectedRoute><NodePoleReportPage/></ProtectedRoute>}/>
        <Route path='/profiles' element={<ProtectedRoute><ProfilePage/></ProtectedRoute>}/>
      
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      
    </BrowserRouter >
  )
}
