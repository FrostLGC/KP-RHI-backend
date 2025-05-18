const Task = require("../models/Task");
const User = require("../models/User");
const exceljs = require("exceljs");

// @desc get all taks as an excel file (admin only)
// @route GET /api/report/export/tasks
// @access Private/admin
const exportTasksReport = async (req, res) => {
  try {
    const tasks = await Task.find().populate("assignedTo", "name email");
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Tasks Report");
    worksheet.columns = [
      { header: "Task ID", key: "_id", width: 25 },
      { header: "Title", key: "title", width: 30 },
      { header: "Description", key: "description", width: 50 },
      { header: "Priority", key: "priority", width: 15 },
      { header: "Status", key: "status", width: 20 },
      { header: "Due Date", key: "dueDate", width: 20 },
      { header: "Assigned To", key: "assignedTo", width: 30 },
    ];
    tasks.forEach((task) => {
      const assignedTo = task.assignedTo
        .map((user) => `${user.name} (${user.email})`)
        .join(", ");
      worksheet.addRow({
        _id: task._id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate.toISOString().split("T")[0],
        assignedTo: task.assignedTo || "Unassigned",
      });
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tasks_report_${Date.now()}.xlsx`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error Exporting Task", error: error.message });
  }
};

// @desc get all users as an excel file (admin only)
// @route GET /api/report/export/users
// @access Private/admin
const exportUsersReport = async (req, res) => {
  try {
    const users = await User.find().select("name email _id").lean();
    const userTask = await Task.find({}).populate("assignedTo", "name email");
    const userTaskMap = {};
    users.forEach((user) => {
      userTaskMap[user._id] = {
        name: user.name,
        email: user.email,
        taskCount: 0,
        pendingTask: 0,
        inProgressTask: 0,
        completedTask: 0,
      };
    });

    userTask.forEach((task) => {
      if (task.assignedTo) {
        task.assignedTo.forEach((assignedUser) => {
          if (userTaskMap[assignedUser._id]) {
            userTaskMap[assignedUser._id].taskCount += 1;

            // Menangani status tugas sesuai kondisi yang benar
            if (task.status === "Pending") {
              userTaskMap[assignedUser._id].pendingTask += 1;
            } else if (task.status === "In Progress") {
              userTaskMap[assignedUser._id].inProgressTask =
                (userTaskMap[assignedUser._id].inProgressTask || 0) + 1;
            } else if (task.status === "Completed") {
              userTaskMap[assignedUser._id].completedTask += 1;
            }
          }
        });
      }
    });

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Users Task Report");
    worksheet.columns = [
      { header: "User Name", key: "name", width: 30 },
      { header: "Email", key: "email", width: 50 },
      { header: "Total Assigned Task", key: "taskCount", width: 20 },
      { header: "Pending Task", key: "pendingTask", width: 20 },
      {
        header: "In Progress Task",
        key: "inProgressTask",
        width: 20,
      },
      { header: "Completed Task", key: "completedTask", width: 20 },
    ];
    Object.values(userTaskMap).forEach((user) => {
      worksheet.addRow(user);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=users_report_${Date.now()}.xlsx`
    );

    return workbook.xlsx.write(res).then(() => {
      res.end();
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "error exporting task", error: error.message });
  }
};

module.exports = {
  exportTasksReport,
  exportUsersReport,
};
