require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require("cookie-parser"); 

const bodyParser = require('body-parser');
const adminRoutes = require('./router/admin');
const loginRoutes = require('./router/login');
const indexRoutes = require('./router/index');
const menu_itemsRoutes = require('./router/menu_itmes');
const userRoutes= require('./router/users');
const companiesRoutes= require('./router/company');
const orders= require('./router/orders');

const app = express();
app.use(
    session({
        secret: 'techie members', // use env variable in real projects
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // set secure: true in HTTPS environments
    })
);


app.use(flash())

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cookieParser());
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('errors');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// app.use('/', adminRoutes);

app.use('/', loginRoutes);
app.use('/', indexRoutes);
app.use('/menu_items', menu_itemsRoutes);
app.use('/users', userRoutes);
app.use('/companies', companiesRoutes);
app.use('/orders', orders);



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Admin panel running at http://localhost:${PORT}/admin`);
});