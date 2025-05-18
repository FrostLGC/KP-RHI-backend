const express = require('express');
const { protect, adminOnly } = require('../middlewares/authMiddleware');
const roleVerification = require('../middlewares/roleVerification');
const {
  getUsers,
  getUserById,
  updateUserPosition,
  updateUserProfilePhoto,
} = require('../controllers/userController');

const router = express.Router();

// user management routes
// Allow all authenticated users to get users for task assignment
router.get('/', protect, getUsers);
router.get('/:id', protect, getUserById);
router.put(
  '/:id/position',
  protect,
  roleVerification.superadminOnly,
  updateUserPosition
);
router.put(
  '/:id/profile-photo',
  protect,
  updateUserProfilePhoto
);

module.exports = router;
