const express = require('express');
const router = express.Router();
const authentication = require('../middleware/auth');
const { db, storage } = require('../firebase/db');



router.get('/', authentication, async (req, res) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        let query = db.collection('orders');

        // 🔹 Company user → only own orders
        if (user.role === 'company') {
            query = query.where('companyId', '==', user.companyId || user.id);
        }

        // 🔹 Get total count
        const countSnapshot = await query.get();
        const totalOrders = countSnapshot.size;
        const totalPages = Math.ceil(totalOrders / limit);
        const startAt = (page - 1) * limit;

        // 🔹 Fetch all orders (pagination in memory)
        const snapshot = await query.get();

        const allOrders = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // 🔹 Fetch related documents
            const [
                companyDoc,
                userDoc,
                menuDoc,
                itemsSnapshot
            ] = await Promise.all([
                data.companyId
                    ? db.collection('companies').doc(data.companyId).get()
                    : null,

                data.userId
                    ? db.collection('users').doc(data.userId).get()
                    : null,

                data.menuId
                    ? db.collection('menus').doc(data.menuId).get()
                    : null,

                data.items?.length
                    ? Promise.all(
                        data.items.map(item =>
                            db.collection('menu_items')
                                .doc(item.itemId)
                                .get()
                                .then(doc => ({
                                    doc,
                                    quantity: item.quantity
                                }))
                        )
                      )
                    : []
            ]);

            allOrders.push({
                id: doc.id,
                ...data,

                company: companyDoc?.exists
                    ? { id: companyDoc.id, ...companyDoc.data() }
                    : null,

                user: userDoc?.exists
                    ? { id: userDoc.id, ...userDoc.data() }
                    : null,

                menu: menuDoc?.exists
                    ? { id: menuDoc.id, ...menuDoc.data() }
                    : null,

                items: itemsSnapshot
                    .filter(i => i.doc.exists)
                    .map(i => ({
                        id: i.doc.id,
                        ...i.doc.data(),
                        quantity: i.quantity
                    }))
            });
        }

        // 🔹 Sort by createdAt (latest first)
        allOrders.sort((a, b) => {
            const dateA = a.createdAt?.toDate
                ? a.createdAt.toDate()
                : new Date(a.createdAt || 0);

            const dateB = b.createdAt?.toDate
                ? b.createdAt.toDate()
                : new Date(b.createdAt || 0);

            return dateB - dateA;
        });

        // 🔹 Apply pagination
        const orders = allOrders.slice(startAt, startAt + limit);

        res.render('orders', {
            orders,
            page,
            totalPages,
            totalOrders,
            admin: user
        });

    } catch (error) {
        console.log(error);
        req.flash('errors', 'Unable to fetch orders');
        res.redirect('/dashboard');
    }
});


router.post('/status/:id', authentication, async (req, res) => {
    try {
        const orderId = req.params.id;
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            throw new Error('Order not found');
        }

        const orderData = orderDoc.data();
        const newStatus = req.body.status;

        await orderRef.update({
            status: newStatus
        });

        req.flash('success', 'Order status updated successfully');
        res.redirect('/orders');

    } catch (error) {
        console.log(error);
        req.flash('errors', 'Failed to update order status');
        res.redirect('/orders');
    }
});

router.post('/payment/:id', authentication, async (req, res) => {
    try {
        const orderId = req.params.id;
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();
        const newStatus = req.body.payment_status;

        if (!orderDoc.exists) {
            throw new Error('Order not found');
        }

        await orderRef.update({
            payment_status: newStatus
        });

        req.flash('success', 'Order marked as paid successfully');
        res.redirect('/orders');

    } catch (error) {
        console.log(error);
        req.flash('errors', 'Failed to mark order as paid');
        res.redirect('/orders');
    }
}); 

router.get('/view/:id', authentication, async (req, res) => {
    try {
        const orderId = req.params.id;
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            throw new Error('Order not found');
        }

        const orderData = orderDoc.data();

        // ✅ Clean item IDs properly
        const validItemIds = orderData.items

        console.log('Valid Item IDs:', validItemIds.map(i =>  i.itemId));

        const [
            companyDoc,
            userDoc,
            menuDoc,
            itemsSnapshot
        ] = await Promise.all([
            orderData.companyId
                ? db.collection('companies').doc(orderData.companyId).get()
                : null,

            orderData.userId
                ? db.collection('users').doc(orderData.userId).get()
                : null,

            orderData.menuId
                ? db.collection('menus').doc(orderData.menuId).get()
                : null,

            validItemIds.length
                ? Promise.all(
                    validItemIds.map(item =>
                        db.collection('menu_items').doc(item.itemId).get()
                    )
                  )
                : []
        ]);

        const items = itemsSnapshot
            .filter(doc => doc.exists)
            .map(doc => ({ id: doc.id, ...doc.data() }));
        const order = {
            id: orderDoc.id,
            ...orderData,
            company: companyDoc?.exists ? { id: companyDoc.id, ...companyDoc.data() } : null,
            user: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
            menu: menuDoc?.exists ? { id: menuDoc.id, ...menuDoc.data() } : null,
            items
        };

        res.render('order_view', { order });

    } catch (error) {
        console.error(error);
        req.flash('errors', 'Unable to view order');
        res.redirect('/orders');
    }
});


module.exports = router;