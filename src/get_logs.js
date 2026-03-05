import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, orderBy, query, limit } from "firebase/firestore";

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

async function run() {
  const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(5));
  const snap = await getDocs(q);
  snap.forEach(d => console.log(d.data()));
  process.exit();
}
run();
