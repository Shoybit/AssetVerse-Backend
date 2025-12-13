const express = require("express");
const router = express.Router();
const { getDB } = require("../config/db");
const verifyToken = require("../middlewares/verifyToken");

router.put("/users/me", verifyToken, async (req, res) => {
  const db = getDB();
  const email = req.user.email;

  const { name, phone, address, photo } = req.body;

  await db.collection("users").updateOne(
    { email },
    { $set: { name, phone, address, photo } }
  );

  const user = await db.collection("users").findOne({ email });
  res.json({ user });
});

module.exports = router;
