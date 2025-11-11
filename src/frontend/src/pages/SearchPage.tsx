import React, { useState } from 'react';
import { Step1Search } from '../components/Step1Search';
import { Step2SemanticFiltering } from '../components/Step2SemanticFiltering';
import { Step3LatexGeneration } from '../components/Step3LatexGeneration';
import { useSocket } from '../hooks/useSocket';

export const SearchPage: React.FC = () => {
  const [step1SessionId, setStep1SessionId] = useState<string | null>(null);
  const [step1Complete, setStep1Complete] = useState(false);
  const [step2Complete, setStep2Complete] = useState(false);
  const { isConnected } = useSocket();

  const handleStep1Complete = (sessionId: string, _rawData: any[]) => {
    console.log('[SearchPage] Step 1 completed:', sessionId);
    setStep1SessionId(sessionId);
    setStep1Complete(true);
  };

  const handleStep2Complete = (sessionId: string, _labeledData: any[]) => {
    console.log('[SearchPage] Step 2 completed:', sessionId);
    setStep2Complete(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">LitRevTools</h1>
          <p className="text-gray-600 mb-4">
            AI-Powered Systematic Literature Review Tool with PRISMA Methodology
          </p>

          {/* Workflow Overview */}
          <div className="flex items-center gap-4 p-4 bg-white border-2 border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step1Complete ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  1
                </div>
                <span className="text-sm font-medium">Search & Extract</span>
              </div>
            </div>
            <div className="text-gray-300">→</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step2Complete ? 'bg-green-100 text-green-600' :
                  step1Complete ? 'bg-yellow-100 text-yellow-600' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  2
                </div>
                <span className={`text-sm font-medium ${!step1Complete ? 'text-gray-400' : ''}`}>
                  Semantic Filtering
                </span>
              </div>
            </div>
            <div className="text-gray-300">→</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step1Complete ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  3
                </div>
                <span className={`text-sm font-medium ${!step1Complete ? 'text-gray-400' : ''}`}>
                  LaTeX Generation
                </span>
              </div>
            </div>
          </div>

          {!isConnected && (
            <div className="mt-4 px-3 py-1 bg-yellow-100 text-yellow-800 rounded inline-block text-sm">
              Connecting to server...
            </div>
          )}
        </div>

        {/* Three-Step Workflow */}
        <div className="space-y-8">
          {/* Step 1: Search & Raw Data Extraction */}
          <Step1Search
            onSearchComplete={handleStep1Complete}
            disabled={false}
          />

          {/* Step 2: Semantic Filtering */}
          <Step2SemanticFiltering
            sessionId={step1SessionId}
            enabled={step1Complete}
            onFilteringComplete={handleStep2Complete}
          />

          {/* Step 3: LaTeX Generation */}
          <Step3LatexGeneration
            sessionId={step1SessionId}
            enabled={step1Complete}
          />
        </div>

        {/* Info Box */}
        <div className="mt-8 p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
          <ol className="space-y-2 text-sm text-blue-800">
            <li><strong>Step 1:</strong> Search Semantic Scholar and download raw CSV with keyword-based exclusions.</li>
            <li><strong>Step 2:</strong> Apply LLM-based semantic filtering with custom inclusion/exclusion criteria. You can use Step 1 results or upload your own CSV.</li>
            <li><strong>Step 3:</strong> Generate complete LaTeX paper with PRISMA methodology. You can use results from Step 1, Step 2, or upload your own CSV.</li>
          </ol>
          <p className="mt-4 text-sm text-blue-700">
            <strong>Note:</strong> Steps 2 and 3 become available after completing Step 1, or you can skip ahead by uploading your own CSV files.
          </p>
        </div>
      </div>
    </div>
  );
};
