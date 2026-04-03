async function testLimit() {
  const API_BASE = 'http://localhost:3000';
  console.log('--- Testing Character Creation Limit (using fetch) ---');

  for (let i = 1; i <= 4; i++) {
    try {
      console.log(`Creating character ${i}...`);
      const res = await fetch(`${API_BASE}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Test Char ${i}`,
          description: 'Testing limits'
        })
      });

      const data = await res.json();

      if (res.status === 403) {
        console.log(`❌ Expected Failure: ${data.message}`);
      } else if (res.ok) {
        console.log(`✅ Success: ${data.name} (ID: ${data.id})`);
      } else {
        console.log(`⚠️ Unexpected Response: ${res.status} ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.error(`💥 Request Error: ${error.message}`);
    }
  }
}

testLimit();
