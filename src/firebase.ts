import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
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
let storage: any = null;

if (isFirebaseEnabled) {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
    
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

export async function uploadImageToStorage(base64Data: string, originalUrl: string): Promise<string> {
  if (!isFirebaseEnabled || !storage) {
    throw new Error("Firebase configuration/storage is not enabled.");
  }
  try {
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
    // Extract file extension or assume .jpg
    const hash = Math.random().toString(36).substring(2, 11);
    const datePath = `uploads/${Date.now()}_${hash}.jpg`;
    
    const storageRef = ref(storage, datePath);
    await uploadString(storageRef, base64Content, "base64", {
      contentType: "image/jpeg",
    });
    
    const downloadUrl = await getDownloadURL(storageRef);
    console.log("Image uploaded to Firebase Storage and received persistent secure url:", downloadUrl);
    return downloadUrl;
  } catch (error) {
    console.error("Firebase Storage upload exception:", error);
    throw error;
  }
}

export { db, auth, isFirebaseEnabled };
