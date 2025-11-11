require('dotenv').config();

const geminiApiKey = process.env.GEMINI_API_KEY ||
                    (process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0].trim() : '');

console.log('Using API key:', geminiApiKey ? `${geminiApiKey.substring(0, 10)}...${geminiApiKey.substring(geminiApiKey.length - 4)}` : 'NONE');

async function listModels() {
  if (!geminiApiKey) {
    console.error('ERROR: No Gemini API key found!');
    return;
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  try {
    console.log('\nListing available Gemini models...\n');

    // Try to list models using the API
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models?key=' + geminiApiKey);
    const data = await response.json();

    if (response.ok && data.models) {
      console.log('Available models:');
      data.models.forEach(model => {
        console.log(`- ${model.name} (${model.displayName || 'N/A'})`);
        if (model.supportedGenerationMethods) {
          console.log(`  Methods: ${model.supportedGenerationMethods.join(', ')}`);
        }
      });
    } else {
      console.error('Error:', data);
    }
  } catch (error) {
    console.error('Failed to list models:', error.message);
  }
}

listModels();
