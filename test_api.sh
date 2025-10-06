// test_api.js - Node.js test suite
// Run with: node test_api.js

const BASE_URL = 'http://localhost:5000';

// Simple test runner
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  async runTest(name, testFn) {
    process.stdout.write(`🧪 ${name}... `);
    try {
      await testFn();
      console.log('✅ PASSED');
      this.passed++;
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      this.failed++;
    }
  }

  async runAll() {
    console.log('🚀 Starting Test Suite\n');
    
    for (const test of this.tests) {
      await this.runTest(test.name, test.fn);
    }

    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    process.exit(this.failed > 0 ? 1 : 0);
  }

  add(name, fn) {
    this.tests.push({ name, fn });
  }
}

// Helper function to make API calls
async function apiCall(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, data };
}

// Helper to assert
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Create test runner
const runner = new TestRunner();

// Test 1: Health check
runner.add('Health Check', async () => {
  const { status, data } = await apiCall('GET', '/health');
  assert(status === 200, 'Expected status 200');
  assert(data.status === 'healthy', 'Expected healthy status');
});

// Test 2: Upload single message
runner.add('Upload Single Message', async () => {
  const { status, data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test001',
      device_id: 'device_test',
      content: 'Test message',
      timestamp: '2025-01-15T10:00:00'
    }]
  });
  assert(status === 200, 'Expected status 200');
  assert(data.summary.saved === 1, 'Expected 1 saved message');
});

// Test 3: Duplicate message (skip strategy)
runner.add('Duplicate Message - Skip', async () => {
  const { status, data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test001',
      device_id: 'device_test',
      content: 'Duplicate',
      timestamp: '2025-01-15T10:01:00'
    }],
    conflict_strategy: 'skip'
  });
  assert(data.summary.skipped === 1, 'Expected 1 skipped message');
});

// Test 4: Conflict resolution - Latest wins
runner.add('Conflict Resolution - Latest', async () => {
  // First, upload a message
  await apiCall('POST', '/sync', {
    messages: [{
      id: 'test002',
      device_id: 'device_test',
      content: 'Original',
      timestamp: '2025-01-15T10:00:00'
    }]
  });

  // Try to update with newer timestamp
  const { data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test002',
      device_id: 'device_test',
      content: 'Updated',
      timestamp: '2025-01-15T11:00:00'
    }],
    conflict_strategy: 'latest'
  });
  
  assert(data.summary.updated === 1, 'Expected 1 updated message');
});

// Test 5: Conflict resolution - Overwrite
runner.add('Conflict Resolution - Overwrite', async () => {
  await apiCall('POST', '/sync', {
    messages: [{
      id: 'test003',
      device_id: 'device_test',
      content: 'Original',
      timestamp: '2025-01-15T10:00:00'
    }]
  });

  const { data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test003',
      device_id: 'device_test',
      content: 'Overwritten',
      timestamp: '2025-01-15T09:00:00'
    }],
    conflict_strategy: 'overwrite'
  });
  
  assert(data.summary.updated === 1, 'Expected 1 updated message');
});

// Test 6: Duplicate content detection
runner.add('Duplicate Content Detection', async () => {
  const timestamp1 = '2025-01-15T10:00:00';
  const timestamp2 = '2025-01-15T10:00:02'; // 2 seconds later
  
  await apiCall('POST', '/sync', {
    messages: [{
      id: 'test004',
      device_id: 'device_test',
      content: 'Same content',
      timestamp: timestamp1
    }]
  });

  const { data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test005',
      device_id: 'device_test',
      content: 'Same content',
      timestamp: timestamp2
    }]
  });
  
  assert(data.summary.skipped === 1, 'Expected duplicate to be skipped');
});

// Test 7: Invalid timestamp
runner.add('Invalid Timestamp Validation', async () => {
  const { data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test006',
      device_id: 'device_test',
      content: 'Invalid timestamp',
      timestamp: 'not-a-date'
    }]
  });
  
  assert(data.summary.errors === 1, 'Expected 1 error');
});

// Test 8: Missing required fields
runner.add('Missing Required Fields', async () => {
  const { data } = await apiCall('POST', '/sync', {
    messages: [{
      id: 'test007',
      device_id: 'device_test'
      // missing content and timestamp
    }]
  });
  
  assert(data.summary.errors === 1, 'Expected 1 error');
});

// Test 9: Batch upload with mixed results
runner.add('Batch Upload - Mixed Results', async () => {
  const { data } = await apiCall('POST', '/sync', {
    messages: [
      {
        id: 'test008',
        device_id: 'device_test',
        content: 'Valid message',
        timestamp: '2025-01-15T10:00:00'
      },
      {
        id: 'test001', // duplicate
        device_id: 'device_test',
        content: 'Duplicate