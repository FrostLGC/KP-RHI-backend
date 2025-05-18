const Task = require("../models/Task");
const User = require("../models/User");

// Middleware to verify roles and permissions
const roleVerification = {
  // Middleware to check if user has one of the allowed roles
  allowRoles: (allowedRoles) => {
    return (req, res, next) => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied: insufficient role" });
      }
      next();
    };
  },

  // Middleware to validate HRD access: only see project & personalia
  hrdAccess: async (req, res, next) => {
    if (req.user.role === "hrd") {
      // Implement any specific checks if needed, for now allow
      return next();
    }
    next();
  },

  // Middleware to allow superadmin to update user roles
  superadminOnly: (req, res, next) => {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied: superadmin only" });
    }
    next();
  },

  // Middleware to allow admin to manage only users assigned to them
  adminManageAssignedUsers: async (req, res, next) => {
    if (req.user.role === "admin") {
      try {
        const task = await Task.findById(req.params.id);

        if (!task) {
          return res.status(404).json({ message: "Task not found" });
        }

        // Only validate assignment if modifying assigned users
        if (req.body.assignedTo) {
          // Verify current admin originally assigned this task
          if (task.assignedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({
              message: "Access denied: you didn't create this task",
            });
          }

          // For new assignments, verify users exist
          const users = await User.find({
            _id: { $in: req.body.assignedTo },
          });

          if (users.length !== req.body.assignedTo.length) {
            return res.status(404).json({
              message: "One or more users not found",
            });
          }
        }

        next();
      } catch (error) {
        return res.status(500).json({
          message: "Server error",
          error: error.message,
        });
      }
    } else {
      next();
    }
  },

  // Middleware to validate admin cannot assign high priority to user who already has high priority task on same date from another admin
  validateHighPriorityAssignment: async (req, res, next) => {
    if (req.user.role === "admin" && req.body.priority === "High" && Array.isArray(req.body.assignedTo)) {
      const dueDate = new Date(req.body.dueDate);
      for (const assignedUserId of req.body.assignedTo) {
        const existingHighPriorityTask = await Task.findOne({
          assignedTo: assignedUserId,
          priority: "High",
          dueDate: {
            $gte: new Date(dueDate.setHours(0, 0, 0, 0)),
            $lt: new Date(dueDate.setHours(23, 59, 59, 999)),
          },
          assignedBy: { $ne: req.user._id },
        });
        if (existingHighPriorityTask) {
          const user = await User.findById(assignedUserId);
          const userName = user ? user.name : assignedUserId;
          return res.status(400).json({
            message: `User ${userName} already has a high priority task on the same date assigned by another admin.`,
          });
        }
      }
    }
    next();
  },
};

module.exports = roleVerification;
