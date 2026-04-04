const { resolveAssetUrl } = require('../Creativstorys/frontend/src/config');

// Mock import.meta.env
global.import = { meta: { env: { VITE_API_BASE_URL: 'https://api.creativistoria.app' } } };

const testCases = [
  { input: '/public/comics/strip.png', expected: 'https://api.creativistoria.app/public/comics/strip.png' },
  { input: 'https://s3.amazonaws.com/bucket/comics/strip.png', expected: 'https://s3.amazonaws.com/bucket/comics/strip.png' },
  { input: 'public/avatar.jpg', expected: 'https://api.creativistoria.app/public/avatar.jpg' },
  { input: '', expected: '' },
  { input: null, expected: '' }
];

testCases.forEach(({ input, expected }) => {
  const result = resolveAssetUrl(input);
  console.log(`Input: ${input} -> Result: ${result} (Expected: ${expected})`);
  if (result !== expected) {
    console.error(`❌ Test failed for input: ${input}`);
  } else {
    console.log(`✅ Test passed`);
  }
});
