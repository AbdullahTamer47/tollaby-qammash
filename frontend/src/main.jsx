import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

// PrimeReact
import { PrimeReactProvider } from 'primereact/api'
import 'primereact/resources/themes/lara-dark-indigo/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrimeReactProvider value={{ ripple: true }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrimeReactProvider>
  </React.StrictMode>
)
