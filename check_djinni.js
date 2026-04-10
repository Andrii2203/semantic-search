const fs = require('fs');
fetch('https://djinni.co/jobs/?primary_keyword=JavaScript')
  .then(res => res.text())
  .then(html => {
    const listItems = html.match(/<li[^>]+>/gi);
    if(listItems) console.log("LIs", listItems.filter(li => li.includes('job')).slice(0, 5));
    
    const divItems = html.match(/<div[^>]+class="[^"]*job[^"]*"[^>]*>/gi);
    if(divItems) console.log("DIVs", divItems.slice(0, 5));
    
    fs.writeFileSync('djinni_raw.html', html);
    console.log("HTML length:", html.length);
  });
