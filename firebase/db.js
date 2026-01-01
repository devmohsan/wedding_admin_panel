// firebase/db.js
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccount.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'food-app-82e8d.firebasestorage.app'
  });
}

const db = admin.firestore();
const storage = admin.storage();

module.exports = { db, storage };
// module.exports = db;
