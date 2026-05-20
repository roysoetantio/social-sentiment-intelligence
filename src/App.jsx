import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DashboardProvider } from './context/DashboardContext'
import Layout from './components/layout/Layout'
import Overview from './pages/Overview'
import MentionsExplorer from './pages/MentionsExplorer'
import SentimentAnalytics from './pages/SentimentAnalytics'
import KeywordManager from './pages/KeywordManager'

export default function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/mentions" element={<MentionsExplorer />} />
            <Route path="/analytics" element={<SentimentAnalytics />} />
            <Route path="/keywords" element={<KeywordManager />} />
          </Routes>
        </Layout>
      </DashboardProvider>
    </BrowserRouter>
  )
}
