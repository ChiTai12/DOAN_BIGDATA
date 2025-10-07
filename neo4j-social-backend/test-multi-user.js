import puppeteer from 'puppeteer';

async function testMultiUserChat() {
  console.log("🧪 MULTI-USER CHAT TEST");
  console.log("=" .repeat(40));
  
  // Launch 2 browsers in different contexts
  const browser1 = await puppeteer.launch({ 
    headless: false, 
    args: ['--no-first-run', '--user-data-dir=/tmp/chrome1']
  });
  
  const browser2 = await puppeteer.launch({ 
    headless: false, 
    args: ['--no-first-run', '--user-data-dir=/tmp/chrome2']
  });
  
  try {
    const page1 = await browser1.newPage();
    const page2 = await browser2.newPage();
    
    // User 1: billy
    console.log("1️⃣ User 1 (billy) logging in...");
    await page1.goto('http://localhost:3001');
    await page1.waitForSelector('button'); // Wait for login button
    
    // Click profile/login
    await page1.click('button[aria-label="Profile"]');
    await page1.waitForSelector('input[type="text"]');
    
    // Login billy
    await page1.type('input[type="text"]', 'billy');
    await page1.type('input[type="password"]', '123456');
    await page1.click('button[type="submit"]');
    
    await page1.waitForTimeout(2000); // Wait for login
    
    // User 2: another user  
    console.log("2️⃣ User 2 logging in...");
    await page2.goto('http://localhost:3001');
    await page2.waitForSelector('button');
    
    // Register new user if needed
    await page2.click('button[aria-label="Profile"]');
    await page2.waitForSelector('input[type="text"]');
    
    // Try different user
    await page2.type('input[type="text"]', 'testuser123');
    await page2.type('input[type="password"]', '123456');
    await page2.click('button[type="submit"]');
    
    await page2.waitForTimeout(2000);
    
    // Test chat between users
    console.log("3️⃣ Testing chat...");
    
    // User 1 opens chat
    await page1.click('button[aria-label="Messages"]');
    await page1.waitForTimeout(1000);
    
    // Click on user to chat with
    const userButtons = await page1.$$('button');
    if (userButtons.length > 0) {
      await userButtons[1].click(); // Click first suggested user
      await page1.waitForTimeout(1000);
      
      // Send message
      await page1.type('textarea, input[placeholder*="message"]', 'Hello from billy!');
      await page1.click('button:has-text("Send")');
    }
    
    console.log("✅ Multi-user test completed!");
    console.log("👀 Check both browser windows manually");
    
    // Keep browsers open for manual inspection
    await page1.waitForTimeout(30000); // Wait 30s for manual testing
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  } finally {
    await browser1.close();
    await browser2.close();
  }
}

// Only run if puppeteer is installed
try {
  testMultiUserChat();
} catch (e) {
  console.log("💡 To run automated test, install puppeteer: npm install puppeteer");
  console.log("🔧 Manual solution: Use Incognito mode for second user");
}
