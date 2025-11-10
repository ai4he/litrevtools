import React, { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
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
