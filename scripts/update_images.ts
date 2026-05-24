import fs from 'fs';
import path from 'path';

async function main() {
  const overridesPath = 'src/image-overrides.json';
  let overrides: Record<string, string> = {};
  if (fs.existsSync(overridesPath)) {
    try {
      overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    } catch(e) {}
  }
  
  let appTsx = fs.readFileSync('src/App.tsx', 'utf8');
  let count = 0;
  
  // 1. Replace overrides in App.tsx
  for (const [oldPath, newPath] of Object.entries(overrides)) {
    if (appTsx.includes(oldPath)) {
      appTsx = appTsx.split(oldPath).join(newPath);
      count++;
    }
  }

  // 2. Find remote URLs
  const remoteRegex = /"(https?:\/\/[^"]+)"/g;
  const matches = [...appTsx.matchAll(remoteRegex)];
  const urls = [...new Set(matches.map(m => m[1]))].filter(url => !url.includes("w3.org"));
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`Downloading: ${url}`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const newName = `downloaded_${Date.now()}_${i}.jpg`;
      const pubPath = path.join(process.cwd(), 'public', 'assets', 'images', newName);
      const srcPath = path.join(process.cwd(), 'src', 'assets', 'images', newName);
      
      fs.mkdirSync(path.dirname(pubPath), { recursive: true });
      fs.mkdirSync(path.dirname(srcPath), { recursive: true });
      
      fs.writeFileSync(pubPath, buffer);
      fs.writeFileSync(srcPath, buffer);
      
      const localUrl = `/assets/images/${newName}`;
      appTsx = appTsx.split(url).join(localUrl);
      console.log(`Saved as ${localUrl}`);
      count++;
    } catch (e) {
      console.error(`Failed to download ${url}:`, e);
    }
  }

  // 3. Move misplaced static assets from user drag/drop
  const nestedDir = path.join(process.cwd(), 'src', 'assets', 'images', 'assets', 'images');
  if (fs.existsSync(nestedDir)) {
    const files = fs.readdirSync(nestedDir);
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        const nestedPath = path.join(nestedDir, file);
        const pubPath = path.join(process.cwd(), 'public', 'assets', 'images', file);
        const srcPath = path.join(process.cwd(), 'src', 'assets', 'images', file);
        fs.copyFileSync(nestedPath, pubPath);
        fs.copyFileSync(nestedPath, srcPath);
        console.log(`Moved misplaced file ${file} to root image folder`);
      }
    }
  }

  fs.writeFileSync('src/image-overrides.json', '{}');
  fs.writeFileSync('src/App.tsx', appTsx, 'utf8');
  console.log(`Replaced ${count} total image paths in App.tsx`);
}

main();
