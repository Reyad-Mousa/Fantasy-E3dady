import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = {
  apiKey: "dummy",
  authDomain: "dummy",
  projectId: "fantasy-e3dady",
  storageBucket: "dummy",
  messagingSenderId: "dummy",
  appId: "dummy"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'member_stats'));
  console.log(snap.docs.map(d => d.data()));
  process.exit(0);
}
check();
