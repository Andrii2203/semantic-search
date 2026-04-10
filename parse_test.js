const fs = require('fs');
const html = fs.readFileSync('djinni_raw.html', 'utf8');

// Simplified parser since Djinni uses job-item class now
const itemRegex = /<div[^>]*class="[^"]*job-item\b[^"]*"[^>]*>([\s\S]*?)<footer/gi;
let match;
let count = 0;
while ((match = itemRegex.exec(html)) !== null) {
  const block = match[1];
  
  // Title & Link
  const titleMatch = /<a[^>]*class="[^"]*job-item__title-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
  
  if (titleMatch) {
    count++;
    console.log("Title:", titleMatch[2].replace(/<[^>]*>/g, '').trim());
    console.log("Link:", titleMatch[1]);
  }
}
console.log("Total matched jobs:", count);
