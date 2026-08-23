const MOBILE_BROWSER_PATTERN = /Android|Mobile|iPhone|iPad|iPod/i;

export const detectExtensionBrowser = ({
  userAgent = '',
  brands = [],
} = {}) => {
  const normalizedUserAgent = String(userAgent);
  const normalizedBrands = Array.isArray(brands)
    ? brands.map((brand) => String(brand?.brand || brand)).join(' ')
    : '';
  const isMobile = MOBILE_BROWSER_PATTERN.test(normalizedUserAgent);

  if (
    /Firefox\//i.test(normalizedUserAgent) ||
    /Firefox/i.test(normalizedBrands)
  ) {
    return { family: 'firefox', label: 'Firefox', supported: !isMobile };
  }

  if (
    /Edg\//i.test(normalizedUserAgent) ||
    /Microsoft Edge/i.test(normalizedBrands)
  ) {
    return {
      family: 'chromium',
      label: 'Microsoft Edge',
      supported: !isMobile,
    };
  }

  if (/OPR\//i.test(normalizedUserAgent) || /Opera/i.test(normalizedBrands)) {
    return { family: 'chromium', label: 'Opera', supported: !isMobile };
  }

  if (
    /Chrom(?:e|ium)\//i.test(normalizedUserAgent) ||
    /Google Chrome|Chromium|Brave/i.test(normalizedBrands)
  ) {
    return {
      family: 'chromium',
      label: 'Chrome/Chromium',
      supported: !isMobile,
    };
  }

  if (/Safari\//i.test(normalizedUserAgent)) {
    return { family: 'unsupported', label: 'Safari', supported: false };
  }

  return { family: 'unsupported', label: 'this browser', supported: false };
};

export const detectCurrentExtensionBrowser = () => {
  if (typeof navigator === 'undefined') return detectExtensionBrowser();
  return detectExtensionBrowser({
    userAgent: navigator.userAgent,
    brands: navigator.userAgentData?.brands,
  });
};
