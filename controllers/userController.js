const User = require("../models/User");
const Task = require("../models/Task");

// @desc    Get all users (for task assignment)
// @route   GET /api/users
// @access  Private (authenticated users)
const getUsers = async (req, res) => {
  try {
    // Return all users except superadmin and admin
    const users = await User.find({
      role: { $nin: ["superadmin", "admin"] },
    }).select("-password");

    // add task count to each user
    const usersWithTaskCount = await Promise.all(
      users.map(async (user) => {
        const pendingTask = await Task.countDocuments({
          assignedTo: user._id,
          status: "Pending",
        });
        const inProgressTask = await Task.countDocuments({
          assignedTo: user._id,
          status: "In Progress",
        });
        const completedTask = await Task.countDocuments({
          assignedTo: user._id,
          status: "Completed",
        });
        return {
          ...user._doc,
          pendingTask,
          inProgressTask,
          completedTask,
        };
      })
    );
    res.json(usersWithTaskCount);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get user by id (admin only)
// @route   GET /api/users/:id
// @access  Private
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update user position (superadmin only)
// @route   PUT /api/users/:id/position
// @access  Private/superadmin
const updateUserPosition = async (req, res) => {
  try {
    const { position } = req.body;
    if (!position) {
      return res.status(400).json({ message: "Position is required" });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.position = position;
    await user.save();
    res.json({ message: "User position updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update user profile photo (self)
// @route   PUT /api/users/:id/profile-photo
// @access  Private (user themselves)
const updateUserProfilePhoto = async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    const { profileImageUrl } = req.body;
    if (!profileImageUrl) {
      return res.status(400).json({ message: "Profile image URL is required" });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.profileImageUrl = profileImageUrl;
    await user.save();
    res.json({ message: "Profile photo updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUserPosition,
  updateUserProfilePhoto,
};
