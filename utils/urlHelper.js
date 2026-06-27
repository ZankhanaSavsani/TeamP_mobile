// utils/urlHelper.js
export const getBaseUrl = (instance) => {
  if (!instance) return '';

  if (instance === 'developerox') {
    return 'https://dev.developerox.com';
  }

  if (instance.startsWith('dev-')) {
    const region = instance.split('-')[1];
    return `https://${region}.platformx.dev`;
  }

  return `https://${instance.toLowerCase()}.fiscalox.com`;
};

// Optional helper for direct endpoint use:
export const getApiUrl = (instance, path) => `${getBaseUrl(instance)}/api/${path}`;
