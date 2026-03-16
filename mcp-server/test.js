'use strict';
/**
 * mcp-server/test.js — MCP Server 测试脚本
 */

const {
  getLatestNews,
  searchNews,
  getStats,
  readResource,
} = require('./index');

async function runTests() {
  console.log('=== Alpha-Radar MCP Server Tests ===\n');

  // Test 1: Get latest news
  console.log('Test 1: get_latest_news');
  try {
    const result = await getLatestNews({ limit: 5, min_score: 60, hours: 168 });
    console.log(`  Success: ${result.success}, Count: ${result.count || result.data?.length}`);
    if (result.data?.length > 0) {
      console.log(`  Sample: ${result.data[0].title?.substring(0, 50)}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  console.log();

  // Test 2: Search news
  console.log('Test 2: search_news');
  try {
    const result = await searchNews({ query: '合规', limit: 3 });
    console.log(`  Success: ${result.success}, Count: ${result.count || result.data?.length}`);
    if (result.data?.length > 0) {
      console.log(`  Sample: ${result.data[0].title?.substring(0, 50)}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  console.log();

  // Test 3: Get stats
  console.log('Test 3: get_stats');
  try {
    const result = await getStats({ days: 7 });
    console.log(`  Success: ${result.success}`);
    if (result.data) {
      console.log(`  Total: ${result.data.total || 'N/A'}`);
      console.log(`  Categories: ${result.data.categories?.length || 'N/A'}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  console.log();

  // Test 4: Read resource
  console.log('Test 4: read_resource (news://recent)');
  try {
    const result = await readResource('news://recent');
    console.log(`  Success: ${result.success}, Count: ${result.count || result.data?.length}`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  console.log();

  // Test 5: Read categories resource
  console.log('Test 5: read_resource (news://categories)');
  try {
    const result = await readResource('news://categories');
    console.log(`  Success: ${result.success}`);
    if (result.data?.categories) {
      console.log(`  Categories: ${result.data.categories.map(c => c.name).join(', ')}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  console.log();

  console.log('=== Tests Complete ===');
}

runTests().catch(console.error);
