const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  if (['index.html', 'login.html', 'register.html', 'forgot-password.html', 'reset-password.html'].includes(file)) return;
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace <div class="card"> with <div class="card card-with-spark">
  // Also handle variations like <div class="card" style="...">
  let modified = false;
  
  // A simple regex approach
  const regex = /class="card"/g;
  content = content.replace(regex, (match) => {
    modified = true;
    return 'class="card card-with-spark"';
  });

  const modalRegex = /class="modal"/g;
  content = content.replace(modalRegex, (match) => {
    modified = true;
    return 'class="modal form-with-spark"';
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log('Processed', file);
  }
});
