require('dotenv').config();

// Test Gemini API key loading
const geminiApiKey = process.env.GEMINI_API_KEY ||
                    (process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0].trim() : '');

console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
console.log('GEMINI_API_KEYS:', process.env.GEMINI_API_KEYS ? 'SET' : 'NOT SET');
console.log('Using API key:', geminiApiKey ? `${geminiApiKey.substring(0, 10)}...${geminiApiKey.substring(geminiApiKey.length - 4)}` : 'NONE');
console.log('Model:', process.env.GEMINI_MODEL || 'gemini-flash-lite-latest');

// Test if the API key works with a simple request
async function testGeminiAPI() {
  if (!geminiApiKey) {
    console.error('ERROR: No Gemini API key found!');
    return;
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest' });

  try {
    console.log('\nTesting Gemini API...');
    const result = await model.generateContent('Say "Hello from Gemini API test"');
    const response = await result.response;
    const text = response.text();
    console.log('✅ SUCCESS! Gemini API is working!');
    console.log('Response:', text);
  } catch (error) {
    console.error('❌ FAILED! Gemini API error:', error.message);
  }
}

testGeminiAPI();
