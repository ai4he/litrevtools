const { GoogleGenerativeAI } = require('@google/generative-ai');

// Test with the first API key
const apiKey = process.env.GEMINI_API_KEYS?.split(',')[0] || '';

if (!apiKey) {
  console.error('No API key found in GEMINI_API_KEYS environment variable');
  process.exit(1);
}

async function listAvailableModels() {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log('Testing API key:', apiKey.substring(0, 10) + '...');
    console.log('\nAttempting to list all available models...\n');

    // Try to list models (this might not be supported in all SDK versions)
    const models = await genAI.listModels?.();

    if (models) {
      console.log('Available models:');
      models.forEach(model => {
        console.log(`- ${model.name}`);
      });
    } else {
      console.log('listModels() not available in this SDK version');
    }

  } catch (error) {
    console.error('Error listing models:', error.message);
  }

  // Test specific model names
  console.log('\n\nTesting specific model names:\n');

  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-preview-09-2025',
    'gemini-2.5-flash-lite-preview-09-2025',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of modelsToTest) {
    try {
      console.log(`Testing: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say "hello"');
      const response = await result.response;
      const text = response.text();
      console.log(`✓ ${modelName} - WORKS (response: ${text.substring(0, 50)}...)`);
    } catch (error) {
      console.log(`✗ ${modelName} - FAILED: ${error.message}`);
    }
  }
}

listAvailableModels().catch(console.error);
