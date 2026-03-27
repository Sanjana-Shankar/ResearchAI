import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import SelectModePage from './pages/SelectModePage'
import CallbackPage from './pages/CallbackPage'
import ResearchChatPage from './pages/ResearchChatPage'
import ProductChatPage from './pages/ProductChatPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/select" element={<ProtectedRoute><SelectModePage /></ProtectedRoute>} />
        <Route path="/research" element={<ProtectedRoute><ResearchChatPage /></ProtectedRoute>} />
        <Route path="/product" element={<ProtectedRoute><ProductChatPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
