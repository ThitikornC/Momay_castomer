import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LayerGreedy from './pages/LayerGreedy.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<LayerGreedy />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
