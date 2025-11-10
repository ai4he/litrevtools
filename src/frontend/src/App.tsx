import { useState } from 'react';
import { GoogleAuth } from './components/GoogleAuth';
import { SearchPage } from './pages/SearchPage';
import { User } from './types';

function App() {
  const [user, setUser] = useState<User | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      {!user ? (
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="max-w-md w-full">
            <GoogleAuth onAuthChange={setUser} />
          </div>
        </div>
      ) : (
        <div>
          {/* Header with user info */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <GoogleAuth onAuthChange={setUser} />
            </div>
          </div>

          {/* Main content */}
          <SearchPage />
        </div>
      )}
    </div>
  );
}

export default App;
