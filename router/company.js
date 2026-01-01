const express = require("express");

const router = express.Router();
const bcrypt = require("bcrypt");
const { db, storage } = require("../firebase/db");
const authentication = require("../middleware/auth");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

// Password generation function
function generatePassword() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

router.get("/", authentication, async (req, res) => {
  const snapshot = await db.collection("companies").get();
  const companies = snapshot.docs.map((doc) => doc.data());
  res.render("companies", { companies, query: req.query });
});

router.get("/add", authentication, (req, res) => {
  const initialPassword = generatePassword();
  res.render("addcompany", {
    data: { password: initialPassword },
    mode: "add",
  });
});

router.get("/edit/:id", authentication, async (req, res) => {
  const doc = await db.collection("companies").doc(req.params.id).get();
  if (!doc.exists) return res.redirect("/companies");
  res.render("addcompany", { data: doc.data(), mode: "edit" });
});

router.post("/add", authentication, upload.single("logo"), async (req, res) => {
  try {
    const data = req.body;
    const password = data.password;
    const hashedPassword = await bcrypt.hash(password, 10);

    let logoUrl = null;

    // Handle logo upload to Firebase Storage
    if (req.file) {
      try {
        const fileName = `companies/${uuidv4()}_${req.file.originalname}`;
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
        logoUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      } catch (uploadError) {
        console.error("Logo upload error:", uploadError);
        // Continue without logo if upload fails
        logoUrl = null;
      }
    }

    const docRef = await db.collection("companies").add({
      name: data.name,
      company_code: data.company_code,
      email: data.email,
      phone: data.phone || null,
      logo: logoUrl,
      password: hashedPassword,
      is_active: data.is_active === "true",
      is_approved: data.is_approved === "true",
      role: "company",
      createdAt: new Date().toDateString(),
    });

    // Update the document to include its own ID
    const companyId = docRef.id;
    await docRef.update({ id: companyId });

    const company = await docRef.get();
    const companyData = company.data();

    // Send email to the company (optional, don't fail if email fails)
    try {
      const mailOptions = {
        from: process.env.MAIL_USER,
        to: data.email,
        subject: "Welcome to Lezzetli App - Your Company Account",
        html: `
                    <h2>Welcome to Lezzetli App!</h2>
                    <p>Your company has been successfully registered.</p>
                    <p><strong>Company Name:</strong> ${data.name}</p>
                    <p><strong>Company Code:</strong> ${data.company_code}</p>
                    <p><strong>Email:</strong> ${data.email}</p>
                    <p><strong>Password:</strong> ${password}</p>
                    <p>Please login to your account using the provided credentials.</p>
                `,
      };

      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.warn("Email sending failed:", emailError.message);
      // Don't fail the entire process if email fails
    }
    req.flash("success", "New company added and email sent successfully.");
    res.redirect("/companies");
  } catch (error) {
    console.error("Error adding company:", error);
    res.status(500).send("Error adding company");
  }
});

router.post(
  "/edit/:id",
  authentication,
  upload.single("logo"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { ...req.body };

      if (updates.password) {
        updates.password = await bcrypt.hash(updates.password, 10);
      }

      if (req.file) {
        const fileName = `companies/${uuidv4()}-${req.file.originalname}`;
        const file = storage.file(fileName);

        await file.save(req.file.buffer, {
          contentType: req.file.mimetype,
        });

        await file.makePublic();
        updates.logo = file.publicUrl();
      }

      updates.updated_at = new Date();

      await db.collection("companies").doc(id).update(updates);


    req.flash("success", "Company updated successfully.");
    res.redirect("/companies");
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/delete/:id', authentication, async (req, res) => {
  try {
    await db.collection('companies').doc(req.params.id).delete();
    req.flash('success', 'Company deleted successfully.');
    res.redirect('/companies');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/toggle-approval/:id', authentication, async (req, res) => {
  try {
    const companyRef = db.collection('companies').doc(req.params.id);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
        return res.flash('errors', 'Company not found.'), res.redirect('/companies');
    }

    const companyData = companyDoc.data();
    const isApproved = !companyData.is_approved;

    await companyRef.update({ is_approved: isApproved });
    req.flash('success', `Company has been ${isApproved ? 'approved' : 'disapproved'}.`);
    res.redirect('/companies');
  } catch (err) {
    res.status(500).json({ error: err.message });
  } 
});

router.post('/toggle-status/:id', authentication, async (req, res) => {
  try {
    const companyRef = db.collection('companies').doc(req.params.id);
    const companyDoc = await companyRef.get();          
    if (!companyDoc.exists) {
        return res.flash('errors', 'Company not found.'), res.redirect('/companies');
    }
    const companyData = companyDoc.data();
    const isActive = !companyData.is_active;
    await companyRef.update({ is_active: isActive });
    req.flash('success', `Company has been ${isActive ? 'activated' : 'deactivated'}.`);
    res.redirect('/companies');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




module.exports = router;
