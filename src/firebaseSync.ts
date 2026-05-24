import { db, isFirebaseEnabled } from "./firebase";
import { doc, setDoc, collection, getDocs, writeBatch, deleteDoc } from "firebase/firestore";

// Safe Base64 document helper to generate clean, short, valid Firestore IDs
function getSafeId(url: string): string {
  try {
    const cleanUrl = url.trim().replace(/[\s\?\#\%\&]/g, "_");
    // Ensure id contains only permissible characters matches ^[a-zA-Z0-9_\-]+$
    const safeStr = btoa(encodeURIComponent(cleanUrl))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    return safeStr.slice(0, 100);
  } catch (e) {
    return "url_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  }
}

export async function fetchLivePortfolio(fallbackData: any[]): Promise<any[]> {
  if (!isFirebaseEnabled || !db) {
    return fallbackData;
  }
  try {
    const querySnapshot = await getDocs(collection(db, "portfolio"));
    if (querySnapshot.empty) {
      console.log("Firestore portfolio collection is empty. Bootstrapping with default portfolio items...");
      const batch = writeBatch(db);
      for (const item of fallbackData) {
        const docRef = doc(db, "portfolio", item.id);
        batch.set(docRef, item);
      }
      await batch.commit();
      console.log("Firestore portfolio successfully populated with baseline default projects.");
      return fallbackData;
    }
    const items: any[] = [];
    querySnapshot.forEach((doc) => {
      items.push(doc.data());
    });
    // Sort based on "part" order sequence
    return items.sort((a, b) => (a.part || "").localeCompare(b.part || ""));
  } catch (err) {
    console.warn("Failed to retrieve live portfolio items from Firestore:", err);
    return fallbackData;
  }
}

export async function saveLivePortfolioItem(item: any): Promise<boolean> {
  if (!isFirebaseEnabled || !db) {
    return false;
  }
  try {
    await setDoc(doc(db, "portfolio", item.id), item);
    console.log(`Successfully persisted portfolio category doc: portfolio/${item.id}`);
    return true;
  } catch (err) {
    console.error(`Failed to save portfolio item ${item.id} to Firestore:`, err);
    return false;
  }
}

export async function deleteLivePortfolioItem(itemId: string): Promise<boolean> {
  if (!isFirebaseEnabled || !db) {
    return false;
  }
  try {
    await deleteDoc(doc(db, "portfolio", itemId));
    console.log(`Successfully deleted portfolio doc: portfolio/${itemId}`);
    return true;
  } catch (err) {
    console.error(`Failed to delete portfolio itemId ${itemId} in Firestore:`, err);
    return false;
  }
}

export async function saveFullPortfolio(updatedProjects: any[]): Promise<boolean> {
  if (!isFirebaseEnabled || !db) {
    return false;
  }
  try {
    // Delete missing categories
    const querySnapshot = await getDocs(collection(db, "portfolio"));
    const existingIds = updatedProjects.map(p => p.id);
    for (const docSnap of querySnapshot.docs) {
      if (!existingIds.includes(docSnap.id)) {
        await deleteDoc(doc(db, "portfolio", docSnap.id));
      }
    }
    // Set active categories
    for (const item of updatedProjects) {
      await setDoc(doc(db, "portfolio", item.id), item);
    }
    console.log("Full portfolio index successfully updated and synced directly to Firestore.");
    return true;
  } catch (err) {
    console.error("Failed to bulk sync portfolio updates to Firestore:", err);
    return false;
  }
}

export async function fetchLiveOverrides(fallbackOverrides: Record<string, string>): Promise<Record<string, string>> {
  if (!isFirebaseEnabled || !db) {
    return fallbackOverrides;
  }
  try {
    const querySnapshot = await getDocs(collection(db, "image_overrides"));
    const overrides: Record<string, string> = { ...fallbackOverrides };
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.originalUrl && data.uploadedUrl) {
        overrides[data.originalUrl] = data.uploadedUrl;
      }
    });
    return overrides;
  } catch (err) {
    console.warn("Failed to fetch live image overrides from Firestore:", err);
    return fallbackOverrides;
  }
}

export async function saveLiveOverride(originalUrl: string, uploadedUrl: string): Promise<boolean> {
  if (!isFirebaseEnabled || !db) {
    return false;
  }
  try {
    const safeDocId = getSafeId(originalUrl);
    await setDoc(doc(db, "image_overrides", safeDocId), {
      originalUrl,
      uploadedUrl
    });
    console.log(`Saved override successfully: image_overrides/${safeDocId}`);
    return true;
  } catch (err) {
    console.error("Failed to commit image override translation mapping to Firestore:", err);
    return false;
  }
}
