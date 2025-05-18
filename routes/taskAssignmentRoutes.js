const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  createTaskAssignmentRequest,
  getUserAssignmentRequests,
  respondToAssignmentRequest,
  checkHighPriorityTasks,
  getAllAssignmentRequests,
} = require("../controllers/taskAssignmentController");

const router = express.Router();

router.post("/", protect, createTaskAssignmentRequest);
router.get("/user-requests", protect, getUserAssignmentRequests);
router.put("/:id/respond", protect, respondToAssignmentRequest);
router.post("/check-high-priority-tasks", protect, checkHighPriorityTasks);
router.get("/all-requests", protect, getAllAssignmentRequests);

module.exports = router;
