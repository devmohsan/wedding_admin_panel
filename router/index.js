const express = require('express');
const router = express.Router();
const authentication = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');
const fs = require('fs');
const { db, storage } = require('../firebase/db');
const dayjs = require('dayjs');
const crypto = require('crypto');





function decryptFirst32Bytes(encryptedTextWithIV) {
  try {
    // 1. Split into ciphertext and IV parts
    const [ciphertextBase64, ivBase64] = encryptedTextWithIV.split(':');
    
    // 2. Decode from Base64
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    
    // 3. Get first 32 bytes of ciphertext (2 AES blocks)
    const first32Bytes = ciphertext.subarray(0, 32);
    
    // 4. Verify we have enough data
    if (first32Bytes.length < 32) {
      throw new Error('Ciphertext too short - need at least 32 bytes');
    }
    
    // 5. Prepare key (must match Flutter exactly)
    const key = Buffer.from('my 32 length key................'); // 32 bytes
    
    // 6. Create decipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    // 7. Decrypt just the first 32 bytes (2 blocks)
    let decrypted = decipher.update(first32Bytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 8. Remove PKCS7 padding if present
    const padLength = decrypted[decrypted.length - 1];
    if (padLength > 0 && padLength <= 16) {
      decrypted = decrypted.slice(0, -padLength);
    }
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption failed:', {
      error: error.message,
      input: encryptedTextWithIV.substring(0, 30) + '...'
    });
    return null;
  }
}


function decryptAES(encryptedTextWithIV) {
  try {
    // 1. Verify input format
    if (!encryptedTextWithIV.includes(':')) {
      throw new Error('Invalid format - missing IV separator');
    }

    // 2. Extract components
    const [encryptedBase64, ivBase64] = encryptedTextWithIV.split(':');
    if (!encryptedBase64 || !ivBase64) {
      throw new Error('Missing encrypted data or IV');
    }

    // 3. Prepare key (MUST match Flutter key exactly)
    const key = Buffer.from('my 32 length key................'); // 32 bytes
    
    // 4. Decode from Base64
    const iv = Buffer.from(ivBase64, 'base64');
    const encrypted = Buffer.from(encryptedBase64, 'base64');

    // 5. Verify lengths
    console.log(`IV length: ${iv.length} bytes (must be 16)`);
    console.log(`Encrypted length: ${encrypted.length} bytes (must be multiple of 16)`);

    if (iv.length !== 16) {
      throw new Error('Invalid IV length - must be 16 bytes');
    }

    if (encrypted.length % 16 !== 0) {
      throw new Error('Invalid ciphertext length - must be multiple of 16');
    }

    // 6. Decrypt with error handling
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    // Try both automatic and manual padding
    try {
      // Attempt with automatic padding
      decipher.setAutoPadding(true);
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (autoPadError) {
      console.log('Auto-padding failed, trying manual padding...');
      
      // Fallback to manual padding
      decipher.setAutoPadding(false);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      // Remove PKCS#7 padding manually
      const padLength = decrypted[decrypted.length - 1];
      if (padLength > 0 && padLength <= 16) {
        decrypted = decrypted.slice(0, -padLength);
      }
      
      return decrypted.toString('utf8');
    }
  } catch (error) {
    console.error('Decryption failed:', {
      error: error.message,
      inputLength: encryptedTextWithIV.length,
      ivPart: encryptedTextWithIV.split(':')[1]?.length
    });
    return null;
  }
}

const upload = multer({ storage: multer.memoryStorage() });


router.get('/dashboard', authentication, async (req, res) => {
    try {
        const user = req.user;

        // Fetch Total Counts
        const couplesSnapshot = await db.collection('couples').get();
        const guestsSnapshot = await db.collection('guests').get();
        const bookingsSnapshot = await db.collection('bookings').get();
        const eventsSnapshot = await db.collection('events').get();

        const totalCouples = couplesSnapshot.size;
        const totalGuests = guestsSnapshot.size;
        const totalBookings = bookingsSnapshot.size;
        const totalEvents = eventsSnapshot.size;

        // Fetch Recent Couples
        const recentCouplesSnapshot = await db.collection('couples')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        const recentCouples = recentCouplesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch Recent Guests
        const recentGuestsSnapshot = await db.collection('guests')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        const recentGuests = recentGuestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch Top 5 Events
        const topEventsSnapshot = await db.collection('events')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        const topEvents = topEventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const dashboardData = {
            totalCouples,
            totalGuests,
            totalBookings,
            totalEvents,
            recentCouples,
            recentGuests,
            topEvents
        };

        res.render('dashboard', {
            admin: user,
            dashboard: dashboardData,
            success_msg: req.flash('success'),
            error_msg: req.flash('errors')
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        req.flash('errors', 'Unable to load dashboard data');
        res.redirect('/');
    }
});



// router.post('/tonepacks/upload', upload.single('csvFile'), (req, res) => {
//     const { type, doc_name } = req.body; // 'classic' or 'urban'
//     const filePath = req.file.path;

//     const tones = {};

//     fs.createReadStream(filePath)
//         .pipe(csv())
//         .on('data', (row) => {
//             const tone = row.Tone?.trim();        // Column name must be 'tone'
//             const response = row.Response?.trim(); // Column name must be 'response'

//             if (tone && response) {
//                 if (!tones[tone]) tones[tone] = [];
//                 tones[tone].push(response);
//             }
//         })
//         .on('end', async () => {
//             try {
//                 // Write to Firestore: classic/urban → starter_package → tone arrays
//                 await db.collection(type).doc(doc_name).set(tones, { merge: true });
//                 fs.unlinkSync(filePath); // Clean up temp file
//                 req.flash('success', 'Tone pack uploaded successfully.');
//                 return res.redirect('/tonepacks');
//             } catch (error) {
//                 console.error('Firestore write failed:', error);
//                 req.flash('error', 'Failed to upload tone pack.');
//                 return res.redirect('/tonepacks');
//             }
//         });
// });
router.post('/tonepacks/upload', upload.single('csvFile'), async (req, res) => {
    const { type, doc_name } = req.body;
    const file = req.file;

    if (!file) {
        req.flash('errors', 'No file uploaded');
        return res.redirect('/tonepacks');
    }

    const tones = {};
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    bufferStream
        .pipe(csv())
        .on('data', (row) => {
            const tone = row.Tone?.trim();
            const response = row.Response?.trim();

            if (tone && response) {
                if (!tones[tone]) tones[tone] = [];
                tones[tone].push(response);
            }
        })
        .on('end', async () => {
            try {
                // Upload file to Firebase Storage
                const storagePath = `tonepacks/${type}/${Date.now()}_${file.originalname}`;
                const fileRef = storage.bucket().file(storagePath);

                const uploadStream = fileRef.createWriteStream({
                    metadata: { contentType: file.mimetype }
                });

                uploadStream.end(file.buffer);

                uploadStream.on('error', (err) => {
                    console.error('Upload failed:', err);
                    req.flash('errors', 'File upload failed.');
                    return res.redirect('/tonepacks');
                });

                uploadStream.on('finish', async () => {
                    // Get a signed URL (valid for 1 year)
                    const [url] = await fileRef.getSignedUrl({
                        action: 'read',
                        expires: Date.now() + 365 * 24 * 60 * 60 * 1000
                    });

                    // Save to Firestore
                    await db.collection(type).doc(doc_name).set({
                        ...tones,
                        fileUrl: url,
                        uploadedAt: new Date()
                    }, { merge: true });

                    req.flash('success', 'Tone pack uploaded and saved to Firebase Storage.');
                    res.redirect('/tonepacks');
                });

            } catch (err) {
                console.error('Processing failed:', err);
                req.flash('errors', 'Something went wrong during upload.' + err.message);
                res.redirect('/tonepacks');
            }
        });
});

// router.get('/menus', authentication, async (req, res) => {
//     try {
//         // const collection = req.query.collection || 'urban'; // Default to urban if not specified
//         const snapshot = await db.collection('menus').get();

//         const docList = [];
//         snapshot.forEach(doc => {
//             docList.push({
//                 id: doc.id,
//                 fileUrl: doc.data().fileUrl || null
//             });
//         });

//         res.render('tonepacks', {
//             docList,
//             query: req.query
//         });
//     } catch (err) {
//         console.error('Error fetching documents:', err);
//         req.flash('errors', `Unable to fetch ${req.query.collection || 'urban'} tone packs: ${err.message}`);
//         res.redirect('/dashboard');
//     }
// });

// router.get('/menus', authentication, async (req, res) => {
//     try {
//         const snapshot = await db.collection('menus').get();
        
//         const menus = [];
//         snapshot.forEach(doc => {
//             const data = doc.data();
//             menus.push({
//                 id: doc.id,
//                 companyId: data.companyId || "",
//                 cutoff_time: data.cutoff_time || "",
//                 date: data.date || "",
//                 is_active: data.is_active !== undefined ? data.is_active : true,
//                 mealType: data.mealType || "lunch",
//                 menu_items: data.menu_items || [],
//                 type: data.type || "daily"
//             });
//         });

//         res.render('menus', {
//             menus: menus,  // Changed from docList to menus
//             query: req.query
//         });
//     } catch (err) {
//         console.error('Error fetching menus:', err);
//         req.flash('errors', `Unable to fetch menus: ${err.message}`);
//         res.redirect('/dashboard');
//     }
// });

router.get('/menus', authentication, async (req, res) => {
    try {
        const user = req.user;

        let query = db.collection('menus');

        if (user.role === 'company') {
            query = query.where('companyId', '==', user.companyId || user.id);
        }

        const snapshot = await query.get();

        const menus = [];

        // 🔹 Collect unique companyIds
        const companyIds = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.companyId) companyIds.add(data.companyId);
        });

        // 🔹 Fetch companies in parallel
        const companyMap = {};
        await Promise.all(
            [...companyIds].map(async (companyId) => {
                const companyDoc = await db.collection('companies').doc(companyId).get();
                if (companyDoc.exists) {
                    companyMap[companyId] = {
                        id: companyDoc.id,
                        ...companyDoc.data()
                    };
                }
            })
        );

        // 🔹 Build menus array (UNCHANGED + company)
        snapshot.forEach(doc => {
            const data = doc.data();
            menus.push({
                id: doc.id,
                companyId: data.companyId || "",
                company: companyMap[data.companyId] || null, // ✅ added
                cutoff_time: data.cutoff_time || "",
                date: data.date || "",
                is_active: data.is_active !== undefined ? data.is_active : true,
                mealType: data.mealType || "lunch",
                menu_items: data.menu_items || [],
                type: data.type || "daily"
            });
        });

        res.render('menus', {
            menus: menus,
            query: req.query,
            user: user
        });

    } catch (err) {
        console.error('Error fetching menus:', err);
        req.flash('errors', `Unable to fetch menus: ${err.message}`);
        res.redirect('/dashboard');
    }
});


router.get('/add', authentication, async (req, res) => {
  try {
    const snapshot = await db.collection('menu_items').get();
    const companysnapshot = await db.collection('companies').get();
    const companies = companysnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // console.log('Menu items fetched for menu creation:', items);
    res.render('add_menu', {
      data: {},
      items,
      companies,
      mode: 'add'
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong');
  }
});


router.post('/menus/add', authentication, async (req, res) => {
    const data = req.body;
    try {
        // Prepare menu data with companyId if user is a company
        const menuData = {
            ...data,
            menu_items: Array.isArray(data.menu_items) ? data.menu_items : [data.menu_items],
        };
        
        // If user is a company, ensure companyId is set from user data
        if (req.user && req.user.role === 'company') {
            // Use companyId from user object, or user.id as fallback
            menuData.companyId = req.user.companyId || req.user.id;
        }
        // If user is admin, companyId will be whatever was submitted in the form (or empty)

        const docRef = await db.collection('menus').add(menuData);
        await docRef.update({ id: docRef.id });

        req.flash('success', 'Menu created successfully.');
        res.redirect('/menus');
    } catch (err) {
        console.log(err);
        req.flash('errors', 'Error creating menu.');
        res.redirect('/menus');
    }
});

router.get('/edit/:docId', authentication, async (req, res) => {
    const doc = await db.collection('menus').doc(req.params.docId).get();
    if (!doc.exists) return res.redirect('/menus');

    const snapshot = await db.collection('menu_items').get();
       const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    const companysnapshot = await db.collection('companies').get();
    const companies = companysnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.render('add_menu', {
        data: doc.data(),
        items: items,
        companies: companies,
        mode: 'edit'
    });
})

router.post('/menus/edit/:docId', authentication, async (req, res) => {
    const data = req.body;
    try{
        await db.collection('menus').doc(req.params.docId).update({
            ...data,
            menu_items: Array.isArray(data.menu_items) ? data.menu_items : [data.menu_items],
        });
        req.flash('success', 'Menu updated successfully.');
        res.redirect('/menus');
    }catch(err){
        req.flash('errors', 'Update failed.');
        res.redirect('/menus');
    }
})




router.post('/menus/:docId', authentication, async (req, res) => {
    try {
        const { docId } = req.params;
        const { collection } = req.query;

        if (!collection) {
            req.flash('errors', 'Collection not specified.');
            return res.redirect('/tonepacks');
        }

        await db.collection(collection).doc(docId).delete();

        req.flash('success', 'Tone pack deleted successfully.');
        res.redirect('/tonepacks');
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;