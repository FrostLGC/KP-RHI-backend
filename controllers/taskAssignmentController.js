const TaskAssignmentRequest = require("../models/TaskAssignmentRequest");
const Task = require("../models/Task");

// Create a new task assignment request
const createTaskAssignmentRequest = async (req, res) => {
try {
const { taskId, assignedToUserId } = req.body;
const assignedByAdminId = req.user._id;

    // Check if a pending request already exists for this task and user
    const existingRequest = await TaskAssignmentRequest.findOne({
      taskId,
      assignedToUserId,
      status: "Pending",
    });

    if (existingRequest) {
      return res.status(400).json({ message: "Pending assignment request already exists" });
    }

    const newRequest = await TaskAssignmentRequest.create({
      taskId,
      assignedByAdminId,
      assignedToUserId,
      status: "Pending",
    });

    res.status(201).json({ message: "Task assignment request created", request: newRequest });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all pending assignment requests for the logged-in user
const getUserAssignmentRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const requests = await TaskAssignmentRequest.find({
      assignedToUserId: userId,
      status: "Pending",
    })
      .populate("taskId", "title description priority dueDate")
      .populate("assignedByAdminId", "name email");

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Approve or reject a task assignment request
const respondToAssignmentRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { action } = req.body; // "approve" or "reject"

    const request = await TaskAssignmentRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Assignment request not found" });
    }

    if (request.assignedToUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to respond to this request" });
    }

    if (action === "approve") {
      // Update the task's assignedTo to include this user if not already included
      const task = await Task.findById(request.taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (!task.assignedTo.includes(request.assignedToUserId)) {
        task.assignedTo.push(request.assignedToUserId);
        await task.save();
      }

      request.status = "Approved";
      await request.save();

      res.json({ message: "Assignment request approved", request });
    } else if (action === "reject") {
      request.status = "Rejected";
      await request.save();

      res.json({ message: "Assignment request rejected", request });
    } else {
      res.status(400).json({ message: "Invalid action" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// New controller method to check high priority tasks for users
const checkHighPriorityTasks = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ message: "Invalid userIds" });
    }

    // Find users who have 2 or more high priority tasks assigned
    const usersWithHighPriorityTasks = [];

    for (const userId of userIds) {
      const count = await Task.countDocuments({
        assignedTo: userId,
        priority: "High",
        status: { $ne: "Completed" },
      });

      if (count >= 2) {
        // You may want to fetch user details here if needed
        usersWithHighPriorityTasks.push({ _id: userId });
      }
    }

    res.json({ users: usersWithHighPriorityTasks });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }};

const getAllAssignmentRequests = async (req, res) => {
  try {
    const requests = await TaskAssignmentRequest.find({ status: "Pending" })
      .populate("taskId", "title description priority dueDate")
      .populate("assignedToUserId", "name email")
      .populate("assignedByAdminId", "name email");

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createTaskAssignmentRequest,
  getUserAssignmentRequests,
  respondToAssignmentRequest,
  checkHighPriorityTasks,
  getAllAssignmentRequests,
};
