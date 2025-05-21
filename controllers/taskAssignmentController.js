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
    const { action, rejectionReason } = req.body; // "approve" or "reject" and optional rejectionReason

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
      request.rejectionReason = null; // clear rejection reason if any
      await request.save();

      res.json({ message: "Assignment request approved", request });
    } else if (action === "reject") {
      request.status = "Rejected";
      request.rejectionReason = rejectionReason || null;
      await request.save();

      // Check if all assignment requests for this task are rejected
      const allRequests = await TaskAssignmentRequest.find({ taskId: request.taskId });
      const allRejected = allRequests.length > 0 && allRequests.every(r => r.status === "Rejected");

      // Update task status accordingly
      const task = await Task.findById(request.taskId);
      if (task) {
        // Get all assigned user IDs from the task
        const assignedUserIds = task.assignedTo.map(id => id.toString());

        // Get user IDs from assignment requests
        const requestUserIds = allRequests.map(r => r.assignedToUserId.toString());

        // Users assigned directly (without assignment requests)
        const directAssignedUserIds = assignedUserIds.filter(id => !requestUserIds.includes(id));

        // Consider direct assigned users as approved
        const directAssignedApprovedCount = directAssignedUserIds.length;

        // Count approved and rejected requests
        const approvedRequestsCount = allRequests.filter(r => r.status === "Approved").length;
        const rejectedRequestsCount = allRequests.filter(r => r.status === "Rejected").length;
        const pendingRequestsCount = allRequests.filter(r => r.status === "Pending").length;

        // Total users count
        const totalUsersCount = assignedUserIds.length;

        // Determine task status
        if (rejectedRequestsCount === allRequests.length && directAssignedApprovedCount === 0) {
          // All requests rejected and no direct assigned users
          task.status = "Rejected";
        } else if (pendingRequestsCount > 0) {
          task.status = "Pending Approval";
        } else if (approvedRequestsCount + directAssignedApprovedCount > 0) {
          task.status = "Pending";
        } else {
          task.status = "Pending Approval";
        }

        await task.save();
      }

      res.json({ message: "Assignment request rejected", request });
    } else {
      res.status(400).json({ message: "Invalid action" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// New controller method to check high priority tasks for users
const User = require("../models/User");

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
        // Fetch user details directly
        const user = await User.findById(userId).select("name profileImageUrl");
        if (user) {
          usersWithHighPriorityTasks.push({
            _id: user._id,
            name: user.name,
            profileImageUrl: user.profileImageUrl || null,
          });
        } else {
          usersWithHighPriorityTasks.push({ _id: userId });
        }
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
