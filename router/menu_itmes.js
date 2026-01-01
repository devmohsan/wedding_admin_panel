const express = require('express');
const router = express.Router();
const { db, storage } = require("../firebase/db");
const multer = require("multer");
const authentication = require('../middleware/auth');
const { v4: uuidv4 } = require("uuid");


const upload = multer({ storage: multer.memoryStorage() });




router.get('/', authentication, async (req, res) => {
  try {
    const user = req.user;

    let query = db.collection('menu_items');

    // 🔹 Company user → only own items
    if (user.role === 'company') {
      query = query.where('companyId', '==', user.companyId || user.id);
    }

    const snapshot = await query.get();

    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.render('menu_items', {
      menu_items: items,
      query: req.query,
      user
    });

  } catch (err) {
    console.error(err);
    req.flash('errors', 'Unable to fetch menu items');
    res.redirect('/dashboard');
  }
});


// ➕ Create pack
// router.post('/add', authentication, async (req, res) => {
//   const data = req.body;
//   try {
//     // create with auto-generated ID, then persist that ID in the document
//     const docRef = await db.collection('menu_items').add({
//       ...data,
//       price: parseFloat(data.price),
//       description: data.description
//     });
//     await docRef.update({ id: docRef.id });

//     req.flash('success', 'Pack created successfully.');
//     res.redirect('/menu_items');
//   } catch (err) {
//     console.log(err);
//     req.flash('errors', 'Error creating pack.');
//     res.redirect('/menu_items');
//   }
// });

router.get('/add',authentication, (req, res) => {
  res.render('addpack',{ pack: {},mode: 'add' });
});

router.post('/add', authentication,upload.single("image"), async (req, res) => {
  const data = req.body;

  try {
    const user = req.user;

    
    let image_url = null;

    // Handle logo upload to Firebase Storage
    if (req.file) {
      try {
        const fileName = `menu_items/${uuidv4()}_${req.file.originalname}`;
        const bucket = storage.bucket();
        const fileRef = bucket.file(fileName);

        // Upload the file
        await fileRef.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
          },
        });

        // Make the file public and get the download URL
        await fileRef.makePublic();
        image_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      } catch (uploadError) {
        console.error("Logo upload error:", uploadError);
        // Continue without logo if upload fails
        image_url = null;
      }
    }

    const docRef = await db.collection('menu_items').add({
      ...data,
      price: parseFloat(data.price),
      description: data.description,
      companyId: user.role === 'company' ? (user.companyId || user.id) : null
      ,image: image_url
    });

    await docRef.update({ id: docRef.id });

    req.flash('success', 'Menu Items  created successfully.');
    res.redirect('/menu_items');
  } catch (err) {
    console.log(err);
    req.flash('errors', 'Error creating menu items.');
    res.redirect('/menu_items');
  }
});


// ✏️ Render update form
router.get('/edit/:id',upload.single("image"), authentication, async (req, res) => {
  const doc = await db.collection('menu_items').doc(req.params.id).get();
  if (!doc.exists) return res.redirect('/menu_items');
  res.render('addpack', { pack: doc.data(), mode: 'edit' });
});

// 🔄 Update pack
router.post('/edit/:id', authentication, async (req, res) => {
  const data = req.body;
  try {
    const user = req.user;
    await db.collection('menu_items').doc(req.params.id).update({
      ...data,
      price: parseFloat(data.price),
      description: data.description,
      companyId: user.role === 'company' ? (user.companyId || user.id) : null,
    });
    req.flash('success', 'Menu Items updated successfully.');
    res.redirect('/menu_items');
  } catch (err) {
    req.flash('errors', 'Update failed.');
    res.redirect('/menu_items');
  }
});

// ❌ Delete
router.post('/delete/:id',authentication, async (req, res) => {
  try {
    await db.collection('menu_items').doc(req.params.id).delete();
    req.flash('success', 'Menu Items deleted.');
    res.redirect('/menu_items');
  } catch (err) {
    req.flash('errors', 'Delete failed.');
    res.redirect('/menu_items');
  }
});

module.exports = router;