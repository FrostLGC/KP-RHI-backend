const express = require("express");
const { protect, adminOnly } = require("../middlewares/authMiddleware");
const roleVerification = require("../middlewares/roleVerification");
const {
  getDashboardData,
  getUserDashboardData,
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskChecklist,
} = require("../controllers/taskControllers");

const router = express.Router();
const { getUsersWithTasksGrouped } = require("../controllers/userTasksController");

// project routes
router.get("/dashboard-data", protect, getDashboardData);
router.get("/user-dashboard-data", protect, getUserDashboardData);
router.get("/", protect, getTasks);
router.get("/:id", protect, getTaskById);
router.get("/users/tasks-grouped", protect, getUsersWithTasksGrouped);
router.post(
  "/",
  protect,
  adminOnly,
  roleVerification.validateHighPriorityAssignment,
  createTask
); //create task (admin only)
router.put(
  "/:id",
  protect,
  roleVerification.adminManageAssignedUsers,
  updateTask
); //update task (admin only)
router.delete("/:id", protect, adminOnly, deleteTask); //delete task (admin only)
router.put("/:id/status", protect, updateTaskStatus); //update task status
router.put(
  "/:id/todo",
  protect,
  roleVerification.adminManageAssignedUsers,
  updateTaskChecklist
); //update task checklist

module.exports = router;
