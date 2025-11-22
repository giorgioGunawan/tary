// Quick test script to verify OpenAI API connection
require('dotenv').config();
const { execSync } = require('child_process');

console.log('Testing OpenAI API connection...\n');

// Check if API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is not set!');
  console.error('Please add it to your .env file or Vercel environment variables.');
  process.exit(1);
}

console.log(`✓ API key found: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);

// Test API call using curl
try {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const payload = JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "Hello, API is working!"' }
    ],
    temperature: 0.7,
    max_tokens: 50
  });
  
  // Escape single quotes
  const escapedPayload = payload.replace(/'/g, "'\\''");
  
  const curlCommand = `curl -s -X POST -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${escapedPayload}' --max-time 15 "${url}"`;
  
  console.log('\nMaking test API call...');
  
  const output = execSync(curlCommand, {
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 5 * 1024 * 1024,
    shell: '/bin/bash'
  });
  
  const responseData = JSON.parse(output);
  
  if (responseData.error) {
    console.error('\n❌ OpenAI API returned an error:');
    console.error(JSON.stringify(responseData.error, null, 2));
    console.error('\nPossible issues:');
    console.error('- Invalid API key');
    console.error('- Insufficient credits');
    console.error('- API key permissions');
    process.exit(1);
  }
  
  if (responseData.choices && responseData.choices[0]) {
    const message = responseData.choices[0].message.content;
    console.log('\n✅ OpenAI API is working!');
    console.log(`Response: "${message}"`);
    console.log('\n✓ Your AI calendar assistant should work correctly!');
  } else {
    console.error('\n❌ Unexpected response format:');
    console.error(JSON.stringify(responseData, null, 2));
  }
  
} catch (error) {
  console.error('\n❌ Error testing OpenAI API:');
  console.error(error.message);
  
  if (error.stderr) {
    console.error('\nError details:', error.stderr.toString());
  }
  
  console.error('\nPossible issues:');
  console.error('- Network connectivity');
  console.error('- Firewall blocking OpenAI API');
  console.error('- Invalid API key format');
  
  process.exit(1);
}

