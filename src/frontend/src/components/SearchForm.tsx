import React, { useState, useEffect } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { SearchParameters } from '../types';
import { generateSearchName } from '../utils/helpers';
import axios from 'axios';

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
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [maxResults, setMaxResults] = useState<string>('');

  // Prompts for Step 2 and Step 3 (stored here to pass via SearchParameters)
  const [inclusionCriteriaPrompt, setInclusionCriteriaPrompt] = useState('The paper must have a scientific contribution by proposing a new approach that advance science, so papers that only implement the technology as use case are not allowed. The approach has to be applicable to mathematics, if it is a general computer science approach that is not specificly aplied to mathematics then misregard it.');
  const [exclusionCriteriaPrompt, setExclusionCriteriaPrompt] = useState('Literature reviews of any kind are not allowed.');
  const [latexGenerationPrompt, setLatexGenerationPrompt] = useState('');

  // Auto Mode - run all steps sequentially
  const [autoMode, setAutoMode] = useState(false);

  // Fetch debug mode configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get('/api/config');
        const isDebugMode = response.data?.config?.debugMode || false;

        // Set default values if debug mode is enabled
        if (isDebugMode) {
          setStartDate('2022');
          setEndDate('2022');
          setMaxResults('45');
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
        // Default to blank fields on error (debug mode disabled)
      }
    };

    fetchConfig();
  }, []);

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

  // Parse flexible date format: YYYY, YYYY-MM, or YYYY-MM-DD
  const parseDate = (dateStr: string): { year?: number; month?: number; day?: number } | null => {
    if (!dateStr.trim()) return null;

    const parts = dateStr.trim().split('-');

    if (parts.length === 1) {
      // YYYY format
      const year = parseInt(parts[0]);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 10) {
        return null;
      }
      return { year };
    } else if (parts.length === 2) {
      // YYYY-MM format
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      if (isNaN(year) || isNaN(month) || year < 1900 || year > new Date().getFullYear() + 10 || month < 1 || month > 12) {
        return null;
      }
      return { year, month };
    } else if (parts.length === 3) {
      // YYYY-MM-DD format
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      if (isNaN(year) || isNaN(month) || isNaN(day) ||
          year < 1900 || year > new Date().getFullYear() + 10 ||
          month < 1 || month > 12 ||
          day < 1 || day > 31) {
        return null;
      }
      return { year, month, day };
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (inclusionKeywords.length === 0) {
      alert('Please add at least one inclusion keyword');
      return;
    }

    // Parse dates
    const startDateParsed = parseDate(startDate);
    const endDateParsed = parseDate(endDate);

    if (startDate && !startDateParsed) {
      alert('Invalid start date format. Use YYYY, YYYY-MM, or YYYY-MM-DD');
      return;
    }

    if (endDate && !endDateParsed) {
      alert('Invalid end date format. Use YYYY, YYYY-MM, or YYYY-MM-DD');
      return;
    }

    const params: SearchParameters = {
      name: name.trim() || generateSearchName(),
      inclusionKeywords,
      exclusionKeywords,
      ...(startDateParsed?.year && { startYear: startDateParsed.year }),
      ...(endDateParsed?.year && { endYear: endDateParsed.year }),
      ...(startDateParsed?.month && { startMonth: startDateParsed.month }),
      ...(endDateParsed?.month && { endMonth: endDateParsed.month }),
      ...(startDateParsed?.day && { startDay: startDateParsed.day }),
      ...(endDateParsed?.day && { endDay: endDateParsed.day }),
      ...(maxResults && { maxResults: parseInt(maxResults) }),
      // Pass prompts for Step 2 and Step 3 (these will be used in those steps)
      ...(inclusionCriteriaPrompt.trim() && { inclusionCriteriaPrompt: inclusionCriteriaPrompt.trim() }),
      ...(exclusionCriteriaPrompt.trim() && { exclusionCriteriaPrompt: exclusionCriteriaPrompt.trim() }),
      ...(latexGenerationPrompt.trim() && { latexGenerationPrompt: latexGenerationPrompt.trim() }),
      autoMode,
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

      {/* Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Start Date (optional)</label>
          <input
            type="text"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="2020, 2020-01, or 2020-01-15"
            className="input-field"
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            Format: YYYY, YYYY-MM, or YYYY-MM-DD
          </p>
        </div>
        <div>
          <label className="label">End Date (optional)</label>
          <input
            type="text"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="2024, 2024-06, or 2024-06-15"
            className="input-field"
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            Format: YYYY, YYYY-MM, or YYYY-MM-DD
          </p>
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

      {/* Auto Mode Toggle */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-gray-900">Automatic Mode</h3>
              {autoMode && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                  ENABLED
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Automatically execute all three steps sequentially: Search → Semantic Filtering → Output Generation
            </p>
          </div>
          <div className="ml-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="sr-only peer"
                disabled={disabled}
              />
              <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
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
