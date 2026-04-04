const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

const clickAttr = ` style="cursor: pointer;" onclick="window.location.reload()"`;

files.forEach(file => {
  if (['index.html', 'login.html', 'register.html', 'forgot-password.html', 'reset-password.html'].includes(file)) return;
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('<h1>')) {
    content = content.replace('<h1>', `<h1${clickAttr}>`);
  } else if (content.includes('<h1 id="page-title">')) {
    content = content.replace('<h1 id="page-title">', `<h1 id="page-title"${clickAttr}>`);
  } else if (content.includes('<h1 id="dashboard-title">')) {
    content = content.replace('<h1 id="dashboard-title">', `<h1 id="dashboard-title"${clickAttr}>`);
  } else if (content.includes('<h1 id="sub-number">')) {
    content = content.replace('<h1 id="sub-number">', `<h1 id="sub-number"${clickAttr}>`);
  } else if (content.includes('<h1 id="inv-number">')) {
    content = content.replace('<h1 id="inv-number">', `<h1 id="inv-number"${clickAttr}>`);
  }
  
  // also add format to .card forms as requested in issue 11 (Apply improvements to all remaining pages)
  // Let's not do that yet unless we are sure.
  
  fs.writeFileSync(filePath, content);
  console.log('Processed', file);
});
