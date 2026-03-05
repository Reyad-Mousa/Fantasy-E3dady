import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: "fantasy-e3dady-2024.firebaseapp.com",
    projectId: "fantasy-e3dady-2024",
    storageBucket: "fantasy-e3dady-2024.appspot.com",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "732049103649",
    appId: process.env.VITE_FIREBASE_APP_ID || "1:732049103649:web:3eb06f15cccebc031945be"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const q = query(collection(db, 'scores'), limit(15));
  const snap = await getDocs(q);
  snap.docs.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
  process.exit(0);
}

check().catch(console.error);
