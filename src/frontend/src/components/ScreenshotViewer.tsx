import React, { useState } from 'react';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';

interface ScreenshotViewerProps {
  screenshot?: string;
  title?: string;
}

export const ScreenshotViewer: React.FC<ScreenshotViewerProps> = ({
  screenshot,
  title = 'Browser Screenshot',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!screenshot) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="bg-gray-100 rounded-lg h-64 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <RefreshCw className="mx-auto mb-2 animate-spin" size={32} />
            <p>Waiting for screenshot...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={toggleExpand}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>

        <div className="relative bg-gray-100 rounded-lg overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <RefreshCw className="animate-spin text-gray-500" size={32} />
            </div>
          )}
          <img
            src={screenshot}
            alt="Browser screenshot"
            className="w-full h-auto"
            onLoad={handleImageLoad}
            onError={handleImageLoad}
          />
        </div>

        <p className="text-xs text-gray-500 mt-2">
          Latest screenshot from headless browser
        </p>
      </div>

      {/* Expanded Modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4"
          onClick={toggleExpand}
        >
          <div className="relative max-w-7xl w-full max-h-full overflow-auto">
            <button
              onClick={toggleExpand}
              className="absolute top-4 right-4 p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors z-10"
            >
              <Minimize2 size={24} />
            </button>
            <img
              src={screenshot}
              alt="Browser screenshot (expanded)"
              className="w-full h-auto rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
};
