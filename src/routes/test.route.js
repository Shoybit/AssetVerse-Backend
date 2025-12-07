const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("AssetVerse Backend Running...");
});

module.exports = router;
