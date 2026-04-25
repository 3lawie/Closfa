import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ImageKitProvider } from '@imagekit/react'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImageKitProvider urlEndpoint='https://ik.imagekit.io/9npwwo7fb/'>
      <App />
    </ImageKitProvider>

  </StrictMode>
)
