const express = require('express');
const { protect, adminOnly } = require('../middlewares/authMiddleware');
const { exportTasksReport, exportUsersReport } = require('../controllers/reportController');

const router = express.Router();

router.get("/export/tasks", protect, adminOnly, exportTasksReport); // export tasks (admin only)
router.get("/export/users", protect, adminOnly, exportUsersReport); // export users (admin only)

module.exports = router;