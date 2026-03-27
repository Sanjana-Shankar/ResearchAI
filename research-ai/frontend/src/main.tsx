import ReactDOM from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import App from './App'
import './index.css'

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Auth0Provider
    domain={domain}
    clientId={clientId}
    authorizationParams={{
      redirect_uri: import.meta.env.VITE_AUTH0_CALLBACK_URL ?? `${window.location.origin}/callback`,
    }}
    onRedirectCallback={(appState) => {
      window.location.replace(appState?.returnTo ?? '/select')
    }}
  >
    <App />
  </Auth0Provider>
)
