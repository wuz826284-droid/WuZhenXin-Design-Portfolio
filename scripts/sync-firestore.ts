import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

async function sync() {
  console.log("Reading configurations...");
  const configPath = path.resolve("src/firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    console.log("No Firebase config found, skipping Firestore sync.");
    return;
  }
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const portfolioPath = path.resolve("src/portfolio-data.json");
  if (!fs.existsSync(portfolioPath)) {
    console.log("No portfolio-data.json found, skipping.");
    return;
  }
  const portfolioItems = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));

  console.log("Initializing Firebase...");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Syncing portfolio items to Firestore...");
  for (const item of portfolioItems) {
    const docRef = doc(db, "portfolio", item.id);
    await setDoc(docRef, item);
    console.log(`Synced successfully: portfolio/${item.id}`);
  }
  console.log("Sync to Firestore complete!");
}

sync().catch(err => {
  console.error("Firestore synchronizer failure:", err);
  process.exit(1);
});
