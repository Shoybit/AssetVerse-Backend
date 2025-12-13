module.exports = function verifyHR(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  if (req.user.role !== "hr")
    return res.status(403).json({ message: "HR role required" });
  next();
};
