import React, { useEffect, useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { User, LogOut } from 'lucide-react';
import { authAPI } from '../utils/api';
import { User as UserType } from '../types';

// Google Client ID from environment variable
// Note: Client ID is public and safe to expose in frontend code
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

interface GoogleAuthProps {
  onAuthChange?: (user: UserType | null) => void;
}

export const GoogleAuth: React.FC<GoogleAuthProps> = ({ onAuthChange }) => {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const currentUser = await authAPI.getCurrentUser();
        setUser(currentUser);
        onAuthChange?.(currentUser);
      } catch (error) {
        console.log('Not authenticated');
        setUser(null);
        onAuthChange?.(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      const response = await authAPI.googleLogin(credentialResponse.credential);
      const { user: userData, token } = response;

      // Store token in localStorage
      localStorage.setItem('authToken', token);

      setUser(userData);
      onAuthChange?.(userData);
    } catch (error: any) {
      console.error('Login failed:', error);
      alert(error.response?.data?.message || 'Login failed. Please try again.');
    }
  };

  const handleLoginError = () => {
    console.error('Google login failed');
    alert('Google login failed. Please try again.');
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      setUser(null);
      onAuthChange?.(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 flex-1">
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="text-primary-600" size={20} />
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="mb-6 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-primary-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome to LitRevTools</h3>
          <p className="text-gray-600">Sign in with your Google account or continue as guest</p>
        </div>
        {GOOGLE_CLIENT_ID && (
          <div className="mb-4">
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
              useOneTap={false}
              theme="outline"
              size="large"
              text="signin_with"
            />
          </div>
        )}
        <button
          onClick={() => {
            setUser({ id: 'guest', email: 'guest@local', name: 'Guest User' });
            onAuthChange?.({ id: 'guest', email: 'guest@local', name: 'Guest User' });
          }}
          className="px-6 py-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-primary-300"
        >
          Continue as Guest
        </button>
      </div>
    </GoogleOAuthProvider>
  );
};
