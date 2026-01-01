const express = require('express');
const router = express.Router();
const {db} = require('../firebase/db');
const authentication = require('../middleware/auth');


router.get('/', authentication, async (req, res) => {
  try {
    const currentUser = req.user; // Get the authenticated user
    let query = db.collection('couples');
    
    // If user is a company, only show their own employees
    if (currentUser.role === 'company') {
      query = query.where('companyId', '==', currentUser.companyId || currentUser.id);
    }
    // If user is admin, show all users (no filter needed)
    // Note: You might want to add additional filters for admin if needed
    
    const snapshot = await query.get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.render('users', { 
      users,
      query: req.query, // Pass query parameters for pagination
      success_msg: req.flash('success'), 
      error_msg: req.flash('errors'),
      admin: currentUser // Pass current user as admin to template
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    req.flash('errors', 'Error fetching users: ' + err.message);
    res.redirect('/dashboard');
  }
});

router.get('/guests', authentication, async (req, res) => {
  try {
    const currentUser = req.user; // Get the authenticated user
    let query = db.collection('guests');
    
    // If user is admin, show all users (no filter needed)
    // Note: You might want to add additional filters for admin if needed
    
    const snapshot = await query.get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.render('guests', { 
      users,
      query: req.query, // Pass query parameters for pagination
      success_msg: req.flash('success'), 
      error_msg: req.flash('errors'),
      admin: currentUser // Pass current user as admin to template
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    req.flash('errors', 'Error fetching users: ' + err.message);
    res.redirect('/dashboard');
  }
});

router.post('/approve/:id', authentication, async (req, res) => {
  try {
    await db.collection('users').doc(req.params.id).update({ status: 'approved' });
    req.flash('success', 'User approved');
    res.redirect('/users');
  } catch (err) {
    req.flash('errors', 'Approval failed');
    res.redirect('/users');
  }
});

router.post('/suspend/:id', authentication, async (req, res) => {
  try {
    await db.collection('users').doc(req.params.id).update({ status: 'suspended' });
    req.flash('success', 'User suspended');
    res.redirect('/users');
  } catch (err) {
    req.flash('errors', 'Suspension failed');
    res.redirect('/users');
  }
});



router.post('/delete/:id', authentication, async (req, res) => {
  try {
    await db.collection('users').doc(req.params.id).delete();
    req.flash('success', 'User deleted');
    res.redirect('/users');
  } catch (err) {
    req.flash('errors', 'Delete failed');
    res.redirect('/users');
  }
});


// router.get('/view/:id', authentication, async (req, res) => {
//   try {
//     const doc = await db.collection('users').doc(req.params.id).get();
//     if (!doc.exists) throw new Error('User not found');
//     const user = doc.data();
//     res.render('viewUser', { user });
//   } catch (err) {
//     console.error('Error viewing user:', err.message);
//     req.flash('errors', 'Unable to view user');
//     res.redirect('/users');
//   }
// });

router.get('/view/:id', authentication, async (req, res) => {
  try {
    // Step 1: Fetch the user data from `users` collection
    const userRef = db.collection('couples').doc(req.params.id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const user = userDoc.data();

    // Step 2: Fetch all events from `events` collection for this couple
    const eventsSnapshot = await db.collection('events')
      .where('coupleId', '==', req.params.id)
      .get();

    const events = [];
    eventsSnapshot.forEach(doc => {
      events.push({ id: doc.id, ...doc.data() });
    });

    
    // Step 3: Render the EJS view with both user and events
    res.render('viewUser', {
      user,
      events,
      purchasedPacks: [] // Keep empty to avoid breaking legacy view logic if present
    });

  } catch (err) {
    console.error('Error viewing user and events:', err.message);
    req.flash('errors', 'Unable to load couple or events');
    res.redirect('/users');
  }
});



router.get('/viewGuest/:id', authentication, async (req, res) => {
  try {
    // Step 1: Fetch the guest data from `guests` collection
    const guestRef = db.collection('guests').doc(req.params.id);
    const guestDoc = await guestRef.get();

    if (!guestDoc.exists) {
      throw new Error('Guest not found');
    }

    const guest = { id: guestDoc.id, ...guestDoc.data() };

    // Step 2: Fetch bookings by guest's userId
    // The guest doc has 'userId', we use that to find bookings
    const bookingsSnapshot = await db.collection('bookings')
      .where('userId', '==', guest.userId) 
      .get();

    const bookingsWithDetails = [];

    // Step 3: Process each booking to get event and ticket info
    for (const doc of bookingsSnapshot.docs) {
      const booking = { id: doc.id, ...doc.data() };
      
      if (booking.eventId) {
        // Fetch Event
        const eventDoc = await db.collection('events').doc(booking.eventId).get();
        
        if (eventDoc.exists) {
          const event = { id: eventDoc.id, ...eventDoc.data() };
          const bookedTickets = [];

          // Match tickets from ticketQuantities map
          // structure: { "ticketId1": 2, "ticketId2": 1 }
          if (booking.ticketQuantities && event.tickets && Array.isArray(event.tickets)) {
             for (const [ticketId, quantity] of Object.entries(booking.ticketQuantities)) {
                // Find ticket in event.tickets array
                const ticketDetail = event.tickets.find(t => t.id === ticketId);
                if (ticketDetail) {
                   bookedTickets.push({
                      ...ticketDetail,
                      bookedQuantity: quantity
                   });
                }
             }
          }

          bookingsWithDetails.push({
            booking,
            event,
            tickets: bookedTickets
          });
        }
      }
    }

    console.log(bookingsWithDetails);

    res.render('viewGuest', { 
       user: guest, 
       bookingsWithDetails 
    });

  } catch (error) {
    console.error('Error viewing guest:', error.message);
    req.flash('errors', 'Unable to load guest details');
    res.redirect('/users/guests');
  }
});
router.get('/viewEvent/:id', authentication, async (req, res) => {
  try {
    // Step 1: Fetch the user data from `users` collection
    const userRef = db.collection('events').doc(req.params.id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const user = userDoc.data();

    // console.log(user);
    // Step 2: Fetch all events from `events` collection for this couple
    const eventsSnapshot = await db.collection('events')
      .where('id', '==', req.params.id)
      .get();

    const events = [];
    eventsSnapshot.forEach(doc => {
      events.push({ id: doc.id, ...doc.data() });
    });

    // Step 3: Render the EJS view with both user and events
    res.render('viewEvent', {
      user,
      // events,
      purchasedPacks: [] // Keep empty to avoid breaking legacy view logic if present
    });

  } catch (err) {
    console.error('Error viewing user and events:', err.message);
    req.flash('errors', 'Unable to load event');
    res.redirect('/users');
  }
});

module.exports = router;