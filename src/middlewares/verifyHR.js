module.exports = function verifyHR(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ message: 'No authenticated user' });
    if (req.user.role !== 'hr') return res.status(403).json({ message: 'HR role required' });
    next();
  } catch (err) {
    console.error('verifyHR error:', err);
    return res.status(500).json({ message: 'Internal server error in role check' });
  }
};
