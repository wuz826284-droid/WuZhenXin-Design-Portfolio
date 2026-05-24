const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'assets', 'images');
const pubDir = path.join(__dirname, '..', 'public', 'assets', 'images');

console.log('=== Syncing images from src/assets/images to public/assets/images ===');
if (!fs.existsSync(srcDir)) {
  console.log('Source directory does not exist. Skipping image sync.');
  process.exit(0);
}

if (!fs.existsSync(pubDir)) {
  fs.mkdirSync(pubDir, { recursive: true });
}

const files = fs.readdirSync(srcDir);
let count = 0;
files.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const pubPath = path.join(pubDir, file);
  
  if (fs.statSync(srcPath).isFile()) {
    // Check if file is different or doesn't exist in public
    let shouldCopy = false;
    if (!fs.existsSync(pubPath)) {
      shouldCopy = true;
    } else {
      const srcStat = fs.statSync(srcPath);
      const pubStat = fs.statSync(pubPath);
      if (srcStat.size !== pubStat.size) {
        shouldCopy = true;
      }
    }
    
    if (shouldCopy) {
      try {
        fs.copyFileSync(srcPath, pubPath);
        console.log(`Copied ${file} to public static folder`);
        count++;
      } catch (e) {
        console.error(`Failed to copy ${file}:`, e.message);
      }
    }
  }
});

console.log(`Sync complete. Copied ${count} images.`);
