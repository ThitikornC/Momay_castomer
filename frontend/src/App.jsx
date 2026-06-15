import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast.jsx'
import MomayRelationshipLayer from './pages/MomayRelationshipLayer.jsx'
import Settings from './pages/Settings.jsx'
import CamView from './pages/CamView.jsx'
import CheckIn from './pages/CheckIn.jsx'

const HOME = import.meta.env.VITE_HOME || '/momaymodel'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/momaymodel" element={<MomayRelationshipLayer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/cam" element={<CamView />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
