import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from '@/App.jsx'
import '@/index.css'
import { installAppResumeHandlers } from '@/lib/appResume'

registerSW({ immediate: true })
installAppResumeHandlers()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
