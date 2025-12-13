// src/middlewares/verifyToken.js
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

/**
 * verifyToken middleware
 * - accepts Authorization: Bearer <token>
 * - supports token payloads containing one of: id, _id, userId, sub, or email
 * - looks up the user in DB (excluding password) and attaches sanitized user to req.user
 */
module.exports = async function verifyToken(req, res, next) {
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader)
      return res.status(401).json({ message: "Authorization header missing" });

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res
        .status(401)
        .json({
          message:
            "Invalid Authorization header format. Expected: Bearer <token>",
        });
    }

    const token = parts[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // tolerant id extraction: supports { id, _id, userId, sub } or email
    const possibleId =
      decoded.id || decoded._id || decoded.userId || decoded.sub || null;
    const possibleEmail =
      decoded.email || (decoded.user && decoded.user.email) || null;

    if (!possibleId && !possibleEmail) {
      return res
        .status(401)
        .json({ message: "Token payload missing id/email" });
    }

    const db = getDB();

    let query;
    if (possibleId) {
      // safe ObjectId usage: only use ObjectId if it looks valid, else fall back to string match
      try {
        query = { _id: new ObjectId(String(possibleId)) };
      } catch (err) {
        // invalid object id string — try matching by string id field (in case you used string ids)
        query = { _id: String(possibleId) };
      }
    } else {
      query = { email: String(possibleEmail).toLowerCase() };
    }

    // fetch user excluding password
    const user = await db
      .collection("users")
      .findOne(query, { projection: { password: 0 } });

    if (!user) {
      return res
        .status(401)
        .json({ message: "User not found (invalid token)" });
    }

    // normalize and attach to req.user (do not expose sensitive fields)
    // ensure email is lowercased and role present
    req.user = {
      _id: user._id,
      id: user._id, // convenience
      email: (user.email || "").toLowerCase(),
      role: user.role || "employee",
      name: user.name || null,
      companyName: user.companyName || null,
      // include other non-sensitive fields you need (but avoid tokens/passwords)
    };

    return next();
  } catch (err) {
    console.error("verifyToken error:", err);
    return res.status(500).json({ message: "Internal server error in auth" });
  }
};
