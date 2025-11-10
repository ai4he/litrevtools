export const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

export const generateSearchName = (): string => {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `LitReview-${timestamp}`;
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const formatAuthors = (authors: string[]): string => {
  if (authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return authors.join(' and ');
  return `${authors[0]} et al.`;
};
