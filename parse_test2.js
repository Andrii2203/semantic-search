const fs = require('fs');
const html = fs.readFileSync('djinni_raw.html', 'utf8');

const blocks = html.split('class="job-item ');
const jobs = [];

for (let i = 1; i < blocks.length; i++) {
  const block = blocks[i];
  
  // Find href
  const hrefMatch = block.match(/href="(\/jobs\/[^"]+)"/);
  if (!hrefMatch) continue;
  
  const relativeUrl = hrefMatch[1];
  
  // Find title text - Djinni uses job_item__header-link 
  // But wait, the title text is probably elsewhere or inside the header.
  // Let's just find the text inside the first <h3 or something? No wait, they removed the <h3>.
  // Let's just extract all text from the link tag!
  const linkStart = block.indexOf('class="job_item__header-link');
  let title = 'Unknown Title';
  if (linkStart !== -1) {
    const linkEnd = block.indexOf('</a>', linkStart);
    if (linkEnd !== -1) {
      const linkContent = block.substring(linkStart, linkEnd);
      // Clean tags, whitespace
      title = linkContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      // Remove generic terms like "is-company-logo" or "company logo"
      title = title.replace(/is-company-logo/g, '').trim();
    }
  }

  console.log("Found:", title, relativeUrl);
}
