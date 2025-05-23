const express = require("express");
const router = express.Router();

// GET /calendar - Example endpoint for calendar data
router.get("/", (req, res) => {
  res.json({
    message: "Calendar endpoint is working!",
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  });
});

module.exports = router;
