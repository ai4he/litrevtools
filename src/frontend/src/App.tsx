import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { GoogleAuth } from './components/GoogleAuth';
import { SearchPage } from './pages/SearchPage';
import ProjectsDashboard from './components/ProjectsDashboard';
import ProjectPageEnhanced from './components/ProjectPageEnhanced';
import { User } from './types';
import { FolderOpen, Search } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {!user ? (
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="max-w-md w-full">
              <GoogleAuth onAuthChange={setUser} />
            </div>
          </div>
        ) : (
          <div>
            {/* Header with user info and navigation */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <h1 className="text-xl font-bold text-gray-800">LitRevTools</h1>
                    <nav className="flex gap-4">
                      <Link
                        to="/projects"
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <FolderOpen size={18} />
                        Projects
                      </Link>
                      <Link
                        to="/search"
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <Search size={18} />
                        Quick Search
                      </Link>
                    </nav>
                  </div>
                  <GoogleAuth onAuthChange={setUser} />
                </div>
              </div>
            </div>

            {/* Main content */}
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects" element={<ProjectsDashboard />} />
              <Route path="/projects/:id" element={<ProjectPageEnhanced />} />
              <Route path="/search" element={<SearchPage />} />
            </Routes>
          </div>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
