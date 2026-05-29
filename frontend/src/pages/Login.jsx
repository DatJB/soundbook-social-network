import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Lock, User, ArrowRight, Disc3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { GoogleLogin } from '@react-oauth/google';
import { isGoogleAuthConfigured } from '../config/env';
import {
  canSwitchAccount,
  getCurrentUser,
  getStoredAuth,
  isAdminRole,
  login,
  loginWithGoogle,
  register,
  resolveHomePath,
} from '../services/auth';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', username: '', password: '', displayName: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { showToast } = useToast();

  const currentSession = useMemo(() => getStoredAuth(), []);
  const currentUser = currentSession?.user || getCurrentUser();
  const sessionLocked = !canSwitchAccount();

  useEffect(() => {
    if (currentSession?.token && currentSession?.user?.role) {
      navigate(resolveHomePath(currentSession.user.role), { replace: true });
    }
  }, [currentSession, navigate]);

  const handleGoogleLogin = async (idToken) => {
    if (!idToken) {
      showToast('Google không trả về ID token hợp lệ. Vui lòng thử lại.', 'error');
      return;
    }

    if (sessionLocked) {
      showToast(`Bạn đang đăng nhập bằng ${currentUser?.displayName || currentUser?.email}. Hãy logout trước khi đăng nhập tài khoản khác.`, 'warning');
      return;
    }

    setLoading(true);

    try {
      const result = await loginWithGoogle(idToken);
      const userRole = result?.data?.role;
      const shouldGoHome = isAdminRole(userRole) || result?.data?.onboardingCompleted;
      navigate(shouldGoHome ? resolveHomePath(userRole) : '/onboarding', { replace: true });
    } catch (error) {
      console.error('Lỗi đăng nhập Google:', error);
      showToast(error.message || 'Đăng nhập Google thất bại.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (sessionLocked) {
      showToast(`Bạn đang đăng nhập bằng ${currentUser?.displayName || currentUser?.email}. Hãy logout trước khi đăng nhập tài khoản khác.`, 'warning');
      return;
    }

    setIsLogin(!isLogin);
    setFormData({ email: '', username: '', password: '', displayName: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (sessionLocked) {
      showToast(`Bạn đang đăng nhập bằng ${currentUser?.displayName || currentUser?.email}. Hãy logout trước khi đăng nhập tài khoản khác.`, 'warning');
      return;
    }

    setLoading(true);

    try {
      const result = isLogin
          ? await login({
            email: formData.email,
            password: formData.password,
          })
          : await register({
            email: formData.email,
            password: formData.password,
            displayName: formData.displayName || formData.username,
          });

      const userRole = result?.data?.role;
      const shouldGoHome = isAdminRole(userRole) || result?.data?.onboardingCompleted;
      navigate(shouldGoHome ? resolveHomePath(userRole) : '/onboarding', { replace: true });
    } catch (error) {
      if (!isLogin && error?.status === 400 && String(error.message || '').toLowerCase().includes('email')) {
        setIsLogin(true);
        showToast('Email này đã tồn tại. Mình đã chuyển sang chế độ đăng nhập, bạn hãy nhập mật khẩu để đăng nhập.', 'info');
      } else {
        console.error('Lỗi kết nối:', error);
        showToast(error.message || 'Thao tác thất bại. Vui lòng kiểm tra lại.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen bg-bg-color text-text-color flex flex-col md:flex-row">
        <div className="hidden md:flex md:w-1/2 relative bg-gradient-to-br from-primary-600 via-purple-700 to-black overflow-hidden items-center justify-center p-12">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-fuchsia-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-yellow-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000" />

          <div className="relative z-10 text-white max-w-lg">
            <div className="flex items-center gap-4 mb-8">
              <div className="bg-white/90 p-2 rounded-2xl shadow-xl backdrop-blur-sm transform hover:scale-105 transition-transform">
                <img src="/sb1.png" alt="Logo" className="h-8 sm:h-10 object-contain" />
              </div>
              <h1 className="text-4xl font-black tracking-tight drop-shadow-md">Soundbook</h1>
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-primary-600 animate-[spin_10s_linear_infinite] shrink-0 shadow-lg ml-1">
                <Disc3 size={28} />
              </div>
            </div>
            <h2 className="text-5xl font-bold leading-tight mb-6">{t('login.branding_tagline')}</h2>
            <p className="text-xl text-white/80 font-medium">{t('login.branding_desc')}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-24 relative">
          <div className="w-full max-sm relative z-10">
            <div className="mb-10 text-center md:text-left">
              <div className="md:hidden flex flex-wrap items-center justify-center gap-3 mb-6 text-primary-500">
                <div className="bg-white/90 p-1.5 rounded-xl shadow-md border border-gray-100 dark:border-gray-800">
                  <img src="/sb1.png" alt="Logo" className="h-7 object-contain" />
                </div>
                <span className="text-2xl font-black">Soundbook</span>
                <Disc3 size={32} className="animate-[spin_10s_linear_infinite] shrink-0 drop-shadow-sm ml-1" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                {isLogin ? t('login.welcome_back') : t('login.create_account')}
              </h2>
              <p className="text-text-muted">
                {isLogin ? t('login.signin_desc') : t('login.register_desc')}
              </p>
            </div>

            {sessionLocked && (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  Bạn đang đăng nhập bằng <strong>{currentUser?.displayName || currentUser?.email}</strong>. Hãy logout trước khi đăng nhập tài khoản khác.
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider ml-1">{t('login.label_username')}</label>
                    <div className="relative">
                      <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                          type="text"
                          required
                          disabled={loading || sessionLocked}
                          placeholder="johndoe"
                          className="w-full bg-surface-color border border-gray-200 dark:border-gray-800 rounded-xl py-3 pl-11 pr-4 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value, displayName: e.target.value })}
                      />
                    </div>
                  </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider ml-1">{t('login.label_email')}</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                      type="email"
                      required
                      disabled={loading || sessionLocked}
                      placeholder="name@example.com"
                      className="w-full bg-surface-color border border-gray-200 dark:border-gray-800 rounded-xl py-3 pl-11 pr-4 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider ml-1">{t('login.label_password')}</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                      type="password"
                      required
                      disabled={loading || sessionLocked}
                      placeholder="......"
                      className="w-full bg-surface-color border border-gray-200 dark:border-gray-800 rounded-xl py-3 pl-11 pr-4 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all text-sm mb-1 disabled:opacity-60 disabled:cursor-not-allowed"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>

              <button
                  type="submit"
                  disabled={loading || sessionLocked}
                  className={`w-full bg-primary-500 text-white rounded-xl py-3 font-semibold shadow-lg shadow-primary-500/30 hover:bg-primary-600 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 mt-4 ${(loading || sessionLocked) ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLogin ? t('login.signin_btn') : t('login.register_btn')}
                <ArrowRight size={18} />
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              <span className="text-xs text-text-muted uppercase font-semibold">{t('login.or_continue')}</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            </div>

            <div className="flex justify-center w-full">
              {isGoogleAuthConfigured ? (
                <div className={sessionLocked ? 'pointer-events-none opacity-60' : ''}>
                  <GoogleLogin
                      onSuccess={(credentialResponse) => {
                        handleGoogleLogin(credentialResponse?.credential);
                      }}
                      onError={() => {
                        showToast('Đăng nhập Google thất bại. Vui lòng thử lại.', 'error');
                      }}
                      type="standard"
                      shape="pill"
                      theme="filled_blue"
                      text="continue_with"
                      size="large"
                      logo_alignment="left"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
                  Chưa cấu hình Google Client ID cho frontend.
                </div>
              )}
            </div>

            <p className="mt-8 text-center text-sm text-text-muted">
              {isLogin ? `${t('login.no_account')} ` : `${t('login.have_account')} `}
              <button
                  onClick={handleToggle}
                  disabled={sessionLocked}
                  className="text-primary-500 font-semibold hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {isLogin ? t('login.signup_link') : t('login.login_link')}
              </button>
            </p>
          </div>

          <div className="absolute bottom-6 left-0 w-full flex items-center justify-center gap-1 text-sm">
            <button onClick={() => setLanguage('vi')} className={`px-2 py-1 rounded-lg transition-colors font-medium ${language === 'vi' ? 'text-primary-500 font-semibold' : 'text-text-muted hover:text-text-color'}`}>Tiếng Việt</button>
            <span className="text-text-muted">|</span>
            <button onClick={() => setLanguage('en')} className={`px-2 py-1 rounded-lg transition-colors font-medium ${language === 'en' ? 'text-primary-500 font-semibold' : 'text-text-muted hover:text-text-color'}`}>English (UK)</button>
          </div>
        </div>
      </div>
  );
};

export default Login;