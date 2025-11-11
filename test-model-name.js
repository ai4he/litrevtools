require('dotenv').config();

const geminiApiKey = process.env.GEMINI_API_KEY ||
                    (process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0].trim() : '');

async function testModel(modelName) {
  console.log(`\nTesting model: ${modelName}`);

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContent('Say "Hello"');
    const response = await result.response;
    const text = response.text();
    console.log(`✅ SUCCESS with ${modelName}`);
    console.log(`Response: ${text}`);
    return true;
  } catch (error) {
    console.log(`❌ FAILED with ${modelName}`);
    console.log(`Error: ${error.message}`);
    return false;
  }
}

(async () => {
  console.log('Testing different model names...\n');

  await testModel('gemini-flash-lite-latest');
  await testModel('gemini-2.5-flash-lite');
  await testModel('gemini-2.0-flash-lite');
})();
