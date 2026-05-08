function getMe(req, res) {
  return res.json(req.user);
}

module.exports = {
  getMe,
};
