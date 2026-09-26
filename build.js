import fs from 'fs';
import path from 'path';

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  fs.readdirSync(src).forEach(file => {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  });
}

// Ensure dist output directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Copy public JS files to dist root
copyDir('public', 'dist');

// Copy main HTML and CSS
fs.copyFileSync('index.html', 'dist/index.html');
fs.copyFileSync('style.css', 'dist/style.css');

console.log('Static build completed successfully!');
