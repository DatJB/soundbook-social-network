import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { RoomSessionProvider } from './context/RoomSessionContext';
import { MusicPlayerProvider } from './context/MusicPlayerContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GOOGLE_CLIENT_ID } from './config/env';

import Layout from './components/layout/Layout';
import Onboarding from './pages/Onboarding';
import TasteSettings from './pages/TasteSettings';
import Newsfeed from './pages/Newsfeed';
import Profile from './pages/Profile';
import FriendsPage from './pages/FriendsPage';
import Discovery from './pages/Discovery';
import LiveSyncRoom from './pages/LiveSyncRoom';
import Chat from './pages/Chat';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import { getCurrentUser, isAdminRole, isLoggedIn, resolveHomePath } from './services/auth';

const NotFound = () => <div className="min-h-screen grid flex-col items-center justify-center">404 Not Found</div>;

const PublicOnlyRoute = () => {
  const user = getCurrentUser();
  if (isLoggedIn() && user?.role) {
    return <Navigate to={resolveHomePath(user.role)} replace />;
  }
  return <Outlet />;
};

const RequireAuth = () => {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

const RequireAdmin = () => {
  const user = getCurrentUser();
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!isAdminRole(user?.role)) return <Navigate to="/feed" replace />;
  return <Outlet />;
};

import { ToastProvider } from './context/ToastContext';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            {/* RoomSessionProvider at root: one STOMP connection, survives navigation */}
            <RoomSessionProvider>
            <MusicPlayerProvider>
            <Router>
              <Routes>
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/login" element={<Login />} />
                </Route>

                <Route element={<RequireAuth />}>
                  <Route path="/onboarding" element={<Onboarding />} />

                  <Route element={<RequireAdmin />}>
                    <Route path="/admin" element={<AdminDashboard />} />
                  </Route>

                  <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/feed" replace />} />
                    <Route path="/feed" element={<Newsfeed />} />
                    <Route path="/discovery" element={<Discovery />} />
                    <Route path="/taste-settings" element={<TasteSettings />} />
                    <Route path="/profile/:id" element={<Profile />} />
                    <Route path="/profile/:id/friends" element={<FriendsPage />} />
                    <Route path="/room/:id" element={<LiveSyncRoom />} />
                    <Route path="/chat" element={<Chat />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
            </MusicPlayerProvider>
          </RoomSessionProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  </GoogleOAuthProvider>
  );
}

export default App;