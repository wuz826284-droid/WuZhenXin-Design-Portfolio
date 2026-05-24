import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const isFirebaseEnabled = !!(
  firebaseConfig && 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.trim() !== "" &&
  !firebaseConfig.apiKey.includes("remixed-") &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId.trim() !== "" &&
  !firebaseConfig.projectId.includes("remixed-")
);

let app;
let db: any = null;
let auth: any = null;

if (isFirebaseEnabled) {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Authenticate anonymously so actions are validated by 'request.auth != null' in our Firestore Rules
    signInAnonymously(auth)
      .then(() => {
        console.log("Firebase Auth signed in anonymously successfully.");
      })
      .catch((err) => {
        console.warn("Firebase Auth anonymous sign-in failed:", err);
      });
  } catch (err) {
    console.error("Failed to bootstrap Firebase client:", err);
  }
} else {
  console.log("Firebase configuration is missing or empty. Standard Express API fallback mode active.");
}

export { db, auth, isFirebaseEnabled };
