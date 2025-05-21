const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const User = require("../models/User");

// @desc    Get users with their tasks grouped by status
// @route   GET /api/users/tasks-grouped
// @access  Private (admin)
const getUsersWithTasksGrouped = async (req, res) => {
  try {
    // Fetch all users (or filter as needed)
    const users = await User.find().select("name profileImageUrl email");

    // For each user, fetch tasks grouped by status and sorted by createdAt descending
    const usersWithTasks = await Promise.all(
      users.map(async (user) => {
        const tasks = await Task.find({ assignedTo: user._id })
          .sort({ createdAt: -1 })
          .select("title status createdAt dueDate");

        // Group tasks by status
        const groupedTasks = tasks.reduce(
          (acc, task) => {
            if (!acc[task.status]) {
              acc[task.status] = [];
            }
            acc[task.status].push(task);
            return acc;
          },
          { Pending: [], "In Progress": [], Completed: [] }
        );

        return {
          _id: user._id,
          name: user.name,
          profileImageUrl: user.profileImageUrl,
          email: user.email,
          tasks: groupedTasks,
        };
      })
    );

    res.json({ users: usersWithTasks });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getUsersWithTasksGrouped,
  router,
};
