import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAECHeFAqCvl0Dd1_PbWBWIjmj2XHGoliM",
  authDomain: "tefiis-admin.firebaseapp.com",
  projectId: "tefiis-admin",
  storageBucket: "tefiis-admin.firebasestorage.app",
  messagingSenderId: "98064108710",
  appId: "1:98064108710:web:6b6a7c084e44cdca1b7867",
  measurementId: "G-LSVRKQ1FV0"
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
const auth = getAuth(app);

export { app, analytics, auth };
