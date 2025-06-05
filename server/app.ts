import express, { Express, Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";

import indexRouter from "./routes/index";
import usersRouter from "./routes/users";
import calendarRouter from "./routes/calendar";
import googleCalendarRouter from "./routes/googleCalendar";
import projectManagementRouter from "./routes/projectManagement";

const app: Express = express();

// Basic Express settings
app.set("json spaces", 2);
app.set("x-powered-by", false);

// Middleware
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/calendar", calendarRouter);
app.use("/calendar/google", googleCalendarRouter);
app.use("/projects", projectManagementRouter);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  if (err instanceof require("./lib/errors").CalendarError) {
    const status = (err as any).statusCode || 400;
    res.status(status).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Something broke!" });
  }
});

export default app;
