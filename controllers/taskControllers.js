const Task = require("../models/Task");
const User = require("../models/User");

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
const TaskAssignmentRequest =
  require("./taskAssignmentController").TaskAssignmentRequest ||
  require("../models/TaskAssignmentRequest");

  const getTasks = async (req, res) => {
    try {
      const {
        status,
        sortBy = "createdAt",
        sortOrder = "desc",
        assignedTo,
        search, // Add search parameter
      } = req.query;

      let filter = {};

      if (status && status !== "All") {
        filter.status = status;
      }

      if (assignedTo) {
        filter.assignedTo = assignedTo;
      }

      // Add search filter if search term is provided
      if (search) {
        filter.title = { $regex: search, $options: "i" }; // Case-insensitive search
      }

      // Validate and set sort options
      const validSortFields = ["createdAt", "dueDate"];
      const validSortOrders = ["asc", "desc"];

      const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
      const sortDirection = validSortOrders.includes(sortOrder)
        ? sortOrder === "asc"
          ? 1
          : -1
        : -1;

      const sortOptions = { [sortField]: sortDirection };

      let tasks;

      if (req.user.role === "admin") {
        tasks = await Task.find(filter)
          .sort(sortOptions)
          .populate([
            { path: "assignedTo", select: "name email profileImageUrl" },
            { path: "assignedBy", select: "name email profileImageUrl" },
          ]);
      } else {
        tasks = await Task.find({ ...filter, assignedTo: req.user._id })
          .sort(sortOptions)
          .populate([
            { path: "assignedTo", select: "name email profileImageUrl" },
            { path: "assignedBy", select: "name email profileImageUrl" },
          ]);
      }

      // For each task, check assignment requests and update assignedTo and status accordingly
      const tasksWithAssignmentInfo = await Promise.all(
        tasks.map(async (task) => {
          // Fetch assignment requests for this task
          const assignmentRequests = await TaskAssignmentRequest.find({
            taskId: task._id,
          });

          // Map userId to assignment request status and rejection reason
          const assignmentMap = {};
          assignmentRequests.forEach((req) => {
            assignmentMap[req.assignedToUserId.toString()] = {
              status: req.status,
              rejectionReason: req.rejectionReason,
            };
          });

          // Include users with approved, pending, or rejected requests or those originally assigned without requests
          const assignedToFiltered = task.assignedTo.filter((user) => {
            const req = assignmentMap[user._id.toString()];
            return (
              !req ||
              req.status === "Approved" ||
              req.status === "Pending" ||
              req.status === "Rejected"
            );
          });

          // Add rejection, pending info to assignedTo users
          let assignedToWithRejection = assignedToFiltered.map((user) => {
            const req = assignmentMap[user._id.toString()];
            return {
              ...user._doc,
              rejected: req?.status === "Rejected",
              pending: req?.status === "Pending",
              rejectionReason: req?.rejectionReason || null,
            };
          });

          // Find users with pending or rejected requests not in assignedTo
          const assignedToIds = task.assignedTo.map((user) =>
            user._id.toString()
          );
          const pendingOrRejectedUserIds = Object.entries(assignmentMap)
            .filter(
              ([userId, req]) =>
                (req.status === "Pending" || req.status === "Rejected") &&
                !assignedToIds.includes(userId)
            )
            .map(([userId]) => userId);

          if (pendingOrRejectedUserIds.length > 0) {
            const extraUsers = await User.find({
              _id: { $in: pendingOrRejectedUserIds },
            }).select("name email profileImageUrl");
            const extraUsersWithInfo = extraUsers.map((user) => ({
              ...user._doc,
              rejected:
                assignmentMap[user._id.toString()]?.status === "Rejected",
              pending: assignmentMap[user._id.toString()]?.status === "Pending",
              rejectionReason:
                assignmentMap[user._id.toString()]?.rejectionReason || null,
            }));
            assignedToWithRejection =
              assignedToWithRejection.concat(extraUsersWithInfo);
          }

          // Determine if any assigned user has pending request
          const hasPending = Object.values(assignmentMap).some(
            (req) => req.status === "Pending"
          );

          // Determine if all assigned users rejected
          const originalAssignedToIds = task._doc.assignedTo.map((id) =>
            id.toString()
          );
          const allRejected =
            originalAssignedToIds.length > 0 &&
            originalAssignedToIds.every((userId) => {
              const req = assignmentMap[userId];
              return req?.status === "Rejected";
            });

          // Special case: if only one assigned user and rejected, mark rejected
          const singleUserRejected =
            task.assignedTo &&
            task.assignedTo.length === 1 &&
            assignmentMap[task.assignedTo[0]._id.toString()]?.status ===
              "Rejected";

          // Determine if any assigned user approved
          const hasApproved = Object.values(assignmentMap).some(
            (req) => req.status === "Approved"
          );

          // Determine if todo checklist started (any item completed)
          const todoStarted = task.todoChecklist.some((item) => item.completed);

          // Determine if all todo checklist items are completed
          const allTodoCompleted =
            task.todoChecklist.length > 0 &&
            task.todoChecklist.every((item) => item.completed);

          // Set task status accordingly
          let status = task.status;
          if (allRejected || singleUserRejected) {
            status = "Rejected";
          } else if (hasPending) {
            status = "Pending Approval";
          } else if (hasApproved && allTodoCompleted) {
            status = "Completed";
          } else if (hasApproved && todoStarted) {
            status = "In Progress";
          } else if (hasApproved && !todoStarted) {
            status = "Pending";
          }

          const completedCount = task.todoChecklist.filter(
            (item) => item.completed
          ).length;

          // Update task.status to the computed status
          task.status = status;

          const { status: originalStatus, ...taskWithoutStatus } = task._doc;

          return {
            ...taskWithoutStatus,
            assignedTo: assignedToWithRejection,
            completedTodoCount: completedCount,
            status,
          };
        })
      );

      // Status summary count (updated to use the same filter)
      const statusFilter =
        req.user.role === "admin"
          ? filter
          : { ...filter, assignedTo: req.user._id };

      const allTasks = await Task.countDocuments(statusFilter);
      const pendingTasks = await Task.countDocuments({
        ...statusFilter,
        status: "Pending",
      });
      const inProgressTasks = await Task.countDocuments({
        ...statusFilter,
        status: "In Progress",
      });
      const completedTasks = await Task.countDocuments({
        ...statusFilter,
        status: "Completed",
      });

      res.json({
        tasks: tasksWithAssignmentInfo,
        statusSummary: {
          all: allTasks,
          pendingTasks,
          inProgressTasks,
          completedTasks,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };

const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(
      "assignedTo",
      "name email profileImageUrl"
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      dueDate,
      assignedTo,
      attachments,
      todoChecklist,
      location,
    } = req.body;

    if (!Array.isArray(assignedTo)) {
      return res
        .status(400)
        .json({ message: "assignedTo must be an array of user IDs" });
    }

    const assignedBy = req.user._id;

    // Separate users into those with 2 or more high priority tasks and others
    const usersWithHighPriorityTasks = [];
    const usersWithoutHighPriorityTasks = [];

    for (const userId of assignedTo) {
      const count = await Task.countDocuments({
        assignedTo: userId,
        priority: "High",
        status: { $ne: "Completed" },
      });
      if (count >= 2) {
        usersWithHighPriorityTasks.push(userId);
      } else {
        usersWithoutHighPriorityTasks.push(userId);
      }
    }

    // Create the task assigned directly to users without high priority overload
    const task = await Task.create({
      title,
      description,
      priority,
      dueDate,
      assignedTo: usersWithoutHighPriorityTasks,
      assignedBy,
      location,
      createdBy: req.user._id,
      todoChecklist,
      attachments,
    });

    // For users with high priority tasks, create assignment requests
    if (usersWithHighPriorityTasks.length > 0) {
      const taskAssignmentController = require("./taskAssignmentController");
      for (const userId of usersWithHighPriorityTasks) {
        await taskAssignmentController.createTaskAssignmentRequest(
          {
            body: { taskId: task._id, assignedToUserId: userId },
            user: req.user,
          },
          {
            status: () => ({ json: () => {} }),
          }
        );
      }
    }

    res.status(201).json({
      message: "Task created successfully",
      task,
      assignmentRequestsCreated: usersWithHighPriorityTasks.length > 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Validate assigned users exist if provided
    if (req.body.assignedTo) {
      if (!Array.isArray(req.body.assignedTo)) {
        return res
          .status(400)
          .json({ message: "assignedTo must be an array of user IDs" });
      }

      // Check if all assigned users exist
      const usersExist = await User.find({ _id: { $in: req.body.assignedTo } });
      if (usersExist.length !== req.body.assignedTo.length) {
        // Filter out invalid userIds (null, undefined, non-string/object)
        const validUserIds = req.body.assignedTo.filter(
          (id) =>
            id !== null &&
            id !== undefined &&
            (typeof id === "string" || typeof id === "object")
        );

        const missingUsers = validUserIds.filter(
          (userId) =>
            !usersExist.some(
              (user) => user._id.toString() === userId.toString()
            )
        );
        return res.status(404).json({
          message: "One or more assigned users not found",
          missingUsers,
        });
      }
    }

    // Update task fields
    task.title = req.body.title || task.title;
    task.description = req.body.description || task.description;
    task.priority = req.body.priority || task.priority;
    task.dueDate = req.body.dueDate || task.dueDate;
    task.todoChecklist = req.body.todoChecklist || task.todoChecklist;
    task.attachments = req.body.attachments || task.attachments;
    task.assignedTo = req.body.assignedTo || task.assignedTo;

    // Update location if provided and valid
    if (req.body.location && typeof req.body.location === "object") {
      const { lat, lng, address } = req.body.location;
      task.location = {
        lat: typeof lat === "number" ? lat : task.location.lat,
        lng: typeof lng === "number" ? lng : task.location.lng,
        address: typeof address === "string" ? address : task.location.address,
      };
    }

    const updatedTask = await task.save();
    res.json({ message: "Task updated successfully", updatedTask });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    await task.deleteOne();
    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const isAssigned = task.assignedTo.some(
      (userId) => userId.toString() === req.user._id.toString()
    );

    if (!isAssigned && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this task" });
    }

    task.status = req.body.status || task.status;

    if (task.status === "Completed") {
      task.todoChecklist.forEach((item) => (item.completed = true));
      task.progress = 100;
    }

    await task.save();
    res.json({ message: "Task status updated successfully", task });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateTaskChecklist = async (req, res) => {
  try {
    const { todoChecklist } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    if (!task.assignedTo.includes(req.user._id) && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this task" });
    }

    // Prevent updating checklist if task is rejected
    if (task.status === "Rejected") {
      return res
        .status(403)
        .json({ message: "Cannot update checklist of a rejected task" });
    }

    task.todoChecklist = todoChecklist;

    // auto update progress
    const completedCount = todoChecklist.filter(
      (item) => item.completed
    ).length;
    const totalItems = todoChecklist.length;
    task.progress =
      totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

    // auto mark task as completed if all items are completed
    if (task.progress === 100) {
      task.status = "Completed";
    } else if (task.progress > 0) {
      task.status = "In Progress";
    } else {
      task.status = "Pending";
    }

    await task.save();
    const updatedTask = await Task.findById(req.params.id).populate(
      "assignedTo",
      "name email profileImageUrl"
    );

    res.json({
      message: "Task checklist updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getDashboardData = async (req, res) => {
  try {
    // fetch statistics
    const totalTasks = await Task.countDocuments();
    const pendingTasks = await Task.countDocuments({ status: "Pending" });
    const completedTasks = await Task.countDocuments({ status: "Completed" });
    const overdueTasks = await Task.countDocuments({
      status: { $ne: "Completed" },
      dueDate: { $lt: new Date() },
    });

    // ensure all posible users status are included
    const taskStatuses = ["Pending", "In Progress", "Completed"];
    const taskDistributionRaw = await Task.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const taskDistribution = taskStatuses.reduce((acc, status) => {
      const formattedKey = status.replace(/\s+/g, "");
      acc[formattedKey] =
        taskDistributionRaw.find((item) => item._id === status)?.count || 0;
      return acc;
    }, {});
    taskDistribution["All"] = totalTasks;

    // ensure all priorities are included
    const taskPriorities = ["Low", "Medium", "High"];
    const taskPriorityLevelsRaw = await Task.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);
    const taskPriorityLevels = taskPriorities.reduce((acc, priority) => {
      acc[priority] =
        taskPriorityLevelsRaw.find((item) => item._id === priority)?.count || 0;
      return acc;
    }, {});

    //  fetch recent 10 taks
    const recentTasks = await Task.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title status priority dueDate createdAt");
    res.status(200).json({
      statistics: {
        totalTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
      },
      chart: {
        taskDistribution,
        taskPriorityLevels,
      },
      recentTasks,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getUserDashboardData = async (req, res) => {
  try {
    const userId = req.user._id;

    const totalTasks = await Task.countDocuments({ assignedTo: userId });
    const pendingTasks = await Task.countDocuments({
      assignedTo: userId,
      status: "Pending",
    });
    const completedTasks = await Task.countDocuments({
      assignedTo: userId,
      status: "Completed",
    });
    const overdueTasks = await Task.countDocuments({
      assignedTo: userId,
      status: { $ne: "Completed" },
      dueDate: { $lt: new Date() },
    });

    // task distribution by status
    const taskStatuses = ["Pending", "In Progress", "Completed"];
    const taskDistributionRaw = await Task.aggregate([
      { $match: { assignedTo: userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const taskDistribution = taskStatuses.reduce((acc, status) => {
      const formattedKey = status.replace(/\s+/g, "");
      acc[formattedKey] =
        taskDistributionRaw.find((item) => item._id === status)?.count || 0;
      return acc;
    }, {});

    taskDistribution["All"] = totalTasks;

    // task distribution by priority
    const taskPriorities = ["Low", "Medium", "High"];
    const taskPriorityLevelsRaw = await Task.aggregate([
      { $match: { assignedTo: userId } },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    const taskPriorityLevels = taskPriorities.reduce((acc, priority) => {
      acc[priority] =
        taskPriorityLevelsRaw.find((item) => item._id === priority)?.count || 0;
      return acc;
    }, {});

    // fetch recent 10 tasks
    const recentTasks = await Task.find({ assignedTo: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate([
        {
          path: "assignedBy",
          select: "name email",
        },
        {
          path: "assignedTo",
          select: "name email profileImageUrl",
        },
      ])
      .select("title status priority dueDate createdAt");

    res.status(200).json({
      statistics: {
        totalTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
      },
      chart: {
        taskDistribution,
        taskPriorityLevels,
      },
      recentTasks,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskChecklist,
  getDashboardData,
  getUserDashboardData,
};
