const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {db} = require('../firebase/db');

const secretKey = process.env.JWT_SECRET;

router.get('/', (req, res) => {

    res.render('login');

});

router.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password) {
            req.flash('error', 'Email and password are required');
            return res.redirect('/');
        }
        let collection;
        if(role == 'company'){
            collection = 'companies';
        }else{
            collection = 'admin_user';
        }
        const snapshot = await db.collection(collection).where('email', '==', email).limit(1).get();

        if (snapshot.empty) {
            req.flash('error', 'Invalid email');
            return res.redirect('/');

        }
     
        const userDoc = snapshot.docs[0];
        const user = userDoc.data();

        // res.send(typeof (password))

        const isMatch = await bcrypt.compare(password, user.password);
   
        if (!isMatch) {
            req.flash('error', 'Invalid email or password not match');
            return res.redirect('/');
        }



        const token = jwt.sign(
            {
                id: userDoc.id,
                email: user.email,
                name: user.name,
                role: user.role
            },
            secretKey,
            { expiresIn: '1d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // set to true in production with HTTPS
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        });
        req.flash('success', 'You have been logged in successfully.');
        return res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).send({error: error.message});
    }
})


router.post('/logout', (req, res) => {
    res.clearCookie('token'); // Clear JWT token cookie
    req.flash('success', 'You have been logged out successfully.');
    res.redirect('/'); // Redirect to login or home page
});

module.exports = router;