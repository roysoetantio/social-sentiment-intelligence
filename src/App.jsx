import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import AuthGate from './components/auth/AuthGate'
import { DashboardProvider } from './context/DashboardContext'
import { SocialFilterProvider } from './context/SocialFilterContext'
import Layout from './components/layout/Layout'
import Overview from './pages/Overview'
import MentionsExplorer from './pages/MentionsExplorer'
import SentimentAnalytics from './pages/SentimentAnalytics'
import KeywordManager from './pages/KeywordManager'
import SocialFeed from './pages/SocialFeed'
import SocialFeedFacebook from './pages/SocialFeedFacebook'
import More from './pages/More'
import UserManagement from './pages/UserManagement'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate>
            <DashboardProvider>
              <SocialFilterProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/mentions" element={<MentionsExplorer />} />
                  <Route path="/analytics" element={<SentimentAnalytics />} />
                  <Route path="/keywords" element={<KeywordManager />} />
                  {/* /social kept as an alias — older links and the mobile More page point at it */}
                  <Route path="/social" element={<Navigate to="/social/instagram" replace />} />
                  <Route path="/social/instagram" element={<SocialFeed />} />
                  <Route path="/social/facebook" element={<SocialFeedFacebook />} />
                  <Route path="/more" element={<More />} />
                  <Route path="/admin" element={<UserManagement />} />
                </Routes>
              </Layout>
              </SocialFilterProvider>
            </DashboardProvider>
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
