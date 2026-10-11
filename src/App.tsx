import { Toaster } from 'react-hot-toast';
import Navigation from './Navigation/Routing';
import { ModalProvider } from './Context/Modal';
import { useEffect } from 'react';
import { initializeSocket } from './service/socket';
import { AuthProvider } from './Context/Auth';
import Alert from './pages/Alert';
import ErrorPopupModal from './components/ErrorPopupModal';
import { initErrorInterceptor } from './utils/errorPopup';

// Initialize error interceptor so toast.error triggers modal popup
initErrorInterceptor();

function App() {
  useEffect(() => {
    initializeSocket();
  }, []);
  return (
    <AuthProvider>
      <ModalProvider>
        <Navigation />
        <Toaster
          position="top-center"
          containerStyle={{ zIndex: 999999 }}
          toastOptions={{
            duration: 4000,
            style: {
              fontSize: '13px',
              fontWeight: 500,
              padding: '12px 16px',
              borderRadius: '8px',
              maxWidth: '500px',
            },
            success: {
              duration: 3500,
            },
            error: {
              duration: 5000,
            },
          }}
        />
        <Alert />
        <ErrorPopupModal />
      </ModalProvider>
    </AuthProvider>
  );
}

export default App;


