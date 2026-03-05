import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setLogLevel } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "dummy",
  authDomain: "dummy",
  projectId: "fantasy-e3dady", // ensure you have emulator running locally
  storageBucket: "dummy",
  messagingSenderId: "dummy",
  appId: "dummy"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'member_stats'));
  console.log("Stats found:", snap.size);
  snap.forEach(d => console.log(d.id, '=>', d.data()));
  process.exit(0);
}
check();
