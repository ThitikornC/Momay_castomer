import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import Test from './pages/Test.jsx'
import Heatmap from './pages/Heatmap.jsx'
import Layer1 from './pages/Layer1.jsx'
import Layer11 from './pages/Layer1.1.jsx'
import LayerGreedy from './pages/LayerGreedy.jsx'
import LayerDP from './pages/LayerDP.jsx'

const HOME = import.meta.env.VITE_HOME || '/preview'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={HOME === '/' ? <Dashboard /> : <Navigate to={HOME} replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/test" element={<Test />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/layer1" element={<Layer1 />} />
          <Route path="/preview" element={<Layer11 />} />
          <Route path="/layer-greedy" element={<LayerGreedy />} />
          <Route path="/layer-dp" element={<LayerDP />} />
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
