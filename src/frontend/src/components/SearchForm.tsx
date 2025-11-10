import React, { useState } from 'react';
import { Search, Plus, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { SearchParameters } from '../types';
import { generateSearchName } from '../utils/helpers';

interface SearchFormProps {
  onSubmit: (params: SearchParameters) => void;
  disabled?: boolean;
}

const DEFAULT_INCLUSION_SUGGESTIONS = ['large language model', 'mathematical reasoning'];
const DEFAULT_EXCLUSION_SUGGESTIONS = ['survey', 'review'];

export const SearchForm: React.FC<SearchFormProps> = ({ onSubmit, disabled = false }) => {
  const [name, setName] = useState('');
  const [inclusionKeywords, setInclusionKeywords] = useState<string[]>([]);
  const [exclusionKeywords, setExclusionKeywords] = useState<string[]>([]);
  const [currentInclusion, setCurrentInclusion] = useState('');
  const [currentExclusion, setCurrentExclusion] = useState('');
  const [startYear, setStartYear] = useState<string>('');
  const [endYear, setEndYear] = useState<string>('');
  const [maxResults, setMaxResults] = useState<string>('');

  // LLM Configuration
  const [showLLMConfig, setShowLLMConfig] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'openai' | 'anthropic'>('gemini');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBatchSize, setLlmBatchSize] = useState('10');
  const [llmTemperature, setLlmTemperature] = useState('0.3');

  const addKeyword = (type: 'inclusion' | 'exclusion', keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    if (type === 'inclusion' && !inclusionKeywords.includes(trimmed)) {
      setInclusionKeywords([...inclusionKeywords, trimmed]);
      setCurrentInclusion('');
    } else if (type === 'exclusion' && !exclusionKeywords.includes(trimmed)) {
      setExclusionKeywords([...exclusionKeywords, trimmed]);
      setCurrentExclusion('');
    }
  };

  const removeKeyword = (type: 'inclusion' | 'exclusion', keyword: string) => {
    if (type === 'inclusion') {
      setInclusionKeywords(inclusionKeywords.filter((k) => k !== keyword));
    } else {
      setExclusionKeywords(exclusionKeywords.filter((k) => k !== keyword));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (inclusionKeywords.length === 0) {
      alert('Please add at least one inclusion keyword');
      return;
    }

    const params: SearchParameters = {
      name: name.trim() || generateSearchName(),
      inclusionKeywords,
      exclusionKeywords,
      ...(startYear && { startYear: parseInt(startYear) }),
      ...(endYear && { endYear: parseInt(endYear) }),
      ...(maxResults && { maxResults: parseInt(maxResults) }),
      llmConfig: llmEnabled ? {
        enabled: true,
        provider: llmProvider,
        apiKey: llmApiKey.trim() || undefined,
        batchSize: parseInt(llmBatchSize) || 10,
        maxConcurrentBatches: 3,
        timeout: 30000,
        retryAttempts: 3,
        temperature: parseFloat(llmTemperature) || 0.3,
      } : {
        enabled: false,
        provider: 'gemini',
        batchSize: 10,
        maxConcurrentBatches: 3,
        timeout: 30000,
        retryAttempts: 3,
        temperature: 0.3,
      },
    };

    onSubmit(params);
  };

  const renderKeywordInput = (
    type: 'inclusion' | 'exclusion',
    currentValue: string,
    setCurrentValue: (value: string) => void,
    keywords: string[],
    suggestions: string[]
  ) => (
    <div>
      <label className="label">
        {type === 'inclusion' ? 'Inclusion Keywords' : 'Exclusion Keywords'}
        {type === 'inclusion' && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Keyword tags */}
      <div className="flex flex-wrap gap-2 mb-2">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm"
          >
            {keyword}
            <button
              type="button"
              onClick={() => removeKeyword(type, keyword)}
              className="hover:text-primary-600"
              disabled={disabled}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      {/* Input field */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addKeyword(type, currentValue);
            }
          }}
          placeholder={`Type and press Enter to add ${type} keyword`}
          className="input-field"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => addKeyword(type, currentValue)}
          className="btn-secondary"
          disabled={disabled || !currentValue.trim()}
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-gray-600">Suggestions:</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => addKeyword(type, suggestion)}
            className="text-sm px-3 py-1 border border-gray-300 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
            disabled={disabled || keywords.includes(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Search className="text-primary-600" size={32} />
        <h2 className="text-2xl font-bold text-gray-900">New Literature Review</h2>
      </div>

      {/* Search Name */}
      <div>
        <label className="label">Search Name (optional)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Leave empty to auto-generate"
          className="input-field"
          disabled={disabled}
        />
        <p className="text-sm text-gray-500 mt-1">
          If not provided, a name will be generated automatically
        </p>
      </div>

      {/* Inclusion Keywords */}
      {renderKeywordInput(
        'inclusion',
        currentInclusion,
        setCurrentInclusion,
        inclusionKeywords,
        DEFAULT_INCLUSION_SUGGESTIONS
      )}

      {/* Exclusion Keywords */}
      {renderKeywordInput(
        'exclusion',
        currentExclusion,
        setCurrentExclusion,
        exclusionKeywords,
        DEFAULT_EXCLUSION_SUGGESTIONS
      )}

      {/* Year Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Start Year (optional)</label>
          <input
            type="number"
            value={startYear}
            onChange={(e) => setStartYear(e.target.value)}
            placeholder="e.g., 2020"
            min="1900"
            max={new Date().getFullYear()}
            className="input-field"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">End Year (optional)</label>
          <input
            type="number"
            value={endYear}
            onChange={(e) => setEndYear(e.target.value)}
            placeholder="e.g., 2024"
            min="1900"
            max={new Date().getFullYear()}
            className="input-field"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Max Results */}
      <div>
        <label className="label">Number of Results (optional)</label>
        <input
          type="number"
          value={maxResults}
          onChange={(e) => setMaxResults(e.target.value)}
          placeholder="Leave empty for unlimited results"
          min="1"
          className="input-field"
          disabled={disabled}
        />
        <p className="text-sm text-gray-500 mt-1">
          Infinite results if left empty
        </p>
      </div>

      {/* LLM Configuration Section */}
      <div className="border-t pt-6">
        <button
          type="button"
          onClick={() => setShowLLMConfig(!showLLMConfig)}
          className="flex items-center justify-between w-full text-left"
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-600" size={24} />
            <h3 className="text-lg font-semibold text-gray-900">
              AI-Powered Analysis (LLM)
            </h3>
          </div>
          {showLLMConfig ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        <p className="text-sm text-gray-600 mt-2">
          Use LLMs for intelligent tasks like semantic filtering, category identification, and draft generation.
          Default: Enabled with Gemini API.
        </p>

        {showLLMConfig && (
          <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
            {/* Enable/Disable LLM */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="llm-enabled"
                checked={llmEnabled}
                onChange={(e) => setLlmEnabled(e.target.checked)}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                disabled={disabled}
              />
              <label htmlFor="llm-enabled" className="text-sm font-medium text-gray-700">
                Enable LLM for intelligent tasks
              </label>
            </div>

            {llmEnabled && (
              <>
                {/* Provider Selection */}
                <div>
                  <label className="label">LLM Provider</label>
                  <select
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value as any)}
                    className="input-field"
                    disabled={disabled}
                  >
                    <option value="gemini">Google Gemini (Default, Fast & Cost-effective)</option>
                    <option value="openai">OpenAI (Coming Soon)</option>
                    <option value="anthropic">Anthropic Claude (Coming Soon)</option>
                  </select>
                </div>

                {/* API Key */}
                <div>
                  <label className="label">
                    API Key (optional)
                    {llmProvider === 'gemini' && (
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:underline ml-2"
                      >
                        Get Gemini API Key
                      </a>
                    )}
                  </label>
                  <input
                    type="password"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder="Enter your API key or leave empty to use environment variable"
                    className="input-field"
                    disabled={disabled}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If not provided, the system will use the GEMINI_API_KEY environment variable
                  </p>
                </div>

                {/* Advanced Settings */}
                <details>
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                    Advanced Settings
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label text-xs">Batch Size</label>
                        <input
                          type="number"
                          value={llmBatchSize}
                          onChange={(e) => setLlmBatchSize(e.target.value)}
                          min="1"
                          max="50"
                          className="input-field text-sm"
                          disabled={disabled}
                        />
                        <p className="text-xs text-gray-500 mt-1">Papers per batch (1-50)</p>
                      </div>
                      <div>
                        <label className="label text-xs">Temperature</label>
                        <input
                          type="number"
                          value={llmTemperature}
                          onChange={(e) => setLlmTemperature(e.target.value)}
                          min="0"
                          max="1"
                          step="0.1"
                          className="input-field text-sm"
                          disabled={disabled}
                        />
                        <p className="text-xs text-gray-500 mt-1">Creativity (0-1)</p>
                      </div>
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={disabled || inclusionKeywords.length === 0}
        className="btn-primary w-full py-3 text-lg font-semibold flex items-center justify-center gap-2"
      >
        <Search size={20} />
        Start Literature Review
      </button>
    </form>
  );
};
