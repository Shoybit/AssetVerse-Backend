require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

// Connect to DB then start server
connectDB().then(() => {
  // mount routes after DB is ready
  const authRoutes = require('./routes/auth.route.js');
  const testRoutes = require('./routes/test.route.js'); // your test route
    // protected test routes
  const protectedRoutes = require('./routes/protected.route');
  app.use('/protected', protectedRoutes);
  app.use('/api', authRoutes);
  app.use('/', testRoutes);

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`AssetVerse Backend running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('DB connect error', err);
});
