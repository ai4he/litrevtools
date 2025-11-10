import React, { useState } from 'react';
import { FileText, ExternalLink, CheckCircle, XCircle, Calendar, Users, Quote } from 'lucide-react';
import { Paper } from '../types';
import { formatAuthors, truncateText } from '../utils/helpers';

interface PaperListProps {
  papers: Paper[];
}

export const PaperList: React.FC<PaperListProps> = ({ papers }) => {
  const [filter, setFilter] = useState<'all' | 'included' | 'excluded'>('all');
  const [expandedPapers, setExpandedPapers] = useState<Set<string>>(new Set());

  const filteredPapers = papers.filter((paper) => {
    if (filter === 'all') return true;
    if (filter === 'included') return paper.included;
    if (filter === 'excluded') return !paper.included;
    return true;
  });

  const toggleExpand = (paperId: string) => {
    const newExpanded = new Set(expandedPapers);
    if (newExpanded.has(paperId)) {
      newExpanded.delete(paperId);
    } else {
      newExpanded.add(paperId);
    }
    setExpandedPapers(newExpanded);
  };

  if (papers.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="text-primary-600" size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Extracted Papers</h3>
        </div>
        <div className="text-center py-12 text-gray-500">
          <FileText className="mx-auto mb-3 text-gray-400" size={48} />
          <p>No papers extracted yet</p>
          <p className="text-sm">Papers will appear here as they are discovered</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="text-primary-600" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Extracted Papers</h3>
            <p className="text-sm text-gray-500">{filteredPapers.length} papers</p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              filter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All ({papers.length})
          </button>
          <button
            onClick={() => setFilter('included')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              filter === 'included'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Included ({papers.filter((p) => p.included).length})
          </button>
          <button
            onClick={() => setFilter('excluded')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              filter === 'excluded'
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Excluded ({papers.filter((p) => !p.included).length})
          </button>
        </div>
      </div>

      {/* Paper List */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {filteredPapers.map((paper) => {
          const isExpanded = expandedPapers.has(paper.id);
          return (
            <div
              key={paper.id}
              className={`border rounded-lg p-4 transition-all ${
                paper.included
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              {/* Paper Header */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1">
                  <button
                    onClick={() => toggleExpand(paper.id)}
                    className="text-left hover:text-primary-600 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900 mb-1">
                      {paper.title}
                    </h4>
                  </button>

                  {/* Meta Information */}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Users size={14} />
                      <span>{formatAuthors(paper.authors)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      <span>{paper.year}</span>
                    </div>
                    {paper.citations > 0 && (
                      <div className="flex items-center gap-1">
                        <Quote size={14} />
                        <span>{paper.citations} citations</span>
                      </div>
                    )}
                    {paper.venue && (
                      <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                        {truncateText(paper.venue, 30)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  {paper.included ? (
                    <CheckCircle className="text-green-600" size={20} />
                  ) : (
                    <XCircle className="text-red-600" size={20} />
                  )}
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Open paper"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-300 space-y-3">
                  {/* Abstract */}
                  {paper.abstract && (
                    <div>
                      <h5 className="text-sm font-semibold text-gray-700 mb-1">Abstract</h5>
                      <p className="text-sm text-gray-600">{paper.abstract}</p>
                    </div>
                  )}

                  {/* Exclusion Reason */}
                  {!paper.included && paper.exclusionReason && (
                    <div>
                      <h5 className="text-sm font-semibold text-red-700 mb-1">
                        Exclusion Reason
                      </h5>
                      <p className="text-sm text-red-600">{paper.exclusionReason}</p>
                    </div>
                  )}

                  {/* Additional Info */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    {paper.doi && (
                      <div>
                        <span className="font-semibold text-gray-700">DOI:</span>{' '}
                        <span className="text-gray-600">{paper.doi}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-gray-700">URL:</span>{' '}
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        {truncateText(paper.url, 50)}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Expand/Collapse Button */}
              <button
                onClick={() => toggleExpand(paper.id)}
                className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
