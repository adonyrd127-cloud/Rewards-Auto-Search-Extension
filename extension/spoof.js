(function() {
  'use strict';

  const hash = window.location.hash;
  let mode = null;

  if (hash && hash.includes('ua=')) {
    const match = hash.match(/ua=([^&]+)/);
    if (match) {
      mode = match[1];
      try {
        sessionStorage.setItem('__spoofed_ua_mode', mode);
      } catch (e) {}
      
      // Clean the hash from the URL
      const cleanHash = hash.replace(/#?ua=[^&]+&?/, '').replace(/^&/, '#');
      const cleanUrl = window.location.href.split('#')[0] + (cleanHash && cleanHash !== '#' ? cleanHash : '');
      try {
        window.history.replaceState(null, '', cleanUrl);
      } catch (e) {}
    }
  } else {
    try {
      mode = sessionStorage.getItem('__spoofed_ua_mode');
    } catch (e) {}
  }

  if (mode === 'mobile' || mode === 'edge' || mode === 'desktop') {
    let targetUA, targetAppVersion, targetPlatform, targetTouchPoints, targetUAData;

    if (mode === 'mobile') {
      targetUA = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
      targetAppVersion = "5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
      targetPlatform = "Linux armv8l";
      targetTouchPoints = 5;
      targetUAData = {
        brands: [
          { brand: 'Not/A)Brand', version: '99' },
          { brand: 'Google Chrome', version: '126' },
          { brand: 'Chromium', version: '126' }
        ],
        mobile: true,
        platform: 'Android',
        getHighEntropyValues: function(hints) {
          return Promise.resolve({
            brands: this.brands,
            mobile: this.mobile,
            platform: this.platform,
            platformVersion: '13.0.0',
            architecture: '',
            model: 'SM-S918B'
          });
        }
      };
    } else if (mode === 'edge') {
      targetUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.81";
      targetAppVersion = "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.81";
      targetPlatform = "Win32";
      targetTouchPoints = 0;
      targetUAData = {
        brands: [
          { brand: 'Not)A;Brand', version: '99' },
          { brand: 'Microsoft Edge', version: '126' },
          { brand: 'Chromium', version: '126' }
        ],
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: function(hints) {
          return Promise.resolve({
            brands: this.brands,
            mobile: this.mobile,
            platform: this.platform,
            platformVersion: '10.0.0',
            architecture: 'x86',
            model: ''
          });
        }
      };
    } else if (mode === 'desktop') {
      targetUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
      targetAppVersion = "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
      targetPlatform = "Win32";
      targetTouchPoints = 0;
      targetUAData = {
        brands: [
          { brand: 'Not)A;Brand', version: '99' },
          { brand: 'Google Chrome', version: '126' },
          { brand: 'Chromium', version: '126' }
        ],
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: function(hints) {
          return Promise.resolve({
            brands: this.brands,
            mobile: this.mobile,
            platform: this.platform,
            platformVersion: '10.0.0',
            architecture: 'x86',
            model: ''
          });
        }
      };
    }

    const overwrite = (prop, value) => {
      try {
        Object.defineProperty(Navigator.prototype, prop, { get: () => value, configurable: true });
      } catch (e) {}
      try {
        Object.defineProperty(navigator, prop, { get: () => value, configurable: true });
      } catch (e) {}
    };

    overwrite('userAgent', targetUA);
    overwrite('appVersion', targetAppVersion);
    overwrite('platform', targetPlatform);
    overwrite('maxTouchPoints', targetTouchPoints);
    overwrite('userAgentData', targetUAData);
  }
})();
