const express = require('express');

const router = express.Router();
const bcrypt = require('bcrypt');

const { db } = require('../firebase/db');


router.get('/users', (req, res) => {
    db.collection('users').get().then((snapshot) => {
        const users = snapshot.docs.map((doc) => doc.data());
        res.render('users', { users });
    });
});
router.get('/create-admin', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash('123456789', 10);

        const docRef = await db.collection('admin_user').add({
            email: 'admin@admin.com',
            password: hashedPassword,
            name: 'Super admin'
        });

        // After adding, update the document with its ID as a field
        await docRef.update({ id: docRef.id });

        res.send({
            message: '✅ Admin user created successfully',
            id: docRef.id
        });
    } catch (error) {
        console.error('❌ Error creating admin:', error);
        res.status(500).send({ error: error.message });
    }
});
module.exports = router;