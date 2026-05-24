const fs = require('fs');
const path = require('path');

// Dynamically determine referenced files by scanning codebase
const referencedFiles = new Set([
  'regenerated_image_1779408921933.png',
  'regenerated_image_1779409373917.png',
  'regenerated_image_1779409409989.png',
  'regenerated_image_1779409532178.png',
  'regenerated_image_1779409817532.png',
  'regenerated_image_1779409823567.png',
  'regenerated_image_1779409850202.png',
  'regenerated_image_1779343098956.png',
  'regenerated_image_1779343196172.png',
  'regenerated_image_1777987826245.png',
  'regenerated_image_1777987859069.png',
  'regenerated_image_1778157281116.png',
  'regenerated_image_1777987878599.png',
  'regenerated_image_1779408918460.png',
  'work_insights_illustrations_1779410458171.png',
  'regenerated_image_1778551850611.png'
]);

// 1. Scan src/portfolio-data.json for references
try {
  const portfolioPath = path.join(__dirname, '..', 'src', 'portfolio-data.json');
  if (fs.existsSync(portfolioPath)) {
    const content = fs.readFileSync(portfolioPath, 'utf8');
    const matches = content.match(/(?:\/)?assets\/images\/[^"'\s]+/g);
    if (matches) {
      matches.forEach(match => {
        const filename = path.basename(match);
        referencedFiles.add(filename);
      });
    }
  }
} catch (e) {
  console.error('Error scanning portfolio-data.json:', e);
}

// 2. Scan src/App.tsx for references
try {
  const appPath = path.join(__dirname, '..', 'src', 'App.tsx');
  if (fs.existsSync(appPath)) {
    const content = fs.readFileSync(appPath, 'utf8');
    const matches = content.match(/(?:\/)?assets\/images\/[^"'\s{}()]+/g);
    if (matches) {
      matches.forEach(match => {
        const filename = path.basename(match);
        referencedFiles.add(filename);
      });
    }
  }
} catch (e) {
  console.error('Error scanning App.tsx:', e);
}

// 3. Scan src/image-overrides.json for references
try {
  const overridesPath = path.join(__dirname, '..', 'src', 'image-overrides.json');
  if (fs.existsSync(overridesPath)) {
    const content = fs.readFileSync(overridesPath, 'utf8');
    const matches = content.match(/(?:\/)?assets\/images\/[^"'\s]+/g);
    if (matches) {
      matches.forEach(match => {
        const filename = path.basename(match);
        referencedFiles.add(filename);
      });
    }
  }
} catch (e) {
  console.error('Error scanning image-overrides.json:', e);
}

console.log(`Detected ${referencedFiles.size} referenced images from code scanning.`);

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(ent => {
    const fullPath = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      cleanDir(fullPath);
      // If the directory is now empty or has a nested empty directory, remove it
      if (fs.readdirSync(fullPath).length === 0) {
        console.log(`Removing empty directory: ${fullPath}`);
        fs.rmdirSync(fullPath);
      }
    } else if (ent.isFile()) {
      const filename = ent.name;
      if (!referencedFiles.has(filename)) {
        console.log(`Deleting unreferenced file: ${fullPath}`);
        fs.unlinkSync(fullPath);
      }
    }
  });
}

console.log('=== Cleaning unreferenced images in src/assets/images ===');
cleanDir(path.join(__dirname, '..', 'src', 'assets', 'images'));

console.log('=== Cleaning unreferenced images in public/assets/images ===');
cleanDir(path.join(__dirname, '..', 'public', 'assets', 'images'));

console.log('=== Cleanup complete ===');
