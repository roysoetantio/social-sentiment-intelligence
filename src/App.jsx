import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import AuthGate from './components/auth/AuthGate'
import { DashboardProvider } from './context/DashboardContext'
import Layout from './components/layout/Layout'
import Overview from './pages/Overview'
import MentionsExplorer from './pages/MentionsExplorer'
import SentimentAnalytics from './pages/SentimentAnalytics'
import KeywordManager from './pages/KeywordManager'
import More from './pages/More'
import UserManagement from './pages/UserManagement'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate>
            <DashboardProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/mentions" element={<MentionsExplorer />} />
                  <Route path="/analytics" element={<SentimentAnalytics />} />
                  <Route path="/keywords" element={<KeywordManager />} />
                  <Route path="/more" element={<More />} />
                  <Route path="/admin" element={<UserManagement />} />
                </Routes>
              </Layout>
            </DashboardProvider>
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
