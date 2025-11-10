/**
 * Unified Parameter Schema
 *
 * This module defines the single source of truth for all search parameters
 * across CLI, Web, Desktop, and Mobile platforms. Any new parameter added
 * here automatically becomes available in all platforms.
 */

import { SearchParameters, LLMConfig } from '../types';

export type ParameterType = 'string' | 'number' | 'boolean' | 'string[]' | 'enum' | 'object';

export interface ParameterDefinition {
  key: keyof SearchParameters;
  type: ParameterType;
  label: string;
  description: string;
  required: boolean;
  default?: any;
  options?: Array<{ value: any; label: string; description?: string }>;
  min?: number;
  max?: number;
  placeholder?: string;
  group?: string;
  cliFlag?: string;
  cliShortFlag?: string;
  // For nested configurations like LLMConfig
  nested?: ParameterDefinition[];
}

/**
 * Core Search Parameters Schema
 */
export const SEARCH_PARAMETER_SCHEMA: ParameterDefinition[] = [
  // Basic Search Parameters
  {
    key: 'name',
    type: 'string',
    label: 'Search Name',
    description: 'A descriptive name for this literature review search',
    required: false,
    placeholder: 'e.g., LLM Mathematical Reasoning Survey 2024',
    group: 'basic',
    cliFlag: '--name',
    cliShortFlag: '-n',
  },
  {
    key: 'inclusionKeywords',
    type: 'string[]',
    label: 'Inclusion Keywords',
    description: 'Papers must contain at least one of these keywords',
    required: true,
    default: ['large language model', 'mathematical reasoning'],
    placeholder: 'e.g., machine learning, deep learning',
    group: 'basic',
    cliFlag: '--include',
    cliShortFlag: '-i',
  },
  {
    key: 'exclusionKeywords',
    type: 'string[]',
    label: 'Exclusion Keywords',
    description: 'Papers containing these keywords will be excluded',
    required: false,
    default: ['survey', 'review'],
    placeholder: 'e.g., survey, review',
    group: 'basic',
    cliFlag: '--exclude',
    cliShortFlag: '-e',
  },
  {
    key: 'maxResults',
    type: 'number',
    label: 'Maximum Results',
    description: 'Maximum number of papers to retrieve (leave empty for unlimited)',
    required: false,
    min: 1,
    max: 10000,
    placeholder: '100',
    group: 'basic',
    cliFlag: '--max',
    cliShortFlag: '-m',
  },
  {
    key: 'startYear',
    type: 'number',
    label: 'Start Year',
    description: 'Earliest year to include in search',
    required: false,
    min: 1900,
    max: new Date().getFullYear(),
    placeholder: '2020',
    group: 'basic',
    cliFlag: '--start-year',
  },
  {
    key: 'endYear',
    type: 'number',
    label: 'End Year',
    description: 'Latest year to include in search',
    required: false,
    min: 1900,
    max: new Date().getFullYear(),
    placeholder: new Date().getFullYear().toString(),
    group: 'basic',
    cliFlag: '--end-year',
  },
  {
    key: 'startMonth',
    type: 'number',
    label: 'Start Month',
    description: 'Earliest month to include in search (1-12, optional)',
    required: false,
    min: 1,
    max: 12,
    placeholder: '1',
    group: 'basic',
    cliFlag: '--start-month',
  },
  {
    key: 'endMonth',
    type: 'number',
    label: 'End Month',
    description: 'Latest month to include in search (1-12, optional)',
    required: false,
    min: 1,
    max: 12,
    placeholder: '12',
    group: 'basic',
    cliFlag: '--end-month',
  },

  // LLM Configuration
  {
    key: 'llmConfig',
    type: 'object',
    label: 'LLM Configuration',
    description: 'Configure AI-powered intelligent filtering and paper analysis',
    required: false,
    group: 'advanced',
    cliFlag: '--llm-config',
    nested: [
      {
        key: 'enabled' as any,
        type: 'boolean',
        label: 'Enable LLM',
        description: 'Use AI for intelligent paper filtering and relevance assessment',
        required: false,
        default: false,
        group: 'advanced',
        cliFlag: '--llm-enabled',
      },
      {
        key: 'provider' as any,
        type: 'enum',
        label: 'LLM Provider',
        description: 'AI provider to use for analysis',
        required: false,
        default: 'gemini',
        options: [
          { value: 'gemini', label: 'Google Gemini', description: 'Fast and cost-effective' },
        ],
        group: 'advanced',
        cliFlag: '--llm-provider',
      },
      {
        key: 'model' as any,
        type: 'string',
        label: 'Model',
        description: 'Specific model to use',
        required: false,
        default: 'gemini-1.5-flash',
        placeholder: 'gemini-1.5-flash',
        group: 'advanced',
        cliFlag: '--llm-model',
      },
      {
        key: 'apiKey' as any,
        type: 'string',
        label: 'API Key',
        description: 'Single API key for authentication',
        required: false,
        placeholder: 'your-api-key-here',
        group: 'advanced',
        cliFlag: '--llm-api-key',
      },
      {
        key: 'apiKeys' as any,
        type: 'string[]',
        label: 'API Keys',
        description: 'Multiple API keys for automatic rotation',
        required: false,
        placeholder: 'key1,key2,key3',
        group: 'advanced',
        cliFlag: '--llm-api-keys',
      },
      {
        key: 'batchSize' as any,
        type: 'number',
        label: 'Batch Size',
        description: 'Number of papers to process in each batch',
        required: false,
        default: 10,
        min: 1,
        max: 100,
        group: 'advanced',
        cliFlag: '--llm-batch-size',
      },
      {
        key: 'maxConcurrentBatches' as any,
        type: 'number',
        label: 'Max Concurrent Batches',
        description: 'Maximum number of batches to process simultaneously',
        required: false,
        default: 3,
        min: 1,
        max: 10,
        group: 'advanced',
        cliFlag: '--llm-max-concurrent',
      },
      {
        key: 'timeout' as any,
        type: 'number',
        label: 'Timeout (ms)',
        description: 'Maximum time to wait for LLM response',
        required: false,
        default: 30000,
        min: 1000,
        max: 120000,
        group: 'advanced',
        cliFlag: '--llm-timeout',
      },
      {
        key: 'retryAttempts' as any,
        type: 'number',
        label: 'Retry Attempts',
        description: 'Number of retry attempts on failure',
        required: false,
        default: 3,
        min: 0,
        max: 10,
        group: 'advanced',
        cliFlag: '--llm-retry',
      },
      {
        key: 'temperature' as any,
        type: 'number',
        label: 'Temperature',
        description: 'LLM temperature for response consistency (0.0-1.0)',
        required: false,
        default: 0.3,
        min: 0,
        max: 1,
        group: 'advanced',
        cliFlag: '--llm-temperature',
      },
      {
        key: 'fallbackStrategy' as any,
        type: 'enum',
        label: 'Fallback Strategy',
        description: 'What to do when LLM fails or API keys are exhausted',
        required: false,
        default: 'rule_based',
        options: [
          { value: 'rule_based', label: 'Rule-based', description: 'Fall back to keyword matching' },
          { value: 'skip', label: 'Skip', description: 'Skip papers that fail LLM processing' },
          { value: 'strict', label: 'Strict', description: 'Fail the entire search if LLM fails' },
        ],
        group: 'advanced',
        cliFlag: '--llm-fallback',
      },
      {
        key: 'enableKeyRotation' as any,
        type: 'boolean',
        label: 'Enable Key Rotation',
        description: 'Automatically rotate between multiple API keys to avoid rate limits',
        required: false,
        default: true,
        group: 'advanced',
        cliFlag: '--llm-key-rotation',
      },
    ],
  },
];

/**
 * Get parameter definition by key
 */
export function getParameterDefinition(key: keyof SearchParameters): ParameterDefinition | undefined {
  return SEARCH_PARAMETER_SCHEMA.find(param => param.key === key);
}

/**
 * Get all parameters in a specific group
 */
export function getParametersByGroup(group: string): ParameterDefinition[] {
  return SEARCH_PARAMETER_SCHEMA.filter(param => param.group === group);
}

/**
 * Get default values for all parameters
 */
export function getDefaultParameters(): Partial<SearchParameters> {
  const defaults: any = {};

  SEARCH_PARAMETER_SCHEMA.forEach(param => {
    if (param.default !== undefined) {
      defaults[param.key] = param.default;
    }

    // Handle nested parameters
    if (param.nested) {
      const nestedDefaults: any = {};
      param.nested.forEach(nested => {
        if (nested.default !== undefined) {
          nestedDefaults[nested.key] = nested.default;
        }
      });
      if (Object.keys(nestedDefaults).length > 0) {
        defaults[param.key] = nestedDefaults;
      }
    }
  });

  return defaults;
}

/**
 * Validate parameters against schema
 */
export function validateParameters(params: Partial<SearchParameters>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  SEARCH_PARAMETER_SCHEMA.forEach(param => {
    const value = params[param.key];

    // Check required
    if (param.required && (value === undefined || value === null || value === '')) {
      errors.push(`${param.label} is required`);
      return;
    }

    // Skip validation if value is not provided and not required
    if (value === undefined || value === null) {
      return;
    }

    // Type validation
    if (param.type === 'number' && typeof value !== 'number') {
      errors.push(`${param.label} must be a number`);
    }

    if (param.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${param.label} must be a boolean`);
    }

    if (param.type === 'string[]' && !Array.isArray(value)) {
      errors.push(`${param.label} must be an array`);
    }

    // Range validation
    if (param.type === 'number' && typeof value === 'number') {
      if (param.min !== undefined && value < param.min) {
        errors.push(`${param.label} must be at least ${param.min}`);
      }
      if (param.max !== undefined && value > param.max) {
        errors.push(`${param.label} must be at most ${param.max}`);
      }
    }

    // Enum validation
    if (param.type === 'enum' && param.options) {
      const validValues = param.options.map(opt => opt.value);
      if (!validValues.includes(value)) {
        errors.push(`${param.label} must be one of: ${validValues.join(', ')}`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge parameters with defaults
 */
export function mergeWithDefaults(params: Partial<SearchParameters>): SearchParameters {
  const defaults = getDefaultParameters();
  return {
    ...defaults,
    ...params,
    // Merge nested LLM config if present
    llmConfig: params.llmConfig ? {
      ...defaults.llmConfig as any,
      ...params.llmConfig,
    } : defaults.llmConfig as any,
  } as SearchParameters;
}
